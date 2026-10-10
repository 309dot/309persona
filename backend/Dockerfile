FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PORT=8080 \
    KNOWLEDGE_PACK_PATH=/knowledge_base/309_knowledge_pack.json

WORKDIR /app

# requirements.txt is exported from uv.lock (see backend/pyproject.toml).
COPY backend/requirements.txt ./requirements.txt
RUN pip install -r requirements.txt

COPY backend/app ./app
# Runtime reads the pack JSON, 309files/*.md and topic_aliases.json; PDFs, drafts and
# instructions are excluded by .dockerignore.
COPY knowledge_base /knowledge_base

RUN useradd --create-home --uid 10001 appuser
USER appuser

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:' + os.environ.get('PORT', '8080') + '/health', timeout=4)"

# Hosts like Render pass PORT; default to 8080 for local/staging.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
