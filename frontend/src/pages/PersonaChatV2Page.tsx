import { useEffect, useMemo, useState } from 'react';

import dividerWide from '@assets/icons/divider-wide.svg';
import logoBubble from '@assets/icons/logo-bubble.svg';
import logo0 from '@assets/icons/logo-0.svg';
import logo3 from '@assets/icons/logo-3.svg';
import logo9 from '@assets/icons/logo-9.svg';

const AI_ANSWER =
  '안녕하세요! 저는 309 페르소나를 학습한 AI 에이전트입니다. 제 백그라운드와 경험, 프로젝트, 고민까지 자유롭게 물어보세요. 🙂';
const USER_SAMPLE = '최근에 진행한 프로젝트에서 가장 도전적이었던 부분이 궁금합니다.';
const LOADING_TEXT = '답변을 준비하는 중입니다... 잠시만 기다려주세요.';

function TypingText({ text, speed = 24 }: { text: string; speed?: number }) {
  const [visible, setVisible] = useState('');

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      i += 1;
      setVisible(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(interval);
      }
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed]);

  return (
    <span className="relative inline-block">
      {visible}
      {visible.length < text.length ? <span className="ml-[1px] inline-block animate-pulse text-white">|</span> : null}
    </span>
  );
}

function BrandBadge() {
  return (
    <div className="inline-flex items-center gap-2">
      <div className="flex items-center gap-1 rounded-full bg-slate-900 px-3 py-1 text-white shadow-lg">
        <img src={logo3} alt="3" className="h-4 w-4" />
        <img src={logo0} alt="0" className="h-4 w-4" />
        <img src={logo9} alt="9" className="h-4 w-4" />
      </div>
      <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-[6px] text-[11px] font-semibold text-sky-700">
        <img src={logoBubble} alt="bubble" className="h-3 w-3" />
        BETA
      </span>
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">{children}</p>;
}

function BubbleCard({
  label,
  text,
  tone = 'ai',
}: {
  label: string;
  text: string;
  tone?: 'ai' | 'user' | 'loading';
}) {
  const style = useMemo(() => {
    if (tone === 'user') {
      return 'bg-white border border-slate-200 text-slate-900 shadow-[0_12px_30px_rgba(15,23,42,0.12)]';
    }
    if (tone === 'loading') {
      return 'bg-slate-50 border border-slate-200 text-slate-500';
    }
    return 'bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white shadow-[0_18px_60px_rgba(15,23,42,0.3)]';
  }, [tone]);

  return (
    <div className="w-full">
      <SectionLabel>{label}</SectionLabel>
      <div className={`mt-2 rounded-3xl px-6 py-5 text-base leading-6 ${style}`}>
        {tone === 'ai' ? <TypingText text={text} /> : text}
      </div>
    </div>
  );
}

function Divider() {
  return (
    <div className="flex w-full justify-center py-2">
      <img src={dividerWide} alt="divider" className="h-6 w-auto" />
    </div>
  );
}

function RemainingCounter({ left }: { left: number }) {
  return (
    <div className="flex w-full justify-between rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-[12px] font-semibold text-slate-600">
      <span className="uppercase tracking-[0.08em] text-slate-500">left answer count</span>
      <span className="text-slate-800">남은 질문 수 {left}개</span>
    </div>
  );
}

function ProposalCard() {
  return (
    <div className="w-full rounded-2xl border border-slate-200 bg-white/90 px-5 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
      <SectionLabel>proposal</SectionLabel>
      <p className="mt-2 text-sm text-slate-700 leading-relaxed">
        최초 질문 이후, 사용자에게 추가 질문을 제안하는 카드가 나타납니다. 무엇을 물어봐야 할지 모를 때 간단한
        문장을 제시해 주세요.
      </p>
    </div>
  );
}

function Terms() {
  return (
    <div className="pt-4 text-center text-[11px] text-slate-400">
      개인정보 수집 · 이용 동의 후 진행해 주세요.
    </div>
  );
}

function InputPanel({
  remaining,
  name,
  question,
  onNameChange,
  onQuestionChange,
  onSubmit,
  loading,
}: {
  remaining: number;
  name: string;
  question: string;
  onNameChange: (value: string) => void;
  onQuestionChange: (value: string) => void;
  onSubmit: () => void;
  loading: boolean;
}) {
  const disabled = !question.trim() || loading;

  return (
    <div className="w-full rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
      <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
        <span className="rounded-md bg-slate-100 px-2 py-1 uppercase tracking-[0.08em]">left answer count</span>
        <span className="text-slate-600">남은 질문 {remaining}개</span>
      </div>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <input
          value={question}
          onChange={(e) => onQuestionChange(e.target.value)}
          placeholder="무엇이든 물어보세요"
          className="min-h-[56px] flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              onSubmit();
            }
          }}
        />
        <div className="flex flex-col gap-2 text-xs text-slate-500 sm:w-64">
          <label className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">user name</span>
            <input
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              className="w-28 border-none bg-transparent text-sm text-slate-900 focus:outline-none"
              placeholder="이름(선택)"
            />
          </label>
          <button
            type="button"
            onClick={onSubmit}
            disabled={disabled}
            className="inline-flex h-12 items-center justify-center rounded-2xl bg-slate-900 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            chat start
          </button>
          <span className="text-[11px] text-slate-400">Enter 키로도 제출 가능합니다.</span>
        </div>
      </div>
    </div>
  );
}

export function PersonaChatV2Page() {
  const [visitorName, setVisitorName] = useState('리크루터');
  const [question, setQuestion] = useState('');
  const [remaining, setRemaining] = useState(3);
  const [loading, setLoading] = useState(false);

  const handleSubmit = () => {
    if (!question.trim()) return;
    setLoading(true);
    setTimeout(() => {
      setRemaining((prev) => Math.max(0, prev - 1));
      setQuestion('');
      setLoading(false);
    }, 500);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 px-4 py-8 text-slate-900">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <section className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.12)]">
          <BrandBadge />
          <div className="mt-4 space-y-2 text-[22px] font-bold leading-snug sm:text-[26px]">
            <p>안녕하세요. 만나서 반갑습니다. 이 서비스는 저의 페르소나가 담긴 AI Agent 기반 커피챗 서비스(베타)입니다.</p>
            <p className="text-lg font-semibold text-slate-500">
              궁금한 내용을 입력하면 309 페르소나가 답변해 드립니다.
            </p>
          </div>
        </section>

        <Divider />

        <section className="space-y-5 rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <BubbleCard label="309 persona AI chat : answer" text={AI_ANSWER} tone="ai" />
          <BubbleCard label="user chat" text={USER_SAMPLE} tone="user" />
          <RemainingCounter left={remaining} />
          <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-slate-50">
            <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-white/70 to-transparent" />
            <BubbleCard label="309 persona AI chat : loading" text={LOADING_TEXT} tone="loading" />
          </div>
        </section>

        <section className="space-y-4 rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <ProposalCard />
          <InputPanel
            remaining={remaining}
            name={visitorName}
            question={question}
            onNameChange={setVisitorName}
            onQuestionChange={setQuestion}
            onSubmit={handleSubmit}
            loading={loading}
          />
          <Terms />
        </section>
      </main>
    </div>
  );
}

export default PersonaChatV2Page;

