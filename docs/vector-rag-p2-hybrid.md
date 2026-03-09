# Vector RAG P2 (Hybrid Retrieval) Notes

## What changed
- Added `rag_mode` switch (`lexical` | `hybrid`)
- Added weighted fusion params:
  - `rag_vector_weight` (default 0.7)
  - `rag_lexical_weight` (default 0.3)
- Added `database_url`, `rag_embedding_model`
- Added new service: `app/services/vector_retrieval.py`
- Updated `retrieve_relevant_chunks()` to support hybrid merge with safe fallback

## Safe behavior
- If `rag_mode=hybrid` but vector query fails (missing DB/key, etc), system falls back to lexical retrieval automatically.

## Enable hybrid mode (local embedding)
Set env:
```bash
RAG_MODE=hybrid
DATABASE_URL=postgresql://...
RAG_EMBEDDING_MODEL=nomic-embed-text
RAG_EMBEDDING_BASE_URL=http://127.0.0.1:11434/v1
RAG_EMBEDDING_API_KEY=ollama
RAG_VECTOR_WEIGHT=0.7
RAG_LEXICAL_WEIGHT=0.3
```

Then restart backend.
