"""Split page text into overlapping chunks. A chunk never crosses a page, so its page number is exact."""

import re
from dataclasses import dataclass

from app.services.pdf import Page

CHUNK_SIZE = 800
OVERLAP = 150
MIN_CHUNK = 40


@dataclass
class Chunk:
    page: int
    text: str


def _clean(text: str) -> str:
    text = re.sub(r"[ \t]+", " ", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def _break_point(text: str, start: int, end: int) -> int:
    """Prefer to end a chunk at a paragraph, line or sentence boundary in the last third."""
    if end >= len(text):
        return len(text)
    window_start = start + CHUNK_SIZE * 2 // 3
    for sep in ("\n\n", "\n", ". "):
        pos = text.rfind(sep, window_start, end)
        if pos != -1:
            return pos + len(sep)
    return end


def chunk_pages(pages: list[Page]) -> list[Chunk]:
    chunks: list[Chunk] = []
    for page in pages:
        text = _clean(page.text)
        start = 0
        while start < len(text):
            end = _break_point(text, start, start + CHUNK_SIZE)
            piece = text[start:end].strip()
            if len(piece) >= MIN_CHUNK:
                chunks.append(Chunk(page=page.number, text=piece))
            if end >= len(text):
                break
            start = max(end - OVERLAP, start + 1)
    return chunks
