"""Vector retrieval helpers (pgvector + embeddings)."""

from __future__ import annotations

from typing import Dict, List

import psycopg
from openai import OpenAI

from ..core.config import settings


def _client() -> OpenAI:
    # Vector retrieval uses real embedding model (not ollama chat endpoint)
    if not settings.openai_api_key or settings.openai_api_key == "ollama":
        raise RuntimeError("OPENAI_API_KEY is required for vector retrieval")
    return OpenAI(api_key=settings.openai_api_key)


def retrieve_vector_chunks(query: str, top_k: int = 6) -> List[Dict[str, str]]:
    if not settings.database_url:
        return []

    emb = _client().embeddings.create(
        model=settings.rag_embedding_model,
        input=query,
    ).data[0].embedding
    emb_literal = "[" + ",".join(str(v) for v in emb) + "]"

    with psycopg.connect(settings.database_url) as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT c.chunk_id, c.doc_id, c.chunk_text, (e.embedding <=> %s::vector) AS distance
            FROM rag_chunk_embeddings e
            JOIN rag_chunks c ON c.chunk_id = e.chunk_id
            ORDER BY e.embedding <=> %s::vector
            LIMIT %s
            """,
            (emb_literal, emb_literal, max(1, top_k)),
        )
        rows = cur.fetchall()

    out: List[Dict[str, str]] = []
    for chunk_id, doc_id, chunk_text, distance in rows:
        score = 1.0 - float(distance)
        out.append(
            {
                "source": f"vector:{doc_id}:{chunk_id[:8]}",
                "score": f"{max(0.0, score):.3f}",
                "text": (chunk_text or "")[:700].strip(),
            }
        )
    return out
