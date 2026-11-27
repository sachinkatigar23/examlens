from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.deps import require_service_key
from app.schemas import CheckRequest, LessonRequest, RetagRequest, RevisionRequest, TranscribeRequest
from app.services.check import check_stream
from app.services.lesson import lesson_stream
from app.services.llm import LLMError
from app.services.revision import sheet_stream
from app.services.units import retag_document
from app.services.vision import transcribe

router = APIRouter(dependencies=[Depends(require_service_key)])
SSE_HEADERS = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}


@router.post("/lesson")
async def lesson(req: LessonRequest):
    """Study mode: a from-scratch lesson for one topic, streamed like /ask."""
    return StreamingResponse(lesson_stream(req), media_type="text/event-stream", headers=SSE_HEADERS)


@router.post("/check-answer")
async def check_answer(req: CheckRequest):
    """Check my answer: `grade` event (estimated marks, covered, missing), then the improved version streamed."""
    return StreamingResponse(check_stream(req), media_type="text/event-stream", headers=SSE_HEADERS)


@router.post("/revision-sheet")
async def revision_sheet(req: RevisionRequest):
    """Last-night revision sheet for one unit, streamed like /lesson."""
    return StreamingResponse(sheet_stream(req), media_type="text/event-stream", headers=SSE_HEADERS)


@router.post("/transcribe")
async def transcribe_photo(req: TranscribeRequest):
    """Snap a doubt, step 1: the photo's text, for the student to check before it is solved."""
    try:
        return await transcribe(req.file_path, req.mode, req.purpose)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=400, detail={"message": str(exc), "code": "bad_image"}) from exc
    except LLMError as exc:
        status = 429 if exc.code == "rate_limited" else 503
        raise HTTPException(status_code=status, detail={"message": str(exc), "code": exc.code}) from exc


@router.post("/retag-units")
async def retag_units(req: RetagRequest):
    """Re-tags notes chunks with unit/topic after the syllabus (topics) changed."""
    try:
        updated = sum([await retag_document(req.space_id, d.document_id, d.unit) for d in req.documents])
    except LLMError as exc:
        raise HTTPException(status_code=503, detail={"message": str(exc), "code": exc.code}) from exc
    return {"updated": updated}
