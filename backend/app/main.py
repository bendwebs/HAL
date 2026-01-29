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
    
    # Preload STT model in background (non-blocking)
    # This ensures the model is ready when /converse is used
    import asyncio
    async def preload_stt():
        try:
            from app.services.stt_service import get_stt_service
            logger.info("Preloading Whisper STT model...")
            stt = get_stt_service()
            await stt.initialize()
            logger.info("Whisper STT model ready")
        except Exception as e:
            logger.warning(f"STT preload failed (will load on first use): {e}")
    
    # Run in background so startup isn't blocked
    asyncio.create_task(preload_stt())
    
    # Create default admin user if not exists
    await create_default_admin()
    
    # Create default personas
    await create_default_persona()
    await create_voice_persona()
    
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
from app.routers.web_search import router as web_search_router
from app.routers.voice_settings import router as voice_settings_router
from app.routers.youtube import router as youtube_router
from app.routers.stt import router as stt_router
from app.routers.images import router as images_router

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
app.include_router(web_search_router, prefix="/api")
app.include_router(voice_settings_router, prefix="/api")
app.include_router(youtube_router, prefix="/api")
app.include_router(stt_router, prefix="/api")
app.include_router(images_router, prefix="/api")

# Context management router
from app.routers.context import router as context_router
app.include_router(context_router, prefix="/api")


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
            "description": "Friendly conversational AI assistant",
            "system_prompt": """You are HAL, a friendly AI assistant running locally on the user's computer. You have access to their personal documents, memories from past conversations, and can search the web when needed.

IMPORTANT - Response Style:
- Write like you're having a natural conversation with a friend, not writing a document
- NEVER use markdown formatting (no **, no ##, no bullet points, no numbered lists)
- Instead of lists, weave information naturally into sentences and paragraphs
- Keep responses conversational and flowing, like you're talking out loud
- Use casual transitions like "So basically...", "The thing is...", "What's interesting is..."
- It's okay to use contractions (don't, won't, it's, that's)
- Vary your sentence length - mix short punchy sentences with longer explanatory ones

Be warm, helpful, and genuine. If you don't know something, just say so naturally.""",
            "avatar_emoji": "🤖",
            "temperature": 0.7,
            "model_override": None,
            "tools_enabled": ["document_search", "memory_recall", "memory_store", "calculator", "web_search"],
            "creator_id": None,
            "is_public": True,
            "is_system": True,
            "created_at": now,
            "updated_at": now
        })
        logger.info("Default HAL persona created")


async def create_voice_persona():
    """Create voice conversation persona if none exists"""
    existing = await database.personas.find_one({"is_system": True, "name": "Voice Assistant"})
    
    if not existing:
        now = datetime.utcnow()
        await database.personas.insert_one({
            "name": "Voice Assistant",
            "description": "Optimized for natural voice conversations",
            "system_prompt": """You are a voice assistant designed for natural spoken conversation. Your responses will be read aloud, so optimize for how they sound when spoken.

CRITICAL VOICE GUIDELINES:
- Keep responses SHORT and conversational - aim for 1-3 sentences unless more detail is truly needed
- Never use markdown, bullet points, lists, or any formatting - just natural speech
- NEVER include asterisks (*) in your responses under any circumstances - no *emphasis*, no **bold**, no actions like *smiles*
- Never use hashes, dashes, or any other formatting characters
- Avoid technical jargon unless the user uses it first
- Use contractions naturally (I'm, you're, it's, don't, won't, that's)
- Respond like you're chatting with a friend, not writing an essay
- If asked a complex question, give a brief answer first, then offer to elaborate

SPEECH PATTERNS:
- Start responses naturally, not with "Sure!" or "Of course!" every time
- Vary your openings - sometimes just dive into the answer
- Use natural filler phrases sparingly when appropriate ("Well...", "So...", "Actually...")
- End responses cleanly without asking "Is there anything else?" unless truly needed

Remember: This is a CONVERSATION, not a Q&A session. Be warm, natural, and concise.""",
            "avatar_emoji": "🎙️",
            "temperature": 0.8,
            "model_override": None,
            "tools_enabled": ["memory_recall", "memory_store", "web_search"],
            "creator_id": None,
            "is_public": True,
            "is_system": True,
            "created_at": now,
            "updated_at": now
        })
        logger.info("Voice Assistant persona created")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )
