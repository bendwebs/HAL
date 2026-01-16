# HAL - Local AI System

## Project Overview

HAL is a comprehensive local AI system designed for multi-user access within a LAN environment. It provides a modern, mobile-first chat interface with full AI transparency, sub-agent capabilities, RAG document search, and a Mem0-inspired memory system.

**Repository**: https://github.com/bendwebs/HAL
**Database**: MongoDB at `mongodb://localhost:27017/`

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14 + TypeScript + Tailwind CSS |
| Backend | FastAPI (Python 3.11+) |
| Database | MongoDB (data + vectors via Atlas Vector Search) |
| AI Models | Ollama (`qwen2.5:7b` for chat, `nomic-embed-text` for embeddings) |
| Auth | JWT tokens (LAN-only) |
| State | Zustand (frontend) |
| Styling | Tailwind CSS + CSS Variables |

---

## Core Features

### Phase 1 (Current Build)

- [ ] **Authentication System**
  - [ ] User registration/login
  - [ ] JWT token management
  - [ ] Role-based access (admin/user)
  - [ ] Password hashing (bcrypt)

- [ ] **Chat System**
  - [ ] Create/delete chats
  - [ ] Real-time message streaming
  - [ ] AI transparency layer (thinking, actions, sub-agents)
  - [ ] Transparency toggle (global + per-message)
  - [ ] Persona selection per chat
  - [ ] Document attachment in chat

- [ ] **Chat Sharing**
  - [ ] Private (owner only)
  - [ ] Shared (specific users with read/write permissions)
  - [ ] Public (all users can view)
  - [ ] Share modal with history options (full history vs fresh)

- [ ] **Sub-Agent System**
  - [ ] Max depth: 3 levels
  - [ ] Max concurrent: 8 agents
  - [ ] Visible agent tree in UI
  - [ ] Parent can grant child spawn permissions

- [ ] **RAG System**
  - [ ] Document upload (PDF, TXT, MD, DOCX)
  - [ ] Smart chunking with overlap
  - [ ] Vector embeddings via nomic-embed-text
  - [ ] Hybrid search (vector + keyword)
  - [ ] Context injection into prompts

- [ ] **Memory System (Mem0-style)**
  - [ ] Per-user, private memories
  - [ ] Auto-extraction after conversations
  - [ ] Vector storage for semantic search
  - [ ] Relevance scoring (similarity + recency + importance)
  - [ ] Full CRUD + multi-select in UI
  - [ ] Categories and importance levels

- [ ] **Document Library**
  - [ ] Grid/list view of uploads
  - [ ] Upload with progress
  - [ ] Delete (cascades to vectors)
  - [ ] Search/filter

- [ ] **Persona System**
  - [ ] Create/edit personas
  - [ ] System prompt, temperature, model override
  - [ ] Public/private personas
  - [ ] Avatar emoji

- [ ] **Alert System**
  - [ ] In-app notifications
  - [ ] Broadcast (all users) or targeted
  - [ ] Alert types: info, success, warning, error
  - [ ] Read/unread tracking

- [ ] **Admin Panel**
  - [ ] Dashboard with resource monitoring
  - [ ] User management (CRUD, role changes)
  - [ ] Model management (view, configure defaults)
  - [ ] Tool management (permissions, configuration)
  - [ ] Persona management (system-wide)
  - [ ] Alert management
  - [ ] System settings

- [ ] **Tool Permission System**
  - [ ] Permission levels: disabled, admin_only, always_on, user_toggle, opt_in
  - [ ] Per-tool configuration
  - [ ] Usage statistics

- [ ] **Resource Monitoring**
  - [ ] CPU, RAM, GPU, VRAM usage
  - [ ] Active agent count
  - [ ] Ollama queue depth
  - [ ] Response latency metrics

### Phase 2 (Future)

- [ ] AI Council / Deliberation page (multi-agent debate system)
- [ ] Dynamic agent scaling based on resources
- [ ] Custom tool creation UI
- [ ] Voice input/output
- [ ] Scheduled tasks
- [ ] API access for external integrations
- [ ] Bulk memory import

---

## Data Models

### Users
```json
{
  "_id": "ObjectId",
  "username": "string (unique)",
  "password_hash": "string",
  "display_name": "string",
  "role": "admin | user",
  "settings": {
    "show_thinking": true,
    "show_actions": true,
    "show_subagents": true,
    "theme": "dark",
    "tool_overrides": {}
  },
  "storage_used": 0,
  "storage_quota": 1073741824,
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

### Chats
```json
{
  "_id": "ObjectId",
  "user_id": "ObjectId",
  "title": "string",
  "persona_id": "ObjectId | null",
  "visibility": "private | shared | public",
  "shared_with": [
    {
      "user_id": "ObjectId",
      "permission": "read | write",
      "shared_at": "datetime"
    }
  ],
  "share_includes_history": true,
  "model_override": "string | null",
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

### Messages
```json
{
  "_id": "ObjectId",
  "chat_id": "ObjectId",
  "role": "user | assistant | system | tool",
  "content": "string",
  "thinking": "string | null",
  "actions": [
    {
      "id": "string",
      "type": "tool_call | sub_agent | rag_search | memory_recall",
      "name": "string",
      "parameters": {},
      "status": "pending | running | complete | failed",
      "result": "any",
      "error": "string | null",
      "started_at": "datetime",
      "completed_at": "datetime | null",
      "children": []
    }
  ],
  "document_ids": ["ObjectId"],
  "model_used": "string",
  "token_usage": {
    "prompt": 0,
    "completion": 0
  },
  "created_at": "datetime"
}
```

### Documents
```json
{
  "_id": "ObjectId",
  "user_id": "ObjectId",
  "filename": "string",
  "original_filename": "string",
  "content_type": "string",
  "file_path": "string",
  "file_size": 0,
  "chunk_count": 0,
  "vector_ids": ["string"],
  "metadata": {},
  "created_at": "datetime"
}
```

### Document Chunks
```json
{
  "_id": "ObjectId",
  "document_id": "ObjectId",
  "user_id": "ObjectId",
  "content": "string",
  "embedding": [0.0],
  "chunk_index": 0,
  "metadata": {
    "page": 0,
    "start_char": 0,
    "end_char": 0
  },
  "created_at": "datetime"
}
```

### Personas
```json
{
  "_id": "ObjectId",
  "creator_id": "ObjectId | null",
  "name": "string",
  "description": "string",
  "system_prompt": "string",
  "avatar_emoji": "🤖",
  "temperature": 0.7,
  "model_override": "string | null",
  "is_public": false,
  "is_system": false,
  "tools_enabled": ["string"],
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

### Memories
```json
{
  "_id": "ObjectId",
  "user_id": "ObjectId",
  "content": "string",
  "embedding": [0.0],
  "category": "string",
  "importance": 0.5,
  "source_chat_id": "ObjectId | null",
  "access_count": 0,
  "created_at": "datetime",
  "last_accessed": "datetime | null"
}
```

### Tools
```json
{
  "_id": "ObjectId",
  "name": "string (unique)",
  "display_name": "string",
  "description": "string",
  "icon": "string",
  "schema": {
    "type": "object",
    "properties": {},
    "required": []
  },
  "permission_level": "disabled | admin_only | always_on | user_toggle | opt_in",
  "default_enabled": true,
  "config": {},
  "usage_count": 0,
  "last_used": "datetime | null",
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

### Alerts
```json
{
  "_id": "ObjectId",
  "title": "string",
  "message": "string",
  "alert_type": "info | success | warning | error",
  "target_user_id": "ObjectId | null",
  "read_by": ["ObjectId"],
  "created_at": "datetime",
  "expires_at": "datetime | null"
}
```

### System Config
```json
{
  "_id": "ObjectId",
  "key": "string (unique)",
  "value": "any",
  "description": "string",
  "updated_at": "datetime",
  "updated_by": "ObjectId"
}
```

---

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login, get JWT
- `GET /api/auth/me` - Get current user
- `PUT /api/auth/me` - Update current user

### Chats
- `GET /api/chats` - List user's chats
- `POST /api/chats` - Create chat
- `GET /api/chats/{id}` - Get chat details
- `PUT /api/chats/{id}` - Update chat
- `DELETE /api/chats/{id}` - Delete chat
- `POST /api/chats/{id}/share` - Share chat
- `DELETE /api/chats/{id}/share/{user_id}` - Remove share

### Messages
- `GET /api/chats/{id}/messages` - List messages
- `POST /api/chats/{id}/messages` - Send message (streams response)
- `WebSocket /api/chats/{id}/ws` - Real-time chat

### Documents
- `GET /api/documents` - List user's documents
- `POST /api/documents` - Upload document
- `GET /api/documents/{id}` - Get document details
- `DELETE /api/documents/{id}` - Delete document + vectors

### Personas
- `GET /api/personas` - List available personas
- `POST /api/personas` - Create persona
- `GET /api/personas/{id}` - Get persona
- `PUT /api/personas/{id}` - Update persona
- `DELETE /api/personas/{id}` - Delete persona

### Memories
- `GET /api/memories` - List user's memories
- `POST /api/memories` - Create memory
- `GET /api/memories/{id}` - Get memory
- `PUT /api/memories/{id}` - Update memory
- `DELETE /api/memories/{id}` - Delete memory
- `POST /api/memories/bulk-delete` - Delete multiple
- `GET /api/memories/search` - Search memories

### Tools
- `GET /api/tools` - List tools (with user permissions)
- `PUT /api/tools/{id}/toggle` - Toggle tool (if allowed)

### Alerts
- `GET /api/alerts` - Get user's alerts
- `PUT /api/alerts/{id}/read` - Mark as read
- `PUT /api/alerts/read-all` - Mark all as read

### Admin
- `GET /api/admin/users` - List all users
- `POST /api/admin/users` - Create user
- `PUT /api/admin/users/{id}` - Update user
- `DELETE /api/admin/users/{id}` - Delete user
- `GET /api/admin/tools` - List all tools
- `PUT /api/admin/tools/{id}` - Update tool config
- `GET /api/admin/personas` - List all personas
- `PUT /api/admin/personas/{id}` - Update any persona
- `DELETE /api/admin/personas/{id}` - Delete any persona
- `POST /api/admin/alerts` - Create alert
- `GET /api/admin/resources` - Get system resources
- `GET /api/admin/config` - Get system config
- `PUT /api/admin/config/{key}` - Update config

---

## Project Structure

```
E:\Coding\Hal\
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── (auth)/
│   │   │   │   ├── login/
│   │   │   │   └── register/
│   │   │   ├── (main)/
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── page.tsx
│   │   │   │   ├── chat/
│   │   │   │   │   └── [id]/
│   │   │   │   ├── library/
│   │   │   │   ├── memories/
│   │   │   │   ├── personas/
│   │   │   │   ├── settings/
│   │   │   │   └── admin/
│   │   │   │       ├── page.tsx
│   │   │   │       ├── users/
│   │   │   │       ├── models/
│   │   │   │       ├── tools/
│   │   │   │       ├── personas/
│   │   │   │       ├── alerts/
│   │   │   │       └── resources/
│   │   │   ├── layout.tsx
│   │   │   └── globals.css
│   │   ├── components/
│   │   │   ├── ui/
│   │   │   ├── chat/
│   │   │   ├── admin/
│   │   │   └── shared/
│   │   ├── hooks/
│   │   ├── lib/
│   │   │   ├── api.ts
│   │   │   ├── utils.ts
│   │   │   └── constants.ts
│   │   ├── stores/
│   │   │   ├── auth.ts
│   │   │   ├── chat.ts
│   │   │   ├── ui.ts
│   │   │   └── alerts.ts
│   │   └── types/
│   │       └── index.ts
│   ├── public/
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   ├── next.config.js
│   └── package.json
│
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── auth/
│   │   │   ├── __init__.py
│   │   │   ├── jwt.py
│   │   │   └── dependencies.py
│   │   ├── routers/
│   │   │   ├── __init__.py
│   │   │   ├── auth.py
│   │   │   ├── chats.py
│   │   │   ├── messages.py
│   │   │   ├── documents.py
│   │   │   ├── personas.py
│   │   │   ├── memories.py
│   │   │   ├── tools.py
│   │   │   ├── alerts.py
│   │   │   └── admin.py
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   ├── ollama_client.py
│   │   │   ├── rag_engine.py
│   │   │   ├── memory_system.py
│   │   │   ├── agent_system.py
│   │   │   ├── tool_executor.py
│   │   │   └── resource_monitor.py
│   │   ├── models/
│   │   │   ├── __init__.py
│   │   │   ├── user.py
│   │   │   ├── chat.py
│   │   │   ├── message.py
│   │   │   ├── document.py
│   │   │   ├── persona.py
│   │   │   ├── memory.py
│   │   │   ├── tool.py
│   │   │   └── alert.py
│   │   └── utils/
│   │       ├── __init__.py
│   │       ├── chunking.py
│   │       └── document_parser.py
│   ├── uploads/
│   ├── requirements.txt
│   └── Dockerfile
│
├── docker-compose.yml
├── PLANNING.md
├── PROGRESS.md
└── README.md
```

---

## Design System

### Theme: "Soft Industrial"
Dark mode primary with subtle depth and warmth.

### Colors (CSS Variables)
```css
:root {
  /* Background layers */
  --bg-primary: #0a0a0b;
  --bg-secondary: #111113;
  --bg-tertiary: #1a1a1d;
  --bg-elevated: #222225;
  
  /* Surface (cards, modals) */
  --surface: rgba(255, 255, 255, 0.03);
  --surface-hover: rgba(255, 255, 255, 0.06);
  --surface-active: rgba(255, 255, 255, 0.09);
  
  /* Borders */
  --border: rgba(255, 255, 255, 0.08);
  --border-hover: rgba(255, 255, 255, 0.15);
  
  /* Text */
  --text-primary: #fafafa;
  --text-secondary: #a1a1aa;
  --text-muted: #71717a;
  
  /* Accent (teal) */
  --accent: #14b8a6;
  --accent-hover: #0d9488;
  --accent-muted: rgba(20, 184, 166, 0.15);
  
  /* Status colors */
  --success: #22c55e;
  --warning: #f59e0b;
  --error: #ef4444;
  --info: #3b82f6;
}
```

### Typography
- Headings: `Geist Sans`
- Body: System font stack
- Code/AI Thinking: `JetBrains Mono`

### Spacing Scale
- `xs`: 4px
- `sm`: 8px
- `md`: 16px
- `lg`: 24px
- `xl`: 32px
- `2xl`: 48px

### Border Radius
- `sm`: 6px
- `md`: 8px
- `lg`: 12px
- `xl`: 16px
- `full`: 9999px

---

## Build Progress

Track detailed progress in [PROGRESS.md](./PROGRESS.md)

### Current Phase: Setup
- [ ] Project scaffolding
- [ ] Backend foundation
- [ ] Frontend foundation
- [ ] Database connection
- [ ] Authentication system

---

## Development Commands

### Backend
```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Both (via Docker)
```bash
docker-compose up --build
```

---

## Environment Variables

### Backend (.env)
```env
MONGODB_URI=mongodb://localhost:27017/
DATABASE_NAME=hal
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRATION_HOURS=24
OLLAMA_BASE_URL=http://localhost:11434
DEFAULT_CHAT_MODEL=qwen2.5:7b
DEFAULT_EMBED_MODEL=nomic-embed-text
UPLOAD_DIR=./uploads
MAX_UPLOAD_SIZE=52428800
```

### Frontend (.env.local)
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## Notes

- Default admin credentials: `admin` / `admin123` (change immediately)
- All file uploads stored in `backend/uploads/`
- Vector embeddings stored in MongoDB with Atlas Vector Search index
- WebSocket used for real-time chat streaming
- JWT tokens expire after 24 hours

---

## Future: AI Council

Reserved for Phase 2 - Multi-agent debate system based on https://arxiv.org/html/2511.09030v1

Will live at `/council` route with separate UI for:
- Posing questions to multiple AI agents
- Viewing debate rounds
- Voting and consensus mechanisms
- Final synthesized answers
