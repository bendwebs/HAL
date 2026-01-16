"""Password Hashing - using argon2 (no Rust compilation required)"""

from passlib.context import CryptContext

# Use argon2 - pure Python, no Rust required
pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")


def hash_password(password: str) -> str:
    """Hash a password using argon2"""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against a hash"""
    return pwd_context.verify(plain_password, hashed_password)
