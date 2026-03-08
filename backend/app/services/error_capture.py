"""Error Capture Service - Structured error logging to MongoDB

Captures errors with full context for debugging and system improvement.
Errors are stored in the database and accessible via the admin API.
"""

import traceback
import logging
import platform
from datetime import datetime
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)


class ErrorCapture:
    """Captures and stores errors in MongoDB for later analysis"""

    def __init__(self):
        self._db = None

    def _get_db(self):
        if self._db is None:
            from app.database import database
            self._db = database
        return self._db

    async def capture(
        self,
        error: Exception,
        context: str = "",
        user_id: Optional[str] = None,
        chat_id: Optional[str] = None,
        request_path: Optional[str] = None,
        request_method: Optional[str] = None,
        extra: Optional[Dict[str, Any]] = None,
    ) -> Optional[str]:
        """Capture an error with full context.

        Returns the error document ID if saved successfully.
        """
        try:
            db = self._get_db()

            tb = traceback.format_exception(type(error), error, error.__traceback__)
            tb_str = "".join(tb)

            # Extract the most relevant frame
            source_file = None
            source_line = None
            if error.__traceback__:
                frame = error.__traceback__
                while frame.tb_next:
                    frame = frame.tb_next
                source_file = frame.tb_frame.f_code.co_filename
                source_line = frame.tb_lineno

            doc = {
                "error_type": type(error).__name__,
                "message": str(error),
                "traceback": tb_str,
                "context": context,
                "source_file": source_file,
                "source_line": source_line,
                "user_id": user_id,
                "chat_id": chat_id,
                "request_path": request_path,
                "request_method": request_method,
                "extra": extra or {},
                "python_version": platform.python_version(),
                "resolved": False,
                "resolution_notes": None,
                "created_at": datetime.utcnow(),
            }

            result = await db.error_logs.insert_one(doc)
            logger.debug(f"Error captured: {type(error).__name__} -> {result.inserted_id}")
            return str(result.inserted_id)

        except Exception as capture_err:
            # Never let the error capture itself cause failures
            logger.error(f"Failed to capture error: {capture_err}")
            return None

    async def get_errors(
        self,
        limit: int = 50,
        offset: int = 0,
        resolved: Optional[bool] = None,
        error_type: Optional[str] = None,
        context: Optional[str] = None,
    ):
        """Get captured errors with optional filters."""
        db = self._get_db()
        query: Dict[str, Any] = {}

        if resolved is not None:
            query["resolved"] = resolved
        if error_type:
            query["error_type"] = error_type
        if context:
            query["context"] = {"$regex": context, "$options": "i"}

        cursor = db.error_logs.find(query).sort("created_at", -1).skip(offset).limit(limit)
        errors = await cursor.to_list(limit)

        total = await db.error_logs.count_documents(query)

        return {
            "errors": [
                {
                    "id": str(e["_id"]),
                    "error_type": e["error_type"],
                    "message": e["message"],
                    "traceback": e["traceback"],
                    "context": e["context"],
                    "source_file": e.get("source_file"),
                    "source_line": e.get("source_line"),
                    "user_id": e.get("user_id"),
                    "chat_id": e.get("chat_id"),
                    "request_path": e.get("request_path"),
                    "request_method": e.get("request_method"),
                    "extra": e.get("extra", {}),
                    "resolved": e.get("resolved", False),
                    "resolution_notes": e.get("resolution_notes"),
                    "created_at": e["created_at"].isoformat(),
                }
                for e in errors
            ],
            "total": total,
        }

    async def get_error(self, error_id: str):
        """Get a single error by ID."""
        from bson import ObjectId
        db = self._get_db()
        e = await db.error_logs.find_one({"_id": ObjectId(error_id)})
        if not e:
            return None
        return {
            "id": str(e["_id"]),
            "error_type": e["error_type"],
            "message": e["message"],
            "traceback": e["traceback"],
            "context": e["context"],
            "source_file": e.get("source_file"),
            "source_line": e.get("source_line"),
            "user_id": e.get("user_id"),
            "chat_id": e.get("chat_id"),
            "request_path": e.get("request_path"),
            "request_method": e.get("request_method"),
            "extra": e.get("extra", {}),
            "resolved": e.get("resolved", False),
            "resolution_notes": e.get("resolution_notes"),
            "created_at": e["created_at"].isoformat(),
        }

    async def resolve_error(self, error_id: str, notes: str = ""):
        """Mark an error as resolved."""
        from bson import ObjectId
        db = self._get_db()
        await db.error_logs.update_one(
            {"_id": ObjectId(error_id)},
            {"$set": {"resolved": True, "resolution_notes": notes}},
        )

    async def get_summary(self):
        """Get error summary statistics."""
        db = self._get_db()

        total = await db.error_logs.count_documents({})
        unresolved = await db.error_logs.count_documents({"resolved": False})

        # Get error type breakdown (top 10)
        pipeline = [
            {"$match": {"resolved": False}},
            {"$group": {"_id": "$error_type", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 10},
        ]
        type_counts = await db.error_logs.aggregate(pipeline).to_list(10)

        # Get context breakdown
        context_pipeline = [
            {"$match": {"resolved": False}},
            {"$group": {"_id": "$context", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 10},
        ]
        context_counts = await db.error_logs.aggregate(context_pipeline).to_list(10)

        return {
            "total": total,
            "unresolved": unresolved,
            "resolved": total - unresolved,
            "by_type": {t["_id"]: t["count"] for t in type_counts if t["_id"]},
            "by_context": {c["_id"]: c["count"] for c in context_counts if c["_id"]},
        }

    async def clear_resolved(self):
        """Delete all resolved errors."""
        db = self._get_db()
        result = await db.error_logs.delete_many({"resolved": True})
        return result.deleted_count


# Singleton
_capture: Optional[ErrorCapture] = None


def get_error_capture() -> ErrorCapture:
    global _capture
    if _capture is None:
        _capture = ErrorCapture()
    return _capture
