# 309persona Funnel Decision Report (2026-03-08)

## 상태
- 진행 상태: **Blocked (data access)**
- 원인: Firestore 인증 미설정으로 7일 퍼널 집계를 실행할 수 없음.

## 시도한 실행
```bash
cd backend
PYTHONPATH=. .venv/bin/python scripts/funnel_report.py --days 7
```

## 오류
- `RuntimeError: Firebase credentials are not configured. Set FIREBASE_CREDENTIALS_PATH or FIREBASE_CREDENTIALS_JSON.`

## 필요한 조치 (1개)
- 배포/운영에 사용 중인 Firebase 서비스 계정 설정 제공
  - `FIREBASE_CREDENTIALS_PATH=...` 또는
  - `FIREBASE_CREDENTIALS_JSON=...`

## 조치 후 즉시 수행할 작업
1. 7일 퍼널 리포트 재실행
2. variant(on/off) 비교로 winner 확정
3. 다음 실험 2개 확정 (focus→submit 개선 우선)

## 임시 판단(데이터 전)
- 현재는 question-first(on) 유지 권장 (최근 UI/CTA 개선과 일관)
- 단, 정식 확정은 데이터 확보 후 진행
