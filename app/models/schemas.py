from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum


class IngestResponse(BaseModel):
    doc_id: str
    chunks: int
    entities: int
    relationships: int
    message: str


class QueryRequest(BaseModel):
    query: str = Field(..., min_length=3, max_length=1000)
    top_k: int = Field(default=5, ge=1, le=20)
    use_graph: bool = True
    use_vector: bool = True
    stream: bool = True


class GraphNode(BaseModel):
    id: str
    label: str
    type: str
    properties: dict = Field(default_factory=dict)


class GraphEdge(BaseModel):
    source: str
    target: str
    relationship: str


class GraphContext(BaseModel):
    nodes: list[GraphNode] = Field(default_factory=list)
    edges: list[GraphEdge] = Field(default_factory=list)
    subgraph_summary: str = ""

class Citation(BaseModel):
    source: str
    excerpt: str
    score: float = 0.0


class QueryResponse(BaseModel):
    answer: str
    graph_context: Optional[GraphContext] = None
    vector_chunks_used: int = 0
    graph_hops: int = 0
    latency_ms: float = 0.0
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    citations: list[Citation] = Field(default_factory=list)


class HealthResponse(BaseModel):
    status: str
    neo4j: str
    faiss: str
    llm: str


class DocumentStatus(str, Enum):
    processing = "processing"
    completed = "completed"
    failed = "failed"
