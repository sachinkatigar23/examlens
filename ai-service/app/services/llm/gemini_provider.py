"""Cloud provider: Google Gemini through the official google-genai SDK.

Privacy: callers only ever send the question, the retrieved note passages and (for photos) the image.
Whole PDFs are never sent: ingestion always runs locally.
"""

import asyncio
import re
from collections.abc import AsyncIterator

import httpx
from google import genai
from google.genai import errors, types
from pydantic import ValidationError

from app.config import settings
from app.services.llm.base import LLMError, LLMProvider, T

_client: genai.Client | None = None

# Gemini answers 503 "model is overloaded" now and then (measured: 1 in 2 first calls on a busy model); a short
# retry almost always works. Streams are only retried before any text was sent, so nothing is duplicated.
RETRYABLE = {500, 503}
# An overloaded model can also open a stream and then send nothing (measured: 100 s of silence). Give up after
# this long without a piece of text, and on any single non-streamed call after HTTP_TIMEOUT_MS.
STALL_SECONDS = 45
HTTP_TIMEOUT_MS = 120_000
RETRY_DELAYS = (1.5, 4.0)


async def _retrying(call):
    for delay in (*RETRY_DELAYS, None):
        try:
            return await call()
        except errors.APIError as exc:
            if exc.code not in RETRYABLE or delay is None:
                raise
            await asyncio.sleep(delay)


def _get_client() -> genai.Client:
    global _client
    if not settings.gemini_api_key:
        raise LLMError("Cloud mode isn't set up: add GEMINI_API_KEY to ai-service/.env", "cloud_unavailable")
    if _client is None:
        _client = genai.Client(api_key=settings.gemini_api_key, http_options=types.HttpOptions(timeout=HTTP_TIMEOUT_MS))
    return _client


def _friendly(exc: Exception, model: str) -> LLMError:
    if isinstance(exc, errors.APIError):
        if exc.code == 429:
            # The free tier has a per-minute AND a small per-day limit per model (20 requests/day on
            # gemini-3.6-flash when measured). Say which one, so "wait a minute" isn't wrong advice.
            if "PerDay" in str(exc):
                hours = re.search(r"retryDelay'?:\s*'(\d+)s", str(exc))
                when = f" (resets in about {round(int(hours.group(1)) / 3600)} h)" if hours else ""
                return LLMError(f"Gemini's free daily limit for {model} is used up{when}. "
                                "Use Local, or set another GEMINI_MODEL", "rate_limited")
            return LLMError("Gemini's free-tier rate limit was hit. Wait a minute, or use Local for now", "rate_limited")
        if exc.code in (401, 403) or (exc.code == 400 and "API key" in str(exc)):
            return LLMError("Gemini rejected the API key in ai-service/.env", "cloud_error")
        if exc.code in RETRYABLE:
            return LLMError("Gemini is overloaded right now. Try again in a minute, or use Local", "cloud_busy")
        if exc.code == 404:
            return LLMError(f"Gemini model {model} wasn't found. Check GEMINI_MODEL", "cloud_error")
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
            for delay in (*RETRY_DELAYS, None):
                sent = False
                try:
                    stream = await _get_client().aio.models.generate_content_stream(
                        model=self.model, contents=contents, config=config
                    )
                    pieces = aiter(stream)
                    while True:
                        try:
                            chunk = await asyncio.wait_for(anext(pieces), STALL_SECONDS)
                        except StopAsyncIteration:
                            return
                        except TimeoutError:
                            raise LLMError(
                                "Gemini stopped responding. Try again in a minute, or use Local", "cloud_busy"
                            ) from None
                        if chunk.text:
                            sent = True
                            yield chunk.text
                except errors.APIError as exc:
                    if sent or exc.code not in RETRYABLE or delay is None:
                        raise
                    await asyncio.sleep(delay)
        except LLMError:
            raise
        except Exception as exc:
            raise _friendly(exc, self.model) from exc

    async def chat_json(self, system: str, user: str, schema: type[T]) -> T:
        config = types.GenerateContentConfig(
            system_instruction=system,
            temperature=0,
            response_mime_type="application/json",
            response_json_schema=schema.model_json_schema(),
        )
        try:
            res = await _retrying(
                lambda: _get_client().aio.models.generate_content(model=self.model, contents=user, config=config)
            )
            return schema.model_validate_json(res.text or "")
        except ValidationError as exc:
            raise LLMError(f"Gemini did not return valid JSON: {exc}", "bad_output") from exc
        except LLMError:
            raise
        except Exception as exc:
            raise _friendly(exc, self.model) from exc

    async def vision(self, prompt: str, image: bytes, mime_type: str) -> str:
        contents = [types.Part.from_bytes(data=image, mime_type=mime_type), prompt]
        try:
            res = await _retrying(
                lambda: _get_client().aio.models.generate_content(
                    model=self.model, contents=contents, config=types.GenerateContentConfig(temperature=0)
                )
            )
            return (res.text or "").strip()
        except LLMError:
            raise
        except Exception as exc:
            raise _friendly(exc, self.model) from exc
