# 309 Interview Agent 개발 계획

## 프로젝트 구조

```
309-persona/
├── frontend/                 # React 앱
│   ├── src/
│   │   ├── components/       # UI 컴포넌트
│   │   ├── pages/            # 페이지 (입장, 질문, 대시보드)
│   │   ├── hooks/            # 커스텀 훅
│   │   ├── services/         # API 호출
│   │   └── styles/           # 스타일
│   └── package.json
├── backend/                  # FastAPI 서버
│   ├── app/
│   │   ├── api/              # API 라우터
│   │   ├── core/             # 설정, 보안
│   │   ├── services/         # 비즈니스 로직
│   │   └── prompts/          # LLM 프롬프트
│   └── requirements.txt
├── knowledge_base/           # 309 지식베이스 (이력서, 포폴 등)
├── docs/                     # 문서
├── qa/                       # QA 테스트
└── history_log/              # 변경 이력
```

---

## Phase 1: 프로젝트 초기 설정

### 1-1. 프로젝트 기본 구조 생성

- 폴더 구조 생성 (frontend, backend, docs, qa, history_log)
- Git 초기화 및 .gitignore 설정

### 1-2. Backend 초기 설정

- FastAPI 프로젝트 생성
- requirements.txt (fastapi, uvicorn, firebase-admin, openai, python-dotenv)
- CORS 및 기본 설정

### 1-3. Frontend 초기 설정

- React + TypeScript + Vite 프로젝트 생성
- Tailwind CSS 설정
- 기본 라우팅 설정 (React Router)

### 1-4. Firebase 설정

- Firebase 프로젝트 연동 설정 파일
- Firestore 컬렉션 구조 설계

---

## Phase 2: 데이터 모델 및 지식베이스

### 2-1. Firestore 컬렉션 설계

```
visitors/              # 방문자 정보
  - visitor_name
  - visitor_affiliation
  - visit_ref
  - created_at
  - session_id

conversations/         # 대화 기록
  - visitor_id
  - question
  - answer
  - timestamp
  - is_blocked (교란 시도 여부)

analytics/             # 분석 데이터
  - ref_stats
  - question_categories
  - daily_visits
```

### 2-2. 309 지식베이스 구조

- 이력서 요약 텍스트
- 프로젝트 히스토리
- 협업 스타일/철학
- 페르소나 정의 (말투, 가치관)

---

## Phase 3: Backend 핵심 기능

### 3-1. LLM 서비스 구현

- OpenAI API 연동
- 309 페르소나 시스템 프롬프트 설계
- 지식베이스 컨텍스트 주입

### 3-2. 질문 필터링 로직

- 키워드 기반 전처리 필터
- 금지 패턴 탐지 ("규칙 무시", "ignore instructions" 등)
- 범위 벗어난 질문 자동 차단

### 3-3. API 엔드포인트

- `POST /api/visitors` - 방문자 등록
- `POST /api/chat` - 질문 & 응답
- `GET /api/dashboard/stats` - 대시보드 통계
- `GET /api/dashboard/logs` - 대화 로그

### 3-4. 보안 및 세션 관리

- 세션 기반 대화 관리
- 요청 속도 제한 (Rate Limiting)
- 관리자 인증 (Firebase Auth)

---

## Phase 4: Frontend 구현

### 4-1. 공통 컴포넌트

- Layout, Header, Button, Input 등
- 로딩/에러 상태 UI

### 4-2. 입장 화면

- 서비스 소개 텍스트
- 방문자 정보 입력 폼 (이름, 소속)
- ref 파라미터 처리

### 4-3. 질문 화면 (채팅 인터페이스)

- 추천 질문 카테고리 버튼
- 자유 질문 입력
- 채팅형 응답 UI
- 범위 이탈 시 안내 메시지

### 4-4. 관리자 대시보드

- Firebase Auth 로그인
- 방문자 통계 (일별, ref별)
- 질문 분석 (자주 묻는 질문)
- 대화 로그 조회

---

## Phase 5: 교란 방지 및 보안 강화

### 5-1. 다층 방어 체계

- Layer 1: 백엔드 전처리 필터
- Layer 2: 시스템 프롬프트 역할 고정
- Layer 3: 금지 키워드 필터
- Layer 4: 세션당 질문 수 제한

### 5-2. UX 기반 방어

- 질문 카테고리 UI로 범위 안내
- 서비스 목적 명확히 고지

---

## Phase 6: 테스트 및 배포

### 6-1. QA

- 기능 테스트 시나리오 작성
- 교란 시도 테스트
- API 통합 테스트

### 6-2. 배포 설정

- Backend: Docker + Cloud Run / Railway
- Frontend: Vercel / Netlify
- 환경변수 관리