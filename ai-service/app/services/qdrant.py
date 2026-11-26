"""Qdrant access. Every search is filtered by space_id: this is what keeps one user's notes
from ever showing up in another user's answers (Node has already checked the user owns the space)."""

import uuid

from qdrant_client import AsyncQdrantClient, models

from app.config import settings

VECTOR_SIZE = 768
CHUNKS, TOPICS, QUESTIONS = "chunks", "topics", "questions"

# collection -> payload fields that get an index (filtered fields must be indexed to stay fast)
COLLECTIONS = {
    CHUNKS: {"space_id": "keyword", "document_id": "keyword", "kind": "keyword", "unit": "keyword", "topic_id": "keyword"},
    TOPICS: {"space_id": "keyword", "document_id": "keyword", "unit": "keyword", "derived": "bool"},
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


def space_filter(space_id: str, must: list | None = None, must_not: list | None = None) -> models.Filter:
    """Every query starts from the tenant filter; extra conditions are added to it, never replace it."""
    return models.Filter(must=[field_is("space_id", space_id), *(must or [])], must_not=must_not or [])


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
    must: list[models.Condition] | None = None,  # extra conditions, e.g. [field_is("kind", "notes")]
) -> list[models.ScoredPoint]:
    result = await client.query_points(
        collection,
        query=vector,
        query_filter=space_filter(space_id, must, exclude),
        limit=limit,
        score_threshold=min_score,
        with_payload=True,
    )
    return result.points


async def delete_document(document_id: str) -> None:
    selector = models.FilterSelector(filter=models.Filter(must=[field_is("document_id", document_id)]))
    for name in COLLECTIONS:
        await client.delete(name, points_selector=selector, wait=True)


async def search_many(
    collection: str, vectors: list[list[float]], space_id: str, limit: int, min_score: float | None = None,
    must: list[models.Condition] | None = None,
) -> list[list[models.ScoredPoint]]:
    """Same as search() for many vectors in one round trip."""
    if not vectors:
        return []
    requests = [
        models.QueryRequest(query=v, filter=space_filter(space_id, must), limit=limit, score_threshold=min_score,
                            with_payload=True)
        for v in vectors
    ]
    responses = await client.query_batch_points(collection, requests=requests)
    return [r.points for r in responses]


async def count(collection: str, space_id: str, must: list[models.Condition] | None = None) -> int:
    return (await client.count(collection, count_filter=space_filter(space_id, must), exact=True)).count


async def scroll_all(collection: str, space_id: str, must: list[models.Condition] | None = None,
                     with_vectors: bool = False) -> list[models.Record]:
    points, offset = [], None
    while True:
        batch, offset = await client.scroll(collection, scroll_filter=space_filter(space_id, must), limit=256,
                                            offset=offset, with_payload=True, with_vectors=with_vectors)
        points.extend(batch)
        if offset is None:
            return points


async def set_payloads(collection: str, updates: list[tuple[str, dict]]) -> None:
    """[(point_id, payload fields to set)], sent in batches."""
    ops = [models.SetPayloadOperation(set_payload=models.SetPayload(payload=p, points=[pid])) for pid, p in updates]
    for i in range(0, len(ops), 256):
        await client.batch_update_points(collection, update_operations=ops[i : i + 256], wait=True)


async def delete_where(collection: str, space_id: str, must: list[models.Condition]) -> None:
    selector = models.FilterSelector(filter=space_filter(space_id, must))
    await client.delete(collection, points_selector=selector, wait=True)
