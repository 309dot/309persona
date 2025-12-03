# 배포 가이드

## Backend (FastAPI)

1. Docker 이미지 빌드
   ```bash
   docker build -f backend/Dockerfile -t 309-agent-api .
   ```
2. Cloud Run / Railway 환경 변수
   - `OPENAI_API_KEY`
   - `FIREBASE_CREDENTIALS_JSON` 또는 `FIREBASE_CREDENTIALS_PATH`
   - `KNOWLEDGE_PACK_PATH=/knowledge_base/309_knowledge_pack.json` (Docker 기본 복사 경로)
   - `ADMIN_ALLOWED_EMAILS`, `ALLOWED_ORIGINS`
3. 실행 커맨드
   ```
   uvicorn app.main:app --host 0.0.0.0 --port 8080
   ```
4. 헬스체크
   - `/health` 엔드포인트가 `200 OK`를 반환해야 합니다.

## Frontend (Vercel/Netlify)

1. 환경 변수
   - `VITE_API_BASE_URL=https://<backend-domain>/api`
   - Firebase SDK 관련 `VITE_FIREBASE_*`
2. 빌드 명령
   ```
   npm install
   npm run build
   ```
3. 배포 산출물
   - `frontend/dist` 폴더 전체
4. CDN 캐싱
   - 정적 파일에 대해 gzip/브로틀리 압축을 활성화하면 초기 로딩 속도가 개선됩니다.

## 공통 체크리스트

- CORS에 실제 프론트 도메인을 추가
- Firebase Admin Allowlist에 운영 계정 추가
- OpenAI 모델/비용 모니터링 설정
- Secret Manager 또는 Vercel/Cloud Run Secrets로 민감 정보 관리

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


