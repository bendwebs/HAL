"""Documents Router - File upload and library management"""

from fastapi import APIRouter, HTTPException, status, Depends, UploadFile, File, Query
from bson import ObjectId
from datetime import datetime
from typing import Dict, Any, List, Optional
import os
import uuid
import aiofiles

from app.database import database
from app.auth import get_current_user
from app.config import settings
from app.models.document import DocumentResponse, DocumentListResponse

router = APIRouter(prefix="/documents", tags=["Documents"])

ALLOWED_EXTENSIONS = {'.pdf', '.txt', '.md', '.docx'}
ALLOWED_CONTENT_TYPES = {
    'application/pdf': '.pdf',
    'text/plain': '.txt',
    'text/markdown': '.md',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx'
}


@router.get("", response_model=DocumentListResponse)
async def list_documents(
    current_user: Dict[str, Any] = Depends(get_current_user),
    search: Optional[str] = None,
):
    """List user's documents"""
    query = {"user_id": ObjectId(current_user["_id"])}
    
    if search:
        query["$text"] = {"$search": search}
    
    docs = await database.documents.find(query).sort("created_at", -1).to_list(100)
    total_size = sum(d.get("file_size", 0) for d in docs)
    
    return DocumentListResponse(
        documents=[
            DocumentResponse(
                id=str(d["_id"]),
                filename=d["filename"],
                original_filename=d["original_filename"],
                content_type=d["content_type"],
                file_size=d["file_size"],
                chunk_count=d.get("chunk_count", 0),
                created_at=d["created_at"]
            )
            for d in docs
        ],
        total=len(docs),
        total_size=total_size
    )


@router.post("", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Upload a document"""
    # Validate file type
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type not allowed. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )
    
    # Check file size
    content = await file.read()
    if len(content) > settings.max_upload_size:
        raise HTTPException(status_code=400, detail="File too large")
    
    # Generate unique filename
    unique_filename = f"{uuid.uuid4()}{ext}"
    file_path = os.path.join(settings.upload_dir, unique_filename)
    
    # Ensure upload directory exists
    os.makedirs(settings.upload_dir, exist_ok=True)
    
    # Save file
    async with aiofiles.open(file_path, 'wb') as f:
        await f.write(content)
    
    # Create document record
    now = datetime.utcnow()
    doc = {
        "user_id": ObjectId(current_user["_id"]),
        "filename": unique_filename,
        "original_filename": file.filename,
        "content_type": file.content_type or "application/octet-stream",
        "file_path": file_path,
        "file_size": len(content),
        "chunk_count": 0,
        "vector_ids": [],
        "metadata": {},
        "created_at": now
    }
    
    result = await database.documents.insert_one(doc)
    doc_id = str(result.inserted_id)
    
    # Update user storage
    await database.users.update_one(
        {"_id": ObjectId(current_user["_id"])},
        {"$inc": {"storage_used": len(content)}}
    )
    
    # Queue for processing (chunking and embedding)
    from app.services.rag_engine import get_rag_engine
    rag = get_rag_engine()
    if rag:
        await rag.process_document(doc_id, current_user["_id"])
    
    return DocumentResponse(
        id=doc_id,
        filename=unique_filename,
        original_filename=file.filename,
        content_type=doc["content_type"],
        file_size=len(content),
        chunk_count=0,
        created_at=now
    )


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Get document details"""
    doc = await database.documents.find_one({
        "_id": ObjectId(document_id),
        "user_id": ObjectId(current_user["_id"])
    })
    
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    return DocumentResponse(
        id=str(doc["_id"]),
        filename=doc["filename"],
        original_filename=doc["original_filename"],
        content_type=doc["content_type"],
        file_size=doc["file_size"],
        chunk_count=doc.get("chunk_count", 0),
        created_at=doc["created_at"]
    )


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Delete document and associated vectors"""
    doc = await database.documents.find_one({
        "_id": ObjectId(document_id),
        "user_id": ObjectId(current_user["_id"])
    })
    
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Delete file
    if os.path.exists(doc["file_path"]):
        os.remove(doc["file_path"])
    
    # Delete chunks/vectors
    await database.document_chunks.delete_many({"document_id": ObjectId(document_id)})
    
    # Update user storage
    await database.users.update_one(
        {"_id": ObjectId(current_user["_id"])},
        {"$inc": {"storage_used": -doc["file_size"]}}
    )
    
    # Delete document
    await database.documents.delete_one({"_id": ObjectId(document_id)})
