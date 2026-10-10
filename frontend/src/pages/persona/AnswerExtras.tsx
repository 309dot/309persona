import { RotateCcw, ThumbsDown, ThumbsUp } from 'lucide-react';

import type { ChatSource, FeedbackRating } from '../../types/api';

export function AnswerSources({
  sources,
  hrefFor,
}: {
  sources: ChatSource[];
  hrefFor: (source: ChatSource) => string | undefined;
}) {
  if (!sources.length) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
      <span className="font-semibold">근거</span>
      {sources.map((source) => {
        const href = hrefFor(source);
        const className = 'rounded-full border border-mist-line bg-mist px-2 py-0.5 text-[#445067]';
        return href ? (
          <a key={source.id} href={href} target="_blank" rel="noreferrer" className={`${className} hover:bg-mist-hover`}>
            {source.label}
          </a>
        ) : (
          <span key={source.id} className={className}>
            {source.label}
          </span>
        );
      })}
    </div>
  );
}

export function AnswerFeedback({
  value,
  onRate,
}: {
  value?: FeedbackRating;
  onRate: (rating: FeedbackRating) => void;
}) {
  const button = (rating: FeedbackRating, label: string, Icon: typeof ThumbsUp) => (
    <button
      type="button"
      aria-label={label}
      aria-pressed={value === rating}
      disabled={Boolean(value)}
      onClick={() => onRate(rating)}
      className={`rounded-full p-1 transition ${
        value === rating ? 'text-ink' : 'text-slate-400 hover:text-slate-600'
      } disabled:cursor-default`}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
  return (
    <div className="flex items-center gap-1 text-[11px] text-slate-400">
      {button('up', '도움이 됐어요', ThumbsUp)}
      {button('down', '아쉬워요', ThumbsDown)}
      {value ? <span>의견 고마워요</span> : null}
    </div>
  );
}

export function FollowUpChips({
  items,
  disabled,
  onPick,
}: {
  items: string[];
  disabled: boolean;
  onPick: (question: string) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-2 pl-[52px]">
      {items.map((item) => (
        <button
          key={item}
          type="button"
          disabled={disabled}
          onClick={() => onPick(item)}
          className="rounded-full border border-mist-line bg-white px-3 py-1 text-[12px] font-semibold text-[#445067] transition hover:bg-mist disabled:opacity-50"
        >
          {item}
        </button>
      ))}
    </div>
  );
}

export function FailedAnswer({ disabled, onRetry }: { disabled: boolean; onRetry: () => void }) {
  return (
    <div className="w-full max-w-[540px] rounded-2xl border border-mist-line bg-mist px-4 py-3 text-[13px] leading-5 text-[#334155]">
      <p>지금은 답변을 가져오지 못했어요. 잠시 후 다시 시도해 주세요. 이 질문은 남은 질문 수에서 빠지지 않아요.</p>
      <button
        type="button"
        onClick={onRetry}
        disabled={disabled}
        className="mt-2 inline-flex items-center gap-1 rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
      >
        <RotateCcw className="h-3 w-3" />
        다시 시도
      </button>
    </div>
  );
}
