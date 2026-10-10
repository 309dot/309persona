"""Public view of the knowledge base: the graph behind the visitor's knowledge map."""

from fastapi import APIRouter, Response

from ...services.knowledge_graph import build_graph
from .. import schemas

router = APIRouter()


@router.get("/graph", response_model=schemas.KnowledgeGraph, response_model_exclude_none=True)
def get_graph(response: Response):
    """Titles and links only; note text never leaves the server."""
    response.headers["Cache-Control"] = "public, max-age=300"
    return build_graph().public()
