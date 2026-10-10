"""The knowledge map's graph, the related-node guess in the start event, and the dashboard's notes status."""

from pathlib import Path

from app.core.config import settings
from app.services.knowledge_graph import build_graph, related_nodes

PROJECT_NOTE = """---
title: 디자인 시스템 회고
type: project
project: 페이히어 디자인 시스템
portfolio_pages: 6-11
tags: [디자인시스템, 운영 회고]
question: 디자인 시스템을 팀에 정착시킨 방법은?
---
리뷰 기준을 [[리뷰 루프]]로 운영했어요. 내부 수치는 공개하지 않아요.
"""


def test_public_graph_puts_309_at_the_center_with_projects_documents_and_topics():
    graph = build_graph().public()
    nodes = {node["id"]: node for node in graph["nodes"]}
    assert nodes["PROFILE"] == {"id": "PROFILE", "label": "309", "kind": "center"}
    assert nodes["P2"] == {
        "id": "P2",
        "label": "페이히어 디자인 시스템",
        "kind": "project",
        "meta": "2022–2023",
        "summary": "컴포넌트/토큰 재정의로 디자인 작업시간 3.5→1.3일, 개발 4→2.5일로 단축.",
        "pages": "7-11",
    }
    assert "pages" not in nodes["P1"]  # not in the portfolio PDF
    assert nodes["RESUME"]["kind"] == "doc" and nodes["T:디자인 시스템"]["kind"] == "topic"
    edges = {tuple(edge) for edge in graph["edges"]}
    assert ("T:디자인 시스템", "P2") in edges and ("PROFILE", "P2") in edges
    connected = {node_id for edge in edges for node_id in edge}
    assert set(nodes) == connected


def test_related_nodes_guess_topics_and_projects_from_the_question():
    assert related_nodes("디자인 시스템 구축 경험 알려줘") == ["T:디자인 시스템", "P2"]
    assert related_nodes("하나은행 프로젝트에서 한 일은?") == ["P3"]
    # Through topic_aliases.json, and the project whose impact line mentions priorities.
    assert related_nodes("우선순위가 충돌할 때 기준은?") == ["T:의사결정", "P6"]
    assert related_nodes("PM으로 일한 경험 알려줘") == ["T:PM", "P6", "P7"]
    assert related_nodes("채용 관점에서 강점은?") == []


def test_notes_join_the_map_with_their_links_tags_and_project(notes, client):
    notes("309-persona/디자인 시스템 회고.md", PROJECT_NOTE)
    notes("309-persona/리뷰 루프.md", "---\ntags: [협업]\n---\n매주 같은 화면을 보며 점검했어요.")

    res = client.get("/api/knowledge/graph")
    assert res.status_code == 200 and "max-age=300" in res.headers["cache-control"]
    assert "내부 수치" not in res.text and "매주 같은 화면" not in res.text  # titles only
    graph = res.json()
    nodes = {node["id"]: node for node in graph["nodes"]}
    note = nodes["N:디자인-시스템-회고"]
    assert note == {
        "id": "N:디자인-시스템-회고",
        "label": "디자인 시스템 회고",
        "kind": "note",
        "group": "project",
        "question": "디자인 시스템을 팀에 정착시킨 방법은?",
        "pages": "6-11",
    }
    edges = {tuple(edge) for edge in graph["edges"]}
    assert ("N:디자인-시스템-회고", "T:디자인 시스템") in edges  # tag merged with the pack topic
    assert ("N:디자인-시스템-회고", "T:운영 회고") in edges and nodes["T:운영 회고"]["kind"] == "topic"
    assert ("N:디자인-시스템-회고", "N:리뷰-루프") in edges
    assert ("N:디자인-시스템-회고", "P2") in edges  # project property matched by title
    assert ("N:리뷰-루프", "T:협업") in edges
    assert related_nodes("리뷰 루프는 어떻게 운영했어?")[0] == "N:리뷰-루프"


def test_dashboard_knowledge_status_and_reload(notes, client, admin):
    assert client.get("/api/dashboard/knowledge").status_code == 401

    notes("309-persona/리뷰 루프.md", "매주 같은 화면을 보며 점검했어요.")
    status = client.get("/api/dashboard/knowledge", headers=admin).json()
    assert status["source"] == "local" and status["error"] is None
    assert [(note["title"], note["included"]) for note in status["notes"]] == [("리뷰 루프", True)]
    assert status["prompt_chars"] > status["notes_chars"] > 0

    # A note synced after startup shows up after a reload, without restarting.
    (Path(settings.notes_dir) / "309-persona" / "새 노트.md").write_text("방금 동기화한 노트예요.", encoding="utf-8")
    assert len(client.get("/api/dashboard/knowledge", headers=admin).json()["notes"]) == 1
    reloaded = client.post("/api/dashboard/knowledge/reload", headers=admin).json()
    assert sorted(note["title"] for note in reloaded["notes"]) == ["리뷰 루프", "새 노트"]
