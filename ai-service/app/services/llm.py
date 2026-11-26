"""Talking to Ollama: one-shot JSON extraction and streamed chat."""

import json
from collections.abc import AsyncIterator
from typing import TypeVar

import httpx
from pydantic import BaseModel, ValidationError

from app.config import settings

CONTEXT_TOKENS = 4096

T = TypeVar("T", bound=BaseModel)


class OllamaError(Exception):
    """Ollama is down, the model is missing, or it returned something unusable."""


def _friendly(exc: Exception) -> OllamaError:
    if isinstance(exc, httpx.ConnectError):
        return OllamaError("Ollama is not running. Start it with `ollama serve` and try again")
    if isinstance(exc, httpx.TimeoutException):
        return OllamaError("Ollama took too long to answer")
    return OllamaError(f"Ollama error: {exc}")


async def ollama_post(path: str, body: dict, timeout: float = 300) -> dict:
    try:
        async with httpx.AsyncClient(base_url=settings.ollama_url, timeout=timeout) as client:
            res = await client.post(path, json=body)
    except httpx.HTTPError as exc:
        raise _friendly(exc) from exc
    if res.status_code == 404:
        raise OllamaError(f"Model not found in Ollama. Run `ollama pull {body.get('model')}`")
    if res.status_code >= 400:
        raise OllamaError(f"Ollama answered {res.status_code}: {res.text[:200]}")
    return res.json()


async def chat_json(system: str, user: str, schema: type[T]) -> T:
    """Ask for JSON matching `schema`. Ollama constrains the output to the JSON schema; pydantic validates.
    Retries once on invalid output (small models occasionally truncate or drift)."""
    body = {
        "model": settings.chat_model,
        "stream": False,
        "format": schema.model_json_schema(),
        "options": {"temperature": 0, "num_ctx": CONTEXT_TOKENS},
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
    }
    last_error: Exception | None = None
    for _ in range(2):
        data = await ollama_post("/api/chat", body)
        try:
            return schema.model_validate_json(data["message"]["content"])
        except (ValidationError, KeyError) as exc:
            last_error = exc
    raise OllamaError(f"The model did not return valid JSON: {last_error}")


async def chat_stream(messages: list[dict]) -> AsyncIterator[str]:
    """Yields the answer token by token."""
    body = {
        "model": settings.chat_model,
        "stream": True,
        "options": {"temperature": 0.2, "num_ctx": CONTEXT_TOKENS},
        "messages": messages,
    }
    try:
        async with httpx.AsyncClient(base_url=settings.ollama_url, timeout=httpx.Timeout(300, connect=5)) as client:
            async with client.stream("POST", "/api/chat", json=body) as res:
                if res.status_code >= 400:
                    await res.aread()
                    if res.status_code == 404:
                        raise OllamaError(f"Model not found in Ollama. Run `ollama pull {settings.chat_model}`")
                    raise OllamaError(f"Ollama answered {res.status_code}")
                async for line in res.aiter_lines():
                    if not line:
                        continue
                    part = json.loads(line)
                    if text := part.get("message", {}).get("content"):
                        yield text
                    if part.get("done"):
                        break
    except httpx.HTTPError as exc:
        raise _friendly(exc) from exc
