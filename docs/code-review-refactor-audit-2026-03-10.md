# 309persona 코드 리뷰 & 리팩토링 점검 (2026-03-10)

## 결론
- 리팩토링 **필요**.
- 현재 장애 대응 패치가 누적되면서 `llm_service.py`, `PersonaChatV2Page.tsx` 중심으로 복잡도가 크게 증가.
- 품질 리스크는 "동작은 하지만 예측 가능성이 낮은 상태"에 가까움.

## 핵심 리스크 (우선순위 순)

### P0
- `frontend/src/pages/PersonaChatV2Page.tsx` 단일 파일 과대화 (1169 lines)
  - UI/이벤트/로깅/퍼널/모달/응답렌더/세션 처리 로직이 한 파일에 혼재
  - 수정 시 사이드이펙트 발생 가능성이 매우 높음
- `backend/app/services/llm_service.py` 다중 책임 (498 lines)
  - 프롬프트 구성, 모델 호출, rerank, 품질 게이트, fallback, 후처리가 한 파일에 결합
  - 최근 핫픽스 누적으로 경로별 일관성 저하 위험

### P1
- 정적 분석 기준 Front lint 실패 다수
  - `react-hooks/set-state-in-effect` 다수 위반
  - `react-hooks/exhaustive-deps` 경고 존재
- fallback 답변 품질 규칙이 늘어나며 조건 분기 난이도 상승

### P2
- 프론트 번들 크기 과대 (`~812KB`, gzip `~254KB`)
  - 라우트/컴포넌트 동적 분리 여지 큼
- 운영 응답 품질 회귀 방지 테스트 부재

## 객관 지표
- 파일 규모 상위
  - `PersonaChatV2Page.tsx`: 1169 lines
  - `llm_service.py`: 498 lines
- lint 결과
  - errors: 9
  - warnings: 2
- 빌드
  - frontend build 통과
  - backend py_compile 통과

## 리팩토링 권장안

### 1단계 (안전/회귀 방지)
- `llm_service.py`를 아래로 분리
  - `answer_generation.py` (모델 호출)
  - `answer_quality.py` (품질 게이트)
  - `rag_fallback.py` (fallback 생성)
  - `answer_sanitize.py` (내부 아티팩트 필터)
- 응답 품질 스냅샷 테스트 3개 추가
  - 디자인 시스템 질문
  - 협업 질문
  - 우선순위 질문

### 2단계 (프론트 구조 정리)
- `PersonaChatV2Page.tsx` 분리
  - `components/persona/` 아래로 분해
    - `PersonaHeader.tsx`
    - `PersonaThreadList.tsx`
    - `PersonaInputDock.tsx`
    - `PersonaModals.tsx`
- `hooks/usePersonaSession.ts`
- `hooks/usePersonaFunnel.ts`

### 3단계 (품질/성능)
- markdown renderer, 모달, 대시보드 차트 lazy import
- 번들 사이즈 경고 기준 도입(예: 650KB 초과시 CI warning)

## 즉시 실행 가능한 액션
- [ ] lint 에러(react-hooks/set-state-in-effect) 우선 정리
- [ ] 답변 품질 게이트 테스트 스냅샷 추가
- [ ] `llm_service.py` 책임 분리 PR 1개
- [ ] `PersonaChatV2Page.tsx` 컴포넌트 분해 PR 1개
