"""Syllabus -> topics grouped by unit, using the LLM one unit at a time."""

import re

from app.schemas import ExtractedTopics
from app.services.llm import chat_json
from app.services.pdf import Page

UNIT_HEADING = re.compile(r"^\s*(unit|module)\s*[-–:.]?\s*([ivx]+|\d{1,2})\b[\s\-–:.]*(.*)$", re.IGNORECASE)
# Stop reading at the book list / outcomes: they mention topics but aren't syllabus content.
END_OF_UNITS = re.compile(r"^\s*(text\s*books?|reference(s| books?)?|course outcomes?|suggested readings?)\b", re.I)
ROMAN = {"i": 1, "ii": 2, "iii": 3, "iv": 4, "v": 5, "vi": 6, "vii": 7, "viii": 8, "ix": 9, "x": 10}

SYSTEM = """You turn one unit of a university syllabus into a list of exam topics.
The unit text is usually a title followed by sub-topics separated by commas.
Group closely related sub-topics into topics. Aim for 4 to 8 topics per unit; never return just one.
For each topic:
- name: 2 to 5 words, the way a student would say it (e.g. "Relational algebra", "Normal forms").
- details: the original sub-topics it covers, comma separated, copied from the text.
Every sub-topic in the text must appear in exactly one topic's details.
Ignore objectives, hours, text books and references."""


def _unit_label(kind: str, number: str) -> str:
    n = ROMAN.get(number.lower(), number)
    return f"{kind.capitalize()} {n}"


def split_units(pages: list[Page]) -> list[tuple[str, str]]:
    """[(unit label, text)] when the syllabus has "Unit 1 / UNIT-II / Module 3" headings, else []."""
    units: list[tuple[str, list[str]]] = []
    for line in (l for p in pages for l in p.text.splitlines()):
        heading = UNIT_HEADING.match(line)
        if heading:
            units.append((_unit_label(heading.group(1), heading.group(2)), [heading.group(3)]))
        elif units and END_OF_UNITS.match(line):
            break
        elif units:
            units[-1][1].append(line)
    return [(label, "\n".join(lines).strip()) for label, lines in units if "".join(lines).strip()]


LABELLED = re.compile(r"^([A-Z][^:.]{2,60}):\s*(.+)$")  # "Network topologies: bus, star, ring, mesh."
HOURS = re.compile(r"\(\s*\d+\s*(hours?|hrs?)\s*\)", re.IGNORECASE)
SENTENCE_END = re.compile(r"(?<=\.)\s+(?=[A-Z])")


def parse_labelled_topics(unit_text: str) -> list[dict] | None:
    """Many syllabi list a unit as sentences "Label: item, item, item." Then the labels ARE the topics, so we read
    them directly (exact, repeatable, no LLM). Returns None if the unit isn't written that way."""
    lines = [l.strip() for l in unit_text.splitlines() if l.strip()]
    # First line like "Introduction to Data Communication (12 Hours)" is the unit's title, not a topic.
    if len(lines) > 1 and ":" not in lines[0] and not lines[0].endswith("."):
        lines = lines[1:]
    body = HOURS.sub("", " ".join(lines))
    topics, labelled = [], 0
    for sentence in SENTENCE_END.split(body):
        sentence = sentence.strip().rstrip(".")
        if not sentence:
            continue
        if m := LABELLED.match(sentence):
            labelled += 1
            topics.append({"name": m.group(1).strip(), "details": m.group(2).strip()})
        elif len(sentence.split()) <= 14:
            # A short plain sentence is a topic by itself: "Functions of the network layer."
            name = re.split(r"[,;]", sentence)[0].strip()
            topics.append({"name": name, "details": sentence})
    return topics if labelled >= 2 else None


def unit_title(unit_text: str) -> str:
    """First line of a unit ("Introduction to Data Communication (12 Hours)") without the hours, if it looks
    like a title rather than a list of topics."""
    first = HOURS.sub("", unit_text.strip().splitlines()[0] if unit_text.strip() else "").strip(" .:-–")
    return first if 0 < len(first) <= 80 and first.count(",") < 2 and ":" not in first else ""


async def extract_topics(pages: list[Page]) -> list[dict]:
    """Returns [{unit, name, details}] in syllabus order."""
    topics: list[dict] = []
    units = split_units(pages)
    if len(units) >= 2:
        for label, text in units:
            parsed = parse_labelled_topics(text)
            if parsed:
                topics.extend({"unit": label, **t} for t in parsed)
                continue
            result = await chat_json(SYSTEM, f"This is {label} of the syllabus:\n\n{text[:5000]}", ExtractedTopics)
            topics.extend({"unit": label, "name": t.name.strip(), "details": t.details.strip()} for t in result.topics)
    else:
        # No clear unit headings: let the model infer units from the whole text, a few pages at a time.
        text = "\n".join(p.text for p in pages)
        for i in range(0, len(text), 4000):
            result = await chat_json(
                SYSTEM + "\n- unit: the unit/module the topic belongs to, like \"Unit 2\".",
                f"Syllabus text:\n\n{text[i : i + 4000]}",
                ExtractedTopics,
            )
            topics.extend(
                {"unit": t.unit.strip() or "General", "name": t.name.strip(), "details": t.details.strip()}
                for t in result.topics
            )

    # Drop duplicates the model sometimes repeats.
    seen, unique = set(), []
    for t in topics:
        key = (t["unit"].lower(), t["name"].lower())
        if t["name"] and key not in seen:
            seen.add(key)
            unique.append(t)
    return unique


def topic_embedding_text(topic: dict) -> str:
    # Name plus its sub-topics: "Normalization: 1NF, 2NF, BCNF" matches questions far better than the name alone.
    return f"{topic['name']}: {topic['details']}" if topic.get("details") else topic["name"]
