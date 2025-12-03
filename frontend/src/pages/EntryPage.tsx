import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { Button } from '../components/Button';
import { CategoryChip } from '../components/CategoryChip';
import { Input } from '../components/Input';
import { PageShell } from '../components/PageShell';
import { TextArea } from '../components/TextArea';
import { QUESTION_CATEGORIES } from '../constants/questions';
import { useSessionContext } from '../context/SessionContext';
import { createVisitor } from '../services/api';

export function EntryPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const defaultRef = searchParams.get('ref') ?? 'direct';
  const { session, setSession, clearSession } = useSessionContext();

  const [form, setForm] = useState({
    visitorName: '',
    visitorAffiliation: '',
    visitRef: defaultRef,
    intent: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session) {
      navigate('/chat');
    }
  }, [session, navigate]);

  const highlights = useMemo(
    () => [
      '309의 경력/프로젝트/협업 사례를 기반으로 답변합니다.',
      '질문은 세션당 3개까지 허용되며, 세션은 새로 시작할 수 있습니다.',
      '교란/탈옥 시도는 자동으로 차단됩니다.',
    ],
    [],
  );

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const sessionInfo = await createVisitor({
        visitorName: form.visitorName,
        visitorAffiliation: form.visitorAffiliation,
        visitRef: form.visitRef,
      });
      setSession(sessionInfo);
      navigate('/chat');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageShell
      title="입장하기"
      subtitle="짧은 소개만 남기면 309의 경험을 탐색할 수 있는 인터뷰 에이전트를 바로 사용할 수 있습니다."
      actions={
        session ? (
          <Button variant="secondary" onClick={() => clearSession()}>
            세션 초기화
          </Button>
        ) : null
      }
    >
      <div className="grid gap-6 md:grid-cols-2">
        <section className="glass-panel rounded-3xl p-6">
          <h2 className="text-xl font-semibold text-slate-900">이 서비스에서 할 수 있는 질문</h2>
          <p className="mt-2 text-sm text-slate-500">
            아래 카테고리를 참고하면 309의 경험을 더 입체적으로 살펴볼 수 있습니다.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {QUESTION_CATEGORIES.map((category) => (
              <CategoryChip key={category.id}>{category.label}</CategoryChip>
            ))}
          </div>
          <ul className="mt-6 space-y-3 text-sm text-slate-600">
            {highlights.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span className="mt-1 h-2 w-2 rounded-full bg-brand-400" />
                {item}
              </li>
            ))}
          </ul>
        </section>
        <form onSubmit={handleSubmit} className="glass-panel flex flex-col gap-4 rounded-3xl p-6">
          <h2 className="text-xl font-semibold text-slate-900">방문 정보</h2>
          <Input
            label="이름 또는 이니셜"
            placeholder="예: MJ / Minji"
            value={form.visitorName}
            onChange={(e) => handleChange('visitorName', e.target.value)}
            required
          />
          <Input
            label="소속 / 팀 / 직무"
            placeholder="예: 42Company · Product Lead"
            value={form.visitorAffiliation}
            onChange={(e) => handleChange('visitorAffiliation', e.target.value)}
          />
          <Input
            label="초대 경로 (ref)"
            value={form.visitRef}
            onChange={(e) => handleChange('visitRef', e.target.value)}
            helperText="초대 링크 또는 회사명 등을 남기면 추후 면접 준비에 활용됩니다."
          />
          <TextArea
            label="관심 주제 (선택)"
            placeholder="예: 플랫폼 PM으로 지원 예정이며, 의사결정 사례가 궁금합니다."
            rows={3}
            value={form.intent}
            onChange={(e) => handleChange('intent', e.target.value)}
          />
          {error ? <p className="text-sm text-red-500">{error}</p> : null}
          <Button type="submit" loading={loading} disabled={!form.visitorName}>
            인터뷰 에이전트 시작하기
          </Button>
        </form>
      </div>
    </PageShell>
  );
}

