# DocGraph — GraphRAG System

General-purpose GraphRAG system integrating Neo4j knowledge graphs with FAISS vector search.

## Stack
- **Backend**: FastAPI + Neo4j + FAISS + Groq (Llama 3)
- **Frontend**: React + Vite + TypeScript + Tailwind CSS
- **MLOps**: Docker + GitHub Actions CI/CD + Prometheus + Grafana
- **Deployment**: AWS EC2

## Features
- LLM-based entity & relationship extraction into Neo4j
- Multi-hop Cypher graph traversal
- FAISS vector search with sentence-transformers
- Real-time SSE streaming
- Force-directed interactive knowledge graph visualization
- System reset endpoint
- Optional bearer-token auth for ingest/query/reset endpoints
- Confidence + citation metadata in query responses
- Regression evaluation harness (`eval/run_eval.py`) with CI gating
