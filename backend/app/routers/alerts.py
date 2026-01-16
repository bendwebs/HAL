"""Alerts Router - In-app notifications"""

from fastapi import APIRouter, HTTPException, status, Depends
from bson import ObjectId
from datetime import datetime
from typing import Dict, Any, List

from app.database import database
from app.auth import get_current_user
from app.models.alert import AlertResponse, AlertListResponse

router = APIRouter(prefix="/alerts", tags=["Alerts"])


@router.get("", response_model=AlertListResponse)
async def list_alerts(
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Get user's alerts (targeted + broadcast)"""
    user_id = current_user["_id"]
    now = datetime.utcnow()
    
    # Get alerts targeted to user or broadcast (target_user_id is null)
    query = {
        "$or": [
            {"target_user_id": ObjectId(user_id)},
            {"target_user_id": None}
        ],
        "$or": [
            {"expires_at": None},
            {"expires_at": {"$gt": now}}
        ]
    }
    
    alerts = await database.alerts.find(query).sort("created_at", -1).to_list(50)
    
    alert_responses = []
    unread_count = 0
    
    for alert in alerts:
        is_read = user_id in [str(uid) for uid in alert.get("read_by", [])]
        if not is_read:
            unread_count += 1
        
        alert_responses.append(AlertResponse(
            id=str(alert["_id"]),
            title=alert["title"],
            message=alert["message"],
            alert_type=alert.get("alert_type", "info"),
            is_read=is_read,
            created_at=alert["created_at"],
            expires_at=alert.get("expires_at")
        ))
    
    return AlertListResponse(
        alerts=alert_responses,
        unread_count=unread_count
    )


@router.put("/{alert_id}/read")
async def mark_alert_read(
    alert_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Mark alert as read"""
    user_id = current_user["_id"]
    
    result = await database.alerts.update_one(
        {"_id": ObjectId(alert_id)},
        {"$addToSet": {"read_by": ObjectId(user_id)}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Alert not found")
    
    return {"message": "Alert marked as read"}


@router.put("/read-all")
async def mark_all_alerts_read(
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Mark all alerts as read"""
    user_id = current_user["_id"]
    
    await database.alerts.update_many(
        {
            "$or": [
                {"target_user_id": ObjectId(user_id)},
                {"target_user_id": None}
            ]
        },
        {"$addToSet": {"read_by": ObjectId(user_id)}}
    )
    
    return {"message": "All alerts marked as read"}
