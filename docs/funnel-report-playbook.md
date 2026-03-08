# 309persona Funnel Report Playbook (7일)

## 목표
방문은 있지만 첫 질문 제출이 낮은 문제를 수치로 확인하고, 실험 우선순위를 확정한다.

## 수집 이벤트
- `landing_view`
- `chat_view`
- `input_focus`
- `quick_question_clicked`
- `first_submit`
- `first_answer_rendered`

## 핵심 지표
1. First-message conversion = `first_submit / landing_view`
2. Submit→Answer completion = `first_answer_rendered / first_submit`
3. Landing→Input focus = `input_focus / landing_view`
4. Quick CTA 활용도 = `quick_question_clicked / landing_view`

## 목표값 (1차)
- First-message conversion: **+20%p** (baseline 대비)
- Submit→Answer completion: **90%+**
- Landing→Input focus: **60%+**

## 실행
```bash
cd backend
python3 scripts/funnel_report.py --days 7
```

## 해석 가이드
- `landing` 대비 `input_focus`가 낮으면: 히어로 카피/CTA 문제
- `input_focus` 대비 `first_submit`이 낮으면: 입력 마찰/질문 예시 부족
- `first_submit` 대비 `first_answer`가 낮으면: 응답 지연/실패 문제

## 다음 액션 템플릿
- 유지: 성과가 높은 variant(on/off)
- 개선: 가장 낮은 구간(예: focus→submit)만 집중
- 보류: 영향 낮은 실험은 제거
