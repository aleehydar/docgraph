# DocGraph — General-Purpose GraphRAG System

> Upload any document → extract a Neo4j knowledge graph → query with multi-hop traversal + vector search

## Architecture

```
Ingestion Pipeline
─────────────────
Document (PDF/TXT/DOCX)
  → Chunker (500 tokens, 80 overlap)
  → Entity Extractor (LLM via Groq)
  → Neo4j (entities + relationships as graph nodes/edges)
  → FAISS (dense vector embeddings via sentence-transformers)

Retrieval Pipeline
──────────────────
User Query
  → Entity Detection (LLM)
  → Neo4j Multi-hop Cypher Traversal (2 hops)
  → FAISS Vector Search (top-k chunks)
  → Context Builder (merge graph + vector results)
  → LLM Answer Generation (Groq, streaming SSE)
  → Response
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Graph DB | Neo4j 5 (Bolt + APOC) |
| LLM | Groq (Llama 3 70B) |
| Embeddings | sentence-transformers (all-MiniLM-L6-v2) |
| Vector Store | FAISS (flat L2) |
| API | FastAPI + SSE streaming |
| Frontend | React + Vite + Tailwind |
| MLOps | Prometheus + Grafana + MLflow |
| Infra | Docker Compose + GitHub Actions CI/CD + AWS EC2 |

## Quick Start

### 1. Clone & configure

```bash
git clone https://github.com/YOUR_USERNAME/docgraph.git
cd docgraph
cp .env.example .env
# Edit .env — add GROQ_API_KEY and set NEO4J_PASSWORD
```

### 2. Run with Docker Compose

```bash
docker compose up --build
```

Services:
- API: http://localhost:8000 (FastAPI + Swagger at /docs)
- UI: http://localhost:8501 (React)
- Neo4j Browser: http://localhost:7474
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3000 (admin/admin)

### 3. Run locally (without Docker)

```bash
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt

# Start Neo4j separately (Docker):
docker run -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/password \
  -e NEO4J_PLUGINS='["apoc"]' \
  neo4j:5.18-community

uvicorn app.main:app --reload

# Frontend (separate terminal)
cd frontend && npm install && npm run dev
```

### 4. Run tests

```bash
pytest tests/ -v
```

## API Reference

### POST /ingest/
Upload a document for ingestion.

```bash
curl -X POST http://localhost:8000/ingest/ \
  -F "file=@document.pdf"
```

Response:
```json
{
  "doc_id": "a1b2c3d4",
  "chunks": 24,
  "entities": 87,
  "relationships": 43,
  "message": "Document 'document.pdf' ingested successfully."
}
```

### POST /query/stream
Query with SSE token streaming.

```bash
curl -X POST http://localhost:8000/query/stream \
  -H "Content-Type: application/json" \
  -d '{"query": "Who founded the company?", "top_k": 5}'
```

SSE events:
```
data: {"type": "meta", "graph_nodes": 12, "graph_edges": 8, "vector_chunks": 5}
data: {"type": "token", "content": "The"}
data: {"type": "token", "content": " company"}
...
data: {"type": "done"}
```

### POST /query/
Non-streaming query.

```bash
curl -X POST http://localhost:8000/query/ \
  -H "Content-Type: application/json" \
  -d '{"query": "What products does X make?", "stream": false}'
```

### GET /health
```json
{
  "status": "ok",
  "neo4j": "ok",
  "faiss": "ok (156 vectors)",
  "llm": "llama3-70b-8192"
}
```

## Key Features

- **Multi-hop graph traversal** — answers questions spanning multiple entities/documents that vector RAG can't handle
- **Hybrid retrieval** — combines Neo4j Cypher traversal with FAISS vector search for maximum coverage
- **LLM entity extraction** — automatically builds the knowledge graph from any document
- **Real-time SSE streaming** — token-by-token streaming to the frontend
- **Zero hallucination design** — system prompt strictly grounds the LLM to context only
- **Production MLOps** — Prometheus metrics, Grafana dashboards, automated pytest CI/CD

## Deployment (AWS EC2)

```bash
# On EC2 (Ubuntu 22.04)
sudo apt install docker.io docker-compose-plugin -y
git clone https://github.com/YOUR_USERNAME/docgraph.git
cd docgraph
cp .env.example .env && nano .env   # fill in keys
docker compose up -d
```

GitHub Actions auto-deploys on every push to main.

## CV Summary (copy-paste ready)

**DocGraph — General-Purpose GraphRAG System**
Built a production-grade GraphRAG system integrating Neo4j knowledge graphs with FAISS vector search, 
using Groq (Llama 3 70B) for LLM entity extraction and multi-hop Cypher traversal to answer complex 
cross-document queries beyond vanilla RAG capability; served via FastAPI with real-time SSE streaming 
and a Streamlit UI, containerized with Docker and deployed on AWS EC2 with full GitHub Actions CI/CD, 
Prometheus/Grafana monitoring.

## License

MIT
