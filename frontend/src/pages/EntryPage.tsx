import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { Button } from '../components/Button';
import { NavBar } from '../components/NavBar';
import { VisitorModal } from '../components/VisitorModal';
import { QUESTION_TEMPLATES } from '../constants/questions';
import { useSessionContext } from '../context/SessionContext';

const MAX_SUGGESTIONS = 5;
const QUESTION_HISTORY_KEY = 'entry-question-history';

export function EntryPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const defaultRef = searchParams.get('ref') ?? 'direct';
  const { session, setSession } = useSessionContext();
  const [showVisitorModal, setShowVisitorModal] = useState(!session);
  const [heroIntent, setHeroIntent] = useState('');
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [questionHistory, setQuestionHistory] = useState<string[]>([]);

  useEffect(() => {
    setShowVisitorModal(!session);
  }, [session]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(QUESTION_HISTORY_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setQuestionHistory(parsed);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const displayName = useMemo(() => {
    if (session?.visitorName) return session.visitorName;
    return '리크루터';
  }, [session]);

  const updateHistory = useCallback((question: string) => {
    setQuestionHistory((prev) => {
      const next = [question, ...prev.filter((item) => item !== question)].slice(0, MAX_SUGGESTIONS);
      try {
        localStorage.setItem(QUESTION_HISTORY_KEY, JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }, []);

  const startChat = useCallback(
    (question: string) => {
      if (!question.trim()) return;
      updateHistory(question.trim());
      navigate('/chat', { state: { initialQuestion: question.trim() } });
      setHeroIntent('');
    },
    [navigate, updateHistory],
  );

  const handleHeroInput = (value: string) => {
    setHeroIntent(value);
  };

  const handleHeroSubmit = (event?: React.FormEvent) => {
    if (event) event.preventDefault();
    const trimmed = heroIntent.trim();
    if (!trimmed) {
      return;
    }
    if (!session) {
      setPendingQuestion(trimmed);
      setShowVisitorModal(true);
      return;
    }
    startChat(trimmed);
  };

  useEffect(() => {
    if (session && pendingQuestion) {
      startChat(pendingQuestion);
      setPendingQuestion(null);
    }
  }, [session, pendingQuestion, startChat]);

  const handleSuggestion = (template: string) => {
    setHeroIntent(template);
  };

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <NavBar
        rightSlot={
          session ? (
            <Button variant="pill" onClick={() => setShowVisitorModal(true)}>
              정보 수정
            </Button>
          ) : (
            <Button variant="pill" onClick={() => setShowVisitorModal(true)}>
              정보 입력하기
            </Button>
          )
        }
      />

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-6 pb-20 pt-6 lg:flex-row lg:items-start">
        <section className="flex-1">
          <div className="space-y-4">
            <p className="text-2xl font-bold leading-tight sm:text-[32px]">
              <span className="font-bold">{`${displayName}님,`}</span>
              <br />
              안녕하세요. 🙋‍♂️ 만나서 반갑습니다. 이 서비스는 저의 페르소나가 담긴{' '}
              <span className="text-sky-500">🤖 AI Agent</span> 기반 커피챗 서비스입니다.
            </p>
            <p className="text-2xl font-bold leading-tight sm:text-[32px]">
              궁금한 점이 있다면 편하게 물어보세요.
            </p>
            <p className="text-sm text-slate-500">
              *별건 아니지만 token이 많이 사용될 수록 저의 지갑은 얇아집니다. 🥲
            </p>
          </div>

          <div className="mt-10 space-y-6">
            <form
              onSubmit={handleHeroSubmit}
              className="rounded-full border border-slate-200 bg-neutral-100/60 p-1 pr-1.5 shadow-[3px_4px_16px_rgba(0,0,0,0.12)]"
            >
              <div className="flex items-center gap-3 rounded-full bg-white/90 px-6 py-4 text-base text-slate-500">
                <input
                  type="text"
                  value={heroIntent}
                  onChange={(event) => handleHeroInput(event.target.value)}
                  placeholder="무엇이든 물어보세요"
                  className="flex-1 border-none bg-transparent text-base text-slate-900 placeholder:text-slate-400 focus:outline-none"
                />
                <button
                  type="submit"
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-white transition hover:bg-slate-800 disabled:bg-slate-300"
                  aria-label="관심 주제 입력"
                  disabled={!heroIntent.trim()}
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
            </form>
            <div className="flex flex-wrap gap-2">
              {questionHistory.map((historyQuestion) => (
                <button
                  key={historyQuestion}
                  type="button"
                  onClick={() => handleSuggestion(historyQuestion)}
                  className="flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm transition hover:bg-slate-50"
                >
                  <span className="text-xs text-slate-400">①</span>
                  {historyQuestion}
                </button>
              ))}
              {QUESTION_TEMPLATES.slice(0, MAX_SUGGESTIONS).map((template) => (
                <button
                  key={template}
                  type="button"
                  onClick={() => handleSuggestion(template)}
                  className="rounded-full border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                >
                  {template}
                </button>
              ))}
            </div>
          </div>
        </section>
      </main>

      <VisitorModal
        isOpen={showVisitorModal}
        defaultRef={defaultRef}
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

