import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  addLiveErrorListener,
  addLiveMessageListener,
  addLiveStatusListener,
  connectLiveSocketAsync,
  disconnectLiveSocketAsync,
  sendLiveMessageAsync,
  type LiveSocketConnectOptions,
  type LiveSocketMessage,
  type LiveSocketSendInput,
  type LiveSocketStatus,
  type LiveSocketStatusEvent,
} from 'pili-live';

export type {
  LiveSocketConnectOptions,
  LiveSocketMessage,
  LiveSocketSendInput,
  LiveSocketStatus,
  LiveSocketStatusEvent,
} from 'pili-live';

export interface UseLiveSocketOptions {
  onMessage?: (message: LiveSocketMessage) => void;
  onMessagesBatch?: (messages: LiveSocketMessage[]) => void;
  onStatusChange?: (event: LiveSocketStatusEvent) => void;
  onError?: (error: { code: string; message: string }) => void;
  keepAliveInBackground?: boolean;
}

function normalizeNativeMessage(raw: unknown): LiveSocketMessage | null {
  if (raw && typeof raw === 'object') {
    const item = raw as { type?: unknown; data?: unknown };
    // 原生接收路径只产出 parsed（已解析命令对象）；binary 仅用于发送，
    // 原生侧已经完成二进制/zlib 解析，不再透传给 JS。
    if (
      item.type === 'parsed' &&
      item.data !== null &&
      typeof item.data === 'object' &&
      !Array.isArray(item.data)
    ) {
      return { type: 'parsed', data: item.data as Record<string, any> };
    }
  }
  return null;
}

function normalizeStatusEvent(event: Partial<LiveSocketStatusEvent> | null | undefined): LiveSocketStatusEvent {
  const raw = event?.status;
  const status: LiveSocketStatus =
    raw === 'connecting' || raw === 'open' || raw === 'reconnecting' || raw === 'closed'
      ? raw
      : 'closed';
  return {
    status,
    code: typeof event?.code === 'number' ? event.code : undefined,
    reason: typeof event?.reason === 'string' ? event.reason : undefined,
  };
}

export function useLiveSocket(options: UseLiveSocketOptions = {}) {
  const [status, setStatus] = useState<LiveSocketStatus>('closed');

  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  const configRef = useRef<LiveSocketConnectOptions | null>(null);
  const userDisconnectRef = useRef(true);

  const emitMessage = useCallback((message: LiveSocketMessage) => {
    optionsRef.current.onMessage?.(message);
  }, []);

  const emitStatus = useCallback((event: LiveSocketStatusEvent) => {
    setStatus(event.status);
    optionsRef.current.onStatusChange?.(event);
  }, []);

  const emitError = useCallback((code: string, message: string) => {
    optionsRef.current.onError?.({ code, message });
  }, []);

  const connect = useCallback(async (config: LiveSocketConnectOptions): Promise<boolean> => {
    const normalizedConfig: LiveSocketConnectOptions = {
      ...config,
      url: config.url.trim(),
      headers: config.headers ?? {},
    };
    if (!normalizedConfig.url) return false;

    configRef.current = normalizedConfig;
    userDisconnectRef.current = false;
    emitStatus({ status: 'connecting' });

    const started = await connectLiveSocketAsync(normalizedConfig);
    if (started) return true;

    emitError('native_connect_failed', 'Native live socket did not start');
    try {
      await disconnectLiveSocketAsync();
    } catch {
      // ignore cleanup error
    }
    emitStatus({ status: 'closed' });
    return false;
  }, [emitError, emitStatus]);

  const disconnect = useCallback(() => {
    userDisconnectRef.current = true;
    void disconnectLiveSocketAsync().catch(() => {});
    emitStatus({ status: 'closed' });
  }, [emitStatus]);

  const send = useCallback(async (message: LiveSocketSendInput): Promise<boolean> => {
    const ok = await sendLiveMessageAsync(message);
    if (!ok) emitError('send_failed', 'Failed to send live message');
    return ok;
  }, [emitError]);

  const setKeepAliveInBackground = useCallback((value: boolean) => {
    optionsRef.current = { ...optionsRef.current, keepAliveInBackground: value };
  }, []);

  useEffect(() => {
    const subscriptions = [
      addLiveMessageListener((event) => {
        const rawMessages = event?.messages;
        if (!Array.isArray(rawMessages)) return;
        const normalized: LiveSocketMessage[] = [];
        for (const raw of rawMessages) {
          const message = normalizeNativeMessage(raw);
          if (message) normalized.push(message);
        }
        if (normalized.length === 0) return;
        if (optionsRef.current.onMessagesBatch) {
          optionsRef.current.onMessagesBatch(normalized);
          return;
        }
        for (const message of normalized) emitMessage(message);
      }),
      addLiveStatusListener((event) => {
        emitStatus(normalizeStatusEvent(event));
      }),
      addLiveErrorListener((event) => {
        optionsRef.current.onError?.({
          code: typeof event?.code === 'string' ? event.code : 'native_error',
          message: typeof event?.message === 'string' ? event.message : 'Native live socket error',
        });
      }),
    ];
    return () => {
      for (const sub of subscriptions) sub.remove();
    };
  }, [emitMessage, emitStatus]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        if (optionsRef.current.keepAliveInBackground) return;
        void disconnectLiveSocketAsync().catch(() => {});
        emitStatus({ status: 'closed', reason: 'background' });
        return;
      }
      const config = configRef.current;
      if (state === 'active' && config && !userDisconnectRef.current) {
        void connect(config);
      }
    });
    return () => sub.remove();
  }, [connect, emitStatus]);

  useEffect(() => {
    return () => {
      userDisconnectRef.current = true;
      void disconnectLiveSocketAsync().catch(() => {});
    };
  }, []);

  return {
    connect,
    disconnect,
    send,
    setKeepAliveInBackground,
    status,
  };
}
