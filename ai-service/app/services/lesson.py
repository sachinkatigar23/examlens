"""Study mode: teach one syllabus topic from scratch, using only the student's notes for the facts."""

from collections.abc import AsyncIterator

from app.schemas import LessonRequest
from app.services.llm import LLMError, get_provider
from app.services.retrieval import citations, context_block, search_notes, sse

LESSON_EXCERPTS = 8
MIN_SCORE = 0.5  # below this the notes don't really cover the topic
NOT_COVERED = (
    "Your notes don't seem to cover this topic yet. Upload the notes for this unit "
    "(or pick the unit when uploading) and regenerate."
)

SYSTEM = """You are ExamLens, a patient tutor. Teach ONE topic to a student who is seeing it for the first time,
in simple English, using the note excerpts as the source of every fact.
Rules:
1. Facts come only from the excerpts. Cite the page after each fact like this: [p. 12]
2. The real-life analogy and the exam tip are yours; everything else must come from the notes.
3. Stay on this topic. Use Markdown. Code goes in a fenced block with its language."""

SHAPE = """Teach the topic "{name}" ({unit}). It covers: {details}

Use exactly these sections:
## What it is
<2-4 simple sentences> [p. N]
## Real-life analogy
<one everyday comparison that makes it click>
## How it works
1. <step> [p. N]
2. <step> [p. N]
(as many steps as needed)
## Key terms
- **<term>**: <meaning in one line> [p. N]
## Example
<a small worked example, or code in a fenced block, from the notes>
## What to draw in the exam
<the diagram to draw and its labels; write "No diagram needed" if none fits>
## Exam tip
<one sentence: how this is usually asked and what examiners look for>"""


async def lesson_stream(req: LessonRequest) -> AsyncIterator[str]:
    try:
        provider = get_provider(req.mode)
        meta = {"provider": provider.mode, "model": provider.model}
        # The name leads: a derived topic's details are a list of questions that can drift to neighbouring topics.
        query = f"{req.name}. {req.name}: {req.details[:300]}" if req.details else req.name
        hits = await search_notes(req.space_id, query, LESSON_EXCERPTS, unit=req.unit, topic_id=req.topic_id)
        hits = [h for h in hits if h.score >= MIN_SCORE]
        if not hits:
            yield sse("token", {"text": NOT_COVERED})
            yield sse("done", {"citations": [], "grounded": False, **meta})
            return

        messages = [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": f"Note excerpts:\n\n{context_block(hits)}\n\n---\n"
                                        + SHAPE.format(name=req.name, unit=req.unit or "", details=req.details or req.name)},
        ]
        lesson = ""
        async for token in provider.stream_chat(messages, temperature=0.2, max_tokens=1400):
            lesson += token
            yield sse("token", {"text": token})
        yield sse("done", {"citations": citations(hits, lesson), "grounded": True, **meta})
    except LLMError as exc:
        yield sse("error", {"message": str(exc), "code": exc.code})
    except Exception as exc:
        yield sse("error", {"message": f"The AI service hit a problem ({type(exc).__name__})", "code": "internal"})
