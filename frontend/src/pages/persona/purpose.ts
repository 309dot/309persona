/** Why the visitor came. Keys match the backend's VisitorPurpose. */
export type VisitorPurpose = 'hiring' | 'colleague' | 'designer' | 'browsing';

export const PURPOSES: { key: VisitorPurpose; label: string }[] = [
  { key: 'hiring', label: '채용 검토 중' },
  { key: 'colleague', label: '함께 일할 동료' },
  { key: 'designer', label: '디자이너·후배' },
  { key: 'browsing', label: '그냥 둘러보기' },
];

export const DEFAULT_QUESTIONS = [
  '최근 2년 안에 가장 임팩트 컸던 프로젝트 2개만 핵심으로 설명해줘',
  '디자인 시스템 구축에서 실제로 성과를 낸 방식과 수치를 알려줘',
  'PM으로서 기획부터 출시까지 이끈 프로젝트를 알려줘',
  '우선순위가 충돌할 때 어떤 기준으로 결정했는지 예시로 설명해줘',
  '채용 관점에서 리스크와 강점을 균형 있게 평가해줘',
];

// Questions the knowledge base can answer, ordered for what each visitor usually wants first.
const QUESTIONS_BY_PURPOSE: Record<VisitorPurpose, string[]> = {
  hiring: [
    '최근 2년 안에 가장 임팩트 컸던 프로젝트 2개만 핵심으로 설명해줘',
    'PM으로서 기획부터 출시까지 이끈 프로젝트를 알려줘',
    '채용 관점에서 리스크와 강점을 균형 있게 평가해줘',
    '어떤 회사에서 어떤 역할을 맡아 왔나요?',
  ],
  colleague: [
    '협업 갈등이 생겼을 때 309가 조율한 실제 사례를 말해줘',
    '우선순위가 충돌할 때 어떤 기준으로 결정했는지 예시로 설명해줘',
    '개발자와 일할 때 요구사항과 디자인 기준을 어떻게 맞춰 왔나요?',
    'PRD와 로드맵은 어떻게 쓰고 관리하나요?',
  ],
  designer: [
    '디자인 시스템 구축에서 실제로 성과를 낸 방식과 수치를 알려줘',
    'UX 디자인에서 PM까지 어떻게 역할을 넓혀 왔나요?',
    'AI 오디오북 프로젝트에서 사용자 흐름을 어떻게 설계했나요?',
    '문제를 정의할 때 가장 먼저 하는 일은?',
  ],
  browsing: [
    '309는 어떤 사람인가요?',
    '가장 기억에 남는 프로젝트 하나만 소개해줘',
    'AI 오디오북 프로젝트는 어떤 서비스였나요?',
    '일할 때 가장 중요하게 생각하는 가치는?',
  ],
};

export function questionsFor(purpose: VisitorPurpose | null): string[] {
  return purpose ? QUESTIONS_BY_PURPOSE[purpose] : DEFAULT_QUESTIONS;
}

export function purposeLabel(purpose?: string | null): string | null {
  return PURPOSES.find((item) => item.key === purpose)?.label ?? null;
}
