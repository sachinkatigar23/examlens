"""Snap a doubt: photo of a question / code -> plain text the student can correct before it is solved."""

from pathlib import Path

from app.config import settings
from app.services.llm import Mode, get_provider

MIME = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}

PROMPT = """Transcribe the exam question, problem or code in this photo exactly as written.
- Keep numbers, symbols and formulas (write them in plain text, e.g. x^2, sqrt(x)).
- Put code in a fenced block with its language, keeping indentation.
- If there is a diagram, describe it in one line in [brackets].
Do NOT solve it or add anything else. Output only the transcription."""


def resolve_image(file_path: str) -> Path:
    images = (settings.upload_path / "images").resolve()
    path = (settings.upload_path / file_path).resolve()
    if path.parent != images or path.suffix.lower() not in MIME:  # only files inside uploads/images/
        raise ValueError("Invalid image path")
    if not path.exists():
        raise FileNotFoundError("The photo is missing on disk")
    return path


async def transcribe(file_path: str, mode: Mode) -> dict:
    path = resolve_image(file_path)
    provider = get_provider(mode)
    text = await provider.vision(PROMPT, path.read_bytes(), MIME[path.suffix.lower()])
    model = settings.vision_model_local if mode == "local" else provider.model
    return {"text": text, "provider": mode, "model": model}
