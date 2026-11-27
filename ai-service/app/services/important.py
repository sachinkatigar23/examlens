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

import logging
import math
import re
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints, create_model

from app.services.embeddings import embed_documents, embed_queries
from app.services.llm import LLMError, chat_json
from app.services.pdf import Page, all_lines
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

    for raw in all_lines(pages):
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




# --- Topics derived from the question bank (no syllabus in the notebook) ------------------------------------

log = logging.getLogger("examlens.important")

TopicName = Annotated[str, StringConstraints(min_length=3, max_length=48)]


class TopicNames(BaseModel):
    # maxLength ends up in Ollama's output grammar: a 3B model once looped "GBFS or GBFS or ..." inside a name.
    names: list[TopicName] = Field(min_length=2, max_length=10)


class QuestionTopic(BaseModel):
    topic: TopicName


# One question at a time: asked to list all topics of a unit at once, the 3B model's answer swung with tiny
# prompt changes (one version had no Minimax topic at all, so Minimax landed under "Search algorithms").
NAME_ONE_SYSTEM = """Name the syllabus topic this exam question tests, as it would appear in a textbook's table of contents:
2 to 5 plain words naming the specific concept, algorithm or problem (not a broad area). No brackets.
Examples:
"Explain normalization with 1NF, 2NF and 3NF." -> "Normalization"
"With a neat diagram, explain the OSI reference model." -> "OSI reference model"
"Differentiate between TCP and UDP." -> "TCP and UDP"
"Explain the types of joins in SQL with examples." -> "Types of joins"
"Write a C program to implement a stack using arrays." -> "Stack implementation" """
# A 2-mark question goes to the topic of the long question it is closest to, if they are this similar.
NEAR_LONG = 0.75

SPLIT_SYSTEM = """These exam questions were grouped under one topic, but it is too broad.
Split it into 2 to 4 narrower topics. Each name: 2 to 6 plain words, named after the concept, algorithm or
problem the questions are about. Together they must cover all the questions."""

CLASSIFY_SYSTEM = "Which syllabus topic does this exam question test? Answer with the one topic that fits best."

# A topic holding more than this share of its unit's questions is split once (the first version's
# "Agents and properties" took 14 of 31 Unit 1 questions: agents, the 8-puzzle and the water jug problem).
MAX_SHARE = 0.35
MIN_SPLIT = 6
# Keyword rule: a name word is distinctive if fewer than ~1 in 4 of the unit's questions contain it; a name
# qualifies when 60% of its (weighted) words are in the question; the winner must lead by about one rare word.
DISTINCTIVE_IDF = 1.3
MIN_COVERAGE = 0.6
KEYWORD_MARGIN = 1.0
# How much closer (cosine) a question must be to another topic's nearest question before it moves there.
MOVE_MARGIN = 0.06
# Words that say nothing about WHICH topic a question is about.
GENERIC = {
    "and", "or", "of", "the", "a", "an", "in", "on", "for", "with", "to", "its", "their", "using", "based", "types",
    "type", "basics", "introduction", "concepts", "concept", "overview", "algorithm", "algorithms", "problem",
    "problems", "methods", "method", "techniques", "technique", "properties", "applications", "fundamentals",
}


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b, strict=True))
    return dot / ((sum(x * x for x in a) ** 0.5) * (sum(y * y for y in b) ** 0.5) or 1)


def _stem(word: str) -> str:
    """Crude, but enough to match "agents"/"agent", "limited"/"limit", "searching"/"search"."""
    for suffix in ("ing", "ed", "s"):
        if word.endswith(suffix) and len(word) - len(suffix) >= 4 and not word.endswith("ss"):
            return word[: -len(suffix)]
    return word


def _words(text: str) -> set[str]:
    """Lower-case content words ("Breadth-First" -> breadth, first)."""
    return {_stem(w) for w in re.findall(r"[a-z0-9*]+", text.lower())} - GENERIC


def _clean_name(name: str) -> str:
    """'N-Queens Problem Solving Algorithm (NP-hard, not' -> 'N-Queens Problem Solving Algorithm'."""
    name = re.sub(r"\s*[(\[].*$", "", name)  # brackets, even unclosed ones (the name hit its length limit)
    name = re.sub(r"\s+", " ", name).strip(" .,;-:")
    return " ".join(name.split()[:6])


def _keyword_choice(question: str, names: list[str], idf: dict[str, float]) -> int | None:
    """The topic whose distinctive name words the question contains, if exactly one stands out. "Explain the
    Minimax algorithm" contains "minimax" -> "Minimax and alpha-beta pruning", whatever the embeddings say."""
    q = _words(question)
    scores = []
    for name in names:
        words = _words(name)
        hit = sum(idf.get(w, 0) for w in words & q)
        coverage = hit / (sum(idf.get(w, 0) for w in words) or 1)
        # Only distinctive words can decide: "Search algorithms" is just "search", which half of Unit 2 contains.
        distinctive = any(idf.get(w, 0) >= DISTINCTIVE_IDF for w in words & q)
        scores.append(hit if distinctive and coverage >= MIN_COVERAGE else 0.0)
    ranked = sorted(scores, reverse=True)
    # The most specific name wins ("Simple reflex agent" over "Types of agents"), but only by a clear margin.
    if ranked[0] > 0 and (len(ranked) == 1 or ranked[0] - ranked[1] >= KEYWORD_MARGIN):
        return scores.index(ranked[0])
    return None


async def _classify(question: str, names: list[str]) -> int | None:
    """Constrained LLM choice: the output grammar only allows one of the names, so it can't invent one."""
    schema = create_model("TopicChoice", topic=(Literal[tuple(names)], ...))
    listing = "\n".join(f"- {n}" for n in names)
    try:
        result = await chat_json(CLASSIFY_SYSTEM, f"Topics:\n{listing}\n\nQuestion: {question[:400]}", schema, max_tokens=40)
    except LLMError:
        return None
    return names.index(result.topic)


async def _name_topics(system: str, header: str, qs: list[dict]) -> list[str]:
    """Several names at once (only used to split an over-full topic: a small, related group)."""
    listing = "\n".join(f"- {q['text'][:160]}" for q in qs)
    result = await chat_json(system, f"{header}\n\nQuestions:\n{listing}", TopicNames, max_tokens=260)
    names: list[str] = []
    for n in result.names:
        clean = _clean_name(n)
        if len(clean) >= 3 and clean.lower() not in {x.lower() for x in names}:
            names.append(clean)
    return names


async def _name_one(question: str) -> str | None:
    try:
        result = await chat_json(NAME_ONE_SYSTEM, f'"{question[:400]}" ->', QuestionTopic, max_tokens=30)
    except LLMError:
        return None
    return _grounded_name(result.topic, question)


def _grounded_name(name: str, question: str) -> str | None:
    """A name must share a content word with its own question. The 3B model now and then names something else
    entirely ("Memory management" for "Explain static and dynamic environment"); such a question gets no name
    of its own and is assigned to a topic like a 2-mark question. A glitch like "AI Planning} Wumpus World"
    keeps the part that matches the question."""
    q = _words(question)
    parts = [_clean_name(p) for p in re.split(r"[{}\[\];|\"]", name)]
    best = max(parts, key=lambda p: len(_words(p) & q))
    return best if len(best) >= 3 and _words(best) & q else None


def _merge_names(names: list[str], idf: dict[str, float]) -> tuple[list[str], dict[str, int]]:
    """One topic, several wordings or variants: same content words ("8-tile puzzle" / "8 puzzle problem"), or
    one name's words all inside another's when they are distinctive in this unit ("Agents" takes "Simple reflex
    agent" and "Goal-based agent"; but "Search algorithms" = "search", common to the whole unit, takes nothing).
    The most general name of a group is shown. Returns (unique names, {original name: index})."""
    distinct = list(dict.fromkeys(names))
    keys = {n: frozenset(_words(n)) or frozenset([n.lower()]) for n in distinct}
    parent = list(range(len(distinct)))

    def root(i: int) -> int:
        while parent[i] != i:
            i = parent[i]
        return i

    for i, a in enumerate(distinct):
        for j, b in enumerate(distinct[:i]):
            small, big = sorted((keys[a], keys[b]), key=len)
            if small == big or (small <= big and all(idf.get(w, 0) >= DISTINCTIVE_IDF for w in small)):
                parent[root(i)] = root(j)

    counts = {n: names.count(n) for n in distinct}
    groups: dict[int, list[str]] = {}
    for i, n in enumerate(distinct):
        groups.setdefault(root(i), []).append(n)
    unique: list[str] = []
    index: dict[str, int] = {}
    for members in groups.values():
        display = min(members, key=lambda n: (len(keys[n]), -counts[n], len(n)))
        for n in members:
            index[n] = len(unique)
        unique.append(display)
    return unique, index


def _idf(qs: list[dict], names: list[str]) -> dict[str, float]:
    # A word in most questions of the unit ("search" in Unit 2) tells topics apart less than "minimax" does.
    doc_freq: dict[str, int] = {}
    for q in qs:
        for w in _words(q["text"]):
            doc_freq[w] = doc_freq.get(w, 0) + 1
    return {w: math.log((len(qs) + 1) / (doc_freq.get(w, 0) + 1)) + 0.1 for n in names for w in _words(n)}


async def _assign(qs: list[dict], names: list[str], fixed: dict[int, int] | None = None) -> list[int]:
    """Topic index per question. `fixed` = questions that named a topic themselves. The rest: a clear keyword
    match, else the topic of the most similar fixed question, else the constrained LLM choice, else the nearest
    name by embedding. Then every assignment that wasn't certain is validated against the other questions."""
    fixed = fixed or {}
    idf = _idf(qs, names)
    name_vectors = await embed_documents(names)
    vectors = await embed_queries([q["text"] for q in qs])
    choices, locked = [], []
    for i, (q, qv) in enumerate(zip(qs, vectors, strict=True)):
        choice = fixed.get(i)
        if choice is None:
            choice = _keyword_choice(q["text"], names, idf)
        locked.append(choice is not None)
        if choice is None and fixed:
            sim, j = max((_cosine(qv, vectors[j]), j) for j in fixed)
            choice = fixed[j] if sim >= NEAR_LONG else None
        if choice is None:
            choice = await _classify(q["text"], names)
        if choice is None:
            choice = max(range(len(names)), key=lambda k: _cosine(qv, name_vectors[k]))
        choices.append(choice)
    return _validate(choices, locked, vectors)


def _validate(choices: list[int], locked: list[bool], vectors: list[list[float]]) -> list[int]:
    """Checks every uncertain assignment against the other questions: a question much closer to another
    topic's questions than to its own topic's moves there."""
    result = list(choices)
    for i, vector in enumerate(vectors):
        if locked[i]:
            continue
        best_to: dict[int, float] = {}
        for j, other in enumerate(vectors):
            if j != i:
                best_to[choices[j]] = max(best_to.get(choices[j], -1.0), _cosine(vector, other))
        own = best_to.get(choices[i], -1.0)
        target = max(best_to, key=best_to.get)
        if target != choices[i] and best_to[target] - own >= MOVE_MARGIN:
            result[i] = target
    return result


async def _derive_unit(qs: list[dict]) -> list[tuple[str, list[int]]]:
    """[(topic name, indexes into qs)] for one unit."""
    # Long-answer questions name the topics; asked for one-line definitions, a small model makes a topic per
    # question ("Path cost", "Initial state").
    long = [i for i, q in enumerate(qs) if (q["marks"] or 0) >= 5] or list(range(len(qs)))
    named = {i: n for i in long if (n := await _name_one(qs[i]["text"]))}
    if not named:
        raise LLMError("Couldn't name any topics for this unit", "bad_output")
    names, index = _merge_names(list(named.values()), _idf(qs, list(named.values())))
    choices = await _assign(qs, names, {i: index[n] for i, n in named.items()})
    groups = [(name, [i for i, c in enumerate(choices) if c == k]) for k, name in enumerate(names)]

    # Checked against the questions: a topic that swallowed too much of the unit is split (once).
    result: list[tuple[str, list[int]]] = []
    limit = max(MIN_SPLIT, math.ceil(MAX_SHARE * len(qs)))
    for name, members in groups:
        if len(members) > limit:
            sub_qs = [qs[i] for i in members]
            try:
                sub_names = await _name_topics(SPLIT_SYSTEM, f"Topic: {name}", sub_qs)
            except LLMError:
                sub_names = []
            if len(sub_names) >= 2:
                log.info("split %r (%s questions) into %s", name, len(members), sub_names)
                sub_choices = await _assign(sub_qs, sub_names)
                result += [(sub, [members[i] for i, c in enumerate(sub_choices) if c == k]) for k, sub in enumerate(sub_names)]
                continue
        result.append((name, members))
    return [(n, m) for n, m in result if m]  # a name no question went to isn't a topic of this bank


async def derive_topics(questions: list[dict]) -> list[dict]:
    """No syllabus in the notebook: build per-unit topics from the question bank, so Study mode, unit tags and
    the question bank grouping still work.

    The LLM names the topics (temperature 0), every question is assigned (keyword -> constrained LLM choice ->
    embedding), and the result is checked against the questions: a topic holding too large a share of its unit
    is split, a topic no question went to is dropped. A topic's details are the questions it got.
    Returns [{unit, unit_title, name, details, derived: True, question_indexes}] (indexes into `questions`)."""
    units: dict[str, list[int]] = {}
    for i, q in enumerate(questions):
        if q["unit"]:
            units.setdefault(q["unit"], []).append(i)

    topics: list[dict] = []
    for unit, indexes in units.items():
        qs = [questions[i] for i in indexes]
        title = qs[0]["unit_title"]
        for name, members in await _derive_unit(qs):
            texts = [re.sub(r"[.?]$", "", qs[i]["text"][:120]) for i in members]
            topics.append({
                "unit": unit, "unit_title": title, "name": name, "derived": True,
                "details": "; ".join(dict.fromkeys(texts))[:1500],
                "question_indexes": [indexes[i] for i in members],
            })
    return topics
