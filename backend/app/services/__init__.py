"""Services Package"""

from typing import Optional

# Service instances (initialized in main.py)
_ollama_client = None
_rag_engine = None
_memory_system = None
_agent_system = None


def get_ollama_client():
    return _ollama_client


def get_rag_engine():
    return _rag_engine


def get_memory_system():
    return _memory_system


def get_agent_system():
    return _agent_system


def set_services(ollama, rag, memory, agent):
    global _ollama_client, _rag_engine, _memory_system, _agent_system
    _ollama_client = ollama
    _rag_engine = rag
    _memory_system = memory
    _agent_system = agent
