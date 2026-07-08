from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from app.services.retrieval_service import retrieve_and_answer, retrieve_and_stream
from app.models.schemas import QueryRequest, QueryResponse
from loguru import logger
from app.api.security import require_api_auth

router = APIRouter(prefix="/query", tags=["Query"])


@router.post(
    "/",
    response_model=QueryResponse,
    summary="Query the knowledge graph (non-streaming)",
)
async def query(req: QueryRequest, _auth: None = Depends(require_api_auth)):
    if req.stream:
        raise HTTPException(
            status_code=400,
            detail="Set stream=false for this endpoint, or use /query/stream",
        )
    try:
        return await retrieve_and_answer(
            query=req.query,
            top_k=req.top_k,
            use_graph=req.use_graph,
            use_vector=req.use_vector,
        )
    except Exception as e:
        logger.exception(f"Query error: {e}")
        raise HTTPException(status_code=500, detail="Query failed. Check logs.")


@router.post("/stream", summary="Query with SSE token streaming")
async def query_stream(req: QueryRequest, _auth: None = Depends(require_api_auth)):
    async def event_generator():
        try:
            async for chunk in retrieve_and_stream(
                query=req.query,
                top_k=req.top_k,
                use_graph=req.use_graph,
                use_vector=req.use_vector,
            ):
                yield chunk
        except Exception as e:
            logger.exception(f"Stream error: {e}")
            yield f"data: {{\"type\": \"error\", \"message\": \"{str(e)}\"}}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
