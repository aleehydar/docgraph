from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from app.services.ingestion_service import ingest_document
from app.models.schemas import IngestResponse
from loguru import logger
from app.api.security import require_api_auth, require_admin_auth
from app.core.config import get_settings

router = APIRouter(prefix="/ingest", tags=["Ingestion"])

ALLOWED_EXTENSIONS = {"pdf", "txt", "docx", "md"}
MAX_FILE_SIZE_MB = 20


@router.post("/", response_model=IngestResponse, summary="Upload and ingest a document")
async def ingest(
    file: UploadFile = File(...),
    _auth: None = Depends(require_api_auth),
):
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed: {ALLOWED_EXTENSIONS}",
        )

    content = await file.read()
    size_mb = len(content) / (1024 * 1024)
    if size_mb > MAX_FILE_SIZE_MB:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({size_mb:.1f} MB). Max: {MAX_FILE_SIZE_MB} MB",
        )

    try:
        result = await ingest_document(content, file.filename)
        return result
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.exception(f"Ingestion error: {e}")
        raise HTTPException(status_code=500, detail="Ingestion failed. Check logs.")

@router.post("/reset", summary="Reset Neo4j and FAISS databases")
async def reset_databases(_auth: None = Depends(require_admin_auth)):
    settings = get_settings()
    if not settings.allow_system_reset:
        raise HTTPException(status_code=403, detail="System reset is strictly disabled in this environment.")
    try:
        from app.services.graph_service import graph_service
        from app.services.ingestion_service import clear_faiss
        await graph_service.clear_database()
        clear_faiss()
        return {"message": "Databases successfully reset."}
    except Exception as e:
        logger.exception(f"Reset error: {e}")
        raise HTTPException(status_code=500, detail="Database reset failed.")
