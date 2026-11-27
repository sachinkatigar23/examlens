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

ANSWER_PROMPT = """This is a student's handwritten exam answer. Transcribe it exactly as written, including spelling
mistakes, so it can be graded fairly.
- Keep the structure: headings, numbered points, bullets and paragraphs on their own lines.
- Write formulas in plain text (x^2, sqrt(x)); put code in a fenced block with its language.
- For each diagram write one line: [Diagram: what it shows, and its labels].
- Mark words you can't read as [illegible].
Do NOT correct, complete or comment on the answer. Output only the transcription."""


def resolve_image(file_path: str) -> Path:
    images = (settings.upload_path / "images").resolve()
    path = (settings.upload_path / file_path).resolve()
    if path.parent != images or path.suffix.lower() not in MIME:  # only files inside uploads/images/
        raise ValueError("Invalid image path")
    if not path.exists():
        raise FileNotFoundError("The photo is missing on disk")
    return path


async def transcribe(file_path: str, mode: Mode, purpose: str = "doubt") -> dict:
    path = resolve_image(file_path)
    provider = get_provider(mode)
    prompt = ANSWER_PROMPT if purpose == "answer" else PROMPT
    text = await provider.vision(prompt, path.read_bytes(), MIME[path.suffix.lower()])
    model = settings.vision_model_local if mode == "local" else provider.model
    return {"text": text, "provider": mode, "model": model}
