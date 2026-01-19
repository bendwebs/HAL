"""Web Search Router - Endpoints for web search and article extraction"""

from fastapi import APIRouter, HTTPException, status, Depends
from bson import ObjectId
from datetime import datetime
from typing import Dict, Any, List, Optional
from pydantic import BaseModel

from app.database import database
from app.auth import get_current_user
from app.services.web_search import get_web_search_service

router = APIRouter(prefix="/web-search", tags=["Web Search"])


class SearchRequest(BaseModel):
    query: str
    target_site: Optional[str] = None
    max_results: int = 5


class ExtractRequest(BaseModel):
    search_id: str
    link_index: Optional[int] = None  # If None, extract all links
    max_links: int = 5


@router.post("/search")
async def search_web(
    request: SearchRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Search the web and save results to MongoDB.
    Returns search results with a search_id for later extraction.
    """
    web_search = get_web_search_service()
    
    if not web_search.is_available:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Web search not available. Configure TAVILY_API_KEY."
        )
    
    result = await web_search.search_and_save(
        user_id=str(current_user["_id"]),
        query=request.query,
        target_site=request.target_site,
        max_results=request.max_results
    )
    
    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=result.get("error", "Search failed")
        )
    
    return result


@router.get("/search/{search_id}")
async def get_search_results(
    search_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Get saved search results by ID"""
    web_search = get_web_search_service()
    
    result = await web_search.get_search_results(search_id)
    
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Search not found"
        )
    
    # Verify ownership
    if result.get("user_id") != str(current_user["_id"]):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    return result


@router.post("/extract")
async def extract_articles(
    request: ExtractRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Extract full article content from saved search results.
    
    If link_index is provided, extracts just that link.
    Otherwise, extracts up to max_links articles.
    """
    web_search = get_web_search_service()
    
    # Verify the search exists and belongs to user
    search = await web_search.get_search_results(request.search_id)
    if not search:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Search not found"
        )
    
    if search.get("user_id") != str(current_user["_id"]):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    if request.link_index is not None:
        # Extract single link
        result = await web_search.extract_link_from_search(
            search_id=request.search_id,
            link_index=request.link_index
        )
        return {"articles": [result] if result.get("success") else [], "errors": [] if result.get("success") else [result]}
    else:
        # Extract all links
        articles = await web_search.extract_all_links(
            search_id=request.search_id,
            max_links=request.max_links
        )
        
        successful = [a for a in articles if a.get("success")]
        failed = [a for a in articles if not a.get("success")]
        
        return {
            "articles": successful,
            "errors": failed,
            "total_extracted": len(successful),
            "total_failed": len(failed)
        }


@router.get("/history")
async def get_search_history(
    limit: int = 20,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Get user's search history"""
    searches = await database.web_searches.find(
        {"user_id": ObjectId(current_user["_id"])}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    
    for s in searches:
        s["_id"] = str(s["_id"])
        s["user_id"] = str(s["user_id"])
    
    return {"searches": searches, "count": len(searches)}


@router.delete("/search/{search_id}")
async def delete_search(
    search_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Delete a saved search"""
    # Verify ownership
    search = await database.web_searches.find_one({"_id": ObjectId(search_id)})
    if not search:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Search not found"
        )
    
    if str(search.get("user_id")) != str(current_user["_id"]):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    await database.web_searches.delete_one({"_id": ObjectId(search_id)})
    return {"success": True, "deleted": search_id}
