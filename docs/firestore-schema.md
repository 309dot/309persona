# Firestore 컬렉션 설계

## visitors (session 스코프)

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `visitor_name` | string | 방문자 이름 혹은 이니셜 |
| `visitor_affiliation` | string | 회사/팀/직무 정보 |
| `visit_ref` | string | 초대 링크나 ref 태그 (예: 회사명) |
| `session_id` | string | 백엔드가 생성한 UUID, 문서 ID로도 사용 |
| `created_at` | timestamp | Firestore 서버 타임스탬프 |

- session_id를 문서 ID로 사용하면 조회가 단순해집니다.
- ref별 방문 현황을 계산하기 위해 `visit_ref`는 빈 문자열 대신 `direct`로 치환합니다.

## conversations

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `session_id` | string | visitors 문서와의 관계 |
| `visitor_id` | string | 방문자 문서 ID (동일하게 session_id) |
| `question` | string | 사용자가 입력한 질문 |
| `answer` | string | LLM이 응답한 결과 또는 차단 메시지 |
| `category` | string | question_filter가 분류한 카테고리 |
| `is_blocked` | boolean | 차단 여부 |
| `timestamp` | timestamp | Firestore 서버 타임스탬프 |

- dashboard에서 최근 질문/카테고리 분포를 계산합니다.

## analytics (선택)

현재 버전은 실시간 계산으로 충분하므로 별도의 `analytics` 컬렉션을 사용하지 않습니다. 추후 대량 데이터가 쌓이면 Cloud Functions를 통해 ref/day/category별 집계를 `analytics/{stat}` 문서에 적재하는 방식을 고려합니다.


