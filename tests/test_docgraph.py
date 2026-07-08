import builtins
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.ingestion_service import chunk_text, extract_text


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from app.main import app

    with (
        patch("app.main.graph_service.connect", AsyncMock()),
        patch("app.main.graph_service.close", AsyncMock()),
        patch("app.main.get_embedder", MagicMock()),
        patch("app.main.get_faiss_index", MagicMock(return_value=SimpleNamespace(ntotal=0))),
    ):
        with TestClient(app) as c:
            yield c


def auth_headers():
    return {"Authorization": "Bearer test-token"}


# Unit tests
def test_chunk_text_basic():
    text = " ".join(["word"] * 1200)
    chunks = chunk_text(text, chunk_size=500, overlap=80)
    assert len(chunks) >= 2
    for chunk in chunks:
        assert len(chunk.split()) <= 500


def test_chunk_text_short_doc():
    text = "Short document with just a few words."
    chunks = chunk_text(text)
    assert len(chunks) == 1
    assert chunks[0] == text


def test_chunk_text_overlap():
    words = [f"w{i}" for i in range(600)]
    text = " ".join(words)
    chunks = chunk_text(text, chunk_size=100, overlap=20)
    c0_words = set(chunks[0].split())
    c1_words = set(chunks[1].split())
    assert len(c0_words & c1_words) > 0


def test_extract_text_txt():
    content = b"Hello world. This is a test document."
    result = extract_text(content, "test.txt")
    assert "Hello world" in result


@pytest.mark.asyncio
async def test_graph_service_health_mock():
    from app.services.graph_service import GraphService

    svc = GraphService()
    mock_driver = MagicMock()
    mock_session = AsyncMock()
    mock_session.__aenter__.return_value = mock_session
    mock_session.__aexit__.return_value = False
    mock_driver.session = MagicMock(return_value=mock_session)
    svc._driver = mock_driver
    status = await svc.health()
    assert status == "ok"


@pytest.mark.asyncio
async def test_manual_traversal_mock():
    from app.services.graph_service import GraphService

    class AsyncIteratorMock:
        def __init__(self, items):
            self.items = iter(items)
            
        def __aiter__(self):
            return self
            
        async def __anext__(self):
            try:
                return next(self.items)
            except StopIteration:
                raise StopAsyncIteration

    svc = GraphService()
    mock_session = AsyncMock()
    mock_session.__aenter__.return_value = mock_session
    mock_session.__aexit__.return_value = False
    mock_session.run = AsyncMock(return_value=AsyncIteratorMock([]))
    mock_driver = MagicMock()
    mock_driver.session = MagicMock(return_value=mock_session)
    svc._driver = mock_driver

    result = await svc._manual_traversal(["TestEntity"], hops=2)
    assert "nodes" in result
    assert "edges" in result


@pytest.mark.asyncio
async def test_ingest_txt_document():
    from app.services.ingestion_service import ingest_document

    fake_entities = {
        "entities": [{"name": "Anthropic", "type": "ORG", "description": "AI company"}],
        "relationships": [{"source": "Anthropic", "target": "Claude", "type": "CREATED", "context": "test"}],
    }

    with (
        patch("app.services.ingestion_service.extract_entities_from_chunk", AsyncMock(return_value=fake_entities)),
        patch("app.services.graph_service.graph_service.upsert_document", AsyncMock()),
        patch("app.services.graph_service.graph_service.upsert_chunk", AsyncMock()),
        patch("app.services.graph_service.graph_service.upsert_entity", AsyncMock()),
        patch("app.services.graph_service.graph_service.upsert_relationship", AsyncMock()),
        patch("app.services.ingestion_service.save_faiss_index", MagicMock()),
        patch("app.services.ingestion_service.embed_and_store", MagicMock()),
    ):
        content = b"Anthropic created Claude. Claude is a large language model."
        result = await ingest_document(content, "test.txt")
        assert result.chunks >= 1
        assert result.entities >= 1


# API endpoint tests
def test_root_endpoint(client):
    r = client.get("/")
    assert r.status_code == 200
    assert "DocGraph" in r.json()["project"]


def test_health_endpoint_structure(client):
    with patch("app.main.graph_service.health", AsyncMock(return_value="ok")):
        r = client.get("/health")
        assert r.status_code == 200
        data = r.json()
        assert "neo4j" in data
        assert "faiss" in data
        assert "llm" in data


def test_query_stream_requires_auth_when_token_set(client):
    with patch("app.api.security.settings.api_auth_token", "test-token"):
        r = client.post("/query/stream", json={"query": "what is docgraph?", "stream": True})
        assert r.status_code == 401


def test_query_stream_meta_contains_confidence_and_citations(client):
    async def _fake_stream(**_kwargs):
        meta = {
            "type": "meta",
            "graph_nodes": 1,
            "graph_edges": 1,
            "vector_chunks": 1,
            "graph_hops": 2,
            "nodes": [{"id": "A", "label": "A", "type": "CONCEPT"}],
            "edges": [{"source": "A", "target": "B", "type": "RELATED_TO"}],
            "citations": [{"source": "c1", "excerpt": "x", "score": 0.8}],
            "confidence": 0.72,
        }
        yield f"data: {json.dumps(meta)}\n\n"
        yield "data: {\"type\": \"done\"}\n\n"

    with (
        patch("app.api.security.settings.api_auth_token", "test-token"),
        patch("app.api.query.retrieve_and_stream", _fake_stream),
    ):
        with client.stream(
            "POST",
            "/query/stream",
            headers=auth_headers(),
            json={"query": "What is X?", "stream": True},
        ) as resp:
            assert resp.status_code == 200
            text = "".join(chunk.decode("utf-8") if isinstance(chunk, bytes) else chunk for chunk in resp.iter_raw())
            assert "\"confidence\": 0.72" in text
            assert "\"citations\"" in text


@pytest.mark.asyncio
async def test_retrieve_and_answer_emits_citations_and_confidence():
    from app.services import retrieval_service

    class _FakeResp:
        choices = [SimpleNamespace(message=SimpleNamespace(content="Grounded answer"))]

    class _FakeClient:
        class chat:
            class completions:
                @staticmethod
                async def create(**_kwargs):
                    return _FakeResp()

    with (
        patch("app.services.retrieval_service.detect_query_entities", AsyncMock(return_value=["Alpha"])),
        patch(
            "app.services.retrieval_service.graph_service.multi_hop_traversal",
            AsyncMock(return_value={"nodes": [{"name": "Alpha", "type": "ORG"}], "edges": [], "hops": 2}),
        ),
        patch(
            "app.services.retrieval_service.vector_search",
            MagicMock(return_value=[{"chunk_id": "doc_c0", "text": "Alpha founded Beta", "score": 0.1}]),
        ),
        patch("app.services.retrieval_service.get_groq_client", MagicMock(return_value=_FakeClient())),
    ):
        resp = await retrieval_service.retrieve_and_answer("Who founded Beta?")
        assert resp.citations
        assert 0.0 <= resp.confidence <= 1.0


def test_startup_skips_missing_embedder():
    from fastapi.testclient import TestClient
    from app.main import app

    with (
        patch("app.main.graph_service.connect", AsyncMock()),
        patch("app.main.graph_service.close", AsyncMock()),
        patch("app.main.get_embedder", side_effect=ModuleNotFoundError("sentence_transformers")),
        patch("app.main.get_faiss_index", MagicMock(return_value=SimpleNamespace(ntotal=0))),
        patch("app.main.logger.warning") as warning_mock,
    ):
        with TestClient(app) as c:
            r = c.get("/")
            assert r.status_code == 200
        warning_mock.assert_called_once_with("sentence-transformers not installed; embedder warm-up skipped")


def test_get_embedder_defers_sentence_transformers_import():
    from app.services import ingestion_service

    original_import = builtins.__import__

    def _import_with_missing_sentence_transformers(name, *args, **kwargs):
        if name == "sentence_transformers":
            raise ModuleNotFoundError("sentence_transformers")
        return original_import(name, *args, **kwargs)

    with (
        patch.object(ingestion_service, "_embedder", None),
        patch("builtins.__import__", side_effect=_import_with_missing_sentence_transformers),
    ):
        with pytest.raises(ModuleNotFoundError):
            ingestion_service.get_embedder()


def test_get_embedder_initializes_when_sentence_transformers_available():
    from app.services import ingestion_service

    class FakeSentenceTransformer:
        def __init__(self, model_name):
            self.model_name = model_name

    original_import = builtins.__import__

    def _import_with_fake_sentence_transformers(name, *args, **kwargs):
        if name == "sentence_transformers":
            return SimpleNamespace(SentenceTransformer=FakeSentenceTransformer)
        return original_import(name, *args, **kwargs)

    with (
        patch.object(ingestion_service, "_embedder", None),
        patch("builtins.__import__", side_effect=_import_with_fake_sentence_transformers),
    ):
        embedder = ingestion_service.get_embedder()
        assert isinstance(embedder, FakeSentenceTransformer)
        assert embedder.model_name == ingestion_service.settings.embedding_model
