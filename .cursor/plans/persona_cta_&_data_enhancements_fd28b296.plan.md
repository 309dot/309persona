---
name: Persona CTA & Data Enhancements
overview: Refine PersonaChat styling, new CTA links, and data capture
todos:
  - id: progress-indicator
    content: 입력 패널 프로그레스/텍스트 정렬 수정
    status: completed
  - id: bubble-remaining-text
    content: 질문 버블 색상과 남은 질문 캡션 적용
    status: completed
    dependencies:
      - progress-indicator
  - id: answer-formatting
    content: 에이전트 답변 문서형 포매터 도입
    status: completed
    dependencies:
      - bubble-remaining-text
  - id: loader-divider
    content: 로더 스타일 조정 및 Divider 제거
    status: completed
    dependencies:
      - answer-formatting
---

# Persona PersonaChat Enhancements

## 1. CTA & Asset Updates

- Update proposal button action to open a mailto link. Adjust icon usage for portfolio/resume links with the new SVG assets.

## 2. Answer/Error Presentation Changes

- Remove inline error text block and route those messages through the formatted answer pipeline so they appear as agent replies.

## 3. Visitor Data Persistence

- Capture user question content and visitor info updates, persisting them to Firebase via existing service calls or new API endpoints as needed.

## 4. Visitor Modal Prefill

- When the user edits info, prefill the modal fields with stored/last-known visitor details fetched from session/Firebase.

## 5. Styling Polish

- Reduce drop shadow intensity on user message bubbles and input dock to match the requested softer blur radius.