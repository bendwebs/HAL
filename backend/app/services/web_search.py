"""Web Search Service - Using Tavily MCP for search and Newspaper4k for article extraction"""

from typing import List, Dict, Any, Optional
import logging
import asyncio
from datetime import datetime
from bson import ObjectId

from app.database import database
from app.config import settings

logger = logging.getLogger(__name__)

# Lazy import for newspaper
_newspaper_available = None


def _check_newspaper():
    """Check if newspaper4k is available"""
    global _newspaper_available
    if _newspaper_available is None:
        try:
            from newspaper import Article
            _newspaper_available = True
        except ImportError:
            _newspaper_available = False
            logger.warning("Newspaper4k package not installed")
    return _newspaper_available


class WebSearchService:
    """Service for web search and article extraction"""
    
    def __init__(self):
        self._initialized = False
        self.tavily_api_key = getattr(settings, 'tavily_api_key', None)
    
    @property
    def is_available(self) -> bool:
        """Check if web search is available (Tavily API key configured)"""
        return bool(self.tavily_api_key)
    
    async def search_tavily(
        self,
        query: str,
        max_results: int = 5,
        search_depth: str = "basic",
        include_answer: bool = True
    ) -> Dict[str, Any]:
        """
        Search the web using Tavily API directly.
        
        Args:
            query: Search query
            max_results: Maximum number of results (default 5)
            search_depth: "basic" or "advanced"
            include_answer: Include AI-generated answer
            
        Returns:
            Dict with results and metadata
        """
        if not self.tavily_api_key:
            return {
                "success": False,
                "error": "Tavily API key not configured",
                "query": query
            }
        
        try:
            import httpx
            
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    "https://api.tavily.com/search",
                    json={
                        "api_key": self.tavily_api_key,
                        "query": query,
                        "max_results": max_results,
                        "search_depth": search_depth,
                        "include_answer": include_answer
                    }
                )
                response.raise_for_status()
                data = response.json()
                
                return {
                    "success": True,
                    "query": query,
                    "answer": data.get("answer", ""),
                    "results": data.get("results", []),
                    "result_count": len(data.get("results", [])),
                    "response_time": data.get("response_time", 0)
                }
                
        except Exception as e:
            logger.error(f"Tavily search error: {e}")
            return {
                "success": False,
                "error": str(e),
                "query": query
            }
    
    async def save_search_results(
        self,
        user_id: str,
        query: str,
        results: List[Dict[str, Any]],
        answer: str = None
    ) -> str:
        """
        Save search results and links to MongoDB.
        
        Returns the search_id for later reference.
        """
        search_doc = {
            "user_id": ObjectId(user_id),
            "query": query,
            "answer": answer,
            "results": results,
            "created_at": datetime.utcnow(),
            "links_extracted": []  # Track which links have been fully extracted
        }
        
        result = await database.web_searches.insert_one(search_doc)
        search_id = str(result.inserted_id)
        
        logger.info(f"Saved search results: {search_id} with {len(results)} links")
        return search_id
    
    async def get_search_results(self, search_id: str) -> Optional[Dict[str, Any]]:
        """Get saved search results by ID"""
        try:
            doc = await database.web_searches.find_one({"_id": ObjectId(search_id)})
            if doc:
                doc["_id"] = str(doc["_id"])
                doc["user_id"] = str(doc["user_id"])
                return doc
            return None
        except Exception as e:
            logger.error(f"Error getting search results: {e}")
            return None
    
    async def extract_article(self, url: str) -> Dict[str, Any]:
        """
        Extract article content from a URL using Newspaper4k.
        
        Args:
            url: URL to extract content from
            
        Returns:
            Dict with article title, text, authors, publish_date, etc.
        """
        if not _check_newspaper():
            return {
                "success": False,
                "error": "Newspaper4k not installed",
                "url": url
            }
        
        try:
            from newspaper import Article
            
            # Run synchronous newspaper call in executor
            loop = asyncio.get_event_loop()
            
            def extract():
                article = Article(url)
                article.download()
                article.parse()
                
                # Try to get NLP features (keywords, summary)
                keywords = []
                summary = ""
                try:
                    article.nlp()
                    keywords = article.keywords
                    summary = article.summary
                except:
                    pass
                
                return {
                    "title": article.title,
                    "text": article.text,
                    "authors": article.authors,
                    "publish_date": article.publish_date.isoformat() if article.publish_date else None,
                    "top_image": article.top_image,
                    "keywords": keywords,
                    "summary": summary,
                    "url": url
                }
            
            result = await loop.run_in_executor(None, extract)
            result["success"] = True
            return result
            
        except Exception as e:
            logger.error(f"Article extraction error for {url}: {e}")
            return {
                "success": False,
                "error": str(e),
                "url": url
            }
    
    async def extract_link_from_search(
        self,
        search_id: str,
        link_index: int
    ) -> Dict[str, Any]:
        """
        Extract full article content from a specific link in saved search results.
        
        Args:
            search_id: ID of the saved search
            link_index: Index of the link to extract (0-based)
            
        Returns:
            Extracted article content
        """
        search = await self.get_search_results(search_id)
        if not search:
            return {"success": False, "error": "Search not found"}
        
        results = search.get("results", [])
        if link_index < 0 or link_index >= len(results):
            return {"success": False, "error": f"Invalid link index: {link_index}"}
        
        url = results[link_index].get("url")
        if not url:
            return {"success": False, "error": "No URL at that index"}
        
        # Extract the article
        article = await self.extract_article(url)
        
        # Update the search record to mark this link as extracted
        if article.get("success"):
            await database.web_searches.update_one(
                {"_id": ObjectId(search_id)},
                {"$addToSet": {"links_extracted": link_index}}
            )
        
        return article
    
    async def extract_all_links(
        self,
        search_id: str,
        max_links: int = 5
    ) -> List[Dict[str, Any]]:
        """
        Extract content from all links in saved search results.
        
        Args:
            search_id: ID of the saved search
            max_links: Maximum number of links to extract
            
        Returns:
            List of extracted articles
        """
        search = await self.get_search_results(search_id)
        if not search:
            return []
        
        results = search.get("results", [])[:max_links]
        extracted = []
        
        for i, result in enumerate(results):
            url = result.get("url")
            if url:
                article = await self.extract_article(url)
                article["link_index"] = i
                article["search_id"] = search_id
                extracted.append(article)
        
        # Update the search record
        extracted_indices = [i for i, a in enumerate(extracted) if a.get("success")]
        if extracted_indices:
            await database.web_searches.update_one(
                {"_id": ObjectId(search_id)},
                {"$addToSet": {"links_extracted": {"$each": extracted_indices}}}
            )
        
        return extracted
    
    async def search_and_save(
        self,
        user_id: str,
        query: str,
        target_site: Optional[str] = None,
        max_results: int = 5
    ) -> Dict[str, Any]:
        """
        Search the web and save results to MongoDB.
        
        Args:
            user_id: User performing the search
            query: Search query
            target_site: Optional site to focus on
            max_results: Maximum results
            
        Returns:
            Dict with search results and search_id for later extraction
        """
        # Build query with site filter if specified
        search_query = query
        if target_site:
            search_query = f"site:{target_site} {query}"
        
        # Search via Tavily
        search_result = await self.search_tavily(
            query=search_query,
            max_results=max_results,
            include_answer=True
        )
        
        if not search_result.get("success"):
            return search_result
        
        # Save to MongoDB
        search_id = await self.save_search_results(
            user_id=user_id,
            query=query,
            results=search_result.get("results", []),
            answer=search_result.get("answer")
        )
        
        # Return results with search_id
        return {
            "success": True,
            "search_id": search_id,
            "query": query,
            "target_site": target_site,
            "answer": search_result.get("answer", ""),
            "results": search_result.get("results", []),
            "result_count": search_result.get("result_count", 0)
        }


# Singleton
_service: Optional[WebSearchService] = None


def get_web_search_service() -> WebSearchService:
    """Get singleton WebSearchService instance"""
    global _service
    if _service is None:
        _service = WebSearchService()
    return _service
