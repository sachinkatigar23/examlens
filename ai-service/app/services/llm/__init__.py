"""Chat providers. `get_provider("local" | "cloud")` picks one per request."""

from typing import Literal

from app.config import settings
from app.services.llm.base import LLMError, LLMProvider
from app.services.llm.gemini_provider import GeminiProvider
from app.services.llm.ollama_provider import OllamaError, OllamaProvider, chat_json, installed_models, ollama_post

Mode = Literal["local", "cloud"]


def get_provider(mode: Mode) -> LLMProvider:
    if mode == "cloud":
        if not settings.gemini_api_key:
            raise LLMError("Cloud mode isn't set up: add GEMINI_API_KEY to ai-service/.env", "cloud_unavailable")
        return GeminiProvider()
    return OllamaProvider()


__all__ = [
    "GeminiProvider", "LLMError", "LLMProvider", "Mode", "OllamaError", "OllamaProvider",
    "chat_json", "get_provider", "installed_models", "ollama_post",
]
