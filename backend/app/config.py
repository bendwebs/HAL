"""
HAL Backend Configuration
Loads environment variables and provides typed settings
"""

from pydantic_settings import BaseSettings
from typing import Optional
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""
    
    # MongoDB
    mongodb_uri: str = "mongodb://localhost:27017/"
    database_name: str = "hal"
    
    # JWT Authentication
    jwt_secret: str = "change-this-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expiration_hours: int = 24
    
    # Ollama
    ollama_base_url: str = "http://localhost:11434"
    default_chat_model: str = "qwen2.5:7b"
    default_embed_model: str = "nomic-embed-text"
    
    # File Upload
    upload_dir: str = "./uploads"
    max_upload_size: int = 52428800  # 50MB
    
    # Agent Limits
    max_agent_depth: int = 3
    max_concurrent_agents: int = 8
    
    # Server
    api_prefix: str = "/api"
    debug: bool = True
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance"""
    return Settings()


settings = get_settings()
