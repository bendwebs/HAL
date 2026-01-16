"""Password Hashing - with fallback for environments without bcrypt"""

import hashlib
import secrets

# Try to use bcrypt, fall back to SHA256 if not available
try:
    from passlib.context import CryptContext
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    USE_BCRYPT = True
except Exception:
    USE_BCRYPT = False


def hash_password(password: str) -> str:
    """Hash a password"""
    if USE_BCRYPT:
        return pwd_context.hash(password)
    else:
        # Fallback: SHA256 with salt
        salt = secrets.token_hex(16)
        hashed = hashlib.sha256((salt + password).encode()).hexdigest()
        return f"sha256${salt}${hashed}"


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against a hash"""
    if USE_BCRYPT and not hashed_password.startswith("sha256$"):
        return pwd_context.verify(plain_password, hashed_password)
    else:
        # Fallback verification
        if not hashed_password.startswith("sha256$"):
            return False
        parts = hashed_password.split("$")
        if len(parts) != 3:
            return False
        _, salt, stored_hash = parts
        computed_hash = hashlib.sha256((salt + plain_password).encode()).hexdigest()
        return secrets.compare_digest(computed_hash, stored_hash)
