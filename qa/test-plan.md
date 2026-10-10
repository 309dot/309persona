# QA 시나리오

## 1. 방문자 플로우
- [ ] `/persona` 첫 진입 시에는 세션이 만들어지지 않고, 첫 질문 때 `POST /api/visitors` 후 `POST /api/chat`이 호출되는지 확인
- [ ] 프로필 입력(이름/소속) 저장 시 세션이 있으면 `PATCH /api/visitors/{id}`가 호출되는지 확인
- [ ] 진입 직후 `landing_view`, 입력창 포커스 시 `chat_input_started` 퍼널 이벤트가 기록되는지 확인

## 2. 질문/답변
- [ ] 정상 질문 시 LLM 응답이 표시되고 카테고리 태그가 붙는지 확인
- [ ] 탈옥 키워드("규칙 무시", "system prompt") 입력 시 차단 메시지 출력 및 로그 저장 여부 (범위 밖 일반 질문 처리 정책은 Phase 3에서 재정의)
- [ ] 세션당 `MAX_SESSION_QUESTIONS`(기본 5)회를 넘기면 Rate Limiting 메시지가 나오고, 남은 질문 수 표시가 응답의 `remaining`과 일치하는지 확인
- [ ] 추천 질문 템플릿 클릭 → 입력창에 값이 반영되는지 확인
- [ ] 시스템 프롬프트/가드레일 노출 요구("system prompt", "시스템 메시지") 시 차단 메시지 출력
- [ ] 도메인 외 질문 시 `프로덕트/UX/경력 맥락으로 다시 질문` 안내 문구 노출
- [ ] 컨텍스트 블록에 Speaking Style, QA Templates, Guardrails 섹션이 포함되어 응답 품질에 반영되는지 확인

## 3. 대시보드 (관리자)
- [ ] Firebase Email/Password 로그인 성공/실패 시 메시지 확인
- [ ] 통계 카드(누적 방문자, 유입 경로, 인기 카테고리) 값 검증
- [ ] 최근 질문 목록에서 차단 여부 배지 표시
- [ ] 새로고침 버튼 클릭 시 최신 데이터로 업데이트

## 4. 보안/예외
- [ ] Authorization 헤더 없이 `/api/dashboard/*` 호출 시 401 반환
- [ ] 허용되지 않은 이메일로 로그인 후 API 요청 시 403 반환
- [ ] Knowledge base 파일이 없을 때 서버가 명확한 에러를 로그에 남기는지 확인
- [ ] Firebase 설정이 비어 있을 때 대시보드에서 안내 메시지를 출력하는지 확인

## 5. 성능/회복력
- [ ] OpenAI API 에러 시 사용자용 안내 메시지가 표시되고, 시스템 메시지가 채팅에 추가되는지 확인
- [ ] 브라우저 새로고침 후에도 대화 이력이 로컬 스토리지에서 복원되는지 확인

---

## 실행 로그 (2025-12-03)

| 시나리오 | 커맨드 | 결과 |
| --- | --- | --- |
| 헬스체크 | `curl http://127.0.0.1:8000/health` | `{"status":"ok"}` |
| 세션 생성 | `POST /api/visitors` | `session_id=a0f6...4356` 생성 |
| 금지 질문 차단 | `POST /api/chat` (오늘 날씨) | 차단 메시지 및 `blocked=true` |
| Rate Limit | 동일 세션으로 4회 연속 질문 | 4번째 요청에서 `세션당 허용된 질문 수 초과` 반환 |
| 관리자 보호 | `dashboard_smoke.py --id-token fake-token` | `401 Invalid token` |

- 모든 테스트는 `OPENAI_API_KEY=dummy` 환경에서 실행하여 guardrail과 세션 로직만 검증했습니다.
- 실제 답변 품질 검증은 `backend/scripts/persona_smoke.py`에 유효한 OpenAI 키를 주입해 수행하세요.
