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

    # Retrieval / matching thresholds (cosine similarity, nomic-embed-text). Measured, see docs/BUILD_NOTES.md.
    ask_top_k: int = 5
    ask_min_score: float = 0.55  # below this the best chunk isn't really about the question
    topic_match_min_score: float = 0.55
    # Measured: same question reworded scores >= 0.95; different questions on one topic reach ~0.90.
    repeat_min_score: float = 0.92

    @property
    def upload_path(self) -> Path:
        # Relative paths are relative to ai-service/, matching how the Node server resolves its UPLOAD_DIR.
        path = Path(self.upload_dir)
        return path if path.is_absolute() else (SERVICE_ROOT / path).resolve()


settings = Settings()
