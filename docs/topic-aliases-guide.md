# Topic Aliases 운영 가이드

질문 이해 실패율을 줄이기 위해 `knowledge_base/topic_aliases.json`을 운영합니다.

## 파일 위치
- `knowledge_base/topic_aliases.json`

## 구조
```json
{
  "design_system": ["디자인 시스템", "디자인 라이브러리", "component library"],
  "collaboration": ["협업", "조율", "stakeholder"]
}
```

## 운영 원칙
- 실제 사용자 질문 로그에서 반복 등장한 표현을 alias로 추가
- 한국어/영어 혼용 표현을 함께 등록
- 기존 topic key는 유지하고 alias만 확장

## 반영 방식
- backend `question_filter`가 런타임에 파일을 읽어 topic 추론에 사용
- 서버 재시작 후 즉시 반영
