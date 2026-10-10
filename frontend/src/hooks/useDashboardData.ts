import { useCallback, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';

import { getConversationLogs, getDashboardStats } from '../services/api';
import type { ConversationRecord, DashboardStats } from '../types/api';

interface DashboardData {
  uid: string;
  stats: DashboardStats;
  logs: ConversationRecord[];
}

/**
 * Stats and recent logs for the signed-in admin. Loading and error are derived from
 * which request settled last, so the effect never sets state synchronously.
 */
export function useDashboardData(user: User | null) {
  const [refreshCount, setRefreshCount] = useState(0);
  const [data, setData] = useState<DashboardData | null>(null);
  const [settled, setSettled] = useState<{ key: string; error: string | null } | null>(null);
  const requestKey = user ? `${user.uid}:${refreshCount}` : null;

  useEffect(() => {
    if (!user || !requestKey) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const [stats, logs] = await Promise.all([getDashboardStats(token), getConversationLogs(token, 50)]);
        if (cancelled) return;
        setData({ uid: user.uid, stats, logs });
        setSettled({ key: requestKey, error: null });
      } catch (error) {
        if (!cancelled) setSettled({ key: requestKey, error: (error as Error).message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, requestKey]);

  const refresh = useCallback(() => setRefreshCount((count) => count + 1), []);
  // Never show another admin's previous result after switching accounts.
  const current = user && data?.uid === user.uid ? data : null;

  return {
    stats: current?.stats ?? null,
    logs: current?.logs ?? [],
    loading: requestKey !== null && settled?.key !== requestKey,
    error: settled && settled.key === requestKey ? settled.error : null,
    refresh,
  };
}
