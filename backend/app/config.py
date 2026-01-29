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
    default_chat_model: str = "qwen3:8b-8k"
    default_embed_model: str = "nomic-embed-text"
    
    # File Upload
    upload_dir: str = "./uploads"
    max_upload_size: int = 52428800  # 50MB
    data_dir: str = "./data"  # For ChromaDB and other local storage
    
    # Agent Limits
    max_agent_depth: int = 3
    max_concurrent_agents: int = 8
    
    # Web Search (Tavily)
    tavily_api_key: Optional[str] = None
    
    # YouTube API
    youtube_api_key: Optional[str] = None
    
    # Speech-to-Text (faster-whisper)
    # Models: tiny, base, small, medium, large-v2, large-v3, large-v3-turbo (recommended)
    # large-v3-turbo is ~4x faster than large-v3 with similar accuracy
    whisper_model_size: str = "large-v3-turbo"
    whisper_device: str = "cuda"  # cuda or cpu
    whisper_compute_type: str = "float16"  # float16, int8, int8_float16
    
    # Stable Diffusion (Automatic1111 API)
    sd_api_url: str = "http://127.0.0.1:7860"
    sd_default_steps: int = 20
    sd_default_cfg: float = 7.0
    sd_default_sampler: str = "DPM++ 2M Karras"
    sd_webui_path: Optional[str] = None  # Path to Automatic1111 webui folder
    sd_startup_timeout: int = 120  # Seconds to wait for SD to start
    
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
