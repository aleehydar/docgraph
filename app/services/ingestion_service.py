import uuid
import json
from pathlib import Path
from typing import AsyncGenerator, TYPE_CHECKING
from loguru import logger

from groq import AsyncGroq
import faiss
import numpy as np

from app.core.config import get_settings
from app.services.graph_service import graph_service
from app.models.schemas import IngestResponse

settings = get_settings()

if TYPE_CHECKING:
    from sentence_transformers import SentenceTransformer

# ── Globals (loaded once) ────────────────────────────────────────────────────
_embedder: "SentenceTransformer | None" = None
_faiss_index: faiss.IndexFlatL2 | None = None
_faiss_meta: list[dict] = []   # parallel list: chunk_id, text, doc_id
_groq_client: AsyncGroq | None = None


def get_embedder() -> "SentenceTransformer":
    global _embedder
    if _embedder is None:
        from sentence_transformers import SentenceTransformer
        _embedder = SentenceTransformer(settings.embedding_model)
        logger.info(f"Embedder loaded: {settings.embedding_model}")
    return _embedder


def get_faiss_index() -> faiss.IndexFlatL2:
    global _faiss_index, _faiss_meta
    import json as _json
    if _faiss_index is None:
        dim = 384
        index_path = Path(settings.faiss_index_path)
        meta_path = index_path.parent / "faiss_meta.json"
        if index_path.exists():
            _faiss_index = faiss.read_index(str(index_path))
            if meta_path.exists():
                with open(meta_path) as f:
                    _faiss_meta.extend(_json.load(f))
            logger.info(f"FAISS loaded: {_faiss_index.ntotal} vectors")
        else:
            _faiss_index = faiss.IndexFlatL2(dim)
            logger.info("New FAISS index created")
    return _faiss_index
    
def get_groq_client() -> AsyncGroq:
    global _groq_client
    if _groq_client is None:
        _groq_client = AsyncGroq(api_key=settings.groq_api_key)
    return _groq_client


def save_faiss_index():
    import json as _json
    index_path = Path(settings.faiss_index_path)
    index_path.parent.mkdir(parents=True, exist_ok=True)
    faiss.write_index(get_faiss_index(), str(index_path))
    meta_path = index_path.parent / "faiss_meta.json"
    with open(meta_path, "w") as f:
        _json.dump(_faiss_meta, f)

def clear_faiss():
    global _faiss_index, _faiss_meta
    _faiss_index = None
    _faiss_meta.clear()
    index_path = Path(settings.faiss_index_path)
    meta_path = index_path.parent / "faiss_meta.json"
    if index_path.exists():
        index_path.unlink()
    if meta_path.exists():
        meta_path.unlink()
    get_faiss_index() # Re-initialize empty FAISS

# ── Text extraction ──────────────────────────────────────────────────────────

def extract_text(file_bytes: bytes, filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1].lower()
    if ext == "pdf":
        from pypdf import PdfReader
        from io import BytesIO
        reader = PdfReader(BytesIO(file_bytes))
        return "\n".join(p.extract_text() or "" for p in reader.pages)
    elif ext in ("docx", "doc"):
        from docx import Document
        from io import BytesIO
        doc = Document(BytesIO(file_bytes))
        return "\n".join(p.text for p in doc.paragraphs)
    else:
        return file_bytes.decode("utf-8", errors="ignore")


# ── Chunking ─────────────────────────────────────────────────────────────────

def chunk_text(text: str, chunk_size: int = 500, overlap: int = 80) -> list[str]:
    words = text.split()
    chunks, i = [], 0
    while i < len(words):
        chunk = " ".join(words[i: i + chunk_size])
        if chunk.strip():
            chunks.append(chunk.strip())
        i += chunk_size - overlap
    return chunks


# ── Entity extraction via LLM ────────────────────────────────────────────────

ENTITY_PROMPT = """Extract entities and relationships from the text below.
Return ONLY valid JSON with this exact structure:
{{
  "entities": [
    {{"name": "...", "type": "PERSON|ORG|LOCATION|EVENT|CONCEPT|PRODUCT", "description": "..."}}
  ],
  "relationships": [
    {{"source": "...", "target": "...", "type": "WORKS_AT|LOCATED_IN|PART_OF|CAUSED|RELATED_TO|...", "context": "..."}}
  ]
}}
Rules:
- Only include entities explicitly mentioned in the text.
- Keep names as they appear.
- type must be one word, snake_case or SCREAMING_SNAKE_CASE.
- Return ONLY the JSON, no markdown, no explanation.

Text:
{text}"""


async def extract_entities_from_chunk(chunk: str) -> dict:
    client = get_groq_client()
    try:
        resp = await client.chat.completions.create(
            model=settings.llm_model,
            messages=[{"role": "user", "content": ENTITY_PROMPT.format(text=chunk[:2000])}],
            temperature=0.0,
            max_tokens=1024,
        )
        raw = resp.choices[0].message.content.strip()
        # Strip possible markdown fences
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        return json.loads(raw)
    except Exception as e:
        logger.warning(f"Entity extraction failed: {e}")
        return {"entities": [], "relationships": []}


# ── Embedding & FAISS ────────────────────────────────────────────────────────

def embed_and_store(chunk_id: str, doc_id: str, text: str):
    embedder = get_embedder()
    index = get_faiss_index()
    vec = embedder.encode([text], normalize_embeddings=True).astype(np.float32)
    index.add(vec)
    _faiss_meta.append({"chunk_id": chunk_id, "doc_id": doc_id, "text": text})

def vector_search(query: str, top_k: int = 5) -> list[dict]:
    embedder = get_embedder()
    index = get_faiss_index()
    if index.ntotal == 0:
        return []
    vec = embedder.encode([query], normalize_embeddings=True).astype(np.float32)
    distances, indices = index.search(vec, min(top_k, index.ntotal))
    results = []
    for dist, idx in zip(distances[0], indices[0]):
        if idx != -1:
            if idx < len(_faiss_meta):
                results.append({**_faiss_meta[idx], "score": float(dist)})
            else:
                meta_idx = idx % len(_faiss_meta)
                results.append({**_faiss_meta[meta_idx], "score": float(dist)})
    return results


# ── Main ingestion pipeline ───────────────────────────────────────────────────

async def ingest_document(
    file_bytes: bytes,
    filename: str,
) -> IngestResponse:
    doc_id = str(uuid.uuid4())[:8]
    logger.info(f"Ingesting: {filename} | doc_id={doc_id}")

    # 1. Extract raw text
    text = extract_text(file_bytes, filename)
    if not text.strip():
        raise ValueError("Could not extract text from document")

    # 2. Chunk
    chunks = chunk_text(text, chunk_size=150, overlap=30)
    logger.info(f"  → {len(chunks)} chunks")

    # 3. Store document node
    await graph_service.upsert_document(doc_id, filename, len(chunks))

    total_entities = 0
    total_rels = 0

    for i, chunk_text_str in enumerate(chunks):
        chunk_id = f"{doc_id}_c{i}"

        # 4. Store chunk in Neo4j
        await graph_service.upsert_chunk(chunk_id, doc_id, chunk_text_str, i)

        # 5. Embed + store in FAISS
        embed_and_store(chunk_id, doc_id, chunk_text_str)

        # 6. Extract entities & relationships (every chunk)
        extracted = await extract_entities_from_chunk(chunk_text_str)

        for ent in extracted.get("entities", []):
            if ent.get("name"):
                await graph_service.upsert_entity(
                    name=ent["name"],
                    entity_type=ent.get("type", "CONCEPT"),
                    doc_id=doc_id,
                    chunk_id=chunk_id,
                    description=ent.get("description", ""),
                )
                total_entities += 1

        for rel in extracted.get("relationships", []):
            if rel.get("source") and rel.get("target"):
                await graph_service.upsert_relationship(
                    source_name=rel["source"],
                    target_name=rel["target"],
                    rel_type=rel.get("type", "RELATED_TO"),
                    doc_id=doc_id,
                    context=rel.get("context", ""),
                )
                total_rels += 1

    # 7. Persist FAISS index
    save_faiss_index()

    logger.success(
        f"Ingestion done: {len(chunks)} chunks, {total_entities} entities, {total_rels} rels"
    )
    return IngestResponse(
        doc_id=doc_id,
        chunks=len(chunks),
        entities=total_entities,
        relationships=total_rels,
        message=f"Document '{filename}' ingested successfully.",
    )
