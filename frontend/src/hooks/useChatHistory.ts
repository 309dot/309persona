import { useEffect, useState } from 'react';
import { v4 as uuid } from 'uuid';

import type { ChatMessage } from '../types/api';

const HISTORY_PREFIX = 'interview-agent-history';

export function useChatHistory(sessionId?: string) {
  const storageKey = sessionId ? `${HISTORY_PREFIX}-${sessionId}` : null;
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    if (!storageKey) return;
    const cached = localStorage.getItem(storageKey);
    if (cached) {
      try {
        setMessages(JSON.parse(cached));
      } catch {
        localStorage.removeItem(storageKey);
      }
    } else {
      setMessages([
        {
          id: uuid(),
          role: 'system',
          text: '309의 경험을 바탕으로 어떤 점이 궁금한지 물어봐 주세요.',
          timestamp: new Date().toISOString(),
        },
      ]);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey) return;
    localStorage.setItem(storageKey, JSON.stringify(messages));
  }, [messages, storageKey]);

  const appendMessage = (message: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    setMessages((prev) => [
      ...prev,
      {
        ...message,
        id: uuid(),
        timestamp: new Date().toISOString(),
      },
    ]);
  };

  const clearHistory = () => {
    if (storageKey) {
      localStorage.removeItem(storageKey);
    }
    setMessages([]);
  };

  return { messages, appendMessage, clearHistory };
}

