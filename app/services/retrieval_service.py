import time
import json
from typing import AsyncGenerator
from loguru import logger
from groq import AsyncGroq

from app.core.config import get_settings
from app.services.graph_service import graph_service
from app.services.ingestion_service import vector_search, get_groq_client
from app.models.schemas import QueryResponse, GraphContext, GraphNode, GraphEdge, Citation

settings = get_settings()


# ── Entity detection from query ───────────────────────────────────────────────

ENTITY_DETECT_PROMPT = """Extract specific named entities from the query below.
Focus on: proper nouns, organization names, law names, act names, section numbers, place names.
Ignore generic words like "people", "organizations", "topics", "relationships".
Return ONLY a JSON array of specific entity name strings.
Example: ["Companies Act 2017", "Commission", "Pakistan"]
Query: {query}"""

async def detect_query_entities(query: str) -> list[str]:
    client = get_groq_client()
    try:
        resp = await client.chat.completions.create(
            model=settings.llm_model,
            messages=[{"role": "user", "content": ENTITY_DETECT_PROMPT.format(query=query)}],
            temperature=0.0,
            max_tokens=256,
        )
        raw = resp.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        entities = json.loads(raw)
        return [e for e in entities if isinstance(e, str)]
    except Exception as e:
        logger.warning(f"Entity detection failed: {e}. Falling back to query words.")
        # Fallback: use capitalized words as entity hints
        return [w.strip(".,?!") for w in query.split() if w[0].isupper()]


# ── Build system prompt ───────────────────────────────────────────────────────

def build_system_prompt(graph_context: dict, vector_chunks: list[dict]) -> str:
    parts = [
        "You are a precise document assistant. Answer using ONLY the context below.",
        "If the answer is not in the context, say so clearly — do not hallucinate.",
        "",
    ]

    if graph_context.get("nodes"):
        parts.append("## Knowledge Graph Context")
        parts.append("Entities found:")
        for n in graph_context["nodes"][:15]:
            parts.append(f"  - {n['name']} ({n['type']})")

        parts.append("\nRelationships:")
        for e in graph_context["edges"][:20]:
            ctx = f" [{e['ctx']}]" if e.get("ctx") else ""
            parts.append(f"  - {e['src']} --[{e['rel']}]--> {e['tgt']}{ctx}")
        parts.append("")

    if vector_chunks:
        parts.append("## Relevant Document Passages")
        for i, chunk in enumerate(vector_chunks[:5], 1):
            parts.append(f"\n[Passage {i}]")
            parts.append(chunk["text"][:800])
        parts.append("")

    return "\n".join(parts)


def build_citations(vector_chunks: list[dict]) -> list[Citation]:
    citations: list[Citation] = []
    for chunk in vector_chunks[:5]:
        excerpt = chunk.get("text", "").strip().replace("\n", " ")
        citations.append(
            Citation(
                source=chunk.get("chunk_id", "unknown"),
                excerpt=excerpt[:220],
                score=round(max(0.0, 1.0 - float(chunk.get("score", 1.0))), 4),
            )
        )
    return citations


def estimate_confidence(graph_ctx: dict, vector_chunks: list[dict]) -> float:
    graph_signal = min(1.0, len(graph_ctx.get("nodes", [])) / 12)
    vector_signal = min(1.0, len(vector_chunks) / 5)
    score_signal = 0.0
    if vector_chunks:
        avg_dist = sum(float(c.get("score", 1.0)) for c in vector_chunks[:5]) / min(5, len(vector_chunks))
        score_signal = 1.0 / (1.0 + max(avg_dist, 0.0))
    confidence = (0.45 * vector_signal) + (0.35 * score_signal) + (0.20 * graph_signal)
    return round(max(0.0, min(1.0, confidence)), 3)


# ── Main retrieval pipeline ───────────────────────────────────────────────────

async def retrieve_and_answer(
    query: str,
    top_k: int = 5,
    use_graph: bool = True,
    use_vector: bool = True,
) -> QueryResponse:
    t0 = time.time()

    graph_ctx = {"nodes": [], "edges": [], "hops": 0}
    vector_chunks = []

    # 1. Detect entities in query
    if use_graph:
        entity_names = await detect_query_entities(query)
        logger.info(f"Query entities: {entity_names}")

        if entity_names:
            graph_ctx = await graph_service.multi_hop_traversal(entity_names, hops=2)
            logger.info(
                f"  → Graph: {len(graph_ctx['nodes'])} nodes, {len(graph_ctx['edges'])} edges"
            )

    # 2. Vector search
    if use_vector:
        vector_chunks = vector_search(query, top_k=top_k)
        logger.info(f"  → Vector: {len(vector_chunks)} chunks")

    # 3. Build prompt and call LLM
    system_prompt = build_system_prompt(graph_ctx, vector_chunks)
    client = get_groq_client()

    resp = await client.chat.completions.create(
        model=settings.llm_model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": query},
        ],
        temperature=0.1,
        max_tokens=1024,
    )
    answer = resp.choices[0].message.content.strip()

    # 4. Build response
    graph_context_model = GraphContext(
        nodes=[GraphNode(id=n["name"], label=n["name"], type=n["type"]) for n in graph_ctx["nodes"]],
        edges=[
            GraphEdge(source=e["src"], target=e["tgt"], relationship=e["rel"])
            for e in graph_ctx["edges"]
        ],
        subgraph_summary=f"{len(graph_ctx['nodes'])} entities, {len(graph_ctx['edges'])} relationships across {graph_ctx.get('hops', 0)} hops",
    )

    citations = build_citations(vector_chunks)
    confidence = estimate_confidence(graph_ctx, vector_chunks)

    return QueryResponse(
        answer=answer,
        graph_context=graph_context_model,
        vector_chunks_used=len(vector_chunks),
        graph_hops=graph_ctx.get("hops", 0),
        latency_ms=round((time.time() - t0) * 1000, 2),
        confidence=confidence,
        citations=citations,
    )


# ── Streaming variant ─────────────────────────────────────────────────────────

async def retrieve_and_stream(
    query: str,
    top_k: int = 5,
    use_graph: bool = True,
    use_vector: bool = True,
) -> AsyncGenerator[str, None]:
    """Yields SSE-compatible data strings."""

    graph_ctx = {"nodes": [], "edges": [], "hops": 0}
    vector_chunks = []

    if use_graph:
        entity_names = await detect_query_entities(query)
        if entity_names:
            graph_ctx = await graph_service.multi_hop_traversal(entity_names, hops=2)

    if use_vector:
        vector_chunks = vector_search(query, top_k=top_k)

    system_prompt = build_system_prompt(graph_ctx, vector_chunks)
    client = get_groq_client()

    # Yield graph metadata first (include subgraph for UI context panel)
    meta = {
        "type": "meta",
        "graph_nodes": len(graph_ctx["nodes"]),
        "graph_edges": len(graph_ctx["edges"]),
        "vector_chunks": len(vector_chunks),
        "graph_hops": graph_ctx.get("hops", 0),
        "nodes": [
            {"id": n["name"], "label": n["name"], "type": n["type"]}
            for n in graph_ctx["nodes"][:20]
        ],
        "edges": [
            {"source": e["src"], "target": e["tgt"], "type": e["rel"]}
            for e in graph_ctx["edges"][:15]
        ],
        "citations": [
            {
                "source": c.source,
                "excerpt": c.excerpt,
                "score": c.score,
            }
            for c in build_citations(vector_chunks)
        ],
        "confidence": estimate_confidence(graph_ctx, vector_chunks),
    }
    yield f"data: {json.dumps(meta)}\n\n"

    # Stream the answer tokens
    stream = await client.chat.completions.create(
        model=settings.llm_model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": query},
        ],
        temperature=0.1,
        max_tokens=1024,
        stream=True,
    )

    async for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            yield f"data: {json.dumps({'type': 'token', 'content': delta})}\n\n"

    yield "data: {\"type\": \"done\"}\n\n"
