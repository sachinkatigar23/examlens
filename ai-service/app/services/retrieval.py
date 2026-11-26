"""Retrieval from the student's NOTES (never the syllabus, papers or question bank) + citation helpers."""

import json
import re

from app.services import qdrant
from app.services.embeddings import embed_queries

CITE = re.compile(r"\[p\.\s*(\d+)\]")


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


def citations(hits, answer: str) -> list[dict]:
    """One citation per (document, page). If the answer cites pages, keep only those. If none of its cited pages
    were in the excerpts (a small model sometimes invents a page number), list the excerpts that were used."""
    cited_pages = {int(p) for p in CITE.findall(answer)}
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
