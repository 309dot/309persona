# 309persona Funnel Baseline (2026-03-08)

## 현재 상태
- 퍼널 리포트 실행 성공 (인증 해결)
- 결과: **No funnel data found**

## Baseline
- `landing_view`: 0
- `input_focus`: 0
- `first_submit`: 0
- `first_answer_rendered`: 0

## 운영 기준 (데이터 유효성)
- 최소 분석 표본: `landing_view >= 100 sessions` (7일)
- winner 확정 조건:
  - first-message conversion +15%p 이상 개선 또는
  - 동일 전환율일 때 submit→answer completion 더 높은 variant 선택

## 다음 액션
1. 매일 자동 리마인드로 7일 리포트 재실행
2. 표본 도달 시 variant(on/off) winner 확정
3. winner 기준으로 다음 실험 2개 확정
