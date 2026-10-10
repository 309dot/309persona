# 309 Interview Agent

이 프로젝트는 리크루터와 면접관이 면접 전에 `309`의 경력, 사고방식, 협업 철학을 미리 이해할 수 있도록 돕는 AI 인터뷰 에이전트입니다. 방문자가 질문을 입력하면 FastAPI 백엔드가 309 지식베이스 기반 **RAG 검색 컨텍스트**와 OpenAI 호환 LLM(기본: Ollama `qwen3:32b`)을 활용해 309의 페르소나에 맞춰 답변합니다. 모든 질문/응답 로그는 Firebase Firestore에 저장되며, 309 전용 대시보드(`/admin`)에서 방문 추이와 관심 주제를 분석할 수 있습니다.

현재 고도화 로드맵은 [`docs/upgrade-plan-2026-10.md`](docs/upgrade-plan-2026-10.md)에 있습니다.

## 기술 스택

- **Frontend**: React 19 + Vite + TypeScript + Tailwind CSS, React Router (Node 24, `.nvmrc`)
- **Backend**: FastAPI, Python 3.11, Firebase Admin SDK, OpenAI 호환 SDK
- **Database / Auth**: Firebase (Firestore, Auth)
- **배포**: Vercel (Frontend, `309designlab.com`), Render (Backend)

## 디렉터리 구조

```
frontend/        # React 웹앱 (/persona 채팅, /admin 대시보드)
backend/         # FastAPI 서버, scripts/에 스모크 테스트·리포트 스크립트
knowledge_base/  # 309 지식베이스 (폴더별 역할은 knowledge_base/README.md)
docs/            # 설계 및 운영 문서 (docs/archive: 이전 개발 기록)
qa/              # QA 시나리오
infra/           # 스테이징 compose, 로컬 Mac 실행 스크립트
```

## 로컬 환경 구성

### 사전 준비

1. Node.js 24 (`.nvmrc`), npm 10+
2. Python 3.11
3. OpenAI 호환 LLM 엔드포인트 (기본값은 로컬 Ollama `http://127.0.0.1:11434/v1`의 `qwen3:32b`)
4. (선택) Firebase 서비스 계정 키 — 없으면 Firestore 기록 없이 동작합니다

### Backend

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp env.sample .env.local  # 백엔드는 .env.local을 읽습니다
.venv/bin/uvicorn app.main:app --reload --port 8000
```

주요 환경 변수 (`backend/env.sample` 참고):

```
OPENAI_BASE_URL=http://127.0.0.1:11434/v1
OPENAI_MODEL=qwen3:32b
OPENAI_API_KEY=ollama
FIREBASE_CREDENTIALS_PATH=../serviceAccountKey.json   # 선택
ALLOWED_ORIGINS=http://localhost:5173,https://309designlab.com   # 쉼표 구분 또는 JSON 배열
ADMIN_ALLOWED_EMAILS=me@example.com   # 비어 있으면 대시보드 접근이 모두 막힙니다
MAX_SESSION_QUESTIONS=5
```

테스트 (Firebase·LLM 없이 실행됩니다):

```bash
.venv/bin/python scripts/answer_quality_smoke_test.py
.venv/bin/python scripts/api_smoke_test.py
```

### Frontend

```bash
cd frontend
npm ci
cp env.sample .env.local  # VITE_API_BASE_URL, Firebase 웹 설정
npm run dev               # http://localhost:5173
npm run lint
npm run build             # 타입체크 + 빌드
```

## 배포

- Frontend: `main`에 푸시하면 Vercel이 루트 `vercel.json`으로 `frontend/`를 빌드해 운영 배포합니다. 다른 브랜치는 프리뷰 배포입니다.
- Backend: Render(`https://three09persona.onrender.com`). 환경 변수는 Render 대시보드에서 관리합니다. 자세한 내용은 [`docs/deployment.md`](docs/deployment.md).
- CI: GitHub Actions(`.github/workflows/ci.yml`)가 푸시·PR마다 프론트 lint/build와 백엔드 스모크 테스트를 실행합니다.

## QA & 문서

- `docs/` 폴더에 설계·운영 문서를 정리합니다.
- `qa/` 폴더에는 기능/교란 방지 테스트 시나리오를 둡니다.
- 변경 이력은 git 커밋과 PR로 관리합니다. 이전 일자별 기록은 `docs/archive/history_log/`에 있습니다.
