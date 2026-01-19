"""Resource Monitor - System resource tracking"""

import psutil
from typing import Dict, Any, Optional
from datetime import datetime

try:
    import GPUtil
    GPU_AVAILABLE = True
except ImportError:
    GPU_AVAILABLE = False

from app.config import settings


class ResourceMonitor:
    """Monitor system resources"""
    
    def __init__(self):
        self.active_agents = 0
        self.max_agents = settings.max_concurrent_agents
        self.pending_requests = 0
        self.request_latencies = []
        self.max_latency_samples = 100
    
    def increment_agents(self) -> bool:
        """Increment active agent count if under limit"""
        if self.active_agents < self.max_agents:
            self.active_agents += 1
            return True
        return False
    
    def decrement_agents(self):
        """Decrement active agent count"""
        self.active_agents = max(0, self.active_agents - 1)
    
    def record_latency(self, latency_ms: float):
        """Record a request latency"""
        self.request_latencies.append(latency_ms)
        if len(self.request_latencies) > self.max_latency_samples:
            self.request_latencies.pop(0)
    
    def get_stats(self) -> Dict[str, Any]:
        """Get current resource statistics"""
        # CPU
        cpu_percent = psutil.cpu_percent(interval=0.1)
        
        # Memory
        memory = psutil.virtual_memory()
        
        # GPU (if available)
        gpu_stats = None
        if GPU_AVAILABLE:
            try:
                gpus = GPUtil.getGPUs()
                if gpus:
                    gpu = gpus[0]  # First GPU
                    gpu_stats = {
                        "name": gpu.name,
                        "load_percent": round(gpu.load * 100, 1),
                        "memory_used_mb": round(gpu.memoryUsed),
                        "memory_total_mb": round(gpu.memoryTotal),
                        "memory_percent": round((gpu.memoryUsed / gpu.memoryTotal) * 100, 1) if gpu.memoryTotal > 0 else 0,
                        "temperature": gpu.temperature
                    }
            except Exception:
                pass
        
        # Latency stats
        avg_latency = 0
        p95_latency = 0
        if self.request_latencies:
            avg_latency = sum(self.request_latencies) / len(self.request_latencies)
            sorted_latencies = sorted(self.request_latencies)
            p95_index = int(len(sorted_latencies) * 0.95)
            p95_latency = sorted_latencies[p95_index] if sorted_latencies else 0
        
        return {
            "cpu": {
                "percent": cpu_percent,
                "cores": psutil.cpu_count()
            },
            "memory": {
                "used_bytes": memory.used,
                "total_bytes": memory.total,
                "percent": memory.percent,
                "used_gb": round(memory.used / (1024**3), 2),
                "total_gb": round(memory.total / (1024**3), 2)
            },
            "gpu": gpu_stats,
            "agents": {
                "active": self.active_agents,
                "max": self.max_agents,
                "available": self.max_agents - self.active_agents
            },
            "queue": {
                "pending": self.pending_requests
            },
            "latency": {
                "avg_ms": round(avg_latency, 2),
                "p95_ms": round(p95_latency, 2),
                "samples": len(self.request_latencies)
            },
            "timestamp": datetime.utcnow().isoformat()
        }


# Singleton instance
_monitor: Optional[ResourceMonitor] = None


def get_resource_monitor() -> ResourceMonitor:
    global _monitor
    if _monitor is None:
        _monitor = ResourceMonitor()
    return _monitor


async def get_resource_stats() -> Dict[str, Any]:
    """Get current resource statistics including service status"""
    import httpx
    from app.database import database
    from app.config import settings
    
    monitor = get_resource_monitor()
    stats = monitor.get_stats()
    
    # Check MongoDB status
    mongodb_status = "disconnected"
    try:
        if database.client:
            await database.client.admin.command('ping')
            mongodb_status = "connected"
    except Exception:
        pass
    
    # Check Ollama status
    ollama_status = "disconnected"
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            response = await client.get(f"{settings.ollama_base_url}/api/tags")
            if response.status_code == 200:
                ollama_status = "connected"
    except Exception:
        pass
    
    # Return flattened format for frontend compatibility
    return {
        "cpu_percent": stats["cpu"]["percent"],
        "memory_percent": stats["memory"]["percent"],
        "disk_percent": stats.get("disk", {}).get("percent", 0),
        "mongodb_status": mongodb_status,
        "ollama_status": ollama_status,
        "gpu": stats.get("gpu"),
        "agents": stats["agents"],
        "latency": stats["latency"],
        "detailed": stats  # Include full stats for advanced use
    }
