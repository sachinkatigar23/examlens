import secrets

from fastapi import Header, HTTPException

from app.config import settings


def require_service_key(x_service_key: str = Header(default="")) -> None:
    """Only the Node API knows the shared key. compare_digest avoids leaking it through timing."""
    if not secrets.compare_digest(x_service_key, settings.service_key):
        raise HTTPException(status_code=401, detail="Invalid service key")
