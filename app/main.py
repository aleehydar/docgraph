from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from loguru import logger
from prometheus_fastapi_instrumentator import Instrumentator

from app.core.config import get_settings
from app.api.ingest import router as ingest_router
from app.api.query import router as query_router
from app.services.graph_service import graph_service
from app.services.ingestion_service import get_embedder, get_faiss_index
from app.models.schemas import HealthResponse

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting DocGraph...")
    await graph_service.connect()
    try:
        get_embedder()  # warm up embedder
    except ModuleNotFoundError:
        logger.warning("sentence-transformers not installed; embedder warm-up skipped")
    get_faiss_index()   # warm up / load FAISS
    logger.success("DocGraph ready")
    yield
    # Shutdown
    await graph_service.close()
    logger.info("DocGraph shut down")


app = FastAPI(
    title="DocGraph — GraphRAG API",
    description=(
        "General-purpose GraphRAG system: upload any document, "
        "build a Neo4j knowledge graph, query with multi-hop traversal + vector search."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Prometheus metrics at /metrics
Instrumentator().instrument(app).expose(app)

# Routers
app.include_router(ingest_router)
app.include_router(query_router)


@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def health():
    neo4j_status = await graph_service.health()
    from app.services.ingestion_service import get_faiss_index
    faiss_status = f"ok ({get_faiss_index().ntotal} vectors)"
    return HealthResponse(
        status="ok",
        neo4j=neo4j_status,
        faiss=faiss_status,
        llm=settings.llm_model,
    )


@app.get("/", tags=["Root"])
async def root():
    return {
        "project": "DocGraph",
        "description": "GraphRAG with Neo4j — upload docs, query the knowledge graph",
        "docs": "/docs",
        "health": "/health",
    }
