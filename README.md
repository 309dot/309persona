# 309 Interview Agent

이 프로젝트는 리크루터와 면접관이 면접 전에 `309`의 경력, 사고방식, 협업 철학을 미리 이해할 수 있도록 돕는 AI 인터뷰 에이전트입니다. 방문자가 질문하면 FastAPI 백엔드가 309 지식베이스와 OpenAI 호환 LLM(기본: Ollama `qwen3:32b`)으로 309의 말투로 답하고, 답변을 글자 단위로 스트리밍합니다. 답변 아래에는 근거가 된 자료, 이어서 물어볼 만한 질문, 👍/👎 피드백이 붙습니다. 질문·답변 로그는 Firebase Firestore에 저장되며, 309 전용 대시보드(`/admin`)에서 방문 퍼널, 답변 실패율·응답 시간·피드백, 방문자별 대화를 볼 수 있습니다.

답변 방식은 두 가지이고 `ANSWER_PIPELINE`으로 고릅니다. `legacy`(기본)는 검색 + 품질 게이트 재호출, `direct`는 지식베이스 전체를 넣고 한 번에 스트리밍하며 대화 이력을 이어 받습니다. 바꾸기 전에 [`backend/evals`](backend/evals/README.md)로 두 방식을 비교합니다.

현재 고도화 로드맵은 [`docs/upgrade-plan-2026-10.md`](docs/upgrade-plan-2026-10.md)에 있습니다.

## 기술 스택

- **Frontend**: React 19 + Vite 8 + TypeScript 6 + Tailwind CSS 4, React Router 7 (Node 24, `.nvmrc`)
- **Backend**: FastAPI, Python 3.13 (uv), Firebase Admin SDK, OpenAI 호환 SDK
- **Database / Auth**: Firebase (Firestore, Auth)
- **배포**: Vercel (Frontend, `309designlab.com`), Render (Backend)

## 디렉터리 구조

```
frontend/        # React 웹앱 (/persona 채팅, /admin 대시보드)
backend/         # FastAPI 서버 (tests/: pytest, evals/: 답변 평가셋, scripts/: 리포트·운영 스크립트)
knowledge_base/  # 309 지식베이스 (폴더별 역할은 knowledge_base/README.md)
docs/            # 설계 및 운영 문서 (docs/archive: 이전 개발 기록)
qa/              # QA 시나리오, e2e/: 가짜 LLM으로 도는 브라우저 E2E
infra/           # 스테이징 compose, 로컬 Mac 실행 스크립트
```

## 로컬 환경 구성

### 사전 준비

1. Node.js 24 (`.nvmrc`), npm 10+
2. [uv](https://docs.astral.sh/uv/) — `backend/.python-version`의 Python 3.13을 알아서 받아 씁니다
3. OpenAI 호환 LLM 엔드포인트 (기본값은 로컬 Ollama `http://127.0.0.1:11434/v1`의 `qwen3:32b`)
4. (선택) Firebase 서비스 계정 키 — 없으면 Firestore 기록 없이 동작합니다

### Backend

```bash
cd backend
uv sync                   # uv.lock 기준으로 .venv 생성 (개발 도구 pytest·ruff 포함)
cp env.sample .env.local  # 백엔드는 .env.local을 읽습니다
uv run uvicorn app.main:app --reload --port 8000
```

주요 환경 변수 (`backend/env.sample` 참고):

```
OPENAI_BASE_URL=http://127.0.0.1:11434/v1
OPENAI_MODEL=qwen3:32b
OPENAI_API_KEY=ollama
FIREBASE_CREDENTIALS_PATH=../serviceAccountKey.json   # 선택
ALLOWED_ORIGINS=http://localhost:5173,https://309designlab.com   # 쉼표 구분 또는 JSON 배열
ADMIN_ALLOWED_EMAILS=me@example.com   # 비어 있으면 대시보드 접근이 모두 막힙니다
ANSWER_PIPELINE=legacy                # legacy | direct
MAX_SESSION_QUESTIONS=5               # 세션당 질문 수
MAX_IP_QUESTIONS=30                   # 같은 IP의 시간당 질문 수 (IP_WINDOW_MINUTES)
TRUSTED_PROXY_HOPS=1                  # X-Forwarded-For를 붙이는 프록시 수 (Render 1)
```

테스트·린트 (Firebase·LLM 없이 실행됩니다):

```bash
uv run pytest
uv run ruff check .
```

답변 평가 (실제 LLM을 호출합니다, [`backend/evals/README.md`](backend/evals/README.md)):

```bash
uv run python -m evals.run --pipeline both
```

의존성을 바꿀 때는 `uv add <패키지>` 후 `requirements.txt`를 다시 내보냅니다. Render와 Docker 이미지는 이 파일로 설치하고, CI가 `uv.lock`과 어긋나면 실패시킵니다.

```bash
uv export --no-hashes --no-dev --format requirements-txt --quiet -o requirements.txt
```

### Frontend

```bash
cd frontend
npm ci
cp env.sample .env.local  # VITE_API_BASE_URL, Firebase 웹 설정
npm run dev               # http://localhost:5173
npm run lint
npm run build             # 타입체크 + 빌드
npm run size              # 첫 화면 JS·CSS gzip 예산 검사 (빌드 후)
```

화면을 실제로 조작하는 E2E는 [`qa/e2e/README.md`](qa/e2e/README.md)를 참고하세요.

## 배포

- Frontend: `main`에 푸시하면 Vercel이 루트 `vercel.json`으로 `frontend/`를 빌드해 운영 배포합니다. 다른 브랜치는 프리뷰 배포입니다.
- Backend: Render(`https://three09persona.onrender.com`). 환경 변수는 Render 대시보드에서 관리합니다. 자세한 내용은 [`docs/deployment.md`](docs/deployment.md).
- CI: GitHub Actions(`.github/workflows/ci.yml`)가 푸시·PR마다 프론트 lint/build/번들 예산, 백엔드 ruff·pytest·`requirements.txt` 동기화 확인, Docker 이미지 빌드·헬스체크를 실행합니다.
- 의존성: Dependabot이 매주 월요일 프론트(npm)·백엔드(uv)·GitHub Actions 업데이트 PR을 묶어서 엽니다(`.github/dependabot.yml`).

## QA & 문서

- `docs/` 폴더에 설계·운영 문서를 정리합니다.
- `qa/` 폴더에는 기능/교란 방지 테스트 시나리오를 둡니다.
- 변경 이력은 git 커밋과 PR로 관리합니다. 이전 일자별 기록은 `docs/archive/history_log/`에 있습니다.
