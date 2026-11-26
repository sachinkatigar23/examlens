"""The interface every chat provider implements (Local = Ollama, Cloud = Gemini).

Embeddings are NOT part of it: they always stay local (nomic-embed-text), so switching the chat provider
never needs re-indexing.
"""

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from typing import TypeVar

from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)


class LLMError(Exception):
    """A provider failed in a way the user should hear about. `code` lets the UI react, e.g. offer Cloud when
    the local model is offline:
      local_offline | model_missing | cloud_unavailable | rate_limited | cloud_error | vision_unavailable | bad_output
    """

    def __init__(self, message: str, code: str = "llm_error"):
        super().__init__(message)
        self.code = code


class LLMProvider(ABC):
    mode: str  # "local" | "cloud"
    model: str

    @property
    def label(self) -> str:
        return f"{'Local' if self.mode == 'local' else 'Cloud'} · {self.model}"

    @abstractmethod
    def stream_chat(
        self, messages: list[dict], *, temperature: float = 0.1, max_tokens: int | None = None
    ) -> AsyncIterator[str]:
        """messages: [{role: system|user|assistant, content}] -> the answer, piece by piece. max_tokens is a
        safety stop for the local model; cloud models follow the requested length well enough without it."""

    @abstractmethod
    async def chat_json(self, system: str, user: str, schema: type[T]) -> T:
        """One answer that must validate against `schema`."""

    @abstractmethod
    async def vision(self, prompt: str, image: bytes, mime_type: str) -> str:
        """Reads an image (a photographed question or code) and answers `prompt` about it."""
