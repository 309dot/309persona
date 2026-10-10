# 309 Interview Agent - Frontend

Vite + React + TypeScript 기반의 309 Interview Agent 웹 UI입니다. 방문자 입장 → 질문/답변 → 관리자 대시보드 플로우를 제공합니다.

## 사전 준비

1. 의존성 설치
   ```bash
   cd frontend
   npm install
   ```
2. 환경 변수 설정 (`frontend/.env` 또는 `.env.local`)
   ```bash
   VITE_API_BASE_URL=http://localhost:8000/api
   VITE_FIREBASE_API_KEY=xxx
   VITE_FIREBASE_AUTH_DOMAIN=xxx.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=xxx
   VITE_FIREBASE_APP_ID=1:xxxx:web:xxxx
   ```
   - Firebase를 설정하지 않으면 대시보드 로그인 영역이 자동으로 비활성화됩니다.

## 개발 서버

```bash
npm run dev
```

- `/persona` (PersonaChatV2Page): 첫 질문 때 세션 발급(`POST /api/visitors`) 후 질문(`POST /api/chat`). 남은 질문 수는 백엔드 응답(`remaining`, `limit`)을 따른다
- `/admin` (DashboardPage, 지연 로딩): Firebase Auth 로그인 후 통계/로그 조회 (`GET /api/dashboard/*`)
- 그 밖의 경로는 `/persona`로 이동

## 프로덕션 빌드

```bash
npm run build
npm run preview
```

운영 배포는 Vercel이 루트 `vercel.json`으로 처리합니다. `VITE_API_BASE_URL`을 운영 API 주소로 설정하세요.

## 주요 폴더

- `src/pages`: Persona 채팅·Dashboard 페이지
- `src/lib/visit.ts`: 퍼널 이벤트용 탭별 방문 ID
- `src/services/api.ts`: FastAPI 백엔드와 통신
- `src/hooks/useAdminAuth.ts`: Firebase Auth 래퍼, 토큰을 백엔드에 전달

## 문제 해결

- API 호출 시 CORS 오류 → 백엔드 `.env.local`의 `ALLOWED_ORIGINS`에 프론트 도메인을 추가
- Firebase Auth 미설정 → `DashboardPage`가 "Firebase 설정이 필요" 메시지를 노출 (정상 동작)
- 빌드 시 환경 변수 누락 → `import.meta.env` 값이 `undefined`일 수 있으므로 `.env.local` 확인
- 대시보드 로그인 후 403 → 백엔드 `ADMIN_ALLOWED_EMAILS`에 로그인 이메일이 있는지 확인 (비어 있으면 모두 차단)
