from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.deps import require_service_key
from app.schemas import AskRequest
from app.services.answer import answer_stream

router = APIRouter(dependencies=[Depends(require_service_key)])


@router.post("/ask")
async def ask(req: AskRequest):
    # Server-Sent Events: "event: token" many times, then "event: done" with citations (or "event: error").
    return StreamingResponse(
        answer_stream(req),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
