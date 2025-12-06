import { useEffect, useMemo, useRef, useState } from 'react';

import agentAvatar from '@assets/images/agent-avatar.png';
import iconArrow from '@assets/icons/proposal-arrow.svg';
import iconEdit from '@assets/icons/name-edit.svg';
import iconEnvelope from '@assets/icons/proposal-mail.svg';
import iconPdf from '@assets/icons/resume-pdf.svg';
import logoFull from '@assets/icons/logo.svg';

const AI_ANSWER = '안녕하세요, 309 AI입니다. 편하게 회사명이나 이름을 알려주시면 커피챗을 시작할게요. 😊';
const INPUT_PLACEHOLDER = '무엇이든 물어보세요';
const TOTAL_QUESTIONS = 5;
const PORTFOLIO_URL =
  'https://raw.githubusercontent.com/309dot/309persona/main/knowledge_base/309files/pdf/%ED%8F%AC%ED%8A%B8%ED%8F%B4%EB%A6%AC%EC%98%A4_%EC%84%B1%EB%B0%B1%EA%B3%A4.pdf';
const RESUME_URL =
  'https://raw.githubusercontent.com/309dot/309persona/main/knowledge_base/309files/pdf/%ED%94%84%EB%A1%9C%EB%8D%95%ED%8A%B8%20%EB%94%94%EC%9E%90%EC%9D%B4%EB%84%A4_%EC%9D%B4%EB%A0%A5%EC%84%9C_%EC%84%B1%EB%B0%B1%EA%B3%A4.pdf';

function TypingText({
  text,
  speed = 110,
  onComplete,
}: {
  text: string;
  speed?: number;
  onComplete?: () => void;
}) {
  const [visible, setVisible] = useState('');
  const hasRunRef = useRef(false);

  useEffect(() => {
    if (hasRunRef.current) return undefined;
    hasRunRef.current = true;
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

function RemainingCounter({ used }: { used: number }) {
  const progress = useMemo(() => {
    return Math.min(100, Math.max(0, (used / TOTAL_QUESTIONS) * 100));
  }, [used]);

  return (
    <div className="flex items-center gap-2 text-[12px] font-medium text-slate-600">
      <div className="relative inline-flex h-8 w-8 items-center justify-center">
        <svg className="h-8 w-8 rotate-[-90deg]" viewBox="0 0 36 36">
          <circle cx="18" cy="18" r="16" className="stroke-slate-200" strokeWidth="3" fill="none" />
          <circle
            cx="18"
            cy="18"
            r="16"
            className="stroke-sky-500"
            strokeWidth="3"
            fill="none"
            strokeDasharray="100"
            strokeDashoffset={`${100 - progress}`}
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute text-[11px] font-semibold text-slate-700">
          {used}/{TOTAL_QUESTIONS}
        </span>
      </div>
    </div>
  );
}

function ProposalCard() {
  return (
    <button
      type="button"
      className="flex w-fit items-center gap-2 rounded-full border border-[#dee0e3] bg-white px-4 py-3 text-sm font-medium text-slate-900 shadow-[0_1px_2px_rgba(20,21,26,0.05)] transition hover:border-slate-300"
    >
      <img src={iconEnvelope} alt="proposal" className="h-4 w-4 opacity-80" />
      309에게 제안하기
      <img src={iconArrow} alt="arrow" className="h-3.5 w-3.5 opacity-80" />
    </button>
  );
}

function InputPanel({
  name,
  question,
  onQuestionChange,
  onSubmit,
  loading,
  usedCount,
}: {
  name: string;
  question: string;
  onQuestionChange: (value: string) => void;
  onSubmit: () => void;
  loading: boolean;
  usedCount: number;
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
          <RemainingCounter used={usedCount} />
          <div className="flex items-center gap-2 text-[12px] text-slate-600">
            <div className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2">
              <img src={iconEdit} alt="" className="h-3 w-3 opacity-70" />
              <span className="text-slate-700">{name || '삼성전자, 채용 담당자님'}</span>
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
  const [usedCount, setUsedCount] = useState(0);
  const [botAnswered, setBotAnswered] = useState(false);

  const handleSubmit = () => {
    if (!question.trim()) return;
    setUsedCount((prev) => Math.min(TOTAL_QUESTIONS, prev + 1));
    setShowLoadingBubble(true);
    setLoading(true);
    setTimeout(() => {
      setQuestion('');
      setLoading(false);
      setShowLoadingBubble(false);
      setBotAnswered(true);
    }, 500);
  };

  return (
    <div className="min-h-screen bg-white px-4 py-10 text-slate-900">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 pb-40">
        <section className="flex flex-col gap-3">
          <BrandBadge />
          <div className="space-y-1 text-[28px] font-bold leading-tight sm:text-[30px]">
            <p>
              <TypingText
                text="안녕하세요. 🙋 만나서 반갑습니다. 이 서비스는 저의 페르소나가 담긴 🤖 AI Agent 기반 커피챗 서비스(베타)입니다."
                speed={100}
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
                    speed={95}
                  />
                </div>
              </div>
            </div>
          )}

          {showLoadingBubble && loading ? (
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

        <section className="h-20" />
      </main>

      {botAnswered ? (
        <div className="fixed inset-x-0 bottom-4 z-10 flex justify-center px-4">
          <div className="flex w-full max-w-3xl flex-col gap-1">
            <div className="flex items-center justify-between gap-3">
              <ProposalCard />
              <div className="flex items-center gap-3 text-[12px] text-slate-600">
                <a
                  href={PORTFOLIO_URL}
                  className="flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-slate-800 shadow-sm transition hover:bg-slate-200"
                  download
                >
                  <img src={iconEdit} alt="portfolio" className="h-4 w-4 opacity-80" />
                  포트폴리오
                </a>
                <a
                  href={RESUME_URL}
                  className="flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-slate-800 shadow-sm transition hover:bg-slate-200"
                  download
                >
                  <img src={iconPdf} alt="resume" className="h-4 w-4 opacity-90" />
                  이력서
                </a>
              </div>
            </div>
            <div className="mt-1">
              <InputPanel
                name={visitorName}
                question={question}
                onQuestionChange={setQuestion}
                onSubmit={handleSubmit}
                loading={loading}
                usedCount={usedCount}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default PersonaChatV2Page;

