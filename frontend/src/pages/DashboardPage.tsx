import { useEffect, useMemo, useState } from 'react';

import { AdminLogin } from '../components/AdminLogin';
import { Button } from '../components/Button';
import { PageShell } from '../components/PageShell';
import { StatCard } from '../components/StatCard';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { getConversationLogs, getDashboardStats } from '../services/api';
import type { ConversationRecord, DashboardStats } from '../types/api';

export function DashboardPage() {
  const auth = useAdminAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [logs, setLogs] = useState<ConversationRecord[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalVisitors = useMemo(() => {
    if (!stats) return 0;
    return stats.daily_visits.reduce((sum, item) => sum + item.value, 0);
  }, [stats]);

  const popularRef = useMemo(() => {
    if (!stats?.ref_stats?.length) return '-';
    return `${stats.ref_stats[0].label} (${stats.ref_stats[0].value})`;
  }, [stats]);

  const popularCategory = useMemo(() => {
    if (!stats?.question_categories?.length) return '-';
    return `${stats.question_categories[0].label} (${stats.question_categories[0].value})`;
  }, [stats]);

  const fetchData = async () => {
    if (!auth.user) return;
    setLoadingData(true);
    setError(null);
    try {
      const token = await auth.user.getIdToken();
      const [statsResponse, logsResponse] = await Promise.all([
        getDashboardStats(token),
        getConversationLogs(token, 50),
      ]);
      setStats(statsResponse);
      setLogs(logsResponse);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (auth.user) {
      fetchData();
    } else {
      setStats(null);
      setLogs([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.user]);

  if (!auth.supported) {
    return (
      <PageShell title="관리자 대시보드" subtitle="Firebase 설정이 필요합니다.">
        <div className="glass-panel rounded-3xl p-6 text-center text-slate-600">
          <p>
            Firebase 환경 변수(VITE_FIREBASE_API_KEY 등)가 설정되지 않아 대시보드를 사용할 수
            없습니다.
          </p>
        </div>
      </PageShell>
    );
  }

  if (auth.loading) {
    return (
      <PageShell title="관리자 대시보드">
        <div className="glass-panel rounded-3xl p-6 text-center text-slate-600">
          로딩 중입니다...
        </div>
      </PageShell>
    );
  }

  if (!auth.user) {
    return (
      <PageShell title="관리자 대시보드" subtitle="관리자 계정으로 로그인해 주세요.">
        <AdminLogin onSubmit={auth.signIn} loading={auth.loading} error={auth.error} />
      </PageShell>
    );
  }

  return (
    <PageShell
      title="관리자 대시보드"
      subtitle={`${auth.user.email}님, 방문자 현황을 확인할 수 있습니다.`}
      actions={
        <Button variant="secondary" onClick={auth.signOut}>
          로그아웃
        </Button>
      }
    >
      <div className="flex flex-wrap gap-4">
        <StatCard label="누적 방문자" value={totalVisitors} />
        <StatCard label="주요 유입 경로" value={popularRef} />
        <StatCard label="많이 묻는 카테고리" value={popularCategory} />
      </div>
      {error ? <p className="text-sm text-rose-500">{error}</p> : null}
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="glass-panel rounded-3xl p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">일별 방문</h3>
            <Button variant="ghost" onClick={fetchData} loading={loadingData}>
              새로고침
            </Button>
          </div>
          <div className="mt-4 space-y-2">
            {stats?.daily_visits.length ? (
              stats.daily_visits.map((point) => (
                <div key={point.label} className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">{point.label}</span>
                  <span className="font-semibold text-slate-900">{point.value}명</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">아직 데이터가 없습니다.</p>
            )}
          </div>
        </div>
        <div className="glass-panel rounded-3xl p-6">
          <h3 className="text-base font-semibold text-slate-900">최근 질문</h3>
          <div className="mt-4 space-y-3">
            {logs.length ? (
              logs.map((log) => (
                <div
                  key={log.id}
                  className="rounded-2xl border border-slate-100 bg-white/80 p-4 text-sm shadow-sm"
                >
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>{log.category ?? 'general'}</span>
                    <span>
                      {log.timestamp
                        ? new Date(log.timestamp).toLocaleString('ko-KR', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '방금'}
                    </span>
                  </div>
                  <p className="mt-2 font-medium text-slate-900">{log.question}</p>
                  {log.answer ? (
                    <p className="mt-1 text-sm text-slate-600">
                      {log.answer.length > 140 ? `${log.answer.slice(0, 140)}…` : log.answer}
                    </p>
                  ) : null}
                  {log.is_blocked ? (
                    <span className="mt-2 inline-flex rounded-full bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-600">
                      차단됨
                    </span>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">아직 로그가 없습니다.</p>
            )}
          </div>
        </div>
      </section>
    </PageShell>
  );
}

