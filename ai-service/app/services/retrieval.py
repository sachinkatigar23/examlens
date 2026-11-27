"""Retrieval from the student's NOTES (never the syllabus, papers or question bank) + citation helpers."""

import json
import re

from app.services import qdrant
from app.services.embeddings import embed_queries

# "[p. 12]", and the multi-page "[p. 2, 8]" / "[p. 2, p. 8]" that Gemini writes.
CITE = re.compile(r"\[p\.\s*(\d+(?:\s*,\s*(?:p\.\s*)?\d+)*)\]")


def cited_pages_of(text: str) -> set[int]:
    return {int(n) for group in CITE.findall(text) for n in re.findall(r"\d+", group)}


def _keep_real(match: re.Match, real_pages: set[int]) -> str:
    """A citation keeps only the pages that were retrieved; one with none left is removed."""
    pages = [n for n in re.findall(r"\d+", match.group(1)) if int(n) in real_pages]
    return f"[p. {', '.join(pages)}]" if pages else ""


def sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


async def search_notes(space_id: str, query: str, limit: int, unit: str | None = None, topic_id: str | None = None):
    """Top note chunks for `query`. With a unit/topic it first searches inside it and tops up from the whole
    notebook, so a unit with little material still gets an answer (unit tags can be wrong for "Mixed" notes)."""
    [vector] = await embed_queries([query])
    notes_only = [qdrant.field_is("kind", "notes")]
    hits = []
    if topic_id:
        hits += await qdrant.search(qdrant.CHUNKS, vector, space_id, limit=limit, must=[*notes_only, qdrant.field_is("topic_id", topic_id)])
    if unit:
        hits += await qdrant.search(qdrant.CHUNKS, vector, space_id, limit=limit, must=[*notes_only, qdrant.field_is("unit", unit)])
    if len(hits) < limit:
        hits += await qdrant.search(qdrant.CHUNKS, vector, space_id, limit=limit, must=notes_only)

    unique, seen = [], set()
    for h in sorted(hits, key=lambda h: -h.score):
        if h.id not in seen:
            seen.add(h.id)
            unique.append(h)
    return unique[:limit]


def context_block(hits) -> str:
    return "\n\n".join(f"Excerpt {i} [p. {h.payload['page']}]:\n{h.payload['text']}" for i, h in enumerate(hits, 1))


_WORD = re.compile(r"[a-z0-9]{3,}")
_STOP = set("the and for with that this are was were from into its their them they which what when where how "
            "can has have had not but also than then there these those such each other use used using".split())
# A line needs this many words before it is a "fact" worth a citation, and must share this many content words
# with an excerpt before that excerpt's page is put on it.
CITE_MIN_WORDS = 8
CITE_MIN_SHARED = 3


def _content(text: str) -> set[str]:
    return {w for w in _WORD.findall(text.lower()) if w not in _STOP}


UNLINKED = ("*ExamLens couldn't link this answer to a page of your notes, so it may come from the model's general "
            "knowledge. Check it against your notes or textbook.*")


def ensure_citations(answer: str, hits) -> str:
    """Every answer from the notes must show its pages, and only real ones.
    1. A citation of a page that wasn't among the excerpts is invented: it is removed.
    2. Each paragraph or bullet without a citation gets the page of the excerpt it shares most words with
       (a small model sometimes cites nothing: measured 1 of 2 five-mark answers). Code blocks, headings,
       table rows and short lines are left alone.
    3. If no line could be linked to any excerpt, the answer says so instead of showing unrelated pages.
    Returns the answer unchanged when it already cites every substantial line correctly."""
    if not hits or not answer.strip():
        return answer
    real_pages = {h.payload["page"] for h in hits}
    answer = CITE.sub(lambda m: _keep_real(m, real_pages), answer)
    answer = re.sub(r"[ \t]+(?=\n|$)", "", answer)  # the space a removed citation leaves at a line end
    excerpts = [(h.payload["page"], _content(h.payload["text"])) for h in hits]
    lines, in_code = answer.split("\n"), False
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith("```"):
            in_code = not in_code
            continue
        if in_code or stripped.startswith(("#", "|")) or CITE.search(line) or len(stripped.split()) < CITE_MIN_WORDS:
            continue
        words = _content(stripped)
        shared, page = max(((len(words & ex), page) for page, ex in excerpts), key=lambda x: x[0])
        if shared >= CITE_MIN_SHARED:
            lines[i] = f"{line.rstrip()} [p. {page}]"
    fixed = "\n".join(lines)
    if not CITE.search(fixed):
        fixed = f"{fixed.rstrip()}\n\n{UNLINKED}"
    return fixed


def is_unlinked(answer: str) -> bool:
    return UNLINKED in answer


def citations(hits, answer: str) -> list[dict]:
    """One citation per (document, page). If the answer cites pages, keep only those. If none of its cited pages
    were in the excerpts (a small model sometimes invents a page number), list the excerpts that were used."""
    if is_unlinked(answer):
        return []  # nothing in the answer came from these excerpts: showing them as sources would mislead
    cited_pages = cited_pages_of(answer)
    if cited_pages and not cited_pages & {h.payload["page"] for h in hits}:
        cited_pages = set()
    result, seen = [], set()
    for h in hits:
        key = (h.payload["document_id"], h.payload["page"])
        if key in seen or (cited_pages and h.payload["page"] not in cited_pages):
            continue
        seen.add(key)
        text = h.payload["text"]
        result.append({
            "document_id": key[0],
            "page": key[1],
            "snippet": text[:280] + ("…" if len(text) > 280 else ""),
            "score": round(h.score, 3),
        })
    return result
