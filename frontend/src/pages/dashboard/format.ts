export function formatMs(ms?: number | null): string {
  if (typeof ms !== 'number') return '-';
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}초`;
}

export function formatTime(timestamp?: string): string {
  if (!timestamp) return '방금';
  return new Date(timestamp).toLocaleString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
