"""College "important questions" PDF -> questions with unit + marks, and (when the notebook has no syllabus)
syllabus-like topics derived from those questions.

Typical layout (real AI question bank):
    UNIT – I
    Introduction to Artificial Intelligence
    2-Marks Questions
     1. Define Intelligence.
    5 - Marks Questions
    1 Explain the architecture of a Knowledge Base Agent.     <- number without a dot
    10 marks
    ...
"""

import re

from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints

from app.services.embeddings import embed_documents, embed_queries
from app.services.llm import chat_json
from app.services.pdf import Page
from app.services.questions import extract_with_llm

ROMAN = {"i": 1, "ii": 2, "iii": 3, "iv": 4, "v": 5, "vi": 6, "vii": 7, "viii": 8}

# "UNIT – I", "UNIT II — Searching", "Unit -3", "UNIT 4", "Module 2: ..."
UNIT_HEADING = re.compile(r"^\s*(?:unit|module)\s*[^\w\s]?\s*([ivx]{1,4}|\d{1,2})\b\s*[^\w\s]*\s*(.*)$", re.I)
# "2-Marks Questions", "5 Mark Questions", "5 - Marks Questions", "10 marks", "Two marks questions"
MARKS_HEADING = re.compile(r"^\s*(\d{1,2}|two|five|ten|sixteen)\s*-?\s*marks?\b(\s*questions?)?\s*:?\s*$", re.I)
WORD_MARKS = {"two": 2, "five": 5, "ten": 10, "sixteen": 16}
# Headings without a number: "Short answer questions" / "Long answer questions"
NAMED_GROUP = re.compile(r"^\s*(short|long)\s+answer\s+questions?\s*:?\s*$", re.I)
# "1. Define ...", "2.Explain ...", "1 Explain ..." (no dot, but a capital letter follows), "Q3) ..."
Q_START = re.compile(r"^\s*(?:Q\.?\s*)?(\d{1,2})\s*(?:[\.\)]\s*|\s+(?=[A-Z]))(\S.*)$")
DEFAULT_MARKS = 5
MAX_QUESTION_CHARS = 600


def _unit_label(token: str) -> str:
    return f"Unit {ROMAN.get(token.lower(), token)}"


def parse_important(pages: list[Page]) -> list[dict]:
    """[{unit, unit_title, number, text, marks}] in document order. marks is None when no heading gave one."""
    questions: list[dict] = []
    unit, unit_title, marks = None, "", None
    want_title = False
    current: dict | None = None

    for raw in (l for p in pages for l in p.text.splitlines()):
        line = raw.strip()
        if not line:
            continue
        if m := UNIT_HEADING.match(line):
            unit, unit_title, marks, current = _unit_label(m.group(1)), m.group(2).strip(" -–—:"), None, None
            want_title = not unit_title  # the title is often on the next line
            continue
        if m := MARKS_HEADING.match(line):
            token = m.group(1).lower()
            marks, current, want_title = int(WORD_MARKS.get(token, token)), None, False
            continue
        if m := NAMED_GROUP.match(line):
            marks, current, want_title = (2 if m.group(1).lower() == "short" else 10), None, False
            continue
        if want_title:
            unit_title, want_title = line, False
            continue
        if q := Q_START.match(line):
            current = {"unit": unit, "unit_title": unit_title, "number": q.group(1), "text": q.group(2), "marks": marks}
            questions.append(current)
        elif current and len(current["text"]) < MAX_QUESTION_CHARS:
            current["text"] += " " + line  # wrapped line, sub-part "a. ...", or a figure's labels

    for q in questions:
        q["text"] = re.sub(r"\s+", " ", q["text"]).strip()[:MAX_QUESTION_CHARS]
        prefix = f"U{q['unit'].split()[-1]}-" if q["unit"] else ""
        q["number"] = f"{prefix}{q['marks'] or ''}M{q['number']}" if q["marks"] else f"{prefix}{q['number']}"
    return [q for q in questions if len(q["text"]) >= 8]


async def extract_important(pages: list[Page]) -> tuple[list[dict], str]:
    found = parse_important(pages)
    if len(found) >= 5:
        return found, "regex"
    # Unusual layout: the paper extractor's LLM fallback (no units, marks only if printed next to a question).
    found = await extract_with_llm(pages)
    return [{**q, "unit": None, "unit_title": ""} for q in found], "llm"


class TopicNames(BaseModel):
    # maxLength ends up in Ollama's output grammar: a 3B model once looped "GBFS or GBFS or ..." inside a name.
    names: list[Annotated[str, StringConstraints(min_length=3, max_length=40)]] = Field(min_length=2, max_length=8)


DERIVE_SYSTEM = """You are given the important exam questions of ONE unit of a university course.
List the 4 to 8 main syllabus topics these questions test. Each topic must cover several questions.
Write names in full words, no abbreviations or dots.
Each name: 2 to 5 plain words, the way a student would say it (e.g. "Uninformed search", "Intelligent agents").
Topics must not overlap, and together they must cover all the questions."""


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b, strict=True))
    return dot / ((sum(x * x for x in a) ** 0.5) * (sum(y * y for y in b) ** 0.5) or 1)


async def derive_topics(questions: list[dict]) -> list[dict]:
    """No syllabus in the notebook: build per-unit topics from the question bank, so Study mode, unit tags and
    the question bank grouping still work. The LLM only NAMES the topics (a short answer: fast, and a 3B model
    can't loop on it); each question then goes to its nearest name by embedding, and a topic's details are the
    questions it got. Returns [{unit, unit_title, name, details, derived: True}]."""
    units: dict[str, list[dict]] = {}
    for q in questions:
        if q["unit"]:
            units.setdefault(q["unit"], []).append(q)

    topics: list[dict] = []
    for unit, qs in units.items():
        title = qs[0]["unit_title"]
        # Topics are named from the long-answer questions: one-line definitions pull a small model towards a
        # topic per question. (Every question is still assigned to a topic below.)
        long = [q for q in qs if (q["marks"] or 0) >= 5] or qs
        listing = "\n".join(f"- {q['text'][:160]}" for q in long)
        result = await chat_json(DERIVE_SYSTEM, f"{unit}: {title}\n\nQuestions:\n{listing}", TopicNames, max_tokens=200)
        names = list(dict.fromkeys(n.strip() for n in result.names if n.strip()))

        name_vectors = await embed_documents(names)
        question_vectors = await embed_queries([q["text"] for q in qs])
        members: dict[str, list[str]] = {n: [] for n in names}
        for q, qv in zip(qs, question_vectors, strict=True):
            best = max(range(len(names)), key=lambda i: _cosine(qv, name_vectors[i]))
            members[names[best]].append(re.sub(r"[.?]$", "", q["text"][:120]))
        for name in names:
            if members[name]:  # a name no question went to isn't a topic of this bank
                details = "; ".join(dict.fromkeys(members[name]))[:1500]
                topics.append({"unit": unit, "unit_title": title, "name": name, "details": details, "derived": True})
    return topics
