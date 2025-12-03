import clsx from 'clsx';

import type { ChatMessage } from '../types/api';

interface Props {
  message: ChatMessage;
}

export function ChatBubble({ message }: Props) {
  const isVisitor = message.role === 'visitor';
  const isSystem = message.role === 'system';

  return (
    <div
      className={clsx('flex w-full flex-col gap-1', {
        'items-end': isVisitor,
        'items-start': !isVisitor,
        'text-center': isSystem,
      })}
    >
      {!isSystem ? (
        <span className="text-xs text-slate-500">
          {isVisitor ? '방문자' : message.blocked ? '안내 메시지' : '309 Interview Agent'}
        </span>
      ) : null}
      <div
        className={clsx(
          'max-w-2xl rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm',
          {
            'bg-brand-600 text-white': isVisitor,
            'bg-white text-slate-800 border border-slate-100': !isVisitor && !message.blocked,
            'bg-amber-50 text-amber-900 border border-amber-200': message.blocked,
            'mx-auto text-slate-500': isSystem,
          },
        )}
      >
        {message.text}
        {message.category ? (
          <div className="mt-2 text-xs font-semibold uppercase tracking-wide text-brand-500">
            #{message.category}
          </div>
        ) : null}
      </div>
      <span className="text-[11px] text-slate-400">
        {new Date(message.timestamp).toLocaleTimeString('ko-KR', {
          hour: '2-digit',
          minute: '2-digit',
        })}
      </span>
    </div>
  );
}

