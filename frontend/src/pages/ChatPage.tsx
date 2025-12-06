import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import agentAvatar from '@assets/images/agent-avatar.png';
import chatProductImage from '@assets/images/chat-product.png';

import { NavBar } from '../components/NavBar';
import { VisitorModal } from '../components/VisitorModal';
import { useSessionContext } from '../context/SessionContext';
import { useChatHistory } from '../hooks/useChatHistory';
import { sendQuestion } from '../services/api';
import type { ChatMessage } from '../types/api';

function formatTimestamp(timestamp: string) {
  try {
    return new Date(timestamp).toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function SuggestionCard() {
  return (
    <div className="mt-4 flex gap-4 rounded-3xl border border-slate-200 bg-white p-3 shadow-[0_1px_3px_rgba(20,21,26,0.08)]">
      <div className="h-20 w-20 overflow-hidden rounded-2xl bg-slate-50">
        <img src={chatProductImage} alt="추천 리소스" className="h-full w-full object-cover" />
      </div>
      <div className="flex flex-col justify-between text-sm">
        <div>
          <p className="font-semibold text-slate-900">Craftwork Icons</p>
          <p className="text-slate-500">3D, Vector</p>
        </div>
        <p className="font-semibold text-slate-900">$59</p>
      </div>
    </div>
  );
}

function AgentMessage({ message }: { message: ChatMessage }) {
  const showSuggestionCard = /suggestions?/i.test(message.text);

  return (
    <div className="flex w-full max-w-xl gap-4">
      <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white shadow-[0_6px_15px_rgba(0,0,0,0.08)]">
        <img src={agentAvatar} alt="309 avatar" className="h-full w-full object-cover" />
      </div>
      <div className="flex-1 space-y-2">
        <div className="flex items-end gap-2 text-xs text-slate-500">
          <span className="font-semibold text-slate-900">309</span>
          <span>{formatTimestamp(message.timestamp)}</span>
        </div>
        <div className="rounded-[24px] border border-slate-200 bg-white px-5 py-4 text-sm text-slate-800 shadow-[0_1px_3px_rgba(20,21,26,0.08)]">
          {message.text}
          {message.category ? (
            <span className="mt-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">
              #{message.category}
            </span>
          ) : null}
          {showSuggestionCard ? <SuggestionCard /> : null}
        </div>
      </div>
    </div>
  );
}

function VisitorMessage({ message }: { message: ChatMessage }) {
  return (
    <div className="flex w-full justify-end">
      <div className="max-w-xl rounded-[24px] bg-sky-500 px-5 py-4 text-sm text-white shadow-[0_8px_16px_rgba(11,152,255,0.3)]">
        {message.text}
      </div>
    </div>
  );
}

function SystemMessage({ message }: { message: ChatMessage }) {
  return (
    <div className="text-center text-xs font-medium text-slate-400">{message.text}</div>
  );
}

export function ChatPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, setSession } = useSessionContext();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showVisitorModal, setShowVisitorModal] = useState(!session);
  const [incomingQuestion, setIncomingQuestion] = useState<string | null>(null);

  const { messages, appendMessage } = useChatHistory(session?.sessionId);

  useEffect(() => {
    setShowVisitorModal(!session);
  }, [session]);

  const visitorDisplayName = useMemo(() => session?.visitorName || '리크루터', [session]);

  useEffect(() => {
    const state = (location.state as { initialQuestion?: string } | null) ?? null;
    if (state?.initialQuestion) {
      setIncomingQuestion(state.initialQuestion);
      setInput(state.initialQuestion);
      navigate(location.pathname + location.search, { replace: true });
    }
  }, [location, navigate]);

  const handleAsk = async (questionOverride?: string) => {
    if (!session) {
      setShowVisitorModal(true);
      return;
    }

    const question = (questionOverride ?? input).trim();
    if (!question) return;
    appendMessage({ role: 'visitor', text: question });
    if (!questionOverride) {
      setInput('');
    }
    setLoading(true);
    setError(null);
    try {
      const response = await sendQuestion({
        sessionId: session.sessionId,
        question,
      });
      appendMessage({
        role: response.blocked ? 'system' : 'agent',
        text: response.answer,
        blocked: response.blocked,
        category: response.category,
      });
      if (response.blocked) {
        setError(response.reason ?? '질문이 차단되었습니다.');
      }
    } catch (e) {
      setError((e as Error).message);
      appendMessage({
        role: 'system',
        text: '답변을 가져오는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session && incomingQuestion) {
      handleAsk(incomingQuestion);
      setIncomingQuestion(null);
      setInput('');
    }
  }, [session, incomingQuestion]);

  const renderMessage = (message: ChatMessage) => {
    if (message.role === 'system') {
      return <SystemMessage key={message.id} message={message} />;
    }
    if (message.role === 'agent') {
      return <AgentMessage key={message.id} message={message} />;
    }
    return <VisitorMessage key={message.id} message={message} />;
  };

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <NavBar />

      <main className="mx-auto flex w-full max-w-4xl flex-col items-center gap-12 px-6 pb-[180px] pt-4">
        <div className="w-full text-left text-2xl font-semibold leading-snug">
          <p>
            <span className="font-bold">{`${visitorDisplayName}님,`}</span> 이제 대화를 시작해 볼까요?
          </p>
          <p className="text-xl text-slate-500">준비가 끝났습니다. 궁금한 점을 자유롭게 물어보세요.</p>
        </div>

        <section className="w-full space-y-8">
          <div className="flex items-center gap-3 text-xs font-medium text-slate-400">
            <span className="h-px flex-1 bg-slate-200" />
            Chat Started
            <span className="h-px flex-1 bg-slate-200" />
          </div>
          <div className="flex flex-col items-center gap-6">
            {messages.length ? messages.map((message) => renderMessage(message)) : null}
          </div>
        </section>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-2 px-6 py-3">
          <div className="rounded-[28px] border border-slate-200 bg-neutral-100/80 p-1 shadow-[3px_4px_16px_rgba(0,0,0,0.12)]">
            <div className="flex items-center gap-3 rounded-[26px] bg-white px-5 py-3">
              <textarea
                rows={1}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="무엇이든 물어보세요"
                className="min-h-[48px] flex-1 resize-none border-none bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => handleAsk()}
                disabled={loading || !input.trim()}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-white transition hover:bg-slate-800 disabled:bg-slate-300"
                aria-label="질문 보내기"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  className="h-5 w-5"
                >
                  <path d="M5 12h14M13 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-400">
            세션당 최대 3개의 질문이 허용됩니다. 더 깊은 이야기를 원하시면 새로운 세션을 생성해 주세요.
          </p>
          {error ? <p className="text-sm text-rose-500">{error}</p> : null}
        </div>
      </div>

      <VisitorModal
        isOpen={showVisitorModal}
        canClose={Boolean(session)}
        onClose={() => setShowVisitorModal(false)}
        onSuccess={(visitorSession) => {
          setSession(visitorSession);
          setShowVisitorModal(false);
        }}
      />
    </div>
  );
}

