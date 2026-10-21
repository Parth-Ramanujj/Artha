import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { messageStudioApi, sessionApi } from '../../services/api';

const STORAGE_KEY = 'openwa.messageStudio.sessionId';

function remembered(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

/**
 * The WhatsApp number the studio checks and tests against. Its engine decides what can be sent
 * natively (Cloud API) and what falls back. Remembered per browser.
 */
export function useStudioSession() {
  const [sessionId, setSessionIdState] = useState<string>(remembered);
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: sessionApi.list });
  const list = useMemo(() => sessions.data ?? [], [sessions.data]);

  // Default to the first connected number, then the first number, once the list arrives.
  useEffect(() => {
    if (!sessions.isSuccess) return;
    if (sessionId && list.some(s => s.id === sessionId)) return;
    const pick = list.find(s => s.status === 'ready') ?? list[0];
    setSessionIdState(pick?.id ?? '');
  }, [sessions.isSuccess, list, sessionId]);

  const setSessionId = (id: string) => {
    setSessionIdState(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Private mode: the choice just isn't remembered.
    }
  };

  const capabilities = useQuery({
    queryKey: ['message-studio', 'capabilities', sessionId],
    queryFn: () => messageStudioApi.capabilities(sessionId || undefined),
    enabled: sessions.isSuccess,
  });

  return {
    sessionId,
    setSessionId,
    sessions: list,
    sessionsLoading: sessions.isLoading,
    capabilities: capabilities.data,
  };
}
