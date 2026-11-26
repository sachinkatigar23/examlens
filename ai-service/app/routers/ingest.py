from fastapi import APIRouter, BackgroundTasks, Depends

from app.deps import require_service_key
from app.schemas import IngestRequest
from app.services.ingest import run_ingest

router = APIRouter(dependencies=[Depends(require_service_key)])


@router.post("/ingest", status_code=202)
async def ingest(req: IngestRequest, background: BackgroundTasks):
    # Answer immediately; the work happens after the response and ends with a callback to Node.
    background.add_task(run_ingest, req)
    return {"accepted": True, "document_id": req.document_id}
