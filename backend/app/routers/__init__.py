"""Routers Package"""

from app.routers.auth import router as auth_router
from app.routers.chats import router as chats_router
from app.routers.messages import router as messages_router
from app.routers.documents import router as documents_router
from app.routers.personas import router as personas_router
from app.routers.memories import router as memories_router
from app.routers.tools import router as tools_router
from app.routers.alerts import router as alerts_router
from app.routers.admin import router as admin_router
