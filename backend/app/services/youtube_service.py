"""YouTube Service - Search and play videos using YouTube Data API v3"""

from typing import List, Dict, Any, Optional
import logging
import asyncio
from datetime import datetime
from bson import ObjectId

from app.database import database
from app.config import settings

logger = logging.getLogger(__name__)


class YouTubeService:
    """Service for YouTube video search and playback"""
    
    # Confidence thresholds
    HIGH_CONFIDENCE_THRESHOLD = 0.75  # Auto-play if above this
    LOW_CONFIDENCE_THRESHOLD = 0.4    # Show results if below this
    
    def __init__(self):
        self.api_key = getattr(settings, 'youtube_api_key', None)
        self._initialized = False
    
    @property
    def is_available(self) -> bool:
        """Check if YouTube API is available"""
        return bool(self.api_key)
    
    async def search_videos(
        self,
        query: str,
        max_results: int = 5,
        video_type: str = "video"  # video, channel, playlist
    ) -> Dict[str, Any]:
        """
        Search YouTube for videos.
        
        Args:
            query: Search query
            max_results: Maximum number of results (1-50)
            video_type: Type of content to search for
            
        Returns:
            Dict with search results and metadata
        """
        if not self.api_key:
            return {
                "success": False,
                "error": "YouTube API key not configured",
                "query": query
            }
        
        try:
            import httpx
            
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    "https://www.googleapis.com/youtube/v3/search",
                    params={
                        "key": self.api_key,
                        "q": query,
                        "part": "snippet",
                        "type": video_type,
                        "maxResults": min(max_results, 50),
                        "order": "relevance"
                    }
                )
                response.raise_for_status()
                data = response.json()
                
                # Process results
                videos = []
                for item in data.get("items", []):
                    video_id = item.get("id", {}).get("videoId")
                    if not video_id:
                        continue
                        
                    snippet = item.get("snippet", {})
                    videos.append({
                        "video_id": video_id,
                        "title": snippet.get("title", ""),
                        "description": snippet.get("description", ""),
                        "channel_title": snippet.get("channelTitle", ""),
                        "channel_id": snippet.get("channelId", ""),
                        "thumbnail": snippet.get("thumbnails", {}).get("high", {}).get("url", 
                                    snippet.get("thumbnails", {}).get("default", {}).get("url", "")),
                        "published_at": snippet.get("publishedAt", ""),
                        "url": f"https://www.youtube.com/watch?v={video_id}",
                        "embed_url": f"https://www.youtube.com/embed/{video_id}"
                    })
                
                return {
                    "success": True,
                    "query": query,
                    "videos": videos,
                    "result_count": len(videos)
                }
                
        except Exception as e:
            logger.error(f"YouTube search error: {e}")
            return {
                "success": False,
                "error": str(e),
                "query": query
            }
    
    async def get_video_details(self, video_id: str) -> Dict[str, Any]:
        """
        Get detailed information about a specific video.
        
        Args:
            video_id: YouTube video ID
            
        Returns:
            Dict with video details
        """
        if not self.api_key:
            return {
                "success": False,
                "error": "YouTube API key not configured"
            }
        
        try:
            import httpx
            
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    "https://www.googleapis.com/youtube/v3/videos",
                    params={
                        "key": self.api_key,
                        "id": video_id,
                        "part": "snippet,contentDetails,statistics"
                    }
                )
                response.raise_for_status()
                data = response.json()
                
                items = data.get("items", [])
                if not items:
                    return {
                        "success": False,
                        "error": "Video not found"
                    }
                
                item = items[0]
                snippet = item.get("snippet", {})
                stats = item.get("statistics", {})
                content = item.get("contentDetails", {})
                
                return {
                    "success": True,
                    "video": {
                        "video_id": video_id,
                        "title": snippet.get("title", ""),
                        "description": snippet.get("description", ""),
                        "channel_title": snippet.get("channelTitle", ""),
                        "channel_id": snippet.get("channelId", ""),
                        "thumbnail": snippet.get("thumbnails", {}).get("high", {}).get("url", ""),
                        "published_at": snippet.get("publishedAt", ""),
                        "duration": content.get("duration", ""),
                        "view_count": int(stats.get("viewCount", 0)),
                        "like_count": int(stats.get("likeCount", 0)),
                        "comment_count": int(stats.get("commentCount", 0)),
                        "url": f"https://www.youtube.com/watch?v={video_id}",
                        "embed_url": f"https://www.youtube.com/embed/{video_id}"
                    }
                }
                
        except Exception as e:
            logger.error(f"YouTube video details error: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    def calculate_confidence(
        self,
        query: str,
        videos: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Calculate confidence scores for search results.
        
        Uses multiple signals:
        - Title similarity to query
        - Channel relevance
        - View count (popularity)
        - Whether query terms appear in title
        
        Returns videos with confidence scores added.
        """
        if not videos:
            return []
        
        query_lower = query.lower()
        query_words = set(query_lower.split())
        
        scored_videos = []
        for video in videos:
            title_lower = video.get("title", "").lower()
            title_words = set(title_lower.split())
            
            # Calculate various score components
            scores = {}
            
            # 1. Word overlap score (what % of query words appear in title)
            if query_words:
                overlap = len(query_words.intersection(title_words))
                scores["word_overlap"] = overlap / len(query_words)
            else:
                scores["word_overlap"] = 0
            
            # 2. Exact phrase match bonus
            if query_lower in title_lower:
                scores["exact_match"] = 0.3
            else:
                scores["exact_match"] = 0
            
            # 3. Position bonus (first result gets slight boost)
            position = videos.index(video)
            scores["position"] = max(0, (5 - position) * 0.05)  # 0.25 for first, 0 for 5th+
            
            # 4. Title length penalty (very long titles are often compilations)
            title_len = len(video.get("title", ""))
            if title_len > 80:
                scores["length_penalty"] = -0.1
            else:
                scores["length_penalty"] = 0
            
            # Calculate weighted final score
            confidence = (
                scores["word_overlap"] * 0.5 +
                scores["exact_match"] +
                scores["position"] +
                scores["length_penalty"]
            )
            
            # Clamp to 0-1 range
            confidence = max(0, min(1, confidence))
            
            video_with_score = video.copy()
            video_with_score["confidence"] = round(confidence, 3)
            video_with_score["confidence_breakdown"] = scores
            scored_videos.append(video_with_score)
        
        # Sort by confidence
        scored_videos.sort(key=lambda x: x["confidence"], reverse=True)
        
        return scored_videos
    
    async def search_and_score(
        self,
        user_id: str,
        query: str,
        chat_id: Optional[str] = None,
        max_results: int = 5
    ) -> Dict[str, Any]:
        """
        Search YouTube, score results, and determine action.
        
        Returns:
            Dict with:
            - action: "play" (auto-play top result) or "select" (show choices)
            - videos: List of videos with confidence scores
            - selected_video: The video to play (if action is "play")
            - search_id: ID for tracking user selection
        """
        # Search YouTube
        search_result = await self.search_videos(query, max_results)
        
        if not search_result.get("success"):
            return search_result
        
        videos = search_result.get("videos", [])
        if not videos:
            return {
                "success": True,
                "action": "no_results",
                "query": query,
                "videos": [],
                "message": f"No videos found for '{query}'"
            }
        
        # Score results
        scored_videos = self.calculate_confidence(query, videos)
        
        # Determine action based on top result confidence
        top_video = scored_videos[0]
        confidence = top_video.get("confidence", 0)
        
        if confidence >= self.HIGH_CONFIDENCE_THRESHOLD:
            action = "play"
            selected_video = top_video
        else:
            action = "select"
            selected_video = None
        
        # Save search for training data
        search_id = await self._save_search(
            user_id=user_id,
            query=query,
            chat_id=chat_id,
            videos=scored_videos,
            auto_selected=selected_video.get("video_id") if selected_video else None,
            confidence=confidence
        )
        
        return {
            "success": True,
            "action": action,
            "query": query,
            "videos": scored_videos,
            "selected_video": selected_video,
            "top_confidence": confidence,
            "search_id": search_id,
            "message": self._get_action_message(action, top_video, confidence)
        }
    
    def _get_action_message(
        self, 
        action: str, 
        top_video: Dict[str, Any], 
        confidence: float
    ) -> str:
        """Generate a human-readable message about the action"""
        if action == "play":
            return f"Playing: {top_video.get('title', 'video')}"
        elif action == "select":
            return "I found several videos that might match. Please select one:"
        else:
            return "No videos found matching your request."
    
    async def _save_search(
        self,
        user_id: str,
        query: str,
        chat_id: Optional[str],
        videos: List[Dict[str, Any]],
        auto_selected: Optional[str],
        confidence: float
    ) -> str:
        """Save search to database for training data collection"""
        search_doc = {
            "user_id": ObjectId(user_id),
            "chat_id": ObjectId(chat_id) if chat_id else None,
            "query": query,
            "videos": videos,
            "auto_selected_video_id": auto_selected,
            "auto_select_confidence": confidence,
            "user_selected_video_id": None,  # Filled in when user selects
            "created_at": datetime.utcnow(),
            "selection_made_at": None
        }
        
        result = await database.youtube_searches.insert_one(search_doc)
        return str(result.inserted_id)
    
    async def record_user_selection(
        self,
        search_id: str,
        selected_video_id: str,
        user_id: str
    ) -> Dict[str, Any]:
        """
        Record which video the user selected.
        This data helps improve confidence scoring over time.
        """
        try:
            result = await database.youtube_searches.update_one(
                {
                    "_id": ObjectId(search_id),
                    "user_id": ObjectId(user_id)
                },
                {
                    "$set": {
                        "user_selected_video_id": selected_video_id,
                        "selection_made_at": datetime.utcnow()
                    }
                }
            )
            
            if result.modified_count > 0:
                logger.info(f"Recorded user selection: search={search_id}, video={selected_video_id}")
                return {"success": True}
            else:
                return {"success": False, "error": "Search not found or already selected"}
                
        except Exception as e:
            logger.error(f"Error recording selection: {e}")
            return {"success": False, "error": str(e)}
    
    async def get_training_data(
        self,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """
        Get search/selection data for training analysis.
        Returns searches where user made a different selection than auto-select.
        """
        pipeline = [
            {
                "$match": {
                    "user_selected_video_id": {"$ne": None},
                }
            },
            {
                "$addFields": {
                    "selection_matched": {
                        "$eq": ["$auto_selected_video_id", "$user_selected_video_id"]
                    }
                }
            },
            {"$sort": {"created_at": -1}},
            {"$limit": limit}
        ]
        
        results = await database.youtube_searches.aggregate(pipeline).to_list(limit)
        
        # Convert ObjectIds to strings
        for doc in results:
            doc["_id"] = str(doc["_id"])
            doc["user_id"] = str(doc["user_id"])
            if doc.get("chat_id"):
                doc["chat_id"] = str(doc["chat_id"])
        
        return results


# Singleton
_service: Optional[YouTubeService] = None


def get_youtube_service() -> YouTubeService:
    """Get singleton YouTubeService instance"""
    global _service
    if _service is None:
        _service = YouTubeService()
    return _service
