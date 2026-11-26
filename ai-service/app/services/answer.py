"""Ask ExamLens: retrieve the student's own note chunks and stream a grounded, cited answer."""

import json
import re
from collections.abc import AsyncIterator

from app.config import settings
from app.schemas import AskRequest
from app.services import qdrant
from app.services.embeddings import embed_queries
from app.services.llm import OllamaError, chat_stream

NOT_FOUND = (
    "I couldn't find this in your notes. Try asking with the words your notes use, "
    "or upload the notes that cover this topic."
)

SYSTEM = """You are ExamLens, helping a university student revise for an exam from their OWN notes.
Rules:
1. Use ONLY the facts in the numbered note excerpts below. No outside knowledge.
2. After each fact, cite the page it came from exactly like this: [p. 12]
3. Be concise and exam-oriented: start with a one-line definition or direct answer, then key points as
   short bullets. Bold the key terms.
4. If the excerpts don't contain the answer, reply only: "I couldn't find this in your notes." """

CITE = re.compile(r"\[p\.\s*(\d+)\]")
HISTORY_TURNS = 4


def sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def _build_messages(req: AskRequest, hits) -> list[dict]:
    context = "\n\n".join(f"Excerpt {i} [p. {h.payload['page']}]:\n{h.payload['text']}" for i, h in enumerate(hits, 1))
    history = [{"role": m.role, "content": m.content[:1500]} for m in req.history[-HISTORY_TURNS:]]
    return [
        {"role": "system", "content": SYSTEM},
        *history,
        {"role": "user", "content": f"Note excerpts:\n\n{context}\n\n---\nQuestion: {req.question}"},
    ]


def _citations(hits, answer: str) -> list[dict]:
    """One citation per (document, page). If the answer cites pages, keep only those."""
    cited_pages = {int(p) for p in CITE.findall(answer)}
    citations, seen = [], set()
    for h in hits:
        key = (h.payload["document_id"], h.payload["page"])
        if key in seen or (cited_pages and h.payload["page"] not in cited_pages):
            continue
        seen.add(key)
        text = h.payload["text"]
        citations.append({
            "document_id": key[0],
            "page": key[1],
            "snippet": text[:280] + ("…" if len(text) > 280 else ""),
            "score": round(h.score, 3),
        })
    return citations


async def answer_stream(req: AskRequest) -> AsyncIterator[str]:
    try:
        # Follow-ups like "explain more" carry little meaning alone; the previous question helps retrieval.
        last_user = next((m.content for m in reversed(req.history) if m.role == "user"), "")
        query = f"{last_user}\n{req.question}" if len(req.question) < 40 and last_user else req.question
        [vector] = await embed_queries([query])
        hits = await qdrant.search(qdrant.CHUNKS, vector, req.space_id, limit=settings.ask_top_k)

        # The guard: if even the best excerpt is only loosely related, don't let the model guess.
        if not hits or hits[0].score < settings.ask_min_score:
            yield sse("token", {"text": NOT_FOUND})
            yield sse("done", {"citations": [], "grounded": False})
            return

        hits = [h for h in hits if h.score >= settings.ask_min_score - 0.1]
        answer = ""
        async for token in chat_stream(_build_messages(req, hits)):
            answer += token
            yield sse("token", {"text": token})

        grounded = "couldn't find this in your notes" not in answer.lower()
        yield sse("done", {"citations": _citations(hits, answer) if grounded else [], "grounded": grounded})
    except OllamaError as exc:
        yield sse("error", {"message": str(exc)})
    except Exception as exc:  # e.g. Qdrant down
        yield sse("error", {"message": f"The AI service hit a problem ({type(exc).__name__})"})
