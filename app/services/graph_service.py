from neo4j import AsyncGraphDatabase, AsyncDriver
from loguru import logger
from app.core.config import get_settings
from typing import Optional
import asyncio


settings = get_settings()


class GraphService:
    """Manages all Neo4j operations: write entities/relationships, run Cypher traversals."""

    _driver: Optional[AsyncDriver] = None

    async def connect(self):
        self._driver = AsyncGraphDatabase.driver(
            settings.neo4j_uri,
            auth=(settings.neo4j_user, settings.neo4j_password),
        )
        await self._driver.verify_connectivity()
        await self._ensure_indexes()
        logger.info("Neo4j connected")

    async def close(self):
        if self._driver:
            await self._driver.close()

    async def _ensure_indexes(self):
        async with self._driver.session() as session:
            await session.run(
                "CREATE INDEX entity_name IF NOT EXISTS FOR (e:Entity) ON (e.name)"
            )
            await session.run(
                "CREATE INDEX chunk_doc IF NOT EXISTS FOR (c:Chunk) ON (c.doc_id)"
            )

    # ── WRITE ──────────────────────────────────────────────────────────────

    async def upsert_document(self, doc_id: str, filename: str, chunk_count: int):
        async with self._driver.session() as session:
            await session.run(
                """
                MERGE (d:Document {id: $doc_id})
                SET d.filename = $filename,
                    d.chunk_count = $chunk_count,
                    d.created_at = timestamp()
                """,
                doc_id=doc_id,
                filename=filename,
                chunk_count=chunk_count,
            )

    async def upsert_chunk(self, chunk_id: str, doc_id: str, text: str, index: int):
        async with self._driver.session() as session:
            await session.run(
                """
                MERGE (c:Chunk {id: $chunk_id})
                SET c.doc_id = $doc_id,
                    c.text = $text,
                    c.index = $index
                WITH c
                MATCH (d:Document {id: $doc_id})
                MERGE (d)-[:HAS_CHUNK]->(c)
                """,
                chunk_id=chunk_id,
                doc_id=doc_id,
                text=text,
                index=index,
            )

    async def upsert_entity(
        self,
        name: str,
        entity_type: str,
        doc_id: str,
        chunk_id: str,
        description: str = "",
    ):
        async with self._driver.session() as session:
            await session.run(
                """
                MERGE (e:Entity {name: $name, type: $entity_type})
                SET e.description = $description
                WITH e
                MATCH (c:Chunk {id: $chunk_id})
                MERGE (c)-[:MENTIONS]->(e)
                WITH e
                MATCH (d:Document {id: $doc_id})
                MERGE (d)-[:CONTAINS_ENTITY]->(e)
                """,
                name=name,
                entity_type=entity_type,
                description=description,
                chunk_id=chunk_id,
                doc_id=doc_id,
            )

    async def upsert_relationship(
        self,
        source_name: str,
        target_name: str,
        rel_type: str,
        doc_id: str,
        context: str = "",
    ):
        # Sanitize relationship type for Cypher (only alphanumeric + underscore)
        safe_rel = "".join(c if c.isalnum() else "_" for c in rel_type.upper())
        async with self._driver.session() as session:
            await session.run(
                f"""
                MATCH (s:Entity {{name: $source}})
                MATCH (t:Entity {{name: $target}})
                MERGE (s)-[r:{safe_rel}]->(t)
                SET r.context = $context,
                    r.doc_id = $doc_id
                """,
                source=source_name,
                target=target_name,
                context=context,
                doc_id=doc_id,
            )

    async def clear_database(self):
        """Delete all nodes and relationships in the Neo4j database."""
        async with self._driver.session() as session:
            await session.run("MATCH (n) DETACH DELETE n")

    # ── READ ───────────────────────────────────────────────────────────────

    async def find_entities(self, names: list[str]) -> list[dict]:
        """Find entities by name list (case-insensitive partial match)."""
        async with self._driver.session() as session:
            result = await session.run(
                """
                UNWIND $names AS n
                MATCH (e:Entity)
                WHERE toLower(e.name) CONTAINS toLower(n)
                RETURN DISTINCT e.name AS name, e.type AS type, e.description AS description
                LIMIT 20
                """,
                names=names,
            )
            return [dict(r) async for r in result]

    async def multi_hop_traversal(
        self, entity_names: list[str], hops: int = 2
    ) -> dict:
        """
        Traverse the graph up to `hops` degrees from seed entities.
        Returns nodes and relationships forming the relevant subgraph.
        """
        async with self._driver.session() as session:
            result = await session.run(
                f"""
                UNWIND $names AS n
                MATCH (seed:Entity)
                WHERE toLower(seed.name) CONTAINS toLower(n)
                CALL apoc.path.subgraphAll(seed, {{
                    maxLevel: {hops},
                    relationshipFilter: '>',
                    labelFilter: 'Entity'
                }})
                YIELD nodes, relationships
                RETURN nodes, relationships
                LIMIT 1
                """,
                names=entity_names,
            )
            # APOC may not be installed; fall back to simple 2-hop Cypher
            records = [r async for r in result]
            if records:
                return await self._parse_subgraph(records[0])

        # Fallback: manual 2-hop without APOC
        return await self._manual_traversal(entity_names, hops)

    async def _manual_traversal(self, entity_names: list[str], hops: int) -> dict:
        depth_clause = "-[r1]->(b:Entity)-[r2]->(c:Entity)" if hops >= 2 else "-[r1]->(b:Entity)"
        async with self._driver.session() as session:
            result = await session.run(
                f"""
                UNWIND $names AS n
                MATCH (a:Entity)
                WHERE toLower(a.name) CONTAINS toLower(n)
                MATCH path = (a){depth_clause}
                RETURN
                    collect(DISTINCT {{name: a.name, type: a.type}}) AS a_nodes,
                    collect(DISTINCT {{name: b.name, type: b.type}}) AS b_nodes,
                    collect(DISTINCT {{src: a.name, tgt: b.name, rel: type(r1), ctx: r1.context}}) AS edges1
                LIMIT 50
                """,
                names=entity_names,
            )
            nodes, edges = [], []
            async for record in result:
                for node in record["a_nodes"] + record["b_nodes"]:
                    if node not in nodes:
                        nodes.append(node)
                edges.extend(record["edges1"])
            return {"nodes": nodes, "edges": edges, "hops": hops}

    async def _parse_subgraph(self, record) -> dict:
        nodes = [
            {"name": n["name"], "type": n.get("type", "Entity")}
            for n in record["nodes"]
        ]
        edges = [
            {
                "src": r.start_node["name"],
                "tgt": r.end_node["name"],
                "rel": r.type,
                "ctx": r.get("context", ""),
            }
            for r in record["relationships"]
        ]
        return {"nodes": nodes, "edges": edges, "hops": 2}

    async def health(self) -> str:
        try:
            async with self._driver.session() as session:
                await session.run("RETURN 1")
            return "ok"
        except Exception as e:
            return f"error: {e}"


graph_service = GraphService()
