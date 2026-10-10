import {
  Activity,
  BarChart3,
  Eye,
  ListChecks,
  RefreshCw,
  ShieldAlert,
  ThumbsUp,
  Timer,
  TriangleAlert,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';

import { AdminLogin } from '../components/AdminLogin';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { useDashboardData } from '../hooks/useDashboardData';
import type { DashboardStats } from '../types/api';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { formatMs, formatTime } from './dashboard/format';
import { KnowledgeCard } from './dashboard/KnowledgeCard';
import { SessionPanel } from './dashboard/SessionPanel';

function KpiCard({ icon: Icon, title, value, note }: { icon: LucideIcon; title: string; value: string; note?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="h-4 w-4" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{value}</p>
        {note ? <p className="mt-1 text-xs text-slate-500">{note}</p> : null}
      </CardContent>
    </Card>
  );
}

function metricValue(stats: DashboardStats | null, key: 'ref' | 'referrer' | 'category') {
  if (!stats) return '-';
  if (key === 'ref') return stats.ref_stats?.length ? `${stats.ref_stats[0].label} (${stats.ref_stats[0].value})` : '-';
  if (key === 'referrer')
    return stats.referrer_stats?.length ? `${stats.referrer_stats[0].label} (${stats.referrer_stats[0].value})` : '-';
  return stats.question_categories?.length ? `${stats.question_categories[0].label} (${stats.question_categories[0].value})` : '-';
}

export function DashboardPage() {
  const auth = useAdminAuth();
  const { stats, logs, loading: loadingData, error, refresh } = useDashboardData(auth.user);
  const [openSession, setOpenSession] = useState<string | null>(null);

  const kpis = stats?.kpis;
  const totalVisitors = useMemo(() => {
    if (!stats) return 0;
    return stats.daily_visits.reduce((sum, item) => sum + item.value, 0);
  }, [stats]);

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
            <Button variant="secondary" onClick={refresh} loading={loadingData}>
              <RefreshCw className="mr-1 h-4 w-4" /> 새로고침
            </Button>
            <Button variant="ghost" className="text-white hover:bg-slate-800" onClick={auth.signOut}>
              로그아웃
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={Eye} title="방문" value={String(kpis?.visits ?? 0)} note="첫 화면을 연 탭 수(최근 이벤트 기준)" />
        <KpiCard icon={Activity} title="질문한 방문자" value={String(totalVisitors)} />
        <KpiCard icon={BarChart3} title="평균 질문 수/세션" value={String(kpis?.avg_questions_per_session ?? 0)} />
        <KpiCard icon={ListChecks} title="준비도 비율" value={`${kpis?.readiness_rate ?? 0}%`} note="질문 2개 이상, 차단 없음" />
        <KpiCard icon={ShieldAlert} title="차단 응답 비율" value={`${kpis?.blocked_rate ?? 0}%`} />
        <KpiCard icon={TriangleAlert} title="답변 실패율" value={`${kpis?.failure_rate ?? 0}%`} note="LLM 오류로 답하지 못한 비율" />
        <KpiCard
          icon={Timer}
          title="응답 시간 p50"
          value={formatMs(kpis?.latency_p50_ms)}
          note={`첫 글자 ${formatMs(kpis?.first_token_p50_ms)}`}
        />
        <KpiCard
          icon={ThumbsUp}
          title="답변 피드백"
          value={`👍 ${kpis?.feedback_up ?? 0} · 👎 ${kpis?.feedback_down ?? 0}`}
        />
      </div>

      {error ? <p className="text-sm text-rose-500">{error}</p> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>핵심 퍼널 (방문 → 입력 → 첫 답변 → 프로필 → 5질문 → 제안)</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {stats?.funnel_steps?.length ? (
              stats.funnel_steps.map((step) => (
                <div key={step.key} className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">{step.label}</span>
                  <span className="font-semibold text-slate-900">
                    {step.value}
                    {typeof step.conversion_from_prev === 'number' ? ` · ${step.conversion_from_prev}%` : ''}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">아직 퍼널 이벤트 데이터가 없습니다.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>일별 질문 방문자</CardTitle></CardHeader>
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
          <CardHeader><CardTitle>유입 사이트별 질문 방문자</CardTitle></CardHeader>
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

        <Card>
          <CardHeader><CardTitle>요약 인사이트</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><span className="text-slate-500">주요 Ref</span> · <span className="font-semibold">{metricValue(stats, 'ref')}</span></p>
            <p><span className="text-slate-500">주요 카테고리</span> · <span className="font-semibold">{metricValue(stats, 'category')}</span></p>
            <p>
              <span className="text-slate-500">LLM 토큰(최근 로그)</span> ·{' '}
              <span className="font-semibold">
                입력 {(kpis?.prompt_tokens ?? 0).toLocaleString()} · 출력 {(kpis?.completion_tokens ?? 0).toLocaleString()}
              </span>
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>최근 질문 로그 (누르면 그 방문자의 대화 전체)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {logs.length ? (
            logs.map((log) => (
              <button
                key={log.id}
                type="button"
                onClick={() => setOpenSession(log.session_id)}
                className="block w-full rounded-lg border border-slate-200 p-3 text-left transition hover:border-slate-300 hover:bg-slate-50"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                  <div className="flex flex-wrap items-center gap-2">
                    {log.error ? (
                      <Badge variant="danger">답변 실패</Badge>
                    ) : log.is_blocked ? (
                      <Badge variant="danger">차단</Badge>
                    ) : (
                      <Badge>{log.category ?? 'general'}</Badge>
                    )}
                    {log.feedback ? <span>{log.feedback === 'up' ? '👍' : '👎'}</span> : null}
                    {typeof log.latency_ms === 'number' ? <span>{formatMs(log.latency_ms)}</span> : null}
                  </div>
                  <span>{formatTime(log.timestamp)}</span>
                </div>
                <p className="mt-2 text-sm font-medium text-slate-900">{log.question}</p>
                {log.answer ? (
                  <p className="mt-1 text-sm text-slate-600">{log.answer.length > 180 ? `${log.answer.slice(0, 180)}…` : log.answer}</p>
                ) : null}
              </button>
            ))
          ) : (
            <p className="text-sm text-slate-500">아직 로그가 없습니다.</p>
          )}
        </CardContent>
      </Card>

      <KnowledgeCard user={auth.user} />

      {openSession ? (
        <SessionPanel key={openSession} user={auth.user} sessionId={openSession} onClose={() => setOpenSession(null)} />
      ) : null}
    </div>
  );
}
