"""Local provider: Ollama on the host GPU. Also exposes `ollama_post` for the embeddings module."""

import base64
import json
from collections.abc import AsyncIterator

import httpx
from pydantic import ValidationError

from app.config import settings
from app.services.llm.base import LLMError, LLMProvider, T

EXTRACT_CONTEXT = 4096  # syllabus/question extraction: short inputs
ANSWER_CONTEXT = 8192  # long answers: up to 12 note excerpts + a 16-mark answer. KV cache ~300 MB on a 3B model.


class OllamaError(LLMError):
    """Ollama is down, the model is missing, or it returned something unusable."""

    def __init__(self, message: str, code: str = "local_offline"):
        super().__init__(message, code)


def _friendly(exc: Exception) -> OllamaError:
    if isinstance(exc, httpx.ConnectError):
        return OllamaError("Local model is offline: Ollama is not running (start it with `ollama serve`)")
    if isinstance(exc, httpx.TimeoutException):
        return OllamaError("The local model took too long to answer")
    return OllamaError(f"Ollama error: {exc}")


def _missing(model: str) -> OllamaError:
    return OllamaError(f"Model {model} is not installed in Ollama. Run `ollama pull {model}`", "model_missing")


async def ollama_post(path: str, body: dict, timeout: float = 300) -> dict:
    try:
        async with httpx.AsyncClient(base_url=settings.ollama_url, timeout=timeout) as client:
            res = await client.post(path, json=body)
    except httpx.HTTPError as exc:
        raise _friendly(exc) from exc
    if res.status_code == 404:
        raise _missing(body.get("model", "?"))
    if res.status_code >= 400:
        raise OllamaError(f"Ollama answered {res.status_code}: {res.text[:200]}")
    return res.json()


class OllamaProvider(LLMProvider):
    mode = "local"

    def __init__(self, model: str | None = None):
        self.model = model or settings.chat_model

    async def chat_json(self, system: str, user: str, schema: type[T], max_tokens: int | None = None) -> T:
        """Ollama constrains the output to the JSON schema; pydantic validates. Retries once on invalid output
        (small models occasionally truncate or drift)."""
        body = {
            "model": self.model,
            "stream": False,
            "format": schema.model_json_schema(),
            # Extraction (syllabus topics, questions) must be repeatable: temperature 0 + a fixed seed.
            "options": {"temperature": 0, "seed": 42, "num_ctx": EXTRACT_CONTEXT,
                        **({"num_predict": max_tokens} if max_tokens else {})},
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        }
        last_error: Exception | None = None
        for _ in range(2):
            data = await ollama_post("/api/chat", body)
            try:
                return schema.model_validate_json(data["message"]["content"])
            except (ValidationError, KeyError) as exc:
                last_error = exc
        raise OllamaError(f"The model did not return valid JSON: {last_error}", "bad_output")

    async def stream_chat(
        self, messages: list[dict], *, temperature: float = 0.1, max_tokens: int | None = None
    ) -> AsyncIterator[str]:
        body = {
            "model": self.model,
            "stream": True,
            # Low but not 0: answers read naturally, yet refusals stay consistent (0.2 flipped some to "couldn't find").
            "options": {"temperature": temperature, "num_ctx": ANSWER_CONTEXT, **({"num_predict": max_tokens} if max_tokens else {})},
            "messages": messages,
        }
        try:
            async with httpx.AsyncClient(base_url=settings.ollama_url, timeout=httpx.Timeout(300, connect=5)) as client:
                async with client.stream("POST", "/api/chat", json=body) as res:
                    if res.status_code >= 400:
                        await res.aread()
                        if res.status_code == 404:
                            raise _missing(self.model)
                        raise OllamaError(f"Ollama answered {res.status_code}")
                    async for line in res.aiter_lines():
                        if not line:
                            continue
                        part = json.loads(line)
                        if part.get("error"):
                            raise OllamaError(f"Ollama error: {part['error']}")
                        if text := part.get("message", {}).get("content"):
                            yield text
                        if part.get("done"):
                            break
        except httpx.HTTPError as exc:
            raise _friendly(exc) from exc

    async def vision(self, prompt: str, image: bytes, mime_type: str) -> str:
        if not settings.vision_model_local:
            raise LLMError(
                "No local vision model is set up. Use Cloud, or set VISION_MODEL_LOCAL (e.g. qwen2.5vl:3b) "
                "and pull it with Ollama",
                "vision_unavailable",
            )
        body = {
            "model": settings.vision_model_local,
            "stream": False,
            "options": {"temperature": 0, "num_ctx": EXTRACT_CONTEXT},
            "messages": [{"role": "user", "content": prompt, "images": [base64.b64encode(image).decode()]}],
        }
        data = await ollama_post("/api/chat", body, timeout=600)
        return data.get("message", {}).get("content", "").strip()


# Kept for the ingest pipeline (extraction always runs locally: whole PDFs never leave the machine).
_default = OllamaProvider()


async def chat_json(system: str, user: str, schema: type[T], max_tokens: int | None = None) -> T:
    return await _default.chat_json(system, user, schema, max_tokens)


async def installed_models() -> set[str] | None:
    """Model names Ollama has (with and without the ":latest" tag), or None when Ollama is unreachable."""
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            tags = (await client.get(f"{settings.ollama_url}/api/tags")).json()
    except Exception:
        return None
    names = {m["name"] for m in tags.get("models", [])}
    return names | {n.split(":")[0] for n in names if n.endswith(":latest")}
