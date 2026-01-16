# HAL - Local AI System

A comprehensive local AI system designed for multi-user access within a LAN environment. Features a modern, mobile-first chat interface with full AI transparency, sub-agent capabilities, RAG document search, and a Mem0-inspired memory system.

## Features

- **Multi-User Authentication** - Role-based access (admin/user) with JWT tokens
- **AI Chat with Transparency** - See what the AI is thinking, its actions, and sub-agent activity
- **Sub-Agent System** - AI can spawn sub-agents (max 3 depth, 8 concurrent)
- **RAG Document Search** - Upload PDFs, TXT, MD, DOCX and search via embeddings
- **Memory System** - Mem0-inspired memory that remembers user preferences and facts
- **Chat Sharing** - Private, shared with specific users, or public
- **In-App Alerts** - Notification system for system messages
- **Admin Panel** - User management, tool configuration, resource monitoring

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14 + TypeScript + Tailwind CSS |
| Backend | FastAPI (Python) |
| Database | MongoDB |
| AI Models | Ollama (qwen2.5:7b, nomic-embed-text) |
| Auth | JWT tokens |

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- MongoDB running on `localhost:27017`
- Ollama with models pulled:
  ```bash
  ollama pull qwen2.5:7b
  ollama pull nomic-embed-text
  ```

### Backend Setup

```bash
cd backend
python -m venv venv
venv\Scripts\activate  # Windows
# source venv/bin/activate  # Linux/Mac
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

### Access

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

### Default Admin

- Username: `admin`
- Password: `admin123`

**Change this immediately after first login!**

## Project Structure

```
HAL/
├── frontend/          # Next.js frontend
│   ├── src/
│   │   ├── app/       # App router pages
│   │   ├── components/
│   │   ├── lib/       # API client, utilities
│   │   ├── stores/    # Zustand state
│   │   └── types/     # TypeScript types
│   └── ...
├── backend/           # FastAPI backend
│   ├── app/
│   │   ├── routers/   # API endpoints
│   │   ├── services/  # Business logic
│   │   ├── models/    # Pydantic models
│   │   └── auth/      # Authentication
│   └── uploads/       # File storage
├── PLANNING.md        # Architecture documentation
└── PROGRESS.md        # Build progress tracking
```

## Documentation

- [PLANNING.md](./PLANNING.md) - Full architecture and data models
- [PROGRESS.md](./PROGRESS.md) - Build progress tracking

## License

MIT
