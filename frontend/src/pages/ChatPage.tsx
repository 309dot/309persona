import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '../components/Button';
import { ChatBubble } from '../components/ChatBubble';
import { PageShell } from '../components/PageShell';
import { TextArea } from '../components/TextArea';
import { QUESTION_TEMPLATES } from '../constants/questions';
import { useSessionContext } from '../context/SessionContext';
import { useChatHistory } from '../hooks/useChatHistory';
import { sendQuestion } from '../services/api';

export function ChatPage() {
  const navigate = useNavigate();
  const { session } = useSessionContext();
  const { messages, appendMessage, clearHistory } = useChatHistory(session?.sessionId);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) {
      navigate('/');
    }
  }, [session, navigate]);

  const heroSubtitle = useMemo(() => {
    if (!session) return '';
    const chunk = [session.visitorName, session.visitorAffiliation, session.visitRef]
      .filter(Boolean)
      .join(' · ');
    return chunk ? `${chunk} 님의 세션` : '방문 정보를 바탕으로 세션이 생성되었습니다.';
  }, [session]);

  const handleAsk = async () => {
    if (!session || !input.trim()) return;
    const question = input.trim();
    appendMessage({ role: 'visitor', text: question });
    setInput('');
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
      const message = (e as Error).message;
      setError(message);
      appendMessage({
        role: 'system',
        text: '답변을 가져오는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTemplateClick = (template: string) => {
    setInput(template);
  };

  if (!session) {
    return null;
  }

  return (
    <PageShell title="질문하기" subtitle={heroSubtitle}>
      <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <section className="glass-panel flex h-[70vh] flex-col gap-4 rounded-3xl p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">대화</h2>
            <Button variant="ghost" onClick={clearHistory}>
              대화 리셋
            </Button>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto pr-2">
            {messages.map((message) => (
              <ChatBubble key={message.id} message={message} />
            ))}
          </div>
          <div className="flex flex-col gap-3">
            <TextArea
              placeholder="309에게 묻고 싶은 내용을 입력하세요."
              rows={3}
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            {error ? <p className="text-sm text-rose-500">{error}</p> : null}
            <div className="flex items-center gap-3">
              <Button onClick={handleAsk} loading={loading} disabled={!input.trim()}>
                질문 보내기
              </Button>
              <p className="text-xs text-slate-500">
                세션당 최대 3개의 질문만 허용됩니다. 궁금한 주제를 압축해 주세요.
              </p>
            </div>
          </div>
        </section>
        <aside className="glass-panel flex flex-col gap-4 rounded-3xl p-6">
          <div>
            <h3 className="text-base font-semibold text-slate-900">추천 질문 템플릿</h3>
            <p className="text-sm text-slate-500">클릭하면 입력창에 자동으로 채워집니다.</p>
          </div>
          <div className="flex flex-col gap-2">
            {QUESTION_TEMPLATES.map((template) => (
              <button
                key={template}
                type="button"
                onClick={() => handleTemplateClick(template)}
                className="rounded-2xl border border-slate-100 bg-white/80 px-4 py-3 text-left text-sm text-slate-700 transition hover:border-brand-200 hover:bg-brand-50"
              >
                {template}
              </button>
            ))}
          </div>
          <div className="mt-4">
            <h4 className="text-sm font-semibold uppercase tracking-widest text-slate-500">
              가이드
            </h4>
            <p className="mt-2 text-sm text-slate-600">
              프로젝트 맥락, 협업 방식, 문제 해결 사례, PM 관점에서의 의사결정 질문이 가장 좋은
              답변을 받을 수 있습니다. 309와 무관한 질문은 시스템에서 자동 거절됩니다.
            </p>
          </div>
        </aside>
      </div>
    </PageShell>
  );
}

