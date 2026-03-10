# Topic Alias 로그 분석 (2026-03-10)

- 분석 범위: 최근 conversations 33건
- infer_topic 미매핑: 19건
- 제외 필요(가드레일): 탈옥 시도, 일반 GPT 전환 요청, 날씨 질문

## 상위 미매핑 표현(후보)
- 최근 프로젝트
- 문제를 정의하고 풀어낸 방식
- 경력 요약 / 이력 요약
- 자기소개
- 장점 / 강점

## 이번 반영
- `project_experience` alias 확장
  - 최근 프로젝트
  - 문제를 정의하고 풀어낸 방식
  - project summary
- `career_summary` topic 추가
  - 경력 요약, 경력을 요약, 이력 요약, 이력을 설명, 자기소개, 장점, 강점
  - career summary, background summary
- category 매핑 추가
  - `career_summary` -> `career`

## 다음 주기 운영안
- 매주 1회 최근 200~300건 질문 로그에서 미매핑 top phrase 추출
- 가드레일 위반/비업무 질문은 alias 추가에서 제외
- alias 추가 후 샘플 문장 10개 회귀테스트
