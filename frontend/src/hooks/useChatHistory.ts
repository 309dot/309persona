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
          role: 'agent',
          text: [
            '안녕하세요, 성백곤의 흐름을 재현하는 Flow-Maker Product Designer 309입니다.',
            '복잡한 요구를 정리해 UX·비즈니스·팀 관점에서 현실적인 방향을 드릴게요.',
            '어떤 목적(채용/협업/프로젝트)으로 오셨나요? 그리고 어느 회사에서 오셨는지 알려주시면 맞춰서 답변하겠습니다.',
          ].join(' '),
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

