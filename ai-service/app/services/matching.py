"""Question -> syllabus topic, and question -> same question in another year's paper."""

import re

from app.config import settings
from app.services import qdrant
from app.services.embeddings import embed_queries

# Words that say how to answer, not what is asked. "Explain X with a neat diagram" == "Describe X".
FILLER = set(
    """a an the of and or to in on for with by is are was what which how why its it their them each this that
    explain define describe discuss differentiate distinguish between compare comparison write short note notes
    brief briefly detail details neat diagram diagrams example examples suitable mention give list state
    illustrate also using used help""".split()
)


def content_words(text: str) -> set[str]:
    words = re.findall(r"[a-z0-9]+", text.lower())
    # crude plural folding so "algorithms" == "algorithm" (but keep "process", "address")
    return {w[:-1] if len(w) > 3 and w.endswith("s") and not w.endswith("ss") else w for w in words if w not in FILLER}


def word_overlap(a: str, b: str) -> float:
    """Jaccard overlap of content words, 0..1."""
    wa, wb = content_words(a), content_words(b)
    return len(wa & wb) / len(wa | wb) if wa | wb else 0.0


async def match_topics(space_id: str, texts: list[str]) -> list[tuple[str | None, float | None]]:
    """For each question text: (topic_id, score) of the closest syllabus topic, or (None, None)."""
    if not texts:
        return []
    vectors = await embed_queries(texts)
    matches = []
    for vector in vectors:
        hits = await qdrant.search(
            qdrant.TOPICS, vector, space_id, limit=1, min_score=settings.topic_match_min_score
        )
        matches.append((hits[0].payload["topic_id"], round(hits[0].score, 3)) if hits else (None, None))
    return matches


async def find_repeat_group(space_id: str, text: str, vector: list[float], year: int, document_id: str) -> str | None:
    """repeat_group of the same question from a different year, if there is one.

    Two checks, because embeddings alone can't do it: "What is half duplex mode?" vs "What is full duplex mode?"
    score 0.93 (semantically close, different question), while "Explain the components of data communication"
    with and without "with a neat diagram" scores only 0.88. So: semantically close AND mostly the same words."""
    hits = await qdrant.search(
        qdrant.QUESTIONS,
        vector,
        space_id,
        limit=5,
        min_score=settings.repeat_min_score,
        exclude=[qdrant.field_is("year", year), qdrant.field_is("document_id", document_id)],
    )
    for hit in hits:
        if word_overlap(text, hit.payload.get("text", "")) >= settings.repeat_min_word_overlap:
            return hit.payload["repeat_group"]
    return None
