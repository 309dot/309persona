import type { GraphNode } from '../../../types/api';

export type MapPhase = 'idle' | 'searching' | 'answering';

/** What the map shows right now; the page owns it and both map views read it. */
export interface MapSignals {
  phase: MapPhase;
  /** Guessed from the question when it was sent (start event). */
  related: string[];
  /** Sources of the latest answer. */
  cited: string[];
  /** Sources of every answer so far. */
  visited: string[];
  /** A source chip the visitor is pointing at. */
  focus: string | null;
}

export const KIND_LABELS: Record<GraphNode['kind'], string> = {
  center: '309',
  project: '프로젝트',
  doc: '문서',
  topic: '주제',
  note: '노트',
};

/** The question a node asks when the visitor picks it on the map. */
export function questionFor(node: GraphNode): string {
  if (node.question) return node.question;
  switch (node.kind) {
    case 'center':
      return '309는 어떤 디자이너인가요?';
    case 'project':
      return `${node.label} 프로젝트 이야기를 들려줘`;
    case 'topic':
      return `${node.label} 관련 경험을 알려줘`;
    case 'doc':
      return node.id === 'RESUME' ? '경력을 한눈에 요약해줘' : '일하는 방식과 강점을 요약해줘';
    default:
      return `${node.label}에 대해 알려줘`;
  }
}
