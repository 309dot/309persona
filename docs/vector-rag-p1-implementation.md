# Vector RAG P1 Implementation (309persona)

## Added
- `backend/scripts/sql/001_pgvector_schema.sql`
- `backend/scripts/vector_index_build.py`
- `backend/scripts/vector_search_smoke.py`
- `backend/requirements.txt` updated with `psycopg[binary]`

## 1) Prepare DB
```bash
export DATABASE_URL='postgresql://user:pass@host:5432/309persona'
psql "$DATABASE_URL" -f backend/scripts/sql/001_pgvector_schema.sql
```

## 2) Install deps
```bash
cd backend
pip install -r requirements.txt
```

## 3) Build embeddings index (local Ollama)
```bash
ollama pull nomic-embed-text
export RAG_EMBEDDING_MODEL=nomic-embed-text
export RAG_EMBEDDING_BASE_URL=http://127.0.0.1:11434/v1
export RAG_EMBEDDING_API_KEY=ollama
python backend/scripts/vector_index_build.py
```

## 4) Smoke test retrieval
```bash
export RAG_SMOKE_QUERY='309가 최근 프로젝트에서 문제를 정의하고 풀어낸 방식'
python backend/scripts/vector_search_smoke.py
```

## Notes
- Current embedding dim is fixed to `1536` (`text-embedding-3-small`).
- If embedding model changes, re-run full indexing.
- This is P1 foundation only; API retrieval path switch (hybrid + rerank) is P2 implementation.
