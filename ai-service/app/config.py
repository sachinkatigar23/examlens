from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

SERVICE_ROOT = Path(__file__).resolve().parent.parent  # ai-service/


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=SERVICE_ROOT / ".env", extra="ignore")

    service_key: str
    node_api_url: str = "http://localhost:5000"
    qdrant_url: str = "http://localhost:6333"
    ollama_url: str = "http://localhost:11434"
    chat_model: str = "qwen2.5:3b"
    embed_model: str = "nomic-embed-text"
    upload_dir: str = "../storage/uploads"

    # Cloud mode (optional). No key -> Cloud is shown as unavailable, everything else works.
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"
    # Optional local vision model for "Snap a doubt", e.g. qwen2.5vl:3b (slower, weaker on handwriting).
    vision_model_local: str = ""

    # Retrieval / matching thresholds (cosine similarity, nomic-embed-text). Measured, see docs/BUILD_NOTES.md.
    ask_min_score: float = 0.55  # below this the best chunk isn't really about the question
    topic_match_min_score: float = 0.55
    # Repeats need BOTH: embedding similarity >= 0.85 and >= 60% shared content words (see services/matching.py).
    # Measured on the CN papers: half vs full duplex = 0.93 similar but 50% words; true rewordings 0.87-1.0, 100%.
    repeat_min_score: float = 0.85
    repeat_min_word_overlap: float = 0.6

    # Notes chunk -> syllabus topic (to tag chunks with unit/topic). Lower than question matching: a chunk is
    # longer and covers several ideas, so its similarity to a one-line topic is naturally lower.
    chunk_topic_min_score: float = 0.5

    @property
    def upload_path(self) -> Path:
        # Relative paths are relative to ai-service/, matching how the Node server resolves its UPLOAD_DIR.
        path = Path(self.upload_dir)
        return path if path.is_absolute() else (SERVICE_ROOT / path).resolve()


settings = Settings()
