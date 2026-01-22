"""JWT Token Handling"""

from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from jose import jwt, JWTError

from app.config import settings


def create_access_token(
    user_id: str,
    role: str,
    expires_delta: Optional[timedelta] = None
) -> str:
    """Create a JWT access token (never expires if jwt_expiration_hours is 0)"""
    payload = {
        "sub": user_id,
        "role": role,
        "iat": datetime.utcnow(),
    }
    
    # Only add expiration if configured (0 = never expire)
    if expires_delta:
        payload["exp"] = datetime.utcnow() + expires_delta
    elif settings.jwt_expiration_hours > 0:
        payload["exp"] = datetime.utcnow() + timedelta(hours=settings.jwt_expiration_hours)
    # If jwt_expiration_hours is 0, no "exp" claim = token never expires
    
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def verify_token(token: str) -> Optional[Dict[str, Any]]:
    """Verify and decode a JWT token"""
    try:
        # Disable expiration verification if no exp claim present
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            options={"verify_exp": True, "require_exp": False}
        )
        return payload
    except JWTError:
        return None
