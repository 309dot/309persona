import { useEffect, useMemo, useState } from 'react';

import agentAvatar from '@assets/images/agent-avatar.png';
import logoFull from '@assets/icons/logo.svg';
import logoBubble from '@assets/icons/logo-bubble.svg';

const AI_ANSWER = '커피챗에 앞서 소개 부탁드립니다. (간단한 회사명정도만 밝혀주셔도 됩니다. 😄)';
const INPUT_PLACEHOLDER = '무엇이든 물어보세요';
const TOTAL_QUESTIONS = 5;

function TypingText({
  text,
  speed = 70,
  onComplete,
}: {
  text: string;
  speed?: number;
  onComplete?: () => void;
}) {
  const [visible, setVisible] = useState('');

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      i += 1;
      setVisible(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(interval);
        onComplete?.();
      }
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed, onComplete]);

  return (
    <span className="inline-block">
      {visible}
      {visible.length < text.length ? <span className="ml-[1px] inline-block animate-pulse">|</span> : null}
    </span>
  );
}

function BrandBadge() {
  return (
    <div className="flex items-center gap-2">
      <img src={logoFull} alt="309 logo" className="h-10 w-auto" />
    </div>
  );
}

function Divider() {
  return (
    <div className="flex w-full items-center justify-center gap-3 py-2 text-[12px] font-medium text-slate-400">
      <span className="h-px flex-1 bg-slate-200" />
      Chat Started
      <span className="h-px flex-1 bg-slate-200" />
    </div>
  );
}

function RemainingCounter({ left }: { left: number }) {
  const progress = useMemo(() => {
    const used = TOTAL_QUESTIONS - left;
    return Math.min(100, Math.max(0, (used / TOTAL_QUESTIONS) * 100));
  }, [left]);

  return (
    <div className="flex w-full items-center gap-3 text-[12px] font-medium text-slate-500">
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
        <div className="absolute left-0 top-0 h-full rounded-full bg-sky-500" style={{ width: `${progress}%` }} />
      </div>
      <span className="text-slate-600">
        {TOTAL_QUESTIONS - left}/{TOTAL_QUESTIONS}
      </span>
    </div>
  );
}

function ProposalCard() {
  return (
    <button
      type="button"
      className="flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 shadow-sm transition hover:border-slate-300"
    >
      <img src={logoBubble} alt="" className="h-4 w-4" />
      309에게 제안하기
      <span className="text-base">→</span>
    </button>
  );
}

function InputPanel({
  name,
  question,
  onQuestionChange,
  onSubmit,
  loading,
}: {
  name: string;
  question: string;
  onQuestionChange: (value: string) => void;
  onSubmit: () => void;
  loading: boolean;
}) {
  const disabled = !question.trim() || loading;

  return (
    <div className="w-full rounded-[24px] border border-[#bdbdbd] bg-white px-6 py-4 shadow-[3px_4px_16px_rgba(0,0,0,0.12)]">
      <div className="flex flex-col gap-3 text-sm text-slate-900">
        <input
          value={question}
          onChange={(e) => onQuestionChange(e.target.value)}
          placeholder={INPUT_PLACEHOLDER}
          className="w-full rounded-2xl border border-transparent bg-transparent px-1 py-2 text-[16px] placeholder:text-slate-400 focus:outline-none"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              onSubmit();
            }
          }}
        />
        <div className="flex items-center justify-between">
          <RemainingCounter left={TOTAL_QUESTIONS} />
          <div className="flex items-center gap-2 text-[12px] text-slate-500">
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
              <span className="text-slate-600">{name || '삼성전자, 채용 담당자님'}</span>
            </div>
            <button
              type="button"
              onClick={onSubmit}
              disabled={disabled}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-white transition hover:bg-slate-800 disabled:bg-slate-300"
              aria-label="전송"
            >
              ↑
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PersonaChatV2Page() {
  const [visitorName] = useState('삼성전자, 채용 담당자님');
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [heroDone, setHeroDone] = useState(false);
  const [showLoadingBubble, setShowLoadingBubble] = useState(false);

  const handleSubmit = () => {
    if (!question.trim()) return;
    setLoading(true);
    setTimeout(() => {
      setQuestion('');
      setLoading(false);
    }, 500);
  };

  return (
    <div className="min-h-screen bg-white px-4 py-10 text-slate-900">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <section className="flex flex-col gap-3">
          <BrandBadge />
          <div className="space-y-1 text-[28px] font-bold leading-tight sm:text-[30px]">
            <p>
              <TypingText
                text="안녕하세요. 🙋 만나서 반갑습니다. 이 서비스는 저의 페르소나가 담긴 🤖 AI Agent 기반 커피챗 서비스(베타)입니다."
                speed={80}
                onComplete={() => setHeroDone(true)}
              />
            </p>
          </div>
        </section>

        <Divider />

        <section className="flex flex-col gap-6">
          {heroDone && (
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white shadow-sm">
                <img src={agentAvatar} alt="309 avatar" className="h-full w-full object-cover" />
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  <span className="font-semibold text-slate-900">309</span>
                  <span>10:04 AM</span>
                </div>
                <div className="text-[15px] leading-6 text-slate-900">
                  <TypingText
                    text={AI_ANSWER}
                    speed={70}
                    onComplete={() => setShowLoadingBubble(true)}
                  />
                </div>
              </div>
            </div>
          )}

          {showLoadingBubble ? (
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white shadow-sm">
                <img src={agentAvatar} alt="309 avatar" className="h-full w-full object-cover" />
              </div>
              <div className="flex items-center gap-2 rounded-[16px] bg-slate-100 px-4 py-3 text-[15px] text-slate-600 shadow-inner">
                <span>대답을 생각하는 중입니다</span>
                <span className="flex gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="inline-block h-2 w-2 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '120ms' }} />
                  <span className="inline-block h-2 w-2 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '240ms' }} />
                </span>
              </div>
            </div>
          ) : null}
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <ProposalCard />
            <div className="flex items-center gap-3 text-[12px] text-slate-600">
              <button className="flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 shadow-sm transition hover:border-slate-300">
                📁 포트폴리오
              </button>
              <button className="flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 shadow-sm transition hover:border-slate-300">
                📄 이력서
              </button>
            </div>
          </div>
          <InputPanel
            name={visitorName}
            question={question}
            onQuestionChange={setQuestion}
            onSubmit={handleSubmit}
            loading={loading}
          />
          <div className="mt-2 text-center text-[12px] text-slate-400">
            채팅을 시작하게 되는 경우 개인정보 이용 동의로 간주됩니다.
          </div>
        </section>
      </main>
    </div>
  );
}

export default PersonaChatV2Page;

