# Launch Checklist

마지막 점검을 위한 체크리스트입니다. 스테이징 검증 후 아래 항목을 모두 완료했는지 확인하세요.

## 1. 기능 & 품질
- [ ] `backend/scripts/persona_smoke.py`로 OpenAI 응답 품질 확인 (실제 키 사용)
- [ ] `qa/test-plan.md`의 필수 시나리오(방문, 차단, Rate Limit, 대시보드)를 재실행
- [ ] 브라우저/모바일 주요 해상도에서 UI 스냅샷 확인

## 2. 데이터 & 보안
- [ ] Firebase 콘솔에서 Firestore 규칙이 “백엔드 전용”으로 잠겨 있는지 확인
- [ ] `ADMIN_ALLOWED_EMAILS`가 운영 계정만 포함하도록 정리
- [ ] 지식베이스에 민감 정보(전화번호, 주민번호 등)가 없는지 재검토
- [ ] 질문/응답 로그 보관 기간 및 삭제 절차 문서화 (`docs/security-and-guardrails.md` 참고)

## 3. 모니터링
- [ ] Cloud Run/Railway 로그 수집 및 알람 채널(슬랙/메일) 연결
- [ ] Firebase Analytics 또는 GA4로 방문자 수/유입 경로 대시보드 구성
- [ ] OpenAI Usage 페이지에서 월별 한도 알림 설정

## 4. 배포 절차
- [ ] `frontend/.env`와 `backend/.env` 운영 값을 Secret Manager/Vercel Secrets에 업로드
- [ ] `infra/docker-compose.staging.yml`로 최종 스테이징 연습 배포 완료
- [ ] `docs/deployment.md`에 운영 도메인/CORS 값 업데이트

## 5. 커뮤니케이션
- [ ] `history_log/YYYY-MM-DD.md`에 릴리즈 결정과 변경 사항 기록
- [ ] 309용 온보딩 문서(사용법, 제한사항, 지원 채널)를 정리해 공유
- [ ] ref 링크 전략 및 초대 대상 리스트 검토

## 6. 운영 이후
- [ ] 지식베이스 업데이트 프로세스(리뷰 → 승인 → 배포) 정의
- [ ] 장애 대응 플레이북: OpenAI 오류, Firebase 장애, 프런트 배포 롤백 절차
- [ ] 월간 리포트 자동화(방문자 수, 인기 질문, 차단 비율) 계획 수립

체크리스트가 모두 완료되면 `launch-readiness` TODO를 완료하고 배포 승인 절차로 넘어갑니다.

