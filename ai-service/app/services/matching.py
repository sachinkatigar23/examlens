"""Question -> syllabus topic, and question -> same question in another year's paper."""

from app.config import settings
from app.services import qdrant
from app.services.embeddings import embed_queries


async def match_topics(space_id: str, texts: list[str]) -> list[tuple[str | None, float | None]]:
    """For each question text: (topic_id, score) of the closest syllabus topic, or (None, None)."""
    if not texts:
        return []
    vectors = await embed_queries(texts)
    matches = []
    for vector in vectors:
        hits = await qdrant.search(
            qdrant.TOPICS, vector, space_id, limit=1, min_score=settings.topic_match_min_score
        )
        matches.append((hits[0].payload["topic_id"], round(hits[0].score, 3)) if hits else (None, None))
    return matches


async def find_repeat_group(space_id: str, vector: list[float], year: int, document_id: str) -> str | None:
    """repeat_group of a near-identical question from a different year, if there is one."""
    hits = await qdrant.search(
        qdrant.QUESTIONS,
        vector,
        space_id,
        limit=1,
        min_score=settings.repeat_min_score,
        exclude=[qdrant.field_is("year", year), qdrant.field_is("document_id", document_id)],
    )
    return hits[0].payload["repeat_group"] if hits else None
