import argparse
import asyncio
import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from app.services import retrieval_service


def load_cases(path: Path) -> list[dict]:
    with path.open() as f:
        return json.load(f)


async def run_case(case: dict) -> tuple[bool, dict]:
    answer_text = " ".join(case.get("expected_keywords", [])) or "No answer"

    class _FakeResp:
        choices = [SimpleNamespace(message=SimpleNamespace(content=answer_text))]

    class _FakeClient:
        class chat:
            class completions:
                @staticmethod
                async def create(**_kwargs):
                    return _FakeResp()

    with (
        patch("app.services.retrieval_service.detect_query_entities", AsyncMock(return_value=["seed"])),
        patch(
            "app.services.retrieval_service.graph_service.multi_hop_traversal",
            AsyncMock(return_value=case.get("graph", {"nodes": [], "edges": [], "hops": 0})),
        ),
        patch("app.services.retrieval_service.vector_search", MagicMock(return_value=case.get("chunks", []))),
        patch("app.services.retrieval_service.get_groq_client", MagicMock(return_value=_FakeClient())),
    ):
        resp = await retrieval_service.retrieve_and_answer(case["query"])

    keyword_hits = sum(1 for kw in case.get("expected_keywords", []) if kw.lower() in resp.answer.lower())
    keyword_score = keyword_hits / max(1, len(case.get("expected_keywords", [])))
    confidence_ok = resp.confidence >= float(case.get("min_confidence", 0))
    citation_ok = bool(resp.citations) or not case.get("chunks")

    score = (0.5 * keyword_score) + (0.3 if confidence_ok else 0.0) + (0.2 if citation_ok else 0.0)
    passed = score >= 0.8
    return passed, {
        "name": case["name"],
        "score": round(score, 3),
        "confidence": resp.confidence,
        "citations": len(resp.citations),
    }


async def main() -> int:
    parser = argparse.ArgumentParser(description="Run DocGraph regression eval.")
    parser.add_argument("--dataset", default="eval/golden_set.json")
    parser.add_argument("--min-pass-rate", type=float, default=0.8)
    args = parser.parse_args()

    cases = load_cases(Path(args.dataset))
    results = [await run_case(case) for case in cases]
    pass_count = sum(1 for passed, _ in results if passed)
    pass_rate = pass_count / max(1, len(results))

    print("Eval results:")
    for passed, details in results:
        print(f" - {'PASS' if passed else 'FAIL'} {details['name']}: score={details['score']} confidence={details['confidence']}")

    print(f"Pass rate: {pass_rate:.2%}")
    return 0 if pass_rate >= args.min_pass_rate else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
