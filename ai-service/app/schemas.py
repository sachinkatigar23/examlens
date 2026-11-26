"""Request/response shapes for the internal API (Node <-> FastAPI)."""

from typing import Literal

from pydantic import BaseModel, Field

DocumentKind = Literal["notes", "syllabus", "paper", "important"]
Mode = Literal["local", "cloud"]


class IngestRequest(BaseModel):
    document_id: str
    space_id: str
    kind: DocumentKind
    year: int | None = None
    file_path: str  # file name inside UPLOAD_DIR
    unit: str | None = None  # notes only: "Unit 2", or None for "Mixed / whole subject"


class HistoryMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class AskRequest(BaseModel):
    space_id: str
    question: str = Field(min_length=1, max_length=4000)
    history: list[HistoryMessage] = []
    mode: Mode = "local"
    marks: int | None = Field(default=None, ge=1, le=30)  # known marks (question bank); else detected from text
    unit: str | None = None  # prefer notes of this unit (Study follow-up chat)
    # ask = Ask tab chat · exam = answer a stored question · doubt = solve a photographed problem
    purpose: Literal["ask", "exam", "doubt"] = "ask"


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
