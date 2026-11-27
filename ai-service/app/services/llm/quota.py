"""Cloud (Gemini) usage today, so the UI can say "about 14 of 20 Cloud answers left today" or
"limit reached, resets at 1:30 PM" before the student picks Cloud.

Gemini's API doesn't report the remaining free quota, so ExamLens counts its own requests per model. Google
resets the free-tier daily quota at midnight Pacific time; a "daily limit" 429 marks the model as used up until
then (or for the retry delay Google sends). The count is an estimate: other apps using the same key, or calls
made before this file existed, aren't in it. Kept in a small JSON file so restarts don't reset it.
"""

import json
import logging
import threading
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from app.config import settings

log = logging.getLogger("examlens.quota")
PACIFIC = ZoneInfo("America/Los_Angeles")
_lock = threading.Lock()


def _path():
    return settings.state_path / "cloud_quota.json"


def _day(now: datetime) -> str:
    return now.astimezone(PACIFIC).date().isoformat()


def _next_reset(now: datetime) -> datetime:
    local = now.astimezone(PACIFIC)
    midnight = datetime.combine(local.date() + timedelta(days=1), datetime.min.time(), tzinfo=PACIFIC)
    return midnight.astimezone(UTC)


def _load() -> dict:
    try:
        return json.loads(_path().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _save(data: dict) -> None:
    try:
        _path().parent.mkdir(parents=True, exist_ok=True)
        _path().write_text(json.dumps(data), encoding="utf-8")
    except OSError as exc:  # never break an answer because the counter couldn't be saved
        log.warning("Couldn't save the Cloud usage counter: %s", exc)


def _entry(data: dict, model: str, now: datetime) -> dict:
    entry = data.get(model)
    if not entry or entry.get("day") != _day(now):
        entry = {"day": _day(now), "used": 0, "exhausted_until": None}
        data[model] = entry
    return entry


def record_request(model: str) -> None:
    now = datetime.now(UTC)
    with _lock:
        data = _load()
        _entry(data, model, now)["used"] += 1
        _save(data)


def mark_exhausted(model: str, retry_seconds: int | None = None) -> datetime:
    """A daily-limit 429 arrived: Cloud is used up until Google's reset."""
    now = datetime.now(UTC)
    until = now + timedelta(seconds=retry_seconds) if retry_seconds else _next_reset(now)
    with _lock:
        data = _load()
        _entry(data, model, now)["exhausted_until"] = until.isoformat()
        _save(data)
    return until


def status(model: str) -> dict:
    """{used, limit, remaining, exhausted, resetsAt}. remaining is an estimate (None when no limit is set)."""
    now = datetime.now(UTC)
    with _lock:
        entry = _entry(_load(), model, now)
    until = datetime.fromisoformat(entry["exhausted_until"]) if entry.get("exhausted_until") else None
    exhausted = bool(until and until > now)
    limit = settings.gemini_daily_limit or None
    remaining = None if limit is None else max(limit - entry["used"], 0)
    return {
        "used": entry["used"],
        "limit": limit,
        "remaining": 0 if exhausted else remaining,
        "exhausted": exhausted,
        "resetsAt": (until if exhausted else _next_reset(now)).isoformat(),
    }
