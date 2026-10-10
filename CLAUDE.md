# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트

309(성백곤)의 이력서·포트폴리오를 바탕으로 방문자(리크루터·면접관)의 질문에 309의 말투로 답하는 "AI 커피챗" 서비스. 프론트는 `309designlab.com` 메인 페이지로 운영된다. 문서·UI 문구는 한국어, 커밋 메시지는 영어 명령형 한 줄.

로드맵, 진행 현황, 알려진 버그 목록(B1~B12)은 `docs/upgrade-plan-2026-10.md`에 있다. 작업 전에 해당 Phase와 "남은 일"을 확인할 것.

## 명령

프론트 (`frontend/`)

```bash
npm ci
npm run dev        # Vite 8, http://localhost:5173
npm run lint       # ESLint 10 (flat config)
npm run build      # tsc -b && vite build — 타입체크는 이 명령으로 한다
npm run size       # 빌드 후 첫 화면 JS·CSS(gzip) 예산 검사, CI에서도 돈다
```

백엔드 (`backend/`)

```bash
uv sync                                   # uv.lock → .venv (Python 3.13, pytest·ruff 포함)
uv run uvicorn app.main:app --reload --port 8000

# 테스트·린트: Firebase·LLM 없이 돈다 (tests/conftest.py가 자격 증명을 비운다)
uv run pytest
uv run pytest tests/test_chat_stream.py -k failure   # 일부만
uv run ruff check .

# 답변 평가: 실제 LLM을 호출한다 (evals/README.md)
uv run python -m evals.run --pipeline both

# LLM 호출 없이 legacy 프롬프트·컨텍스트만 확인
uv run python scripts/persona_smoke.py --dry-run --question "디자인 시스템 경험 알려줘"

# Firestore 자격 증명이 필요한 스크립트는 backend/에서 PYTHONPATH=. 로 실행
PYTHONPATH=. uv run python scripts/usage_report.py --months 6
```

의존성은 `pyproject.toml` + `uv.lock`이 원본이다. 바꾼 뒤에는 `uv export --no-hashes --no-dev --format requirements-txt --quiet -o requirements.txt`로 `requirements.txt`를 다시 내보낸다(Render·Docker가 이 파일로 설치하고, CI가 어긋나면 실패한다. Dependabot PR은 `dependabot-requirements.yml`이 대신 내보낸다).

브라우저 E2E(가짜 LLM + 인메모리 Firestore로 화면을 실제로 조작)는 `qa/e2e/README.md`.

## 구조

### 질문 1건의 흐름

1. `frontend/src/pages/PersonaChatV2Page.tsx`(`/persona`)가 **첫 질문 때** `POST /api/visitors`로 세션을 만들고(첫 화면에서 고른 방문 목적 `visitor_purpose` 포함) 질문을 `POST /api/chat/stream`(SSE)으로 보낸다. 직전 답변 3개를 `history`로 함께 보낸다. 이벤트는 `start`(남은 질문 수, 질문 단어로 고른 기록 지도 노드 `related`) → `delta`… → `answer_end`(본문 끝, 이때부터 다음 질문 가능) → `done`(근거·후속 질문·`conversation_id`·남은 질문 수) 또는 `error`, 차단이면 `blocked` 하나. 백엔드에 스트림 경로가 없으면(404 "Not Found") 한 번 확인 후 `POST /api/chat`(JSON)으로 바꾼다. SSE 파서와 API 주소 결정(`resolveBaseUrl()`)은 `src/services/api.ts`.
2. `backend/app/api/routes/chat.py` → `services/chat_runner.py`: `prepare_turn()`이 방문자 조회 → 세션 한도·IP 한도(`core/rate_limiter.py`, 메모리) → `question_filter`(탈옥 정규식만 차단)를 처리하고, `run_turn()`이 `ANSWER_PIPELINE`에 따라 답을 만든다.
   - `direct`(`services/direct_pipeline.py`): `app/prompts/persona_direct.txt` + 지식베이스 전체(`knowledge_document.render_knowledge_block()`, 출처 id `PROFILE`·`P1..`·`RESUME`·`NOTES`·비공개 노트 `N:슬러그`) + 대화 이력 + 방문자 정보로 LLM을 **한 번** 스트리밍 호출한다. 모델은 답변 뒤에 `<<<META>>>`와 JSON(sources, follow_ups, topic)을 쓰고, `StreamParser`가 이 부분과 `<think>` 블록을 화면에서 숨긴다. 예비 모델(`OPENAI_FALLBACK_MODEL`)은 첫 글자가 나가기 전 실패에만 쓴다.
   - `legacy`(`services/llm_service.py`, 기본값): 지식팩 요약 + lexical 검색 + 키워드 rerank를 `system_prompt.txt`에 넣고 호출한 뒤 `answer_quality` 게이트로 최대 3회 재호출, 그래도 안 되면 `rag_fallback`의 고정 문단. 이력은 쓰지 않는다.
3. LLM 예외는 SSE `error` / JSON `503`으로 그대로 알리고, 그 질문은 한도에서 돌려준다(`release`). 가짜 답변으로 덮지 않는다. 화면은 "다시 시도" 버튼을 보여 준다.
4. 대화 로그(`conversations`)에 pipeline, model, latency_ms, first_token_ms, 토큰 수, sources, follow_ups, error(실패 코드)를 남기고, 방문자 피드백은 `POST /api/chat/feedback`이 같은 문서에 `feedback`으로 쓴다(자기 세션의 답변만).

### 기록 지도와 모션

- `GET /api/knowledge/graph`(`services/knowledge_graph.py`): 309(중심)·프로젝트·문서·주제(`allowed_topics`, 노트 태그)·노트를 점과 선으로. 제목과 연결만 나가고 노트 본문은 나가지 않는다. `related_nodes()`는 질문 단어(라벨·`topic_aliases.json`·노트 별칭/태그)로 고른 추측이고, 답의 실제 근거는 `done`의 sources다.
- 프론트 `pages/persona/map/`: `KnowledgeMapCanvas`(캔버스, 시드 고정 레이아웃, 그리기 루프는 React 밖)와 `MapOverlay`는 지연 로딩이다. 로고 옆 "309의 기록 지도" 버튼(`MapEntry`)과 입력창의 "기록 지도" 버튼으로 연다. 첫 화면에는 캔버스를 그리지 않는다(인사말·방문 목적·추천 질문이 첫 화면에 보이도록, e2e_map이 확인). 그래프 API가 없으면(404) 지도 버튼만 숨긴다.
- 상태 모션은 CSS(`index.css`의 `ai-glow`·`avatar-presence`·`ink-in`·`stream-caret`)와 `pages/persona/Presence.tsx`. 모든 움직임은 `prefers-reduced-motion`에서 멈추고, 시각 회귀 스크린샷은 그 설정으로 찍는다.

### 포트폴리오 뷰어·방문 목적·요약

- 포트폴리오 PDF는 쪽 이미지로 보여 준다: `frontend/public/portfolio/`의 `pNN`(뷰어 2000px)·`mNN`(카드 800px)·`tNN`(쪽 목록 240px) WebP. PDF를 바꾸면 `python3 frontend/scripts/render_portfolio_pages.py`(poppler·Pillow)로 다시 만들고, `pages/persona/portfolio/chapters.ts`의 `PORTFOLIO_PAGES`·`CHAPTERS`와 지식팩 `pages`를 맞춘다.
- 근거 → 쪽: 지식팩 프로젝트의 `pages`(`"7-11"`)와 노트 속성 `portfolio_pages`가 그래프 노드의 `pages`로 나간다. 쪽이 있는 근거는 칩·답변 아래 카드(`ProjectCards`, 최대 2장, 내용은 지식팩에서)·지도에서 `PortfolioViewer`를 그 쪽으로 연다. 그래프가 없으면(구버전 백엔드) 근거 칩은 PDF 링크로 돌아간다.
- 방문 목적(`pages/persona/purpose.ts`: hiring·colleague·designer·browsing)은 목적별 추천 질문, 프롬프트 방문자 줄의 "목적: …"(`visitor_service.purpose_label`), 대시보드 목적 카드에 쓰인다. 대화가 시작되면 고를 수 없다.
- `ChatSummary`는 오늘 대화(질문·답변·근거와 쪽)를 한 장으로 보여 주고 PDF 저장은 `window.print()`에 맡긴다. 인쇄 때 요약만 남기는 규칙은 `index.css`의 `@media print`(루트의 `summary-open`).
- 질문별 "남은 질문"은 `start` 이벤트 값이다. `done`의 `remaining`은 보낼 때의 세션 값이라, 본문이 끝난 뒤 바로 보낸 다음 질문까지 세어져 있을 수 있다. 완료 모달은 진행 중인 마지막 질문에서만 띄운다.

### 평가 (`backend/evals/`)

- `golden.jsonl` 44문항(범위 안·자료에 없는 사실·범위 밖·프롬프트 공격·개인정보·이력이 필요한 후속 질문)과 LLM 판정 없는 체크(`checks.py`: 근거 없는 숫자, 내부 문구 유출, 말투, 프로젝트 언급 등).
- `ANSWER_PIPELINE`을 `direct`로 바꾸거나 `persona_direct.txt`를 고치기 전후에 돌려 비교한다. 결과(`evals/results/`)는 gitignore.

### 지식베이스

- 폴더별 역할은 `knowledge_base/README.md`. 지식팩 JSON과 `309files/*.md`(사실만)를 런타임이 읽는다. legacy는 `309files`를 빈 줄 기준으로 쪼개 검색하고(`doc:파일명#번호`), direct는 전부 프롬프트에 넣는다. `instructions/`(지시문)와 `drafts/`(검토 전 초안)는 읽지 않는다.
- 지시문을 `309files/`에 넣지 말 것. 사실로 쓰여 답변에 새어 나온다. 전화번호 줄은 로딩 때 빠진다.
- 309는 프로덕트 매니저/디자이너다(2026 이력서, `309files/pdf/Product-resume.pdf`). 지식팩 요약·`resume.md`·두 프롬프트의 첫 줄이 이 방향으로 맞춰져 있다.
- `309files/pdf/`는 프론트가 GitHub raw 주소로 직접 링크하므로 경로를 바꾸지 않는다.
- `knowledge_base/topic_aliases.json`은 `question_filter`가 레포 기준 상대 경로로 읽는다.
- 로딩 함수가 `lru_cache`라 지식베이스 수정 후에는 서버를 재시작해야 반영된다.
- 비공개 옵시디언 노트(`services/obsidian_notes.py`, `docs/obsidian-notes.md`): 비공개 GitHub 저장소를 tarball로 받거나(`NOTES_GITHUB_*`) 로컬 폴더(`NOTES_DIR`)를 읽어 옵시디언 문법을 정리한 뒤 출처로 더한다. 디스크에 쓰지 않는다. 프롬프트·검색 조각·그래프 캐시는 노트 버전을 키로 써서, 대시보드의 "다시 불러오기"(`POST /api/dashboard/knowledge/reload`)만으로 바뀐다. 노트 원문·실제 노트 내용은 이 레포에 커밋하지 않는다(QA용 가짜 노트만 `qa/e2e/notes/`).

### 데이터·인증

- 백엔드만 Firebase Admin SDK로 Firestore에 쓴다: `visitors`(문서 ID = session_id, 방문 목적 `visitor_purpose`), `conversations`, `funnel_events`. 자격 증명(`FIREBASE_CREDENTIALS_PATH` 또는 `FIREBASE_CREDENTIALS_JSON`)이 없으면 쓰기는 경고만 남기고 넘어가고 방문자 세션은 메모리에 둔다 — 로컬 개발은 자격 증명 없이 가능.
- 프론트의 Firebase는 `/admin` 로그인(Auth)용이다. `GET /api/dashboard/stats|logs|sessions/{id}`가 ID 토큰을 검증하고 `ADMIN_ALLOWED_EMAILS`와 대조한다. 세션 조회는 복합 색인이 필요 없도록 `session_id` 같음 조건만 쓰고 정렬은 파이썬에서 한다.
- `funnel_events`의 `session_id`에는 채팅 세션이 아니라 탭별 방문 ID(`src/lib/visit.ts`)가 들어간다. 대시보드 퍼널과 리포트 스크립트(`funnel_report.py`, `funnel_winner_decision.py`)는 이 단위로 센다.

### 설정

- `backend/app/core/config.py`의 pydantic-settings가 **`backend/.env.local`** 을 읽는다(`.env` 아님). 샘플은 `backend/env.sample`.
- `ALLOWED_ORIGINS`, `ADMIN_ALLOWED_EMAILS`는 쉼표 구분과 JSON 배열 둘 다 받는다. `ADMIN_ALLOWED_EMAILS`가 비어 있으면 대시보드는 모두 403이다(fail-closed).
- `ANSWER_PIPELINE`(legacy|direct), `CHAT_HISTORY_TURNS`, `LLM_TEMPERATURE`, `LLM_MAX_OUTPUT_TOKENS`, `LLM_STREAM_USAGE`(스트림 토큰 사용량 요청, 지원 안 하는 서버면 false), `LLM_REASONING_EFFORT`(생각하는 모델의 reasoning_effort. 생각 토큰도 출력 한도에 들어가므로 켜면 출력 한도를 올린다. Gemini 연결 예시는 `docs/deployment.md`).
- `NOTES_GITHUB_REPO`·`NOTES_GITHUB_TOKEN`(그 저장소 Contents 읽기 전용)·`NOTES_GITHUB_REF`·`NOTES_SUBDIR`·`NOTES_DIR`·`NOTES_MAX_CHARS`(프롬프트에 넣는 노트 분량).
- 질문 한도는 백엔드 `MAX_SESSION_QUESTIONS`(기본 5)가 기준이고 응답의 `remaining`·`limit`을 프론트가 그대로 표시한다. 같은 IP는 `MAX_IP_QUESTIONS`/`MAX_IP_SESSIONS`(`IP_WINDOW_MINUTES`)로 막는다. 클라이언트 IP는 `X-Forwarded-For`의 오른쪽에서 `TRUSTED_PROXY_HOPS`번째 값이다(Render 1). 한도는 프로세스 메모리라 재배포 때 초기화되고 인스턴스끼리 공유되지 않는다.

### 프론트

- Tailwind 4: 설정 파일 없이 `src/index.css`의 `@theme`에 토큰을 둔다(`ink` #0F1324, `graphite` #14151A, `accent` #0B98FF, `mist*`, `line`, `placeholder`, 관리자용 `brand-*`). 새 색은 토큰으로 추가한다.
- 폰트는 `pretendard` 패키지의 dynamic-subset CSS다(쓰인 글자 조각만 받는다).
- 청크: `vite.config.ts`의 `codeSplitting.groups`가 React 코어만 고정 청크로 뺀다. 마크다운 렌더러, 기록 지도 캔버스·오버레이, 포트폴리오 뷰어·대화 요약, `/admin`(Firebase)은 지연 로딩이라 첫 화면에 들어가면 안 된다 — `npm run size`가 잡는다.
- 경로 별칭 `@assets`는 `vite.config.ts`와 `tsconfig.app.json` 양쪽에 정의돼 있다.

## 배포

- 프론트: Vercel이 루트 `vercel.json`으로 `frontend/`를 빌드한다(Node 24.x, 출력 `frontend/dist`). `main` 푸시 시 운영 배포, 다른 브랜치는 프리뷰. 포트폴리오 쪽 이미지(`/portfolio/`)는 하루 캐시.
- 백엔드: Render(`https://three09persona.onrender.com/api`). `backend/Dockerfile`(Python 3.13, 비루트 사용자, `PORT` 환경 변수 사용)은 레포 루트를 컨텍스트로 빌드하며 지식베이스를 `/knowledge_base`에 복사한다(`KNOWLEDGE_PACK_PATH=/knowledge_base/309_knowledge_pack.json`). PDF·`drafts/`·`instructions/`는 루트 `.dockerignore`로 이미지에서 빠진다. CI가 이미지를 빌드해 `/health`와 지식베이스 로딩을 확인한다.
- 프론트와 백엔드는 따로 배포되므로 API를 바꿀 때 구버전 상대와도 동작하게 둔다(예: 스트림 404 → JSON 폴백, `/api/chat` 유지).
- 스테이징: `infra/docker-compose.staging.yml`(API + nginx로 `frontend/dist` 서빙). SSE는 응답의 `X-Accel-Buffering: no`로 nginx 버퍼링을 끈다.

## 주의

- 레포가 public이다. 서비스 계정 키·`.env*`뿐 아니라 방문자 질문·이름 같은 Firestore 데이터 export도 커밋하지 않는다(`reports/`, `backend/evals/results/`는 gitignore됨). 평가셋에 실제 질문을 넣을 때는 일반 질문으로 바꿔 넣는다.
- 라우트는 `/persona`(방문자)와 `/admin`(지연 로딩, Firebase Auth)뿐이다. 방문자 경로에 Firebase를 import하지 말 것.
- `docs/archive/`는 이전 개발 기록이다. 앱이 읽지 않으며 프롬프트에 연결하지 않는다.
- 답변 품질 문제를 키워드 리스트나 재시도 추가로 막지 않는다. 고칠 곳은 `persona_direct.txt`와 지식베이스이고, 효과는 `evals`로 확인한다. legacy 휴리스틱(`answer_quality`, `rag_fallback`, `answer_sanitize`, `context_planner`)은 direct가 평가에서 같거나 나으면 지운다.
