# Staging 배포 가이드

`infra/docker-compose.staging.yml`은 FastAPI 백엔드와 빌드된 React 정적 파일을 한 번에 기동하는 스테이징 구성을 제공합니다.

## 1. 사전 준비

1. 프론트엔드 빌드
   ```bash
   cd frontend
   npm install
   npm run build
   ```
2. 백엔드 환경 변수
   ```bash
   cp backend/env.staging.sample backend/.env.staging
   # OpenAI/Firebase/Origin 값 채우기
   ```
   - Docker 컨테이너 내부에서는 `KNOWLEDGE_PACK_PATH=/knowledge_base/309_knowledge_pack.json`를 사용합니다.
   - Firebase 서비스 계정은 `FIREBASE_CREDENTIALS_JSON` 필드에 직접 넣거나, 배포 환경에서 Secret Manager를 사용하세요.

## 2. 실행

```bash
cd infra
docker compose -f docker-compose.staging.yml up --build
```

- 프론트엔드는 `http://localhost:4173`
- 백엔드 API는 `http://localhost:8000/api`
- Nginx는 `/api/*` 요청을 FastAPI로 프록시하며, `/health`는 backend 헬스엔드포인트에 연결됩니다.

## 3. 점검 체크리스트

- [ ] `http://localhost:4173` 접속 시 Entry 화면이 노출되는지
- [ ] `docker compose logs`에 Firebase/LLM 오류가 없는지
- [ ] `curl http://localhost:8000/health` 호출 결과가 `200 OK`인지
- [ ] 관리자 대시보드가 Firebase 로그인 후 통계를 표시하는지

## 4. 종료

```bash
docker compose -f docker-compose.staging.yml down
```

필요 시 `-v` 옵션으로 볼륨을 정리합니다.

