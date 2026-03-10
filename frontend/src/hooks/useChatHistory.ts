import { useEffect, useMemo, useState } from 'react';
import { v4 as uuid } from 'uuid';

import type { ChatMessage } from '../types/api';

const HISTORY_PREFIX = 'interview-agent-history';

export function useChatHistory(sessionId?: string) {
  const storageKey = sessionId ? `${HISTORY_PREFIX}-${sessionId}` : null;
  const initialMessages = useMemo<ChatMessage[]>(() => {
    if (!storageKey) return [];
    const cached = localStorage.getItem(storageKey);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        localStorage.removeItem(storageKey);
      }
    }
    return [
      {
        id: uuid(),
        role: 'agent',
        text: '안녕하세요, 309 AI입니다. 편하게 회사명이나 이름을 알려주시면 커피챗을 시작할게요. 😊',
        timestamp: new Date().toISOString(),
      },
    ];
  }, [storageKey]);

  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

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

