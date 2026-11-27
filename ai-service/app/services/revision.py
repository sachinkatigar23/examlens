"""Last-night revision sheet: one printable page per unit, from the student's notes of that unit.
(The top questions on the page come from the question data in Node, not from the model.)"""

from collections.abc import AsyncIterator

from app.schemas import RevisionRequest
from app.services.llm import LLMError, get_provider
from app.services.retrieval import citations, context_block, ensure_citations, search_notes, sse

PER_TOPIC = 2  # excerpts per topic
MAX_EXCERPTS = 14  # ~11k characters: fits the local model's window with room for the sheet
MIN_SCORE = 0.5

SYSTEM = """You are ExamLens, making a one-page revision sheet a student reads the night before the exam.
Use only facts from the note excerpts and cite the page after each fact like this: [p. 12]
Be brief: short lines, no paragraphs. Use Markdown. Code goes in a fenced block with its language."""

SHAPE = """Make the last-night revision sheet for {unit}{title}. Its topics: {topics}.

Use exactly these sections:
## Key definitions
8 to 12 bullets, at least one per topic: - **term**: one-line definition [p. N]
## Diagrams to draw
A bullet per diagram the notes describe: - **name**: what to draw and its labels [p. N]
(write "None in this unit" if the notes describe none)
## Formulas and code
Formulas, or a short code snippet in a fenced block, only if they are in the notes
(write "None in this unit" if there are none)
## Must remember
5 one-line facts examiners look for [p. N]

The whole sheet must fit on one printed page."""


async def sheet_stream(req: RevisionRequest) -> AsyncIterator[str]:
    try:
        provider = get_provider(req.mode)
        meta = {"provider": provider.mode, "model": provider.model}
        hits, seen = [], set()
        for topic in req.topics[:12]:
            for h in await search_notes(req.space_id, topic, PER_TOPIC, unit=req.unit):
                if h.id not in seen and h.score >= MIN_SCORE:
                    seen.add(h.id)
                    hits.append(h)
        hits = hits[:MAX_EXCERPTS]
        if not hits:
            yield sse("error", {"message": f"No notes for {req.unit} yet. Upload them in Documents first.", "code": "no_notes"})
            return

        request = SHAPE.format(unit=req.unit, title=f" ({req.unit_title})" if req.unit_title else "", topics=", ".join(req.topics))
        messages = [{"role": "system", "content": SYSTEM},
                    {"role": "user", "content": f"Note excerpts:\n\n{context_block(hits)}\n\n---\n{request}"}]
        sheet = ""
        async for token in provider.stream_chat(messages, max_tokens=1200):
            sheet += token
            yield sse("token", {"text": token})
        done = {"grounded": True, **meta}
        if (fixed := ensure_citations(sheet, hits)) != sheet:
            sheet, done["content"] = fixed, fixed
        yield sse("done", {"citations": citations(hits, sheet), **done})
    except LLMError as exc:
        yield sse("error", {"message": str(exc), "code": exc.code})
    except Exception as exc:
        yield sse("error", {"message": f"The AI service hit a problem ({type(exc).__name__})", "code": "internal"})
