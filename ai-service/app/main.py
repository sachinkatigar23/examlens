"""ExamLens AI service: PDF parsing, embeddings, retrieval and LLM calls. Internal only (X-Service-Key)."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.routers import ask, documents, health, ingest, rematch, study
from app.services import qdrant

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logging.getLogger("httpx").setLevel(logging.WARNING)  # one line per Ollama/Qdrant call is too noisy
log = logging.getLogger("examlens")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    try:
        await qdrant.ensure_collections()
        log.info("Qdrant collections ready")
    except Exception as exc:
        # Start anyway so /health can report the problem; ingest/ask will fail with a clear error.
        log.error("Qdrant not reachable at startup (%s). Is `docker compose up -d` running?", exc)
    yield


app = FastAPI(title="ExamLens AI service", lifespan=lifespan)

for module in (health, ingest, ask, rematch, documents, study):
    app.include_router(module.router)
