import { Activity, BarChart3, Globe2, ListChecks, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { AdminLogin } from '../components/AdminLogin';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { getConversationLogs, getDashboardStats } from '../services/api';
import type { ConversationRecord, DashboardStats } from '../types/api';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';

function metricValue(stats: DashboardStats | null, key: 'ref' | 'referrer' | 'category') {
  if (!stats) return '-';
  if (key === 'ref') return stats.ref_stats?.length ? `${stats.ref_stats[0].label} (${stats.ref_stats[0].value})` : '-';
  if (key === 'referrer')
    return stats.referrer_stats?.length ? `${stats.referrer_stats[0].label} (${stats.referrer_stats[0].value})` : '-';
  return stats.question_categories?.length ? `${stats.question_categories[0].label} (${stats.question_categories[0].value})` : '-';
}

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
    if (auth.user) fetchData();
    else {
      setStats(null);
      setLogs([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.user]);

  if (!auth.supported) {
    return (
      <div className="mx-auto min-h-screen max-w-6xl px-4 py-8 md:px-8">
        <Card className="p-6 text-center text-slate-600">
          Firebase 환경 변수(VITE_FIREBASE_API_KEY 등)가 설정되지 않아 대시보드를 사용할 수 없습니다.
        </Card>
      </div>
    );
  }

  if (auth.loading) {
    return (
      <div className="mx-auto min-h-screen max-w-6xl px-4 py-8 md:px-8">
        <Card className="p-6 text-center text-slate-600">로딩 중입니다...</Card>
      </div>
    );
  }

  if (!auth.user) {
    return (
      <div className="mx-auto min-h-screen max-w-6xl px-4 py-8 md:px-8">
        <div className="mb-6 rounded-xl bg-slate-900 px-6 py-5 text-white">
          <p className="text-xs uppercase tracking-widest text-slate-300">309 Interview Agent</p>
          <h1 className="text-2xl font-semibold">관리자 대시보드</h1>
          <p className="mt-1 text-sm text-slate-300">관리자 계정으로 로그인해 주세요.</p>
        </div>
        <AdminLogin onSubmit={auth.signIn} loading={auth.loading} error={auth.error} />
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-6xl space-y-5 px-4 py-8 md:px-8">
      <div className="rounded-xl bg-slate-900 px-6 py-5 text-white">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-300">309 Interview Agent</p>
            <h1 className="text-2xl font-semibold">관리자 대시보드</h1>
            <p className="mt-1 text-sm text-slate-300">{auth.user.email}님, 운영 지표를 확인해요.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={fetchData} loading={loadingData}>
              <RefreshCw className="mr-1 h-4 w-4" /> 새로고침
            </Button>
            <Button variant="ghost" className="text-white hover:bg-slate-800" onClick={auth.signOut}>
              로그아웃
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Activity className="h-4 w-4" /> 누적 방문자</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{totalVisitors}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Globe2 className="h-4 w-4" /> 주요 Ref</CardTitle></CardHeader>
          <CardContent><p className="text-sm font-medium">{metricValue(stats, 'ref')}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 className="h-4 w-4" /> 주요 유입 사이트</CardTitle></CardHeader>
          <CardContent><p className="text-sm font-medium">{metricValue(stats, 'referrer')}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><ListChecks className="h-4 w-4" /> 자주 묻는 카테고리</CardTitle></CardHeader>
          <CardContent><p className="text-sm font-medium">{metricValue(stats, 'category')}</p></CardContent>
        </Card>
      </div>

      {error ? <p className="text-sm text-rose-500">{error}</p> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>일별 방문</CardTitle></CardHeader>
          <CardContent className="space-y-2">
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>유입 사이트별 통계</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {stats?.referrer_stats?.length ? (
              stats.referrer_stats.map((point) => (
                <div key={point.label} className="flex items-center justify-between text-sm">
                  <span className="truncate text-slate-500">{point.label}</span>
                  <span className="font-semibold text-slate-900">{point.value}명</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">아직 데이터가 없습니다.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>최근 질문 로그</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {logs.length ? (
            logs.map((log) => (
              <div key={log.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <Badge variant={log.is_blocked ? 'danger' : 'default'}>{log.category ?? 'general'}</Badge>
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
                <p className="mt-2 text-sm font-medium text-slate-900">{log.question}</p>
                {log.answer ? (
                  <p className="mt-1 text-sm text-slate-600">{log.answer.length > 180 ? `${log.answer.slice(0, 180)}…` : log.answer}</p>
                ) : null}
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-500">아직 로그가 없습니다.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
