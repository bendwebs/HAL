"""
HAL - Local AI System
Main FastAPI Application
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging
from datetime import datetime
from bson import ObjectId

from app.config import settings
from app.database import database
from app.auth import hash_password
from app.models.user import UserRole, UserSettings

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan - startup and shutdown"""
    logger.info("Starting HAL Backend...")
    
    # Connect to database
    await database.connect()
    
    # Initialize services
    from app.services.ollama_client import get_ollama_client
    from app.services.rag_engine import get_rag_engine
    from app.services.memory_system import get_memory_system
    from app.services.agent_system import get_agent_system
    from app.services.tool_executor import get_tool_executor
    
    # Initialize services with logging
    logger.info("Initializing Ollama client...")
    get_ollama_client()
    logger.info("Ollama client initialized")
    
    logger.info("Initializing RAG engine...")
    get_rag_engine()
    logger.info("RAG engine initialized")
    
    logger.info("Initializing memory system...")
    get_memory_system()
    logger.info("Memory system initialized")
    
    logger.info("Initializing agent system...")
    get_agent_system()
    logger.info("Agent system initialized")
    
    # Initialize tools in database
    tool_executor = get_tool_executor()
    await tool_executor.initialize_tools_in_db()
    
    # Create default admin user if not exists
    await create_default_admin()
    
    # Create default persona
    await create_default_persona()
    
    logger.info("HAL Backend started successfully")
    
    yield
    
    # Shutdown
    logger.info("Shutting down HAL Backend...")
    
    from app.services.ollama_client import close_ollama_client
    await close_ollama_client()
    await database.close()
    
    logger.info("HAL Backend shutdown complete")


# Create FastAPI app
app = FastAPI(
    title="HAL - Local AI System",
    description="Multi-user local AI system with RAG, memory, and sub-agents",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict this to your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Include routers
from app.routers import (
    auth_router, chats_router, messages_router, 
    documents_router, personas_router, memories_router,
    tools_router, alerts_router, admin_router
)
from app.routers.tts import router as tts_router

app.include_router(auth_router, prefix="/api")
app.include_router(chats_router, prefix="/api")
app.include_router(messages_router, prefix="/api")
app.include_router(documents_router, prefix="/api")
app.include_router(personas_router, prefix="/api")
app.include_router(memories_router, prefix="/api")
app.include_router(tools_router, prefix="/api")
app.include_router(alerts_router, prefix="/api")
app.include_router(admin_router, prefix="/api")
app.include_router(tts_router, prefix="/api")


# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "version": "1.0.0"
    }


@app.get("/api/models")
async def list_models():
    """List available Ollama models"""
    from app.services.ollama_client import get_ollama_client
    
    ollama = get_ollama_client()
    models = await ollama.list_models()
    
    return {
        "models": models,
        "default_chat": settings.default_chat_model,
        "default_embed": settings.default_embed_model
    }


async def create_default_admin():
    """Create default admin user if none exists"""
    admin = await database.users.find_one({"username": "admin"})
    
    if not admin:
        now = datetime.utcnow()
        await database.users.insert_one({
            "username": "admin",
            "password_hash": hash_password("admin123"),
            "display_name": "Administrator",
            "role": UserRole.ADMIN,
            "settings": UserSettings().model_dump(),
            "storage_used": 0,
            "storage_quota": 10737418240,  # 10GB for admin
            "created_at": now,
            "updated_at": now
        })
        logger.info("Default admin user created (username: admin, password: admin123)")
        
        # Create welcome alert
        await database.alerts.insert_one({
            "title": "Welcome to HAL",
            "message": "Your local AI system is ready. Please change the default admin password immediately.",
            "alert_type": "warning",
            "target_user_id": None,
            "read_by": [],
            "created_at": now,
            "expires_at": None
        })


async def create_default_persona():
    """Create default system persona if none exists"""
    existing = await database.personas.find_one({"is_system": True, "name": "HAL"})
    
    if not existing:
        now = datetime.utcnow()
        await database.personas.insert_one({
            "name": "HAL",
            "description": "Default helpful AI assistant",
            "system_prompt": """You are HAL, a helpful AI assistant running locally. You have access to the user's documents and memories to provide personalized assistance.

Key behaviors:
- Be helpful, concise, and accurate
- When using information from documents or memories, mention your sources
- If you don't know something, say so honestly
- Respect user privacy - their data stays local
- Be proactive in offering relevant information from their documents and memories""",
            "avatar_emoji": "🤖",
            "temperature": 0.7,
            "model_override": None,
            "tools_enabled": ["document_search", "memory_recall", "memory_store", "calculator"],
            "creator_id": None,
            "is_public": True,
            "is_system": True,
            "created_at": now,
            "updated_at": now
        })
        logger.info("Default HAL persona created")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )
