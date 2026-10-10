# 배포 가이드

## Backend (FastAPI)

운영은 Render(`https://three09persona.onrender.com`)에서 돈다.

1. Docker 이미지 빌드 (레포 루트에서)
   ```bash
   docker build -f backend/Dockerfile -t 309-agent-api .
   ```
2. 환경 변수 (Render 대시보드 → Environment)
   - `OPENAI_BASE_URL`, `OPENAI_MODEL`, `OPENAI_API_KEY` — OpenAI 호환 LLM 엔드포인트
   - `FIREBASE_CREDENTIALS_JSON` 또는 `FIREBASE_CREDENTIALS_PATH`
   - `KNOWLEDGE_PACK_PATH=/knowledge_base/309_knowledge_pack.json` (Docker 기본 복사 경로)
   - `ALLOWED_ORIGINS` (쉼표 구분 또는 JSON 배열)
   - `ADMIN_ALLOWED_EMAILS` — **비어 있으면 대시보드 API가 모두 403**을 반환한다
   - `MAX_SESSION_QUESTIONS` (기본 5, 프론트 표시값도 이 값을 따른다)
   - 선택: `LLM_TIMEOUT_SECONDS`(45), `LLM_MAX_RETRIES`(1), `ANSWER_TIME_BUDGET_SECONDS`(90), `ADMIN_REQUIRE_EMAIL_VERIFIED`(false)
3. 실행 커맨드
   ```
   uvicorn app.main:app --host 0.0.0.0 --port 8080
   ```
4. 헬스체크
   - `/health` 엔드포인트가 `200 OK`를 반환해야 합니다.

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


