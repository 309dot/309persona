# 309 Interview Agent

이 프로젝트는 리크루터와 면접관이 면접 전에 `309`의 경력, 사고방식, 협업 철학을 미리 이해할 수 있도록 돕는 AI 인터뷰 에이전트입니다. 방문자는 이름과 소속을 남기고 질문을 입력하면, FastAPI 백엔드가 309 지식베이스와 OpenAI GPT API를 활용해 309의 페르소나에 맞춰 답변합니다. 모든 질문/응답 로그는 Firebase Firestore에 저장되며, 309 전용 대시보드에서 방문 추이와 관심 주제를 분석할 수 있습니다.

## 기술 스택

- **Frontend**: React 19 + Vite + TypeScript + Tailwind CSS, React Router
- **Backend**: FastAPI, Python 3.11+, Firebase Admin SDK, OpenAI SDK
- **Database / Auth**: Firebase (Firestore, Auth, Storage)
- **Infra**: Docker (권장), Vercel / Netlify (Frontend), Cloud Run / Railway (Backend)

## 디렉터리 구조

```
frontend/        # React 웹앱
backend/         # FastAPI 서버
knowledge_base/  # 309 지식베이스 JSON/문서
docs/            # 설계 및 운영 문서
qa/              # QA 시나리오 및 자동화 스크립트
history_log/     # 일자별 변경 이력
plan/            # 상위 기획 문서
```

## 로컬 환경 구성

### 사전 준비

1. Node.js 20+, npm 10+
2. Python 3.11+
3. Firebase 프로젝트 및 서비스 계정 키 (`serviceAccountKey.json`)
4. OpenAI API Key

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp env.sample .env  # 환경 변수 설정
uvicorn app.main:app --reload
```

필수 환경 변수:

```
OPENAI_API_KEY=sk-...
FIREBASE_CREDENTIALS_PATH=../serviceAccountKey.json
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
MAX_SESSION_QUESTIONS=3
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

`env.sample`을 `.env`로 복사한 뒤, 백엔드 API URL 및 Firebase 설정을 입력합니다.

## 배포

- Backend: Docker 이미지 빌드 후 Cloud Run/Railway에 배포, 환경 변수는 Secret Manager로 관리
- Frontend: `npm run build` 후 Vercel/Netlify에 업로드

## QA & 문서

- `docs/` 폴더에 시스템 다이어그램, API 명세, 페르소나 정의 문서를 정리합니다.
- `qa/` 폴더에는 기능/교란 방지 테스트 케이스 및 자동화 스크립트를 추가합니다.
- 모든 변경 사항은 `history_log/YYYY-MM-DD.md` 파일에 기록합니다.


