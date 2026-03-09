#!/usr/bin/env python3
"""Build vector index rows from 309 knowledge pack + markdown docs.

Prerequisites:
- PostgreSQL with pgvector
- OPENAI_API_KEY set
- DATABASE_URL set (postgres://...)
"""

from __future__ import annotations

import hashlib
import os
import sys
from pathlib import Path

import psycopg
from dotenv import load_dotenv
from openai import OpenAI

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

load_dotenv(ROOT_DIR / ".env.local")

from app.services.knowledge_base import build_rag_chunks  # noqa: E402

EMBED_MODEL = os.getenv("RAG_EMBEDDING_MODEL", "nomic-embed-text")
EMBED_BASE_URL = os.getenv("RAG_EMBEDDING_BASE_URL", os.getenv("OPENAI_BASE_URL", "http://127.0.0.1:11434/v1"))
EMBED_API_KEY = os.getenv("RAG_EMBEDDING_API_KEY", os.getenv("OPENAI_API_KEY", "ollama") or "ollama")


def to_chunk_id(source: str, text: str) -> str:
    base = f"{source}::{text[:120]}".encode("utf-8", errors="ignore")
    return hashlib.sha1(base).hexdigest()  # nosec - id hash only


def chunk_doc_id(source: str) -> str:
    return source.split(":", 1)[0]


def source_type_from(source: str) -> str:
    if source.startswith("project:"):
        return "project"
    if source.startswith("pack:"):
        return "style"
    if source.startswith("extra:"):
        return "portfolio"
    return "misc"


def main() -> None:
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise RuntimeError("DATABASE_URL is required")

    client = OpenAI(api_key=EMBED_API_KEY, base_url=EMBED_BASE_URL)
    chunks = build_rag_chunks()

    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            for source, text in chunks:
                doc_id = chunk_doc_id(source)
                source_type = source_type_from(source)
                cur.execute(
                    """
                    INSERT INTO rag_documents (doc_id, source_type, title, version)
                    VALUES (%s, %s, %s, 'v1')
                    ON CONFLICT (doc_id)
                    DO UPDATE SET updated_at = NOW(), source_type = EXCLUDED.source_type
                    """,
                    (doc_id, source_type, doc_id),
                )

                chunk_id = to_chunk_id(source, text)
                token_count = max(1, len(text.split()))

                cur.execute(
                    """
                    INSERT INTO rag_chunks (chunk_id, doc_id, chunk_index, chunk_text, token_count, metadata_json)
                    VALUES (%s, %s, %s, %s, %s, %s::jsonb)
                    ON CONFLICT (chunk_id)
                    DO UPDATE SET chunk_text = EXCLUDED.chunk_text,
                                  token_count = EXCLUDED.token_count,
                                  updated_at = NOW()
                    """,
                    (chunk_id, doc_id, 0, text, token_count, "{}"),
                )

                emb = client.embeddings.create(model=EMBED_MODEL, input=text).data[0].embedding
                emb_literal = "[" + ",".join(str(v) for v in emb) + "]"

                cur.execute(
                    """
                    INSERT INTO rag_chunk_embeddings (chunk_id, embedding, embedding_model)
                    VALUES (%s, %s::vector, %s)
                    ON CONFLICT (chunk_id)
                    DO UPDATE SET embedding = EXCLUDED.embedding,
                                  embedding_model = EXCLUDED.embedding_model,
                                  embedded_at = NOW()
                    """,
                    (chunk_id, emb_literal, EMBED_MODEL),
                )

        conn.commit()

    print(f"indexed chunks: {len(chunks)}")


if __name__ == "__main__":
    main()
