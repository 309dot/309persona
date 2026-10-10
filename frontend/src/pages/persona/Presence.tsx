/**
 * Small pieces of motion that say what the AI is doing: the avatar ring while it
 * thinks or speaks, the "reading records" line, and streamed words settling into ink.
 * All of it is CSS (index.css) and stops under prefers-reduced-motion.
 */

export type PresenceState = 'thinking' | 'speaking' | null;

export function AvatarPresence({ src, state = null }: { src: string; state?: PresenceState }) {
  return (
    <div className={`avatar-presence relative h-10 w-10 shrink-0 ${state ? `is-${state}` : ''}`} data-presence={state ?? 'idle'}>
      <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white shadow-xs">
        <img src={src} alt="309 avatar" className="h-full w-full object-cover" />
      </div>
    </div>
  );
}

export function ThinkingIndicator({ avatar, relatedLabels }: { avatar: string; relatedLabels: string[] }) {
  return (
    <div className="mt-2 flex items-start gap-3">
      <AvatarPresence src={avatar} state="thinking" />
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex w-fit items-center gap-2 rounded-full bg-white/90 px-3 py-1 text-[13px] font-medium text-slate-500 backdrop-blur-sm">
          <span>답변을 정리하고 있어요</span>
          <span className="dot-wave flex gap-1" aria-hidden="true">
            <span className="inline-block h-[4px] w-[4px] rounded-full bg-slate-500" />
            <span className="inline-block h-[4px] w-[4px] rounded-full bg-slate-500" />
            <span className="inline-block h-[4px] w-[4px] rounded-full bg-slate-500" />
          </span>
        </div>
        {relatedLabels.length ? (
          <p className="animate-fade-in px-3 text-[12px] text-slate-400">
            <span className="font-semibold text-accent">{relatedLabels.join(' · ')}</span> 기록을 살펴보는 중
          </p>
        ) : null}
      </div>
    </div>
  );
}

// Streamed pieces that are still fading in; older ones are plain text.
const TRAIL = 40;
// Markdown markers read as noise while the text is still arriving; the finished answer renders them.
const MARKDOWN_NOISE = /\*\*|__|`|^#{1,6} /gm;

/**
 * The answer while it streams. `marks` are the answer lengths after each screen update,
 * so every update's new words get their own fade-in.
 */
export function StreamingText({ text, marks }: { text: string; marks: number[] }) {
  const tail = marks.slice(-TRAIL);
  const settledEnd = marks.length > TRAIL ? marks[marks.length - TRAIL - 1] : 0;
  const pieces: { start: number; text: string }[] = [];
  let start = settledEnd;
  for (const end of tail) {
    if (end > start) pieces.push({ start, text: text.slice(start, end) });
    start = Math.max(start, end);
  }
  if (start < text.length) pieces.push({ start, text: text.slice(start) });

  return (
    <div className="max-w-none whitespace-pre-wrap text-[14px] leading-6 text-ink" data-streaming="true">
      {text.slice(0, settledEnd).replace(MARKDOWN_NOISE, '')}
      {pieces.map((piece) => (
        <span key={piece.start} className="ink-in">
          {piece.text.replace(MARKDOWN_NOISE, '')}
        </span>
      ))}
      <span className="stream-caret" aria-hidden="true" />
    </div>
  );
}

/** Three linked dots; they bob while the AI is looking through the records. */
export function MapIcon({ active = false }: { active?: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className={`map-icon h-4 w-4 ${active ? 'is-active' : ''}`} aria-hidden="true">
      <path d="M4 11.5 8 4.5l4 7" fill="none" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1.2" />
      <circle cx="4" cy="11.5" r="1.9" fill="currentColor" />
      <circle cx="8" cy="4.5" r="1.9" fill="currentColor" />
      <circle cx="12" cy="11.5" r="1.9" fill="currentColor" />
    </svg>
  );
}
