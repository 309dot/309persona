# Firestore 컬렉션 설계

## visitors (session 스코프)

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `visitor_name` | string | 방문자 이름 혹은 이니셜 |
| `visitor_affiliation` | string | 회사/팀/직무 정보 |
| `visit_ref` | string | 초대 링크나 ref 태그 (예: 회사명) |
| `referrer` | string | HTTP Referrer (유입 사이트 URL) |
| `session_id` | string | 백엔드가 생성한 UUID, 문서 ID로도 사용 |
| `created_at` | timestamp | Firestore 서버 타임스탬프 |

- session_id를 문서 ID로 사용하면 조회가 단순해집니다.
- ref별 방문 현황을 계산하기 위해 `visit_ref`는 빈 문자열 대신 `direct`로 치환합니다.
- `referrer` 필드는 사용자가 어떤 사이트에서 유입되었는지 추적합니다. Dashboard에서 도메인별 통계로 표시됩니다.

## conversations

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `session_id` | string | visitors 문서와의 관계 |
| `visitor_id` | string | 방문자 문서 ID (동일하게 session_id) |
| `question` | string | 사용자가 입력한 질문 |
| `answer` | string | 답변 또는 차단 메시지. 답변에 실패했으면 빈 문자열 |
| `category` | string | legacy: question_filter 키워드 분류, direct: 모델이 고른 topic |
| `is_blocked` | boolean | 차단 여부(한도 초과, 탈옥 필터) |
| `pipeline` | string | `legacy` 또는 `direct` |
| `model` | string | 답한 모델(예비 모델로 바뀌었으면 그 이름) |
| `latency_ms` / `first_token_ms` | number | 전체 응답 시간 / 첫 글자까지 시간 |
| `prompt_tokens` / `completion_tokens` | number | 스트림이 사용량을 알려 준 경우만 |
| `sources` | array | 근거 출처 id(`PROFILE`, `P1`…, `RESUME`, `NOTES`) |
| `follow_ups` | array | 함께 제안한 후속 질문(direct) |
| `error` | string | 답변 실패 코드(`llm_unavailable`, `empty_answer`, `client_disconnected`). 실패한 질문은 방문자 한도에서 빠진다 |
| `feedback` / `feedback_at` | string / timestamp | 방문자 피드백 `up`·`down` (`POST /api/chat/feedback`) |
| `timestamp` | timestamp | Firestore 서버 타임스탬프 |

- 대시보드가 최근 질문, 카테고리 분포, 실패율, 응답 시간 p50, 피드백, 토큰 합계를 계산한다. 실패 기록(`error`)은 질문 수·카테고리에서 뺀다.
- 방문자별 대화 보기는 `session_id` 같음 조건으로만 조회하고 정렬은 서버에서 한다(복합 색인 불필요).

## funnel_events

백엔드 `POST /api/events/funnel`이 기록한다.

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `session_id` | string | 방문 ID(프론트가 탭마다 만드는 값). 서버 세션 ID와 다를 수 있다 |
| `event` | string | 퍼널 이벤트명 (`landing_view`, `chat_input_started`, `first_submit`, `first_answer_rendered`, `follow_up_clicked`, `answer_retried`, `answer_feedback` 등) |
| `variant` | string | 실험 분기값 (`on`/`off`), `properties.variant`를 최상위로 복사 |
| `properties` | map | 이벤트별 부가 정보 (최대 20개 키·2000자) |
| `timestamp` | timestamp | Firestore 서버 타임스탬프 |

- 7일 단위 리포트는 `backend/scripts/funnel_report.py`로 생성합니다.
- 예전 클라이언트 직접 기록 컬렉션 `personaFunnelEvents`는 더 이상 쓰지 않습니다.

## analytics (선택)

현재 버전은 실시간 계산으로 충분하므로 별도의 `analytics` 컬렉션을 사용하지 않습니다. 추후 대량 데이터가 쌓이면 Cloud Functions를 통해 ref/day/category별 집계를 `analytics/{stat}` 문서에 적재하는 방식을 고려합니다.


