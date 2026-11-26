from fastapi import APIRouter, Depends

from app.config import settings
from app.deps import require_service_key
from app.services import qdrant
from app.services.llm import installed_models

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
    installed = await installed_models()
    if installed is not None:
        status["ollama"] = True
        status["models"] = {name: name in installed for name in status["models"]}
    status["ok"] = status["qdrant"] and status["ollama"] and all(status["models"].values())
    return status


@router.get("/providers", dependencies=[Depends(require_service_key)])
async def providers():
    """What the mode toggle can offer. Cloud without a key is 'unavailable', not broken."""
    installed = await installed_models() or set()
    vision_local = bool(settings.vision_model_local) and settings.vision_model_local in installed
    return {
        "local": {"available": settings.chat_model in installed, "model": settings.chat_model},
        "cloud": {"available": bool(settings.gemini_api_key), "model": settings.gemini_model},
        "vision": {
            "local": vision_local,
            "localModel": settings.vision_model_local or None,
            "cloud": bool(settings.gemini_api_key),
        },
        "embeddings": settings.embed_model in installed,
    }
