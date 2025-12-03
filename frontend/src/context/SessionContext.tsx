import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import type { SessionInfo } from '../types/api';

interface SessionContextValue {
  session: SessionInfo | null;
  setSession: (session: SessionInfo) => void;
  clearSession: () => void;
}

const STORAGE_KEY = 'interview-agent-session';

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<SessionInfo | null>(null);

  useEffect(() => {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      try {
        setSessionState(JSON.parse(cached));
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  const setSession = (next: SessionInfo) => {
    setSessionState(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const clearSession = () => {
    setSessionState(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  const value = useMemo(
    () => ({
      session,
      setSession,
      clearSession,
    }),
    [session],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSessionContext() {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error('useSessionContext must be used within SessionProvider');
  }
  return ctx;
}

