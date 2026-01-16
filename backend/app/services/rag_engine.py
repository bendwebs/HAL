"""RAG Engine - Document processing and retrieval"""

from typing import List, Dict, Any, Optional
from bson import ObjectId
from datetime import datetime
import os

from app.database import database
from app.config import settings
from app.services.ollama_client import get_ollama_client


class RAGEngine:
    """Retrieval-Augmented Generation engine"""
    
    def __init__(self):
        self.embed_model = settings.default_embed_model
        self.chunk_size = 500  # characters
        self.chunk_overlap = 50
    
    async def process_document(self, document_id: str, user_id: str):
        """Process a document: extract text, chunk, and embed"""
        doc = await database.documents.find_one({"_id": ObjectId(document_id)})
        if not doc:
            return
        
        # Extract text based on content type
        text = await self._extract_text(doc["file_path"], doc["content_type"])
        
        if not text:
            return
        
        # Chunk the text
        chunks = self._chunk_text(text)
        
        # Generate embeddings and store chunks
        ollama = get_ollama_client()
        chunk_docs = []
        
        for i, chunk in enumerate(chunks):
            try:
                embedding = await ollama.embed(self.embed_model, chunk)
            except Exception as e:
                print(f"Error generating embedding: {e}")
                embedding = []
            
            chunk_doc = {
                "document_id": ObjectId(document_id),
                "user_id": ObjectId(user_id),
                "content": chunk,
                "embedding": embedding,
                "chunk_index": i,
                "metadata": {
                    "start_char": i * (self.chunk_size - self.chunk_overlap),
                },
                "created_at": datetime.utcnow()
            }
            chunk_docs.append(chunk_doc)
        
        if chunk_docs:
            result = await database.document_chunks.insert_many(chunk_docs)
            
            # Update document with chunk count and vector IDs
            await database.documents.update_one(
                {"_id": ObjectId(document_id)},
                {
                    "$set": {
                        "chunk_count": len(chunk_docs),
                        "vector_ids": [str(id) for id in result.inserted_ids]
                    }
                }
            )
    
    async def _extract_text(self, file_path: str, content_type: str) -> str:
        """Extract text from document"""
        if not os.path.exists(file_path):
            return ""
        
        try:
            if content_type == "text/plain" or file_path.endswith(".txt"):
                with open(file_path, "r", encoding="utf-8") as f:
                    return f.read()
            
            elif content_type == "text/markdown" or file_path.endswith(".md"):
                with open(file_path, "r", encoding="utf-8") as f:
                    return f.read()
            
            elif content_type == "application/pdf" or file_path.endswith(".pdf"):
                from PyPDF2 import PdfReader
                reader = PdfReader(file_path)
                text = ""
                for page in reader.pages:
                    text += page.extract_text() + "\n"
                return text
            
            elif file_path.endswith(".docx"):
                from docx import Document
                doc = Document(file_path)
                text = ""
                for para in doc.paragraphs:
                    text += para.text + "\n"
                return text
            
        except Exception as e:
            print(f"Error extracting text from {file_path}: {e}")
        
        return ""
    
    def _chunk_text(self, text: str) -> List[str]:
        """Split text into overlapping chunks"""
        chunks = []
        start = 0
        
        while start < len(text):
            end = start + self.chunk_size
            chunk = text[start:end]
            
            # Try to break at sentence boundary
            if end < len(text):
                last_period = chunk.rfind(". ")
                last_newline = chunk.rfind("\n")
                break_point = max(last_period, last_newline)
                
                if break_point > self.chunk_size // 2:
                    chunk = chunk[:break_point + 1]
                    end = start + break_point + 1
            
            chunks.append(chunk.strip())
            start = end - self.chunk_overlap
        
        return [c for c in chunks if c]  # Filter empty chunks
    
    async def search(
        self,
        user_id: str,
        query: str,
        document_ids: Optional[List[str]] = None,
        limit: int = 5
    ) -> List[Dict[str, Any]]:
        """Search documents using vector similarity"""
        ollama = get_ollama_client()
        
        try:
            query_embedding = await ollama.embed(self.embed_model, query)
        except Exception as e:
            print(f"Error generating query embedding: {e}")
            return []
        
        # Build match stage
        match_stage = {"user_id": ObjectId(user_id)}
        if document_ids:
            match_stage["document_id"] = {"$in": [ObjectId(id) for id in document_ids]}
        
        # For now, we'll do a simple cosine similarity in application
        # In production, use MongoDB Atlas Vector Search
        chunks = await database.document_chunks.find(match_stage).to_list(1000)
        
        # Calculate similarities
        results = []
        for chunk in chunks:
            if chunk.get("embedding"):
                similarity = self._cosine_similarity(query_embedding, chunk["embedding"])
                results.append({
                    "document_id": str(chunk["document_id"]),
                    "chunk_index": chunk["chunk_index"],
                    "content": chunk["content"],
                    "score": similarity,
                    "metadata": chunk.get("metadata", {})
                })
        
        # Sort by similarity and return top results
        results.sort(key=lambda x: x["score"], reverse=True)
        
        # Add document names
        for result in results[:limit]:
            doc = await database.documents.find_one({"_id": ObjectId(result["document_id"])})
            result["document_name"] = doc["original_filename"] if doc else "Unknown"
        
        return results[:limit]
    
    def _cosine_similarity(self, vec1: List[float], vec2: List[float]) -> float:
        """Calculate cosine similarity between two vectors"""
        if not vec1 or not vec2 or len(vec1) != len(vec2):
            return 0.0
        
        dot_product = sum(a * b for a, b in zip(vec1, vec2))
        norm1 = sum(a * a for a in vec1) ** 0.5
        norm2 = sum(b * b for b in vec2) ** 0.5
        
        if norm1 == 0 or norm2 == 0:
            return 0.0
        
        return dot_product / (norm1 * norm2)


# Singleton
_engine: Optional[RAGEngine] = None


def get_rag_engine() -> RAGEngine:
    global _engine
    if _engine is None:
        _engine = RAGEngine()
    return _engine
