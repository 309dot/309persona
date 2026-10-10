# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트

309(성백곤)의 이력서·포트폴리오를 바탕으로 방문자(리크루터·면접관)의 질문에 309의 말투로 답하는 "AI 커피챗" 서비스. 프론트는 `309designlab.com` 메인 페이지로 운영된다. 문서·UI 문구는 한국어, 커밋 메시지는 영어 명령형 한 줄.

현재 로드맵과 알려진 버그 목록(B1~B12)은 `docs/upgrade-plan-2026-10.md`에 있다. 작업 전에 해당 Phase를 확인할 것.

## 명령

프론트 (`frontend/`)

```bash
npm ci
npm run dev        # Vite, http://localhost:5173
npm run lint       # ESLint (flat config)
npm run build      # tsc -b && vite build — 타입체크는 이 명령으로 한다
```

백엔드 (`backend/`)

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --reload --port 8000

# 테스트: pytest 없이 단독 실행 스크립트. Firebase·LLM 없이 돈다
.venv/bin/python scripts/answer_quality_smoke_test.py
.venv/bin/python scripts/api_smoke_test.py
# 테스트 함수 하나만
.venv/bin/python -c "import scripts.answer_quality_smoke_test as t; t.test_quality_gate()"

# LLM 호출 없이 프롬프트·컨텍스트만 확인
.venv/bin/python scripts/persona_smoke.py --dry-run --question "디자인 시스템 경험 알려줘"

# Firestore 자격 증명이 필요한 스크립트는 backend/에서 PYTHONPATH=. 로 실행
PYTHONPATH=. .venv/bin/python scripts/usage_report.py --months 6
```

## 구조

### 질문 1건의 흐름

1. `frontend/src/pages/PersonaChatV2Page.tsx`(`/persona`, 실제 서비스 화면)가 마운트 시 `POST /api/visitors`로 세션을 만들고, 질문을 `POST /api/chat`으로 보낸다. API 주소는 `src/services/api.ts`의 `resolveBaseUrl()`이 `VITE_API_BASE_URL` → (로컬이면) `http://localhost:8000/api` → 같은 출처 `/api` 순으로 정한다.
2. `backend/app/api/routes/chat.py`: 방문자 조회 → 세션별 in-memory 슬라이딩 윈도우 한도(`core/rate_limiter.py`, `MAX_SESSION_QUESTIONS`) → `services/question_filter.py`(탈옥 정규식만 차단, 분류 못 하면 `general`로 허용) → `services/llm_service.generate_persona_answer()`.
3. `llm_service`: 지식팩 요약(최대 8000자) + lexical 검색(`knowledge_base.retrieve_relevant_chunks`) + 키워드 rerank(`rag_fallback.rerank_chunks`) + 검색 계획(`context_planner`)을 `app/prompts/system_prompt.txt`의 `{knowledge_block}`에 넣고 OpenAI 호환 API(기본 Ollama `qwen3:32b`)를 호출한다. 이후 `answer_quality`의 게이트에 걸리면 최대 3회 재호출하고, 그래도 안 되면 `rag_fallback.build_rag_fallback_answer()`의 고정 문단으로 대체한다.
4. 채팅 엔드포인트는 세션이 없을 때(404)를 빼면 예외가 나도 500 대신 대체 답변을 돌려준다. 그래서 LLM 장애가 응답 코드로 드러나지 않는다.

### 지식베이스

- 런타임은 `KNOWLEDGE_PACK_PATH`의 JSON과 **그 파일 옆 `309files/*.md`만** 읽는다(빈 줄 기준으로 쪼개 RAG 청크로 씀). 기본값 기준 `knowledge_base/309agent_knowledge_base/`는 쓰이지 않는다.
- `309files/`에는 지시문 문서(`developer_prompt.md`, `guardrails.md` 등)도 있어 그대로 색인된다. 사실과 지시문을 섞지 말 것.
- `knowledge_base/topic_aliases.json`은 `question_filter`가 레포 기준 상대 경로로 읽는다.
- 로딩 함수가 `lru_cache`라 지식베이스 수정 후에는 서버를 재시작해야 반영된다.

### 데이터·인증

- 백엔드만 Firebase Admin SDK로 Firestore에 쓴다: `visitors`(문서 ID = session_id), `conversations`, `funnel_events`. 자격 증명(`FIREBASE_CREDENTIALS_PATH` 또는 `FIREBASE_CREDENTIALS_JSON`)이 없으면 쓰기는 경고만 남기고 넘어가고 방문자 세션은 메모리에 둔다 — 로컬 개발은 자격 증명 없이 가능.
- 프론트의 Firebase는 `/admin` 로그인(Auth)용이다. 대시보드 데이터는 `GET /api/dashboard/*`가 ID 토큰을 검증하고 `ADMIN_ALLOWED_EMAILS`와 대조해 내려준다.
- `backend/scripts/funnel_report.py`, `funnel_winner_decision.py`는 `personaFunnelEvents`를 읽지만 서버는 `funnel_events`에 쓴다(계획서 B3).

### 설정

- `backend/app/core/config.py`의 pydantic-settings가 **`backend/.env.local`** 을 읽는다(`.env` 아님). 샘플은 `backend/env.sample`.
- `ALLOWED_ORIGINS`, `ADMIN_ALLOWED_EMAILS`는 쉼표 구분과 JSON 배열 둘 다 받는다(`NoDecode` + `split_list`). `ADMIN_ALLOWED_EMAILS`가 비어 있으면 대시보드는 모두 403이다(fail-closed).
- 질문 한도는 두 군데에 따로 있다: 프론트 `TOTAL_QUESTIONS`(5), 백엔드 `MAX_SESSION_QUESTIONS`(기본 3) (B2).
- 프론트 경로 별칭 `@assets`는 `frontend/vite.config.ts`와 `tsconfig.app.json` 양쪽에 정의돼 있다.

## 배포

- 프론트: Vercel이 루트 `vercel.json`으로 `frontend/`를 빌드한다(Node 24.x, 출력 `frontend/dist`). `main` 푸시 시 운영 배포, 다른 브랜치는 프리뷰.
- 백엔드: Render(`https://three09persona.onrender.com/api`). `backend/Dockerfile`은 레포 루트를 컨텍스트로 빌드하며 지식베이스를 `/knowledge_base`에 복사한다(`KNOWLEDGE_PACK_PATH=/knowledge_base/309_knowledge_pack.json`).
- 스테이징: `infra/docker-compose.staging.yml`(API + nginx로 `frontend/dist` 서빙).

## 주의

- 레포가 public이다. 서비스 계정 키·`.env*`뿐 아니라 방문자 질문·이름 같은 Firestore 데이터 export도 커밋하지 않는다(`reports/`는 gitignore됨).
- `/entry`, `/chat` 라우트와 `src/components/` 일부는 레거시다. 새 기능은 `/persona` 기준으로 작업한다.
- `docs/archive/`는 이전 개발 기록(Cursor 기획, Taskmaster 작업 목록, 일자별 로그, 개발 에이전트 메모리)이다. 앱이 읽지 않으며 프롬프트에 연결하지 않는다.
- 답변 품질 문제를 키워드 리스트나 재시도 추가로 막지 않는다. 휴리스틱 계층은 계획서 Phase 3에서 교체 대상이다.
