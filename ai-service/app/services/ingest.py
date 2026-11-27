"""The background job behind POST /ingest: PDF -> text -> vectors (+ topics / questions) -> callback to Node."""

import asyncio
import logging
import os
import time
from pathlib import Path

from app.config import settings
from app.schemas import IngestRequest
from app.services import qdrant
from app.services.chunking import chunk_pages
from app.services.embeddings import embed_documents
from app.services.important import derive_topics, extract_important
from app.services.llm import LLMError
from app.services.matching import find_repeat_group, match_topics
from app.services.node_client import update_document
from app.services.pdf import Page, ScannedPdfError, extract_pages
from app.services.questions import extract_questions
from app.services.syllabus import extract_topics, topic_embedding_text
from app.services.units import tag_chunks

log = logging.getLogger("examlens.ingest")

# One document at a time: the 4 GB GPU holds both models, but parallel LLM jobs would only queue inside
# Ollama and make Ask feel slow. Uploads simply wait their turn ("queued").
_one_at_a_time = asyncio.Semaphore(1)


def new_object_id() -> str:
    """A MongoDB-style ObjectId (4-byte time + 8 random bytes, hex). The AI service creates topic/question ids
    so the same id is used in Qdrant and in MongoDB."""
    return f"{int(time.time()):08x}{os.urandom(8).hex()}"


def _resolve(file_path: str) -> Path:
    path = (settings.upload_path / file_path).resolve()
    if path.parent != settings.upload_path:  # no "../" tricks
        raise ValueError("Invalid file path")
    if not path.exists():
        raise FileNotFoundError("The uploaded file is missing on disk")
    return path


async def _ingest_chunks(req: IngestRequest, pages: list[Page]) -> int:
    chunks = chunk_pages(pages)
    if not chunks:
        return 0
    vectors = await embed_documents([c.text for c in chunks])
    # Notes are tagged with their unit + nearest syllabus topic (Study mode retrieves by these).
    tags = await tag_chunks(req.space_id, vectors, req.unit) if req.kind == "notes" else [(None, None)] * len(chunks)
    payloads = [
        {"space_id": req.space_id, "document_id": req.document_id, "page": c.page, "kind": req.kind, "text": c.text,
         "unit": unit, "topic_id": topic_id}
        for c, (unit, topic_id) in zip(chunks, tags, strict=True)
    ]
    await qdrant.upsert(qdrant.CHUNKS, vectors, payloads)
    return len(chunks)


async def _save_topics(req: IngestRequest, topics: list[dict]) -> list[dict]:
    for order, t in enumerate(topics):
        t["id"], t["order"] = new_object_id(), order
    vectors = await embed_documents([topic_embedding_text(t) for t in topics])
    payloads = [
        {"space_id": req.space_id, "document_id": req.document_id, "topic_id": t["id"], "unit": t["unit"],
         "name": t["name"], "derived": t.get("derived", False)}
        for t in topics
    ]
    await qdrant.upsert(qdrant.TOPICS, vectors, payloads)
    return topics


async def _ingest_topics(req: IngestRequest, pages: list[Page]) -> list[dict]:
    topics = await extract_topics(pages)
    if not topics:
        raise ValueError("Couldn't find any units or topics in this syllabus")
    # A real syllabus replaces topics that were only derived from a question bank.
    await qdrant.delete_where(qdrant.TOPICS, req.space_id, [qdrant.field_is("derived", True)])
    return await _save_topics(req, topics)


async def _ingest_important(req: IngestRequest, pages: list[Page]) -> tuple[list[dict], list[dict]]:
    """College question bank -> (questions, derived topics). Topics are derived only when the notebook has none."""
    questions, method = await extract_important(pages)
    log.info("question bank %s: %s questions via %s", req.document_id, len(questions), method)
    if not questions:
        raise ValueError("Couldn't find any questions in this PDF")

    topics = []
    derived_topic_of: dict[int, str] = {}  # question index -> the derived topic it was validated into
    if await qdrant.count(qdrant.TOPICS, req.space_id) == 0:
        topics = await _save_topics(req, await derive_topics(questions))
        derived_topic_of = {i: t["id"] for t in topics for i in t.pop("question_indexes")}
        log.info("no syllabus: derived %s topics from the question bank", len(topics))

    matches = await match_topics(req.space_id, [q["text"] for q in questions], [q["unit"] for q in questions])
    vectors = await embed_documents([q["text"] for q in questions])
    for i, (q, (topic_id, score), vector) in enumerate(zip(questions, matches, vectors, strict=True)):
        # Derived topics come with their questions already assigned (and checked): plain embedding matching
        # against short topic names is what put Minimax under "A*" before.
        chosen = derived_topic_of.get(i, topic_id)
        q["id"], q["topic_id"], q["match_score"] = new_object_id(), chosen, score if chosen == topic_id else None
        # Year 0 = not a dated paper. A paper question that matches it (now or when uploaded later) shares the
        # group, which gives the "also asked in 2023, 2025" badge.
        q["repeat_group"] = await find_repeat_group(req.space_id, q["text"], vector, 0, req.document_id) or q["id"]

    payloads = [
        {"space_id": req.space_id, "document_id": req.document_id, "question_id": q["id"], "year": 0,
         "kind": "important", "repeat_group": q["repeat_group"], "text": q["text"]}
        for q in questions
    ]
    await qdrant.upsert(qdrant.QUESTIONS, vectors, payloads)
    return questions, topics


async def _ingest_questions(req: IngestRequest, pages: list[Page]) -> list[dict]:
    questions, method = await extract_questions(pages)
    log.info("paper %s: %s questions via %s", req.document_id, len(questions), method)
    if not questions:
        raise ValueError("Couldn't find any questions in this paper")
    year = req.year or 0

    matches = await match_topics(req.space_id, [q["text"] for q in questions])
    vectors = await embed_documents([q["text"] for q in questions])
    for q, (topic_id, score), vector in zip(questions, matches, vectors, strict=True):
        q["id"] = new_object_id()
        q["topic_id"], q["match_score"] = topic_id, score
        # Same group as a near-identical question from another year; otherwise a group of its own.
        q["repeat_group"] = await find_repeat_group(req.space_id, q["text"], vector, year, req.document_id) or q["id"]

    payloads = [
        {"space_id": req.space_id, "document_id": req.document_id, "question_id": q["id"], "year": year,
         "repeat_group": q["repeat_group"], "text": q["text"]}
        for q in questions
    ]
    await qdrant.upsert(qdrant.QUESTIONS, vectors, payloads)
    return questions


async def run_ingest(req: IngestRequest) -> None:
    async with _one_at_a_time:
        if await update_document(req.document_id, {"status": "processing"}) == 404:
            return  # deleted while it was waiting in the queue

        started = time.perf_counter()
        try:
            await qdrant.delete_document(req.document_id)  # makes retries start clean
            pages = await asyncio.to_thread(extract_pages, str(_resolve(req.file_path)))
            result: dict = {"status": "ready", "pages": len(pages), "chunkCount": 0}

            if req.kind in ("notes", "syllabus"):
                result["chunkCount"] = await _ingest_chunks(req, pages)
            if req.kind == "syllabus":
                result["topics"] = await _ingest_topics(req, pages)
            if req.kind == "paper":
                result["questions"] = await _ingest_questions(req, pages)
            if req.kind == "important":
                result["questions"], result["topics"] = await _ingest_important(req, pages)
        except (ScannedPdfError, LLMError, ValueError, FileNotFoundError) as exc:
            result = {"status": "failed", "error": str(exc)}
        except Exception as exc:  # anything unexpected: still tell Node, never leave the doc "processing"
            log.exception("ingest crashed for %s", req.document_id)
            result = {"status": "failed", "error": f"Processing failed unexpectedly ({type(exc).__name__})"}

        if result["status"] == "failed":
            await qdrant.delete_document(req.document_id)
        log.info("ingest %s %s %s in %.1fs", req.kind, req.document_id, result["status"], time.perf_counter() - started)

        if await update_document(req.document_id, result) == 404:
            await qdrant.delete_document(req.document_id)  # the document was deleted meanwhile: don't keep orphans
