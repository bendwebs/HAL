"""
HAL Backend - MongoDB Database Connection
Handles connection pooling and provides database access
"""

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymongo import IndexModel, ASCENDING, TEXT
from typing import Optional
import logging

from app.config import settings

logger = logging.getLogger(__name__)


class Database:
    """MongoDB database connection manager"""
    
    client: Optional[AsyncIOMotorClient] = None
    db: Optional[AsyncIOMotorDatabase] = None
    
    async def connect(self):
        """Connect to MongoDB and initialize indexes"""
        logger.info(f"Connecting to MongoDB at {settings.mongodb_uri}")
        
        self.client = AsyncIOMotorClient(
            settings.mongodb_uri,
            maxPoolSize=50,
            minPoolSize=10
        )
        self.db = self.client[settings.database_name]
        
        # Verify connection
        await self.client.admin.command('ping')
        logger.info(f"Connected to MongoDB database: {settings.database_name}")
        
        # Create indexes
        await self._create_indexes()
    
    async def close(self):
        """Close MongoDB connection"""
        if self.client:
            self.client.close()
            logger.info("MongoDB connection closed")
    
    async def _create_indexes(self):
        """Create database indexes for performance"""
        
        # Users collection
        await self.db.users.create_indexes([
            IndexModel([("username", ASCENDING)], unique=True),
            IndexModel([("role", ASCENDING)]),
        ])
        
        # Chats collection
        await self.db.chats.create_indexes([
            IndexModel([("user_id", ASCENDING)]),
            IndexModel([("visibility", ASCENDING)]),
            IndexModel([("updated_at", ASCENDING)]),
            IndexModel([("shared_with.user_id", ASCENDING)]),
        ])
        
        # Messages collection
        await self.db.messages.create_indexes([
            IndexModel([("chat_id", ASCENDING)]),
            IndexModel([("created_at", ASCENDING)]),
        ])
        
        # Documents collection
        await self.db.documents.create_indexes([
            IndexModel([("user_id", ASCENDING)]),
            IndexModel([("filename", TEXT)]),
        ])
        
        # Document chunks collection (for RAG)
        await self.db.document_chunks.create_indexes([
            IndexModel([("document_id", ASCENDING)]),
            IndexModel([("user_id", ASCENDING)]),
        ])
        
        # Personas collection
        await self.db.personas.create_indexes([
            IndexModel([("creator_id", ASCENDING)]),
            IndexModel([("is_public", ASCENDING)]),
            IndexModel([("is_system", ASCENDING)]),
        ])
        
        # Memories collection
        await self.db.memories.create_indexes([
            IndexModel([("user_id", ASCENDING)]),
            IndexModel([("category", ASCENDING)]),
            IndexModel([("importance", ASCENDING)]),
            IndexModel([("content", TEXT)]),
        ])
        
        # Tools collection
        await self.db.tools.create_indexes([
            IndexModel([("name", ASCENDING)], unique=True),
        ])
        
        # Alerts collection
        await self.db.alerts.create_indexes([
            IndexModel([("target_user_id", ASCENDING)]),
            IndexModel([("created_at", ASCENDING)]),
        ])
        
        # System config collection
        await self.db.system_config.create_indexes([
            IndexModel([("key", ASCENDING)], unique=True),
        ])
        
        logger.info("Database indexes created")
    
    # ============== Collection Accessors ==============
    
    @property
    def users(self):
        return self.db.users
    
    @property
    def chats(self):
        return self.db.chats
    
    @property
    def messages(self):
        return self.db.messages
    
    @property
    def documents(self):
        return self.db.documents
    
    @property
    def document_chunks(self):
        return self.db.document_chunks
    
    @property
    def personas(self):
        return self.db.personas
    
    @property
    def memories(self):
        return self.db.memories
    
    @property
    def tools(self):
        return self.db.tools
    
    @property
    def alerts(self):
        return self.db.alerts
    
    @property
    def system_config(self):
        return self.db.system_config


# Global database instance
database = Database()


async def get_database() -> Database:
    """Dependency to get database instance"""
    return database
