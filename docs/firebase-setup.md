# Firebase 연동 가이드

이 문서는 309 Interview Agent가 Firebase(Firestore + Auth + Storage)를 사용하는 방식을 설명합니다. 아래 순서를 따라 초기 설정을 완료하세요.

## 1. 프로젝트 및 서비스 계정

1. Firebase Console에서 새 프로젝트를 생성하거나 기존 프로젝트를 사용합니다.
2. **프로젝트 설정 → 서비스 계정**에서 `서비스 계정 키`를 생성하고 JSON 파일을 다운로드합니다.
3. **서비스 계정 키 파일 저장하기:**
   - 다운로드한 JSON 파일을 **프로젝트 루트 디렉토리**에 `serviceAccountKey.json`으로 저장합니다.
   - 예: `/309-persona/serviceAccountKey.json`
   - ⚠️ 이 파일은 `.gitignore`에 포함되어 있어 Git에 커밋되지 않습니다.
   
4. **백엔드 환경 변수 설정:**
   - `backend/env.sample` 파일을 복사하여 `backend/.env` 파일을 생성합니다.
   - `FIREBASE_CREDENTIALS_PATH=../serviceAccountKey.json` 설정이 이미 되어 있으므로 그대로 사용하면 됩니다.
   - 다른 필수 환경 변수들(OPENAI_API_KEY, ADMIN_ALLOWED_EMAILS 등)도 설정해주세요.

**대안: 환경 변수로 직접 설정하기 (선택사항)**
- JSON 파일 대신 환경 변수로 설정하려면 `FIREBASE_CREDENTIALS_JSON`에 JSON 내용을 직접 넣을 수 있습니다.
- 이 경우 `FIREBASE_CREDENTIALS_PATH`는 주석 처리하거나 제거하세요.

## 2. Firestore 구조

- **visitors** (문서 ID = `session_id`)
  - `visitor_name`, `visitor_affiliation`, `visit_ref`, `session_id`, `created_at`
- **conversations**
  - `session_id`, `visitor_id`, `question`, `answer`, `category`, `is_blocked`, `timestamp`

필요 시 Firestore 규칙을 아래처럼 설정해 읽기/쓰기를 제한할 수 있습니다.

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false; // 백엔드만 접근
    }
  }
}
```

## 3. Firebase Auth (관리자 전용)

1. Email/Password Provider를 활성화합니다.
2. 관리자 계정을 생성한 뒤, 해당 이메일을 `ADMIN_ALLOWED_EMAILS` 환경 변수에 추가합니다.
3. Frontend의 `frontend/env.sample`을 참고해 Firebase 웹 SDK 환경변수를 `.env`에 입력합니다.

### 3-1. 관리자 토큰 발급 & 대시보드 확인

1. Firebase REST API로 ID Token 발급
   ```bash
   curl 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=VITE_FIREBASE_API_KEY' \
     -H 'Content-Type: application/json' \
     -d '{"email":"admin@example.com","password":"<PASSWORD>","returnSecureToken":true}'
   ```
   - 응답의 `idToken` 값을 복사합니다.
2. Dashboard API 스모크 테스트
   ```bash
   python3 backend/scripts/dashboard_smoke.py \
     --base-url http://127.0.0.1:8000/api \
     --id-token "<ID_TOKEN>" \
     --limit 5
   ```
   - 정상이라면 통계 JSON과 최근 질문 목록이 출력됩니다.
   - 토큰 검증 실패 시 `401`이 반환되며, allowlist에 이메일이 포함되어 있는지 확인하세요.

## 4. Storage (선택)

지식베이스 문서를 Storage에 보관할 경우, 백엔드에서 Signed URL을 생성하거나 Cloud Storage SDK를 사용할 수 있습니다. 현재 버전은 로컬 JSON 파일을 사용하므로 선택 사항입니다.

## 5. 보안 팁

- 서비스 계정 키는 절대 Git에 커밋하지 말고, Secret Manager 혹은 CI/CD 시크릿 스토어에 보관하세요.
- 관리자 API 접근 시 Firebase ID Token을 헤더(`Authorization: Bearer <token>`)로 전달해야 하며, 백엔드는 토큰을 검증 후 allowlist를 확인합니다.
- `ADMIN_ALLOWED_EMAILS`를 비워두면 누구나 토큰으로 접근 가능하니 운영 환경에서는 반드시 설정하세요.

