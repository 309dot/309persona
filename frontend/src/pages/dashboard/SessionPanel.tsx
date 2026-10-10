import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';

import { Badge } from '../../components/ui/badge';
import { getSessionDetail } from '../../services/api';
import type { ConversationRecord, SessionDetail } from '../../types/api';
import { purposeLabel } from '../persona/purpose';
import { formatMs, formatTime } from './format';

function ConversationMeta({ row }: { row: ConversationRecord }) {
  const timing =
    typeof row.latency_ms === 'number'
      ? `${typeof row.first_token_ms === 'number' ? `첫 글자 ${formatMs(row.first_token_ms)} · ` : ''}완료 ${formatMs(row.latency_ms)}`
      : null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
      <span>{formatTime(row.timestamp)}</span>
      {row.error ? <Badge variant="danger">답변 실패 · {row.error}</Badge> : null}
      {row.is_blocked ? <Badge variant="danger">차단</Badge> : null}
      {!row.error && !row.is_blocked ? <Badge>{row.category ?? 'general'}</Badge> : null}
      {row.feedback ? <span>{row.feedback === 'up' ? '👍' : '👎'}</span> : null}
      {timing ? <span>{timing}</span> : null}
      {row.pipeline ? (
        <span>
          {row.pipeline}
          {row.model ? ` · ${row.model}` : ''}
        </span>
      ) : null}
    </div>
  );
}

/** One visitor's whole conversation, opened from the log list. */
export function SessionPanel({ user, sessionId, onClose }: { user: User; sessionId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getSessionDetail(await user.getIdToken(), sessionId);
        if (!cancelled) setDetail(data);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, sessionId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const visitor = detail?.visitor;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="방문자 대화"
        className="flex h-full w-full max-w-xl flex-col bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-xs text-slate-500">대화 보기 · {sessionId.slice(0, 8)}</p>
            <h2 className="text-lg font-semibold text-slate-900">
              {visitor
                ? [visitor.visitor_name, visitor.visitor_affiliation, purposeLabel(visitor.visitor_purpose)]
                    .filter(Boolean)
                    .join(' · ')
                : '방문자'}
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="rounded-full p-1 text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {error ? <p className="text-sm text-rose-500">{error}</p> : null}
          {!detail && !error ? <p className="text-sm text-slate-500">불러오는 중입니다...</p> : null}
          {detail && !detail.conversations.length ? <p className="text-sm text-slate-500">기록된 질문이 없습니다.</p> : null}
          {detail?.conversations.map((row) => (
            <div key={row.id} className="space-y-2 rounded-lg border border-slate-200 p-3">
              <ConversationMeta row={row} />
              <p className="text-sm font-semibold text-slate-900">{row.question}</p>
              {row.answer ? <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{row.answer}</p> : null}
              {row.sources?.length ? <p className="text-xs text-slate-400">근거: {row.sources.join(', ')}</p> : null}
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
