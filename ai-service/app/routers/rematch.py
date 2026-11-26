from fastapi import APIRouter, Depends, HTTPException

from app.deps import require_service_key
from app.schemas import RematchRequest, TopicMatch
from app.services.llm import LLMError
from app.services.matching import match_topics

router = APIRouter(dependencies=[Depends(require_service_key)])


@router.post("/rematch", response_model=list[TopicMatch])
async def rematch(req: RematchRequest):
    """Re-match existing questions to the space's current topics (e.g. the syllabus arrived after the papers)."""
    try:
        matches = await match_topics(req.space_id, [q.text for q in req.questions], [q.unit for q in req.questions])
    except LLMError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return [
        TopicMatch(id=q.id, topic_id=topic_id, match_score=score)
        for q, (topic_id, score) in zip(req.questions, matches, strict=True)
    ]
