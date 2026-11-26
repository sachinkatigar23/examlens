"""Ask ExamLens / exam answers / photographed doubts: retrieve the student's notes and stream a grounded,
cited answer shaped for the marks the question carries."""

import re
from collections.abc import AsyncIterator

from app.config import settings
from app.schemas import AskRequest
from app.services.llm import LLMError, get_provider
from app.services.retrieval import citations, context_block, search_notes, sse

NOT_FOUND = (
    "I couldn't find this in your notes. Try asking with the words your notes use, "
    "or upload the notes that cover this topic."
)
DEFAULT_MARKS = 5
HISTORY_TURNS = 4
FOLLOW_UP_WORDS = 8
# "explain it more simply", "give another example", "what about the second one?"
FOLLOW_UP = re.compile(r"\b(it|its|this|that|these|those|them|more|again|simpler|simply|another|above|previous|one)\b", re.I)

# Longer answers need more material: marks -> how many note excerpts to retrieve.
TOP_K = {2: 4, 5: 6, 10: 10, 16: 12}

# Each format is an ordered outline placed at the END of the prompt: a 3B model follows that far better
# than rules in the system prompt (measured: rules alone gave 1000-word 10-mark answers with no citations).
# Written as instructions, not as a template with <placeholders>: the model copied "<sub-heading for part 1>"
# into its answers. The diagram comes right after the introduction: further down it was dropped 4 times in 5.
FORMATS = {
    2: {
        "words": "40 to 70",
        "shape": """- A definition in 2-3 lines ending with its page, like [p. 4].
- Then one line starting "Example:" with one short example.
- No headings, no bullet list.""",
    },
    5: {
        "words": "150 to 250",
        "shape": """- One introduction line.
- Then 4 to 6 bullets. Each bullet starts with a **bold key term**, then a 1-2 sentence explanation ending with its page, like [p. 7].
- If the topic has one, end with a small example, or code in a fenced block.
- No headings.""",
    },
    10: {
        "words": "350 to 500",
        "shape": """1. "## Introduction": 2-3 lines ending with their page, like [p. 4].
2. "**Diagram to draw:**" on its own line: what to draw and every label on it.
3. Two to four "## " headings naming the main parts of the topic, each with points; end every point with its page, like [p. 7].
4. "## Example": a worked example, code in a fenced block, or a comparison table.
5. "## Advantages and disadvantages": only if the topic has them.
6. "## Conclusion": 2 lines.""",
    },
    16: {
        "words": "600 to 800",
        "shape": """1. "## Introduction": 3-4 lines ending with their page, like [p. 4].
2. "**Diagram to draw:**" on its own line: what to draw and every label on it.
3. Four to six "## " headings naming the main parts of the topic, each explained in depth with points; end every point with its page, like [p. 7].
4. "## Example": a worked example, code in a fenced block, or a comparison table.
5. "## Advantages and disadvantages": if the topic has them.
6. "## Conclusion": 3 lines.""",
    },
}
# Local model only: a hard stop a bit above the target length, so a drifting answer can't run on forever.
MAX_TOKENS = {2: 250, 5: 600, 10: 1300, 16: 1900}

SYSTEM = """You are ExamLens, a tutor helping a university student write exam answers from their OWN notes.
Rules:
1. Use only facts found in the note excerpts. Do not add facts the notes don't support.
   If the question asks for a program, write it (in the language asked) following the method in the notes.
2. After each fact, cite the page it came from exactly like this: [p. 12]
3. Answer only what the question asks. Ignore excerpts about other topics.
4. If the excerpts don't cover the topic at all, reply only: "I couldn't find this in your notes."
   (A program for an algorithm the notes explain IS covered: write it.)
5. Write in Markdown. Never put a citation inside a code block."""

ANSWER_REQUEST = """Question ({marks} marks): {query}

Write a {marks}-mark exam answer of {words} words, ONLY about "{query}".
Structure, in this order:

{shape}

Cite the page after facts like [p. 12]."""
# (A refusal reminder at the END of this request made qwen2.5:3b refuse 7 of 9 on-topic questions: the last
# line wins. Refusals are handled by the system rule + cutting the stream after a refusal line, below.)

REFUSAL = "i couldn't find this in your notes"

DOUBT_SYSTEM = """You are ExamLens, a tutor. The student photographed a problem or a piece of code they are stuck on.
1. Solve it step by step, numbering the steps. Follow the method, notation and terms used in the note
   excerpts, and cite the page you used like this: [p. 12]
2. If it is code: say what the bug is and why, then give the fixed code in a fenced block with its language.
3. If the notes don't cover the method, start with "Your notes don't cover this; using a general method:"
   and solve it anyway.
4. End with the final answer in bold. Write in Markdown."""

# "Write a python program on BFS", "Implement A* in Java", "code for DFS". A program is never IN the notes
# word for word, so with the normal rules a small model refused 3 of 4 such questions ("couldn't find this").
PROGRAM = re.compile(r"\b(program|programme|code|implement(ation)?|source)\b", re.I)
LANGUAGE = re.compile(r"\b(python|java|kotlin|c\+\+|c#|javascript|js|c|sql)\b", re.I)

PROGRAM_SYSTEM = """You are ExamLens, a tutor helping a university student answer a programming question for an exam.
1. Find the algorithm or concept in the note excerpts and follow the steps they describe.
2. Write a complete, correct, runnable program in a fenced code block with its language, with short comments.
3. After the code, explain how it works in 3 to 5 bullets, citing the notes like this: [p. 12]
4. If the excerpts don't describe the algorithm, start with "Your notes don't describe this algorithm; a standard
   version:" and still write the program.
Write in Markdown. Never put a citation inside the code block."""
# No "reply only: I couldn't find this" rule here: with it, qwen2.5:3b refused 1 in 3 program questions whose
# algorithm IS in the notes. Off-topic questions are still stopped earlier by the retrieval score guard.

MARKS_IN_TEXT = re.compile(r"(?:for\s+(?:an?\s+)?|\(\s*)?\b(\d{1,2})\s*[- ]?\s*marks?\b(?:\s*answer)?\s*\)?", re.I)

SMALL_TALK = re.compile(
    r"^\s*(hi+|hello|hey+|hai|namaste|good\s*(morning|afternoon|evening|night)|thanks?|thank\s*you|ty|ok(ay)?|cool|"
    r"bye|who\s+are\s+you|what\s+are\s+you|what\s+can\s+you\s+do|how\s+are\s+you|help)\b[\s!?.,:)]*"
    r"(examlens|there|bro|sir|ma'?am)?[\s!?.,:)]*$",
    re.I,
)
INTRO = (
    "Hi! I'm ExamLens. Ask me anything from the notes in this notebook and I'll answer with page citations; "
    'add "for 10 marks" (or 2, 5, 16) to get an exam-ready answer of that length.'
)


def snap_marks(marks: int | None) -> int:
    """Any mark value -> the nearest answer format we have (2, 5, 10, 16)."""
    if not marks:
        return DEFAULT_MARKS
    return 2 if marks <= 3 else 5 if marks <= 7 else 10 if marks <= 12 else 16


def detect_marks(question: str) -> tuple[int | None, str]:
    """("Explain BFS for a 10-mark answer") -> (10, "Explain BFS"). The marks phrase is removed so it
    doesn't pull retrieval towards unrelated text."""
    m = MARKS_IN_TEXT.search(question)
    if not m:
        return None, question
    cleaned = (question[: m.start()] + question[m.end() :]).strip(" .,-:")
    return int(m.group(1)), cleaned or question


def is_follow_up(question: str) -> bool:
    return len(question.split()) <= FOLLOW_UP_WORDS and bool(FOLLOW_UP.search(question))


def small_talk_reply(question: str) -> str | None:
    if not SMALL_TALK.match(question):
        return None
    if re.match(r"\s*(thanks?|thank\s*you|ty)\b", question, re.I):
        return "You're welcome! Good luck with the revision."
    if re.match(r"\s*bye\b", question, re.I):
        return "Bye! Come back any time before the exam."
    return INTRO


def _messages(req: AskRequest, hits, marks: int, query: str) -> list[dict]:
    context = context_block(hits)
    if req.purpose == "doubt":
        return [
            {"role": "system", "content": DOUBT_SYSTEM},
            {"role": "user", "content": f"Note excerpts:\n\n{context}\n\n---\nThe problem:\n{req.question}"},
        ]
    # Chat history only for short follow-ups ("explain it more simply"). For a full question it hurts: earlier
    # one-paragraph answers taught the model to ignore the 10-mark structure (measured in the Ask tab).
    history = []
    if req.purpose == "ask" and is_follow_up(query):
        history = [{"role": m.role, "content": m.content[:1500]} for m in req.history[-HISTORY_TURNS:]]
    if PROGRAM.search(query):
        language = (LANGUAGE.search(query) or ["Python"])[0]
        return [
            {"role": "system", "content": PROGRAM_SYSTEM},
            *history,
            {"role": "user", "content": f"Note excerpts:\n\n{context}\n\n---\nQuestion ({marks} marks): {query}\n"
                                        f"Write the program in {language}, then explain it with page citations."},
        ]
    return [
        {"role": "system", "content": SYSTEM},
        *history,
        {"role": "user", "content": f"Note excerpts:\n\n{context}\n\n---\n"
                                    + ANSWER_REQUEST.format(marks=marks, query=query, **FORMATS[marks])},
    ]


async def answer_stream(req: AskRequest) -> AsyncIterator[str]:
    try:
        if req.purpose == "ask" and (reply := small_talk_reply(req.question)):
            yield sse("token", {"text": reply})
            yield sse("done", {"citations": [], "grounded": False, "small_talk": True})
            return

        provider = get_provider(req.mode)  # fails early with a clear message if Cloud isn't set up
        found_marks, query = detect_marks(req.question)
        marks = snap_marks(req.marks or found_marks)
        meta = {"provider": provider.mode, "model": provider.model, "marks": marks}

        # Follow-ups like "explain more" carry little meaning alone; the previous question helps retrieval.
        last_user = next((m.content for m in reversed(req.history) if m.role == "user"), "")
        search_text = f"{last_user}\n{query}" if req.purpose == "ask" and len(query) < 40 and last_user else query
        hits = await search_notes(req.space_id, search_text, TOP_K[marks], unit=req.unit)

        # The guard: if even the best excerpt is only loosely related, don't let the model guess.
        weak = not hits or hits[0].score < settings.ask_min_score
        if weak and req.purpose != "doubt":
            yield sse("token", {"text": NOT_FOUND})
            yield sse("done", {"citations": [], "grounded": False, **meta})
            return

        hits = [h for h in hits if h.score >= settings.ask_min_score - 0.1]
        answer = ""
        async for token in provider.stream_chat(_messages(req, hits, marks, query), max_tokens=MAX_TOKENS[marks]):
            head = (answer + token).lstrip()
            # A small model sometimes refuses and then fills the answer shape anyway, with invented facts and
            # page numbers. Once a refusal line is complete, nothing after it is sent.
            if head.lower().startswith(REFUSAL) and "\n" in head:
                rest = head.split("\n", 1)[0][len(answer.lstrip()) :]
                if rest:
                    yield sse("token", {"text": rest})
                answer = head.split("\n", 1)[0]
                break
            answer += token
            yield sse("token", {"text": token})

        grounded = REFUSAL not in answer.lower()
        yield sse("done", {"citations": citations(hits, answer) if grounded else [], "grounded": grounded, **meta})
    except LLMError as exc:
        yield sse("error", {"message": str(exc), "code": exc.code})
    except Exception as exc:  # e.g. Qdrant down
        yield sse("error", {"message": f"The AI service hit a problem ({type(exc).__name__})", "code": "internal"})
