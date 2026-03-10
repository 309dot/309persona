# Funnel Winner Decision (2026-03-10)

- 상태: 데이터 부족 (winner variant 확정 불가)
- 조치: 7일 퍼널 데이터 추가 수집 후 재실행

## 현재 판단
- winner 확정: 불가
- 사유: 유효 표본 수 부족(7일 기준 funnel event 데이터 없음)

## 다음 실험 2개 (업데이트)
1. 첫 질문 전환 개선 실험
   - 가설: 첫 입력 CTA를 더 구체화하면 `chat_input_started -> first_submit` 전환이 상승한다.
   - 변경안: 입력 placeholder/버튼 카피를 질문 유도형으로 A/B 테스트.
   - 성공 기준: first_submit_rate +10%p 이상.

2. 5문항 완주/제안 전환 실험
   - 가설: 5문항 완료 모달에서 제안 버튼 가시성/카피를 조정하면 `five_questions_reached -> proposal_email_sent` 전환이 상승한다.
   - 변경안: 완료 모달 CTA 위치/문구 2안 비교.
   - 성공 기준: proposal_email_sent_rate +5%p 이상.
