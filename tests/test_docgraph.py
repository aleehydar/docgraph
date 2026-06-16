import pytest
import asyncio
from unittest.mock import AsyncMock, patch, MagicMock
from app.services.ingestion_service import chunk_text, extract_text


# ── Unit tests ────────────────────────────────────────────────────────────────

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
    # Overlapping: last words of chunk N should appear in chunk N+1
    c0_words = set(chunks[0].split())
    c1_words = set(chunks[1].split())
    assert len(c0_words & c1_words) > 0


def test_extract_text_txt():
    content = b"Hello world. This is a test document."
    result = extract_text(content, "test.txt")
    assert "Hello world" in result


# ── Graph service unit tests ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_graph_service_health_mock():
    from app.services.graph_service import GraphService
    svc = GraphService()
    mock_driver = AsyncMock()
    mock_session = AsyncMock()
    mock_driver.session.return_value.__aenter__ = AsyncMock(return_value=mock_session)
    mock_driver.session.return_value.__aexit__ = AsyncMock(return_value=False)
    svc._driver = mock_driver
    status = await svc.health()
    assert status == "ok"


@pytest.mark.asyncio
async def test_manual_traversal_mock():
    from app.services.graph_service import GraphService
    svc = GraphService()

    mock_result = AsyncMock()
    mock_result.__aiter__ = MagicMock(return_value=iter([]))

    mock_session = AsyncMock()
    mock_session.run = AsyncMock(return_value=mock_result)

    mock_driver = AsyncMock()
    mock_driver.session.return_value.__aenter__ = AsyncMock(return_value=mock_session)
    mock_driver.session.return_value.__aexit__ = AsyncMock(return_value=False)

    svc._driver = mock_driver
    result = await svc._manual_traversal(["TestEntity"], hops=2)
    assert "nodes" in result
    assert "edges" in result


# ── Ingestion pipeline integration test (mocked LLM) ────────────────────────

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
    ):
        content = b"Anthropic created Claude. Claude is a large language model."
        result = await ingest_document(content, "test.txt")
        assert result.chunks >= 1
        assert result.entities >= 1


# ── API endpoint tests ────────────────────────────────────────────────────────

@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from app.main import app
    with TestClient(app) as c:
        yield c


def test_root_endpoint(client):
    r = client.get("/")
    assert r.status_code == 200
    assert "DocGraph" in r.json()["project"]


def test_health_endpoint_structure(client):
    with patch("app.services.graph_service.graph_service.health", AsyncMock(return_value="ok")):
        r = client.get("/health")
        assert r.status_code == 200
        data = r.json()
        assert "neo4j" in data
        assert "faiss" in data
        assert "llm" in data


def test_startup_skips_missing_embedder():
    from fastapi.testclient import TestClient
    from app.main import app

    with (
        patch("app.main.graph_service.connect", AsyncMock()),
        patch("app.main.graph_service.close", AsyncMock()),
        patch("app.main.get_embedder", side_effect=ModuleNotFoundError("sentence_transformers")),
        patch("app.main.get_faiss_index", MagicMock()),
        patch("app.main.logger.warning") as warning_mock,
    ):
        with TestClient(app) as c:
            r = c.get("/")
            assert r.status_code == 200
        warning_mock.assert_called_once_with("sentence-transformers not installed; embedder warm-up skipped")


def test_get_embedder_defers_sentence_transformers_import():
    import builtins
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
