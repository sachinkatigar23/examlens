from fastapi import APIRouter, Depends, Response

from app.deps import require_service_key
from app.services import qdrant

router = APIRouter(dependencies=[Depends(require_service_key)])


@router.delete("/documents/{document_id}", status_code=204)
async def delete_document(document_id: str):
    await qdrant.delete_document(document_id)  # chunks, topics and questions of this document
    return Response(status_code=204)
