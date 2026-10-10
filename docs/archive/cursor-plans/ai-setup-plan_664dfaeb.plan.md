---
name: ai-setup-plan
overview: 309 지식베이스 문서를 기반으로 인터뷰 에이전트의 프롬프트·컨텍스트·가드레일 구조를 실서비스 수준으로 정비합니다.
todos:
  - id: kb-update
    content: 309 knowledge pack 재정비 및 문서화
    status: completed
  - id: prompt-context
    content: 프롬프트·컨텍스트 주입 로직 개선
    status: completed
  - id: guardrail-qa
    content: 가드레일 연동 및 QA 스모크 테스트
    status: completed
---

# AI Persona Setup Tasks

## 1. 지식베이스 정리

- `knowledge_base/309files/persona_309.md`, `resume_context_for_ai.md`, `qa_base.md`, `guardrails.md`의 핵심 문단을 구조화해 `knowledge_base/309_knowledge_pack.json`의 `summary`, `collaboration_style`, `values`, `projects`, `speaking_style`, `allowed_topics` 필드를 최신화합니다.
- 필요 시 문서별 스니펫을 추가 필드(`qa_templates`, `guardrails`)로 확장하고, 업데이트 절차를 `docs/knowledge-pack.md`에 명시합니다.

## 2. 프롬프트 & 컨텍스트 주입 개선

- `backend/app/services/knowledge_base.py`의 `build_context_block()`을 확장해 새 필드(톤, 템플릿, 가드레일)를 정갈한 섹션으로 합칩니다.
- `backend/app/prompts/system_prompt.txt`를 `developer_prompt.md` 구조와 동일하게 정리해 역할·답변 방식·행동 원칙을 명시하고 `{knowledge_block}`가 자연스럽게 이어지도록 재구성합니다.

## 3. 가드레일 & 질문 필터 연동

- `backend/app/services/question_filter.py`에서 `allowed_topics`와 금지 패턴을 `guardrails.md` 기준으로 정비하고, 도메인 외 질문 대응 문구를 추가합니다.
- 필요 시 `backend/app/core/config.py`나 관련 스키마에 새 설정(예: `blocked_message`, `max_followups`)을 정의해 시스템 전체에서 일관되게 사용하도록 합니다.

## 4. 검증 & 운영 문서화

- `backend/scripts/persona_smoke.py`로 컨텍스트·프롬프트가 기대대로 주입되는지 확인하고, 대표 질문 시나리오를 `qa/test-plan.md`에 추가합니다.
- 최종 변경 사항을 `history_log/2025-12-06.md`(신규)로 기록하고, 필요 시 `docs/knowledge-pack.md`와 `plan/` 폴더에 작업 절차를 남깁니다.