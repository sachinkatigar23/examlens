"""Exam paper -> list of questions.

1. Regex over the cleaned page text (fast, exact, no GPU).
2. If that finds fewer than 5 questions, the layout is unusual: ask the LLM, a couple of pages at a time.
"""

import re
from dataclasses import dataclass, field

from app.schemas import ExtractedQuestions
from app.services.llm import chat_json
from app.services.pdf import Page

MIN_REGEX_QUESTIONS = 5
MIN_TEXT = 10

# "1.", "Q1)", "Q.No. 2:", optionally followed straight away by a sub-part: "3. a) ..."
Q_START = re.compile(
    r"^\s*(?:Q(?:uestion)?\.?\s*(?:No\.?)?\s*)?(\d{1,2})\s*[\.\):]\s*(?:\(?([a-lA-L])[\.\)]\s*)?(.*)$"
)
# "a) ...", "(b) ...", "c. ..."
SUB_START = re.compile(r"^\s*\(?([a-l])[\.\)]\s+(.*)$")
# Marks written at the end: "(5)", "[10]", "(5 marks)", "5M", "(5+5)", or a number far to the right.
MARKS = re.compile(
    r"(?:[\(\[]\s*(\d{1,2})\s*(?:\+\s*(\d{1,2}))?\s*(?:marks?|m)?\s*[\)\]]|\b(\d{1,2})\s*(?:marks?|M)\b|\s{3,}(\d{1,2}))\s*$",
    re.IGNORECASE,
)
# "PART - B", "SECTION C", "Part II": ends the current question; text after it is instructions until the next number.
SECTION_HEADING = re.compile(r"^\s*(part|section)\s*[-–:]?\s*([a-e]|[ivx]+|\d)\b", re.IGNORECASE)
# Section instructions like "Answer any SIX questions. (6 x 2 = 12)": every question in it is worth 2 marks.
SECTION_MARKS = re.compile(r"\(\s*\d+\s*[x×X*]\s*(\d{1,2})\s*=\s*\d+\s*\)")
# Headers and instructions that look like numbered items but aren't questions.
INSTRUCTION = re.compile(
    r"answer\s+(any|all|the following|five|ten)|all questions carry|max(imum)?\.?\s*marks|time\s*:|duration"
    r"|instructions?|^note\b|question paper|^(part|section)\s*[-–:]?\s*[a-e1-5i]+\b|^or$",
    re.IGNORECASE,
)


@dataclass
class _Item:
    qnum: str
    letter: str = ""
    lines: list[str] = field(default_factory=list)
    section_marks: int | None = None  # from the section's "(6 x 2 = 12)" line, used if the question shows none

    @property
    def text(self) -> str:
        return re.sub(r"\s+", " ", " ".join(self.lines)).strip()


def _split_marks(text: str) -> tuple[str, int | None]:
    m = MARKS.search(text)
    if not m:
        return text, None
    a, b, c, d = m.groups()
    marks = int(a) + int(b) if a and b else int(a or c or d)
    return text[: m.start()].strip(" .-–:"), marks if 0 < marks <= 30 else None


def _is_question(text: str) -> bool:
    return len(text) >= MIN_TEXT and not (INSTRUCTION.search(text) and len(text) < 140)


def extract_with_regex(pages: list[Page]) -> list[dict]:
    items: list[_Item] = []
    collecting = False  # False before the first question, after a section heading, and after a question's marks
    section_marks = None
    for line in (l for p in pages for l in p.text.splitlines()):
        line = line.strip()
        if not line or re.fullmatch(r"(?i)or|\(?or\)?", line):
            continue
        if SECTION_HEADING.match(line):
            collecting, section_marks = False, None
            continue
        if per_question := SECTION_MARKS.search(line):
            section_marks = int(per_question.group(1))
        q = Q_START.match(line)
        sub = SUB_START.match(line)
        current = items[-1] if items and collecting else None

        if q:
            items.append(_Item(q.group(1), (q.group(2) or "").lower(), [q.group(3)], section_marks))
            collecting = True
        elif sub and current:
            letter = sub.group(1)
            # "i)" right after "h)" is part i; otherwise it's a roman numeral inside the current part.
            if letter == "i" and current.letter != "h":
                current.lines.append(line)
            else:
                items.append(_Item(current.qnum, letter, [sub.group(2)], section_marks))
        elif current and MARKS.search(current.text):
            # Marks end a question, so this line is something else (a footer, an instruction): stop here.
            collecting = False
        elif current:
            current.lines.append(line)
        # otherwise: header / instructions before the first question or after a section heading: ignored

    has_subparts = {it.qnum for it in items if it.letter}
    stems = {it.qnum: it.text for it in items if not it.letter}
    questions = []
    for it in items:
        if not it.letter and it.qnum in has_subparts:
            continue  # the stem ("3. Explain the following:") becomes context for its parts instead
        text, marks = _split_marks(it.text)
        stem, _ = _split_marks(stems.get(it.qnum, "")) if it.letter else ("", None)
        # Short parts like "b) 3NF" only make sense with their stem: "Explain the following: 3NF".
        if stem and len(text) < 60 and _is_question(stem):
            text = f"{stem} {text}"
        if _is_question(text):
            questions.append({"number": f"{it.qnum}{it.letter}", "text": text, "marks": marks or it.section_marks})
    return questions


LLM_SYSTEM = """You extract exam questions from the text of a university question paper.
Return every question exactly as written (fix only broken line wraps). Include sub-parts as separate
questions with numbers like "2a". Skip instructions, headers, the university name, "OR" lines and
section titles. marks is the number of marks if shown, else null."""


async def extract_with_llm(pages: list[Page], pages_per_batch: int = 2) -> list[dict]:
    questions: list[dict] = []
    for i in range(0, len(pages), pages_per_batch):
        text = "\n\n".join(p.text for p in pages[i : i + pages_per_batch]).strip()
        if not text:
            continue
        result = await chat_json(LLM_SYSTEM, f"Question paper text:\n\n{text[:6000]}", ExtractedQuestions)
        questions.extend(
            {"number": q.number.strip(), "text": q.text.strip(), "marks": q.marks}
            for q in result.questions
            if _is_question(q.text.strip())
        )
    return questions


async def extract_questions(pages: list[Page]) -> tuple[list[dict], str]:
    """Returns (questions, method) where method is 'regex' or 'llm'."""
    found = extract_with_regex(pages)
    if len(found) >= MIN_REGEX_QUESTIONS:
        return found, "regex"
    return await extract_with_llm(pages), "llm"
