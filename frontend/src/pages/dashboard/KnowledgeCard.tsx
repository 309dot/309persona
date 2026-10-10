import { BookOpen, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';

import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { getKnowledgeStatus, reloadKnowledge } from '../../services/api';
import type { KnowledgeStatus } from '../../types/api';
import { formatTime } from './format';

const SOURCES: Record<KnowledgeStatus['source'], string> = {
  none: '연결 안 됨 (공개 자료만 사용)',
  local: '로컬 폴더',
  github: '비공개 GitHub 저장소',
};

const KINDS: Record<string, string> = {
  project: '프로젝트',
  career: '경력',
  story: '사례',
  value: '생각',
  skill: '역량',
  note: '노트',
};

/** Private Obsidian notes behind the answers (docs/obsidian-notes.md), with a reload after a sync. */
export function KnowledgeCard({ user }: { user: User }) {
  const [status, setStatus] = useState<KnowledgeStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getKnowledgeStatus(await user.getIdToken());
        if (!cancelled) setStatus(data);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const reload = async () => {
    setReloading(true);
    setError(null);
    try {
      setStatus(await reloadKnowledge(await user.getIdToken()));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setReloading(false);
    }
  };

  const included = status?.notes.filter((note) => note.included).length ?? 0;
  return (
    <Card role="region" aria-label="지식베이스 · 비공개 노트">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" /> 지식베이스 · 비공개 노트
          </CardTitle>
          <Button variant="secondary" onClick={() => void reload()} loading={reloading} disabled={!status}>
            <RefreshCw className="mr-1 h-4 w-4" /> 다시 불러오기
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {error ? <p className="text-rose-500">{error}</p> : null}
        {status ? (
          <>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-slate-600">
              <span>연결: {SOURCES[status.source]}</span>
              <span>노트 {included}개 사용{status.notes_left_out ? ` · ${status.notes_left_out}개 제외(분량 초과)` : ''}</span>
              <span>
                노트 분량 {status.notes_chars.toLocaleString()}자 / {status.notes_max_chars.toLocaleString()}자
              </span>
              <span>프롬프트 전체 {status.prompt_chars.toLocaleString()}자</span>
              {status.loaded_at ? <span>불러온 시각 {formatTime(status.loaded_at)}</span> : null}
            </div>
            {status.error ? <p className="rounded-md bg-rose-50 px-3 py-2 text-rose-600">불러오기 실패: {status.error}</p> : null}
            {status.notes.length ? (
              <ul className="max-h-64 space-y-1 overflow-y-auto">
                {status.notes.map((note) => (
                  <li key={note.id} className="flex items-center justify-between gap-3 rounded-md px-2 py-1 hover:bg-slate-50">
                    <span className="min-w-0 truncate">
                      <span className="font-medium text-slate-900">{note.title}</span>
                      <span className="ml-2 text-xs text-slate-400">{note.path}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
                      {KINDS[note.kind] ?? note.kind} · {note.chars.toLocaleString()}자
                      {note.included ? <Badge>사용</Badge> : <Badge variant="danger">제외</Badge>}
                    </span>
                  </li>
                ))}
              </ul>
            ) : status.source !== 'none' ? (
              <p className="text-slate-500">읽은 노트가 없어요. 폴더 이름(NOTES_SUBDIR)과 저장소를 확인해 주세요.</p>
            ) : null}
            {status.skipped.length ? (
              <p className="text-xs text-slate-500">건너뛴 파일(초안·빈 노트·너무 큰 파일): {status.skipped.join(', ')}</p>
            ) : null}
          </>
        ) : !error ? (
          <p className="text-slate-500">불러오는 중…</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
