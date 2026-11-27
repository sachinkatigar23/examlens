"""Check my answer: the student's own answer to an exam question -> an estimated mark, what's covered, what's
missing, and an improved version, all judged against their notes and the marks format.

How the mark is estimated (a 3B model can't be trusted with one gut-feel number: it gave 1/10 to a correct
95-word Minimax answer with an example, and listed nothing as covered):
1. The LLM lists the key points a full-marks answer needs, from the notes, and says for each whether the
   student's answer has it (a yes/no per point is something a small model does well). Word overlap with the
   answer double-checks each yes/no.
2. Code checks the format the marks call for (length, diagram, example, conclusion, points).
3. Code adds it up with a published scheme (MARKING), so the student sees where every mark came from.

Order of the stream: `grade` (the verdict, shown at once) -> `token`s (the improved version) -> `done`.
"""

import re
from collections.abc import AsyncIterator
from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints

from app.config import settings
from app.schemas import CheckRequest
from app.services.answer import FORMATS, MAX_TOKENS, SYSTEM, TOP_K, snap_marks
from app.services.llm import LLMError, get_provider
from app.services.retrieval import _content, citations, context_block, ensure_citations, search_notes, sse

# Grading reads fewer excerpts than answering: the student's answer has to fit in the window too.
GRADE_EXCERPTS = 6
Point = Annotated[str, StringConstraints(min_length=2, max_length=120)]
# Only excerpts about as relevant as the best one make the answer key: for "Explain Minimax" the 5th and 6th
# excerpts were about best-first search, and the key then asked for an OPEN list.
KEY_SCORE_GAP = 0.06


class KeyPoint(BaseModel):
    point: Point
    in_answer: bool


class Grade(BaseModel):
    """What the LLM must return (short strings + caps: a 3B model loops inside long JSON strings)."""
    key_points: list[KeyPoint] = Field(min_length=2, max_length=8)
    mistakes: list[Point] = Field(default=[], max_length=3)


GRADE_SYSTEM = """You are a university examiner marking a student's answer. The note excerpts are the answer key.
1. key_points: the 4 to 8 key points a full-marks answer to THIS question must contain, taken from the notes
   about this topic only. Write each in your own words, at most 12 words, starting with a capital letter.
   For each, in_answer is true if the student's answer states it, in any words.
2. mistakes: wrong statements the student WROTE that contradict the notes (usually none). Not things left out.
Answer in JSON."""

# Marks scheme per answer format: where the marks of an answer come from. Content is the share of key points
# covered; the rest are the format checks below. Other mark values are scaled from the nearest format.
MARKING = {
    2: {"Content": 1.5, "Example": 0.5},
    5: {"Content": 4.0, "Example": 0.5, "Points": 0.5},
    10: {"Content": 6.0, "Diagram": 1.5, "Example": 1.0, "Points": 1.0, "Conclusion": 0.5},
    16: {"Content": 10.0, "Diagram": 2.0, "Example": 2.0, "Points": 1.0, "Conclusion": 1.0},
}
# An answer of at least this share of the minimum length gets full credit for the points it covers;
# shorter answers get proportionally less (points named in one line aren't explained).
FULL_LENGTH_SHARE = 0.7

IMPROVE_REQUEST = """Question ({marks} marks): {question}

The student's answer:
\"\"\"
{answer}
\"\"\"

Rewrite it into a full-marks {marks}-mark answer of {words} words. Keep the student's correct points (in their
words where possible), correct the mistakes and add what is missing: {missing}.
Write only the answer itself, as the student should write it in the exam. Don't talk about the student's answer.
Structure, in this order:

{shape}

Cite the page after facts like [p. 12]."""

# The notes don't cover the question: the student still gets a model answer, clearly not from their notes.
GENERAL_SYSTEM = """You are ExamLens, a tutor helping a university student write exam answers. Their notes don't
cover this question, so use standard textbook knowledge. Write in Markdown. Do not cite pages."""

# "The student did not mention the OPEN list": an omission (already under missing), not a mistake.
OMISSION = re.compile(r"^\s*(the\s+)?(student|answer|you)\b.*\b(did not|didn't|does not|doesn't|missed|omit|lacks?|fails?)\b", re.I)

# What a marks format expects, checked in code (reliable, unlike asking a small model "is there a diagram?").
DIAGRAM = re.compile(r"\b(diagram|figure|fig\.|sketch|draw)", re.I)
EXAMPLE = re.compile(r"\b(example|e\.g\.|for instance|such as|consider)\b|```", re.I)
CONCLUSION = re.compile(r"\b(conclusion|to conclude|in conclusion|in summary|to sum up|thus|hence|therefore)\b", re.I)
POINT_LINE = re.compile(r"^\s*(?:[-*•]|\d+[.)]|[a-h][.)])\s+", re.M)


def word_target(marks: int) -> tuple[int, int]:
    low, high = (int(n) for n in re.findall(r"\d+", FORMATS[marks]["words"]))
    return low, high


def structure_check(answer: str, marks: int) -> tuple[list[dict], int]:
    """[{item, ok, note}] for the marks format (marks = 2, 5, 10 or 16), and the word count."""
    words = len(answer.split())
    low, high = word_target(marks)
    points = len(POINT_LINE.findall(answer)) or len([s for s in re.split(r"[.!?]\s", answer) if len(s.split()) >= 5])
    checks = [{"item": "Length", "ok": words >= low * FULL_LENGTH_SHARE, "note": f"{words} words; aim for {low}–{high}"}]
    if marks == 2:
        checks.append({"item": "Example", "ok": bool(EXAMPLE.search(answer)), "note": "one short example after the definition"})
    elif marks == 5:
        checks.append({"item": "Points", "ok": points >= 4, "note": f"{points} points; aim for 4–6"})
        checks.append({"item": "Example", "ok": bool(EXAMPLE.search(answer)), "note": "an example or code, if the topic has one"})
    else:
        checks.append({"item": "Diagram", "ok": bool(DIAGRAM.search(answer)), "note": "a labelled diagram"})
        checks.append({"item": "Example", "ok": bool(EXAMPLE.search(answer)), "note": "a worked example, code or table"})
        checks.append({"item": "Conclusion", "ok": bool(CONCLUSION.search(answer)), "note": "a closing summary"})
        checks.append({"item": "Points", "ok": points >= (6 if marks == 10 else 10), "note": f"{points} points or paragraphs"})
    return checks, words


def _share(point: str, text_words: set[str]) -> float:
    """How much of a point's content words occur in a text (0..1)."""
    words = _content(point)
    return len(words & text_words) / len(words) if words else 0.0


def judge_points(grade: Grade, answer: str) -> tuple[list[str], list[str]]:
    """(covered, missing). The model's yes/no, checked against the answer's words: a "yes" whose words are
    nowhere in the answer is a no; a "no" whose words are almost all in it is a yes."""
    answer_words = _content(answer)
    covered, missing = [], []
    for kp in grade.key_points:
        share = _share(kp.point, answer_words)
        has = (kp.in_answer and share >= 0.25) or share >= 0.75
        (covered if has else missing).append(kp.point)
    return list(dict.fromkeys(covered)), list(dict.fromkeys(missing))


GAP_ADVICE = {"Diagram": "a labelled diagram", "Example": "an example", "Conclusion": "a closing summary",
              "Points": "more separate points"}


def advice(missing_points: list[str], checks: list[dict], words: int, marks: int) -> str:
    """What to do for full marks, built from the verdict itself (the model's own feedback sentence
    contradicted the format checks: "add an example" to an answer that had one)."""
    todo = []
    if missing_points:
        todo.append("cover the missing key points (" + "; ".join(missing_points[:3]) + ")")
    gaps = [GAP_ADVICE[c["item"]] for c in checks if not c["ok"] and c["item"] in GAP_ADVICE]
    if gaps:
        todo.append("add " + (", ".join(gaps[:-1]) + " and " + gaps[-1] if len(gaps) > 1 else gaps[0]))
    low, high = word_target(marks)
    if words < low * FULL_LENGTH_SHARE:
        todo.append(f"write about {low}–{high} words (you wrote {words})")
    if not todo:
        return "This answer has everything the format asks for. Revise it once more and it's exam-ready."
    return "For full marks: " + ", ".join(todo[:-1]) + (", and " if len(todo) > 1 else "") + todo[-1] + "."


def score(marks: int, covered: int, total_points: int, checks: list[dict], words: int) -> tuple[float, list[dict]]:
    """(estimated marks rounded to 0.5, [{part, got, max}]) from the marking scheme."""
    fmt = snap_marks(marks)
    scale = marks / fmt
    low, _ = word_target(fmt)
    ok = {c["item"]: c["ok"] for c in checks}
    length_factor = min(1.0, words / (low * FULL_LENGTH_SHARE))
    breakdown = []
    for part, weight in MARKING[fmt].items():
        top = weight * scale
        if part == "Content":
            got = top * (covered / total_points if total_points else 0) * length_factor
        else:
            got = top if ok.get(part) else 0.0
        breakdown.append({"part": part, "got": round(got * 2) / 2, "max": top})
    total = round(sum(b["got"] for b in breakdown) * 2) / 2
    return min(total, marks), breakdown


async def check_stream(req: CheckRequest) -> AsyncIterator[str]:
    try:
        provider = get_provider(req.mode)
        fmt = snap_marks(req.marks)
        meta = {"provider": provider.mode, "model": provider.model, "marks": req.marks}
        hits = await search_notes(req.space_id, req.question, TOP_K[fmt])
        notes_cover = bool(hits) and hits[0].score >= settings.ask_min_score
        hits = [h for h in hits if h.score >= settings.ask_min_score - 0.1] if notes_cover else []

        checks, words = structure_check(req.student_answer, fmt)
        key_hits = [h for h in hits[:GRADE_EXCERPTS] if h.score >= hits[0].score - KEY_SCORE_GAP]
        key = context_block(key_hits) if hits else "(The notes don't cover this question: use standard textbook knowledge.)"
        grade = await provider.chat_json(
            GRADE_SYSTEM,
            f"Note excerpts (answer key):\n\n{key}\n\n---\nQuestion ({req.marks} marks): {req.question}\n\n"
            f"Student's answer:\n\"\"\"\n{req.student_answer}\n\"\"\"",
            Grade,
        )
        covered, missing = judge_points(grade, req.student_answer)
        estimate, breakdown = score(req.marks, len(covered), len(covered) + len(missing), checks, words)
        # Parts the format expects but the answer lacks are always listed, whatever the model noticed.
        format_gaps = [f"{c['item']} ({c['note']})" for c in checks if not c["ok"] and c["item"] != "Length"]
        notes_words = _content(" ".join(h.payload["text"] for h in hits))
        verdict = {
            "estimatedMarks": estimate,
            "outOf": req.marks,
            "breakdown": breakdown,
            "covered": covered,
            "missing": [*missing, *format_gaps],
            # A "mistake" the notes themselves state isn't one (the 3B grader flagged correct facts).
            "mistakes": [m for m in grade.mistakes if not OMISSION.match(m) and (not notes_words or _share(m, notes_words) < 0.7)],
            "feedback": advice(missing, checks, words, fmt),
            "checklist": checks,
            "wordCount": words,
            "notesCover": notes_cover,
        }
        yield sse("grade", verdict)

        to_add = "; ".join(verdict["missing"][:6]) or "nothing major"
        request = IMPROVE_REQUEST.format(marks=fmt, question=req.question, answer=req.student_answer[:6000],
                                         missing=to_add, **FORMATS[fmt])
        context = context_block(hits) if hits else "(none: the notes don't cover this question)"
        messages = [{"role": "system", "content": SYSTEM if hits else GENERAL_SYSTEM},
                    {"role": "user", "content": f"Note excerpts:\n\n{context}\n\n---\n{request}"}]
        improved = ""
        async for token in provider.stream_chat(messages, max_tokens=MAX_TOKENS[fmt]):
            improved += token
            yield sse("token", {"text": token})

        done = {"grade": verdict, **meta}
        if hits and (fixed := ensure_citations(improved, hits)) != improved:
            improved, done["content"] = fixed, fixed
        yield sse("done", {"citations": citations(hits, improved) if hits else [], **done})
    except LLMError as exc:
        yield sse("error", {"message": str(exc), "code": exc.code})
    except Exception as exc:
        yield sse("error", {"message": f"The AI service hit a problem ({type(exc).__name__})", "code": "internal"})
