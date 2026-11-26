"""Calls back to the Node API. The AI service never writes to MongoDB itself: Node owns the database."""

import asyncio
import logging

import httpx

from app.config import settings

log = logging.getLogger("examlens.node")


async def update_document(document_id: str, payload: dict) -> int | None:
    """PATCH the document's status/results. Returns the HTTP status, or None if Node was unreachable."""
    url = f"{settings.node_api_url}/api/v1/internal/documents/{document_id}"
    headers = {"X-Service-Key": settings.service_key}
    for attempt in range(3):
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                res = await client.patch(url, json=payload, headers=headers)
            if res.status_code >= 400 and res.status_code != 404:
                log.error("Node rejected update for %s: %s %s", document_id, res.status_code, res.text[:300])
            return res.status_code
        except httpx.HTTPError as exc:
            log.warning("Node unreachable (attempt %s): %s", attempt + 1, exc)
            await asyncio.sleep(2 * (attempt + 1))
    return None
