"""Request/response shapes for the internal API (Node <-> FastAPI)."""

from typing import Literal

from pydantic import BaseModel, Field

DocumentKind = Literal["notes", "syllabus", "paper"]


class IngestRequest(BaseModel):
    document_id: str
    space_id: str
    kind: DocumentKind
    year: int | None = None
    file_path: str  # file name inside UPLOAD_DIR


class HistoryMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class AskRequest(BaseModel):
    space_id: str
    question: str = Field(min_length=1, max_length=2000)
    history: list[HistoryMessage] = []


class RematchQuestion(BaseModel):
    id: str
    text: str


class RematchRequest(BaseModel):
    space_id: str
    questions: list[RematchQuestion]


class TopicMatch(BaseModel):
    id: str
    topic_id: str | None
    match_score: float | None


# --- What the LLM must return (validated with pydantic, see services/llm.py) ---


class ExtractedTopic(BaseModel):
    unit: str
    name: str
    details: str = ""


class ExtractedTopics(BaseModel):
    topics: list[ExtractedTopic]


class ExtractedQuestion(BaseModel):
    number: str
    text: str
    marks: int | None = None


class ExtractedQuestions(BaseModel):
    questions: list[ExtractedQuestion]
