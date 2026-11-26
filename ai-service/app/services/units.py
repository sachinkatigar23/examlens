"""Tag note chunks with the unit + syllabus topic they belong to (used by Study mode and unit-scoped chat)."""

from app.config import settings
from app.services import qdrant


async def tag_chunks(space_id: str, vectors: list[list[float]], unit: str | None) -> list[tuple[str | None, str | None]]:
    """For each chunk vector: (unit, topic_id). If the student picked a unit, the chunk keeps it and only that
    unit's topics are candidates; for "Mixed" notes the unit comes from the nearest topic."""
    must = [qdrant.field_is("unit", unit)] if unit else None
    results = await qdrant.search_many(
        qdrant.TOPICS, vectors, space_id, limit=1, min_score=settings.chunk_topic_min_score, must=must
    )
    tags = []
    for points in results:
        if points:
            tags.append((unit or points[0].payload["unit"], points[0].payload["topic_id"]))
        else:
            tags.append((unit, None))
    return tags


async def retag_document(space_id: str, document_id: str, unit: str | None) -> int:
    """Re-tags an already indexed notes document (the syllabus arrived later, or changed). No re-embedding:
    the stored chunk vectors are reused."""
    points = await qdrant.scroll_all(
        qdrant.CHUNKS, space_id, must=[qdrant.field_is("document_id", document_id)], with_vectors=True
    )
    if not points:
        return 0
    tags = await tag_chunks(space_id, [p.vector for p in points], unit)
    await qdrant.set_payloads(
        qdrant.CHUNKS, [(p.id, {"unit": u, "topic_id": t}) for p, (u, t) in zip(points, tags, strict=True)]
    )
    return len(points)
