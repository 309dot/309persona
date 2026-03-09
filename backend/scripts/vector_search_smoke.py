#!/usr/bin/env python3
"""Quick smoke test for vector retrieval."""

from __future__ import annotations

import os
from pathlib import Path

import psycopg
from dotenv import load_dotenv
from openai import OpenAI

ROOT_DIR = Path(__file__).resolve().parents[1]
load_dotenv(ROOT_DIR / ".env.local")

EMBED_MODEL = os.getenv("RAG_EMBEDDING_MODEL", "text-embedding-3-small")


def main() -> None:
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise RuntimeError("DATABASE_URL is required")

    query = os.getenv("RAG_SMOKE_QUERY", "309가 최근 프로젝트에서 문제를 정의한 방식")
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    emb = client.embeddings.create(model=EMBED_MODEL, input=query).data[0].embedding
    emb_literal = "[" + ",".join(str(v) for v in emb) + "]"

    with psycopg.connect(db_url) as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT c.chunk_id, c.doc_id, LEFT(c.chunk_text, 180) AS preview,
                   (e.embedding <=> %s::vector) AS distance
            FROM rag_chunk_embeddings e
            JOIN rag_chunks c ON c.chunk_id = e.chunk_id
            ORDER BY e.embedding <=> %s::vector
            LIMIT 5
            """,
            (emb_literal, emb_literal),
        )
        rows = cur.fetchall()

    print(f"query: {query}")
    for idx, row in enumerate(rows, start=1):
        print(f"{idx}. chunk={row[0]} doc={row[1]} dist={row[3]:.4f}")
        print(f"   {row[2]}")


if __name__ == "__main__":
    main()
