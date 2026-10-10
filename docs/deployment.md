# 배포 가이드

## Backend (FastAPI)

운영은 Render(`https://three09persona.onrender.com`)에서 돈다.

1. Docker 이미지 빌드 (레포 루트에서)
   ```bash
   docker build -f backend/Dockerfile -t 309-agent-api .
   ```
2. 환경 변수 (Render 대시보드 → Environment)
   - `GEMINI_API_KEY` — Gemini, 1순위(아래 "LLM 연결")
   - `ANTHROPIC_API_KEY` 또는 `CLAUDE_API_KEY` — Claude, 예비(아래 "Claude 예비 연결"). 비우면 쓰지 않는다
   - 변수 이름은 대소문자를 가리지 않는다(`Gemini_api_key`, `claude_API_KEY`도 된다)
   - 선택: `OPENAI_BASE_URL`·`OPENAI_API_KEY`·`OPENAI_MODEL` — 그 밖의 OpenAI 호환 서버. `OPENAI_BASE_URL`을 넣지 않으면(기본값은 로컬 Ollama 주소) Gemini·Claude 키가 있을 때 건너뛴다
   - `FIREBASE_CREDENTIALS_JSON` 또는 `FIREBASE_CREDENTIALS_PATH`
   - `KNOWLEDGE_PACK_PATH=/knowledge_base/309_knowledge_pack.json` (Docker 기본 복사 경로)
   - `ALLOWED_ORIGINS` (쉼표 구분 또는 JSON 배열)
   - `ADMIN_ALLOWED_EMAILS` — **비어 있으면 대시보드 API가 모두 403**을 반환한다
   - `MAX_SESSION_QUESTIONS` (기본 5, 프론트 표시값도 이 값을 따른다)
   - `ANSWER_PIPELINE` — `legacy`(기본) 또는 `direct`. `direct`로 바꾸기 전에 `backend/evals`로 비교한다
   - `TRUSTED_PROXY_HOPS` — 앱 앞에서 `X-Forwarded-For`를 덧붙이는 프록시 수(Render 1). IP 한도가 이 값으로 클라이언트 IP를 고른다
   - 선택: `MAX_IP_QUESTIONS`(30)·`MAX_IP_SESSIONS`(20)·`IP_WINDOW_MINUTES`(60), `CHAT_HISTORY_TURNS`(3), `LLM_TEMPERATURE`(0.4), `LLM_MAX_OUTPUT_TOKENS`(1200), `LLM_STREAM_USAGE`(true, 스트림 토큰 사용량을 지원하지 않는 서버면 false), `LLM_REASONING_EFFORT`(비움), `LLM_TIMEOUT_SECONDS`(45), `LLM_MAX_RETRIES`(1), `ANSWER_TIME_BUDGET_SECONDS`(90), `ADMIN_REQUIRE_EMAIL_VERIFIED`(false)
   - 비공개 노트: `NOTES_GITHUB_REPO`, `NOTES_GITHUB_TOKEN`(그 저장소만 Contents 읽기 권한), `NOTES_GITHUB_REF`(main), `NOTES_SUBDIR`(309-persona), `NOTES_MAX_CHARS`(60000). 설정 방법은 `docs/obsidian-notes.md`. 노트는 서버가 시작할 때 받아 오고, 동기화한 뒤에는 대시보드의 "다시 불러오기"로 재배포 없이 반영한다
3. 실행
   - 이미지 기본 명령이 `uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}`이다. Render가 넣는 `PORT`를 그대로 쓰므로 Start Command를 따로 지정하지 않는다.
   - 이미지는 Python 3.13 slim, 비루트 사용자(uid 10001)로 돈다. 의존성은 `backend/requirements.txt`(uv.lock에서 내보낸 파일)로 설치한다.
   - Docker 없이 Render Python 런타임을 쓰는 경우: Root `backend`, Build `pip install -r requirements.txt`, Start `uvicorn app.main:app --host 0.0.0.0 --port $PORT`. Python은 3.13이어야 한다(`backend/.python-version` 또는 Render의 `PYTHON_VERSION` 환경 변수로 지정).
4. 헬스체크
   - `/health` 엔드포인트가 `200 OK`를 반환해야 한다. 이미지에 `HEALTHCHECK`가 들어 있고, CI(`docker` 잡)가 매 푸시마다 이미지를 빌드해 `/health`와 지식베이스 로딩을 확인한다.
5. 스트리밍
   - 답변은 `POST /api/chat/stream`(Server-Sent Events)으로 나간다. 응답에 `X-Accel-Buffering: no`가 붙고, 모델이 늦게 시작해도 15초마다 ping 주석을 보내 연결이 끊기지 않게 한다. 앞단 프록시가 응답을 모아서 보내면 글자 단위 표시가 안 되므로 버퍼링을 끈다.
   - `POST /api/chat`(JSON)도 그대로 둔다. 프론트·백엔드가 따로 배포되는 동안 구버전 프론트가 쓰고, 새 프론트도 스트림 경로가 없으면 이쪽으로 바꾼다.
   - LLM 오류는 이제 고정 문단 대신 오류로 돌아간다(SSE `error`, JSON `503`). LLM 연결이 안 된 상태로 배포하면 방문자에게 "지금은 답변을 가져오지 못했어요"가 보인다.

### LLM 연결 (Google Gemini)

모델 순서는 Gemini(`GEMINI_API_KEY`) → OpenAI 호환 서버(`OPENAI_BASE_URL`을 넣었을 때) → Claude(`ANTHROPIC_API_KEY` 또는 `CLAUDE_API_KEY`)다. 다음 모델로는 첫 글자가 나가기 전에 실패했을 때(하루 한도 초과 포함)만 넘어간다.

1. Google AI Studio(aistudio.google.com)에서 API 키를 만든다. 무료 등급에 들어가는 모델과 하루 요청 한도는 AI Studio의 rate limit 화면에서 확인한다.
2. Render 환경 변수에 `GEMINI_API_KEY=<AI Studio 키>`만 넣는다. 나머지는 기본값이 정해져 있다.
   - `GEMINI_MODEL`: 기본 `gemini-3.5-flash-lite`(2026-10 기준). 무료 등급은 최신 Flash의 하루 요청 수가 매우 적어(포럼 보고 하루 20회) legacy처럼 질문 하나에 여러 번 부르는 방식에서는 금방 바닥나므로, 한도가 넉넉한 Flash-Lite를 기본으로 둔다
   - `GEMINI_REASONING_EFFORT`: 기본 `low`. Gemini 3는 생각을 끌 수 없고 생각 토큰도 출력 한도에 들어가므로, 출력 한도는 4096 이상으로 보낸다
   - temperature는 보내지 않는다(Gemini 3 권장값인 기본 1.0). `stream_options`도 보내지 않는다(Gemini는 마지막 조각에 사용량을 붙여 준다)
   - AI Studio는 이제 `AQ.`로 시작하는 키를 주는데, 이 키가 Gemini API에서 401로 거절된다는 보고가 있다. 그러면 Claude가 대신 답하고, Render 로그에 `model gemini-… failed`가 남는다
   - 예전 방식(`OPENAI_BASE_URL`을 Gemini 주소로, `OPENAI_API_KEY`에 Gemini 키)도 그대로 동작한다
3. 바꾼 뒤 `backend/evals`로 legacy와 direct를 비교하고(`uv run python -m evals.run --pipeline both`), 같거나 나으면 `ANSWER_PIPELINE=direct`로 바꾼다.
4. 무료 등급은 질문·답변이 제공사의 서비스 개선에 쓰일 수 있다(방문자 화면의 개인정보 안내에 적어 둠). 비공개 노트도 모델로 전송되므로 공개하면 안 되는 내용은 노트에 넣지 않는다. 이 조건이 맞지 않으면 결제를 켠 유료 등급을 쓴다.

### Claude 예비 연결

Gemini(또는 다른 OpenAI 호환 모델)가 첫 글자를 쓰기 전에 실패하면 Claude가 대신 답한다. 공식 `anthropic` SDK로 부른다.

1. Render 환경 변수에 `ANTHROPIC_API_KEY`(또는 `CLAUDE_API_KEY`)=<Claude API 키>를 넣는다. Console(console.anthropic.com)의 API Keys에서 만든 키이고, 보통 `sk-ant-api03-`로 시작한다. Claude API는 Claude 구독과 따로 결제되므로 Console의 Billing에 크레딧이 있어야 한다. 모델은 기본값 `claude-haiku-5-5`, 추론 강도는 `ANTHROPIC_EFFORT=low`.
2. Gemini 키 없이 이 키만 넣으면 Claude만으로 답한다.
3. 어느 모델이 답했는지는 대시보드 대화 로그의 모델 값(`claude-haiku-5-5`)으로 본다. Claude가 자주 보이면 Gemini 쪽 키·한도를 확인한다.
4. 비용: Claude Haiku 5.5는 입력 100만 토큰당 $0.10, 출력 $0.50(2026-10 기준, 프롬프트 10만 토큰 이하). 지식베이스 시스템 프롬프트는 캐시되어 다시 읽을 때 입력 단가의 0.1배다. 질문 하나에 지식베이스(비공개 노트 포함) 크기에 따라 대략 $0.001~0.01이다.
5. 질문·직전 대화·방문자 이름과 소속이 Anthropic으로 전송된다(방문자 화면의 개인정보 안내는 "외부 AI 모델 서버"로 적혀 있어 그대로 맞다).

## Frontend (Vercel)

1. 환경 변수
   - `VITE_API_BASE_URL=https://<backend-domain>/api`
   - Firebase SDK 관련 `VITE_FIREBASE_*` (관리자 로그인용)
2. 빌드·배포
   - 루트 `vercel.json`이 `frontend/`를 빌드하고 `frontend/dist`를 배포한다(Node 24.x)
   - `main` 푸시 시 운영 배포, 다른 브랜치는 프리뷰 배포
3. 라우팅·헤더
   - SPA 경로는 `rewrites`로 `index.html`에 연결된다
   - `/assets/*`(해시 파일명)는 1년 immutable 캐시, 모든 경로에 `nosniff`·`Referrer-Policy`·`Permissions-Policy` 헤더

## 공통 체크리스트

- CORS에 실제 프론트 도메인을 추가
- Firebase Admin Allowlist에 운영 계정 추가
- OpenAI 모델/비용 모니터링 설정
- Secret Manager 또는 Vercel/Cloud Run Secrets로 민감 정보 관리

### CORS / 콘솔 에러 안정화 (2026-03)

- Backend env 권장값:
  - `ALLOWED_ORIGINS=https://www.309designlab.com,https://309designlab.com`
  - `ALLOWED_ORIGIN_REGEX=^https://([a-z0-9-]+\.)?309designlab\.com$|^http://(localhost|127\.0\.0\.1)(:\d+)?$`
- Frontend env 권장값:
  - `VITE_ENABLE_CLIENT_FIRESTORE_LOGGING=false`

검증 예시:
```bash
curl -i -X OPTIONS 'https://three09persona.onrender.com/api/visitors' \
  -H 'Origin: https://www.309designlab.com' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type'
```
- 기대 결과: `access-control-allow-origin`가 요청 Origin과 동일하게 반환

## Staging (Docker Compose)

1. `npm run build`로 `frontend/dist`를 준비합니다.
2. `cp backend/env.staging.sample backend/.env.staging` 후 값을 채웁니다.
3. 아래 커맨드로 API+웹을 동시에 구동합니다.
   ```bash
   cd infra
   docker compose -f docker-compose.staging.yml up --build
   ```
4. 브라우저에서 `http://localhost:4173`(웹)과 `http://localhost:8000/health`(API)를 확인합니다.
5. 종료 시 `docker compose -f docker-compose.staging.yml down`.


