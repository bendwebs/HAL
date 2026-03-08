"""Error Logs Router - Admin API for viewing captured errors"""

from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, Dict, Any

from app.auth import get_current_user
from app.models.user import UserRole

router = APIRouter(prefix="/errors", tags=["Error Logs"])


def require_admin(user: Dict[str, Any] = Depends(get_current_user)):
    if user.get("role") != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


@router.get("")
async def list_errors(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    resolved: Optional[bool] = None,
    error_type: Optional[str] = None,
    context: Optional[str] = None,
    _user: Dict = Depends(require_admin),
):
    """List captured errors with filters"""
    from app.services.error_capture import get_error_capture
    capture = get_error_capture()
    return await capture.get_errors(
        limit=limit,
        offset=offset,
        resolved=resolved,
        error_type=error_type,
        context=context,
    )


@router.get("/summary")
async def error_summary(_user: Dict = Depends(require_admin)):
    """Get error statistics summary"""
    from app.services.error_capture import get_error_capture
    capture = get_error_capture()
    return await capture.get_summary()


@router.get("/{error_id}")
async def get_error(error_id: str, _user: Dict = Depends(require_admin)):
    """Get a single error with full traceback"""
    from app.services.error_capture import get_error_capture
    capture = get_error_capture()
    error = await capture.get_error(error_id)
    if not error:
        raise HTTPException(status_code=404, detail="Error not found")
    return error


@router.post("/{error_id}/resolve")
async def resolve_error(
    error_id: str,
    notes: str = "",
    _user: Dict = Depends(require_admin),
):
    """Mark an error as resolved"""
    from app.services.error_capture import get_error_capture
    capture = get_error_capture()
    await capture.resolve_error(error_id, notes)
    return {"status": "resolved"}


@router.delete("/resolved")
async def clear_resolved(_user: Dict = Depends(require_admin)):
    """Delete all resolved errors"""
    from app.services.error_capture import get_error_capture
    capture = get_error_capture()
    count = await capture.clear_resolved()
    return {"deleted": count}
