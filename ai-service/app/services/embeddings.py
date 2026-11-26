"""Text -> 768-dim vectors with nomic-embed-text on Ollama.

nomic-embed-text was trained with task prefixes, and retrieval is noticeably worse without them:
stored text gets "search_document: ", questions get "search_query: ".
"""

from app.config import settings
from app.services.llm import OllamaError, ollama_post

BATCH = 32


async def _embed(texts: list[str]) -> list[list[float]]:
    vectors: list[list[float]] = []
    for i in range(0, len(texts), BATCH):
        data = await ollama_post("/api/embed", {"model": settings.embed_model, "input": texts[i : i + BATCH]})
        vectors.extend(data["embeddings"])
    if len(vectors) != len(texts):
        raise OllamaError("Embedding model returned the wrong number of vectors")
    return vectors


async def embed_documents(texts: list[str]) -> list[list[float]]:
    return await _embed([f"search_document: {t}" for t in texts])


async def embed_queries(texts: list[str]) -> list[list[float]]:
    return await _embed([f"search_query: {t}" for t in texts])
