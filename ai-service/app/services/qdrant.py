"""Qdrant access. Every search is filtered by space_id: this is what keeps one user's notes
from ever showing up in another user's answers (Node has already checked the user owns the space)."""

import uuid

from qdrant_client import AsyncQdrantClient, models

from app.config import settings

VECTOR_SIZE = 768
CHUNKS, TOPICS, QUESTIONS = "chunks", "topics", "questions"

# collection -> payload fields that get an index (filtered fields must be indexed to stay fast)
COLLECTIONS = {
    CHUNKS: {"space_id": "keyword", "document_id": "keyword"},
    TOPICS: {"space_id": "keyword", "document_id": "keyword"},
    QUESTIONS: {"space_id": "keyword", "document_id": "keyword", "year": "integer"},
}

client = AsyncQdrantClient(url=settings.qdrant_url, timeout=30)


async def ensure_collections() -> None:
    existing = {c.name for c in (await client.get_collections()).collections}
    for name, indexes in COLLECTIONS.items():
        if name not in existing:
            await client.create_collection(
                name, vectors_config=models.VectorParams(size=VECTOR_SIZE, distance=models.Distance.COSINE)
            )
        for field, schema in indexes.items():
            await client.create_payload_index(name, field_name=field, field_schema=schema)


def field_is(field: str, value) -> models.FieldCondition:
    return models.FieldCondition(key=field, match=models.MatchValue(value=value))


async def upsert(collection: str, vectors: list[list[float]], payloads: list[dict]) -> None:
    points = [
        models.PointStruct(id=str(uuid.uuid4()), vector=v, payload=p) for v, p in zip(vectors, payloads, strict=True)
    ]
    for i in range(0, len(points), 128):
        await client.upsert(collection, points=points[i : i + 128], wait=True)


async def search(
    collection: str,
    vector: list[float],
    space_id: str,
    limit: int,
    min_score: float | None = None,
    exclude: list[models.FieldCondition] | None = None,  # e.g. [field_is("year", 2023)]
) -> list[models.ScoredPoint]:
    result = await client.query_points(
        collection,
        query=vector,
        query_filter=models.Filter(must=[field_is("space_id", space_id)], must_not=exclude or []),
        limit=limit,
        score_threshold=min_score,
        with_payload=True,
    )
    return result.points


async def delete_document(document_id: str) -> None:
    selector = models.FilterSelector(filter=models.Filter(must=[field_is("document_id", document_id)]))
    for name in COLLECTIONS:
        await client.delete(name, points_selector=selector, wait=True)
