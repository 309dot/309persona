## 309 Persona Chat V2

- Route: `/persona`
- Stack: Vite + React + Tailwind (existing global styles in `src/index.css`)

### Layout
- Hero card: 브랜드 배지 + 인사 문구
- Divider: `divider-wide.svg`
- Chat area: AI 답변, 사용자 메시지, 남은 질문 수, 로딩 버블
- Proposal 영역: 제안 카드 + 입력 패널 + 이용 약관 노트

### Components & 상태
- `PersonaChatV2Page` (`src/pages/PersonaChatV2Page.tsx`)
  - `visitorName`: 입력 이름 (선택값)
  - `question`: 질문 입력
  - `remaining`: 남은 질문 수 (더미 감소 로직)
  - `loading`: 로딩 플래그 (더미 setTimeout)
- 하위 UI
  - `BubbleCard`: tone `ai | user | loading`에 따라 스타일 분기
  - `InputPanel`: 질문 입력, 이름 입력, 남은 질문 안내, enter 제출 지원
  - `ProposalCard`, `Terms`, `BrandBadge`, `RemainingCounter`, `Divider`

### Figma 컴포넌트 참고 (node-id=9-2665)
- 섹션 구조와 텍스트 레이블을 동일하게 반영
- left answer count, proposal, user input 영역을 개별 컴포넌트로 분리해 props 확장 가능하도록 구성

### 추후 연동 포인트
- `remaining`: 백엔드 세션 한도 응답과 연결
- `handleSubmit`: 실제 질문 전송 API 연결 후 로딩/오류 상태를 표시
- `visitorName`: 세션 컨텍스트와 동기화

