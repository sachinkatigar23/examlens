import httpx
from fastapi import APIRouter

from app.config import settings
from app.services import qdrant

router = APIRouter()


@router.get("/health")
async def health():
    """No service key needed: says only whether Qdrant, Ollama and both models are available."""
    status = {"qdrant": False, "ollama": False, "models": {settings.chat_model: False, settings.embed_model: False}}
    try:
        await qdrant.client.get_collections()
        status["qdrant"] = True
    except Exception:
        pass
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            tags = (await client.get(f"{settings.ollama_url}/api/tags")).json()
        status["ollama"] = True
        installed = {m["name"] for m in tags.get("models", [])} | {m["name"].split(":")[0] for m in tags.get("models", [])}
        status["models"] = {name: name in installed for name in status["models"]}
    except Exception:
        pass
    status["ok"] = status["qdrant"] and status["ollama"] and all(status["models"].values())
    return status
