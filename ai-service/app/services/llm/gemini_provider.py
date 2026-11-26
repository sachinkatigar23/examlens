"""Cloud provider: Google Gemini through the official google-genai SDK.

Privacy: callers only ever send the question, the retrieved note passages and (for photos) the image.
Whole PDFs are never sent: ingestion always runs locally.
"""

from collections.abc import AsyncIterator

import httpx
from google import genai
from google.genai import errors, types
from pydantic import ValidationError

from app.config import settings
from app.services.llm.base import LLMError, LLMProvider, T

_client: genai.Client | None = None


def _get_client() -> genai.Client:
    global _client
    if not settings.gemini_api_key:
        raise LLMError("Cloud mode isn't set up: add GEMINI_API_KEY to ai-service/.env", "cloud_unavailable")
    if _client is None:
        _client = genai.Client(api_key=settings.gemini_api_key)
    return _client


def _friendly(exc: Exception) -> LLMError:
    if isinstance(exc, errors.APIError):
        if exc.code == 429:
            return LLMError("Gemini's free-tier rate limit was hit. Wait a minute, or use Local for now", "rate_limited")
        if exc.code in (401, 403) or (exc.code == 400 and "API key" in str(exc)):
            return LLMError("Gemini rejected the API key in ai-service/.env", "cloud_error")
        if exc.code == 404:
            return LLMError(f"Gemini model {settings.gemini_model} wasn't found. Check GEMINI_MODEL", "cloud_error")
        return LLMError(f"Gemini error {exc.code}: {exc.message or exc.status}", "cloud_error")
    if isinstance(exc, httpx.HTTPError):
        return LLMError("Can't reach Gemini. Check the internet connection", "cloud_error")
    return LLMError(f"Gemini error: {exc}", "cloud_error")


def _to_gemini(messages: list[dict]) -> tuple[str | None, list[types.Content]]:
    """OpenAI/Ollama-style messages -> (system instruction, contents). Gemini calls the assistant "model"."""
    system = "\n\n".join(m["content"] for m in messages if m["role"] == "system") or None
    contents = [
        types.Content(role="model" if m["role"] == "assistant" else "user", parts=[types.Part(text=m["content"])])
        for m in messages
        if m["role"] != "system"
    ]
    return system, contents


class GeminiProvider(LLMProvider):
    mode = "cloud"

    def __init__(self, model: str | None = None):
        self.model = model or settings.gemini_model

    async def stream_chat(
        self, messages: list[dict], *, temperature: float = 0.1, max_tokens: int | None = None
    ) -> AsyncIterator[str]:
        system, contents = _to_gemini(messages)
        config = types.GenerateContentConfig(system_instruction=system, temperature=temperature)
        try:
            stream = await _get_client().aio.models.generate_content_stream(
                model=self.model, contents=contents, config=config
            )
            async for chunk in stream:
                if chunk.text:
                    yield chunk.text
        except LLMError:
            raise
        except Exception as exc:
            raise _friendly(exc) from exc

    async def chat_json(self, system: str, user: str, schema: type[T]) -> T:
        config = types.GenerateContentConfig(
            system_instruction=system,
            temperature=0,
            response_mime_type="application/json",
            response_json_schema=schema.model_json_schema(),
        )
        try:
            res = await _get_client().aio.models.generate_content(model=self.model, contents=user, config=config)
            return schema.model_validate_json(res.text or "")
        except ValidationError as exc:
            raise LLMError(f"Gemini did not return valid JSON: {exc}", "bad_output") from exc
        except LLMError:
            raise
        except Exception as exc:
            raise _friendly(exc) from exc

    async def vision(self, prompt: str, image: bytes, mime_type: str) -> str:
        contents = [types.Part.from_bytes(data=image, mime_type=mime_type), prompt]
        try:
            res = await _get_client().aio.models.generate_content(
                model=self.model, contents=contents, config=types.GenerateContentConfig(temperature=0)
            )
            return (res.text or "").strip()
        except LLMError:
            raise
        except Exception as exc:
            raise _friendly(exc) from exc
