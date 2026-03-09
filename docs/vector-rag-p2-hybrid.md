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

## Enable hybrid mode
Set env:
```bash
RAG_MODE=hybrid
DATABASE_URL=postgresql://...
OPENAI_API_KEY=...
RAG_EMBEDDING_MODEL=text-embedding-3-small
RAG_VECTOR_WEIGHT=0.7
RAG_LEXICAL_WEIGHT=0.3
```

Then restart backend.
