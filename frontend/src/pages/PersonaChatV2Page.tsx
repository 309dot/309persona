import { useEffect, useState } from 'react';

import agentAvatar from '@assets/images/agent-avatar.png';
import logoFull from '@assets/icons/logo.svg';
import logoBubble from '@assets/icons/logo-bubble.svg';

const AI_ANSWER = '커피챗에 앞서 소개 부탁드립니다. (간단한 회사명정도만 밝혀주셔도 됩니다. 😄)';
const USER_SAMPLE = '반가워. 난 삼성전자에서 왔어.';
const LOADING_TEXT = '대답을 생각하는 중입니다...';
const INPUT_PLACEHOLDER = '무엇이든 물어보세요';

function TypingText({ text, speed = 18 }: { text: string; speed?: number }) {
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
      <span className="flex items-center gap-2 rounded-[6px] bg-sky-500 px-3 py-[6px] text-[11px] font-semibold text-white shadow-sm">
        <img src={logoBubble} alt="bubble" className="h-3.5 w-3.5" />
        BETA
      </span>
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
  return (
    <div className="flex w-full items-center justify-between text-[12px] font-medium text-slate-500">
      <span className="text-slate-400">5번의 질문을 더 할 수 있습니다.</span>
      <span className="text-slate-400">(1/{left})</span>
    </div>
  );
}

function ProposalCard() {
  return (
    <div className="w-full rounded-full border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm">
      309에게 제안하기
    </div>
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
          <div className="flex items-center gap-2 text-[12px] text-slate-600">
            <span className="inline-flex h-2 w-2 rounded-full bg-sky-500" />
            <span>1/5</span>
          </div>
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
      <div className="mt-2 text-center text-[12px] text-slate-400">
        채팅을 시작하게 되는 경우 개인정보 이용 동의로 간주됩니다.
      </div>
    </div>
  );
}

export function PersonaChatV2Page() {
  const [visitorName] = useState('삼성전자, 채용 담당자님');
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
    <div className="min-h-screen bg-white px-4 py-10 text-slate-900">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <section className="flex flex-col gap-3">
          <BrandBadge />
          <div className="space-y-1 text-[28px] font-bold leading-tight sm:text-[30px]">
            <p>
              <TypingText text="안녕하세요. 🙋 만나서 반갑습니다. 이 서비스는 저의 페르소나가 담긴 🤖 AI Agent 기반 커피챗 서비스(베타)입니다." />
            </p>
          </div>
        </section>

        <Divider />

        <section className="flex flex-col gap-6">
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
                <TypingText text={AI_ANSWER} />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <div className="max-w-[380px] space-y-2 text-right">
              <div className="inline-flex rounded-[16px] bg-sky-500 px-4 py-3 text-[15px] text-white shadow">
                {USER_SAMPLE}
              </div>
              <RemainingCounter left={remaining} />
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white shadow-sm">
              <img src={agentAvatar} alt="309 avatar" className="h-full w-full object-cover" />
            </div>
            <div className="text-[15px] leading-6 text-slate-400">{LOADING_TEXT}</div>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <ProposalCard />
            <div className="flex items-center gap-3 text-[12px] text-slate-600">
              <button className="rounded-full border border-slate-200 px-3 py-2 shadow-sm">포트폴리오</button>
              <button className="rounded-full border border-slate-200 px-3 py-2 shadow-sm">이력서</button>
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

