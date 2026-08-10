import { requireNativeModule, type EventSubscription } from 'expo-modules-core';

type LiveSocketSendMessage =
  | { type: 'text'; text: string }
  | { type: 'binary'; data: Uint8Array };

export type LiveSocketMessage = { type: 'parsed'; data: Record<string, any> };

export type LiveSocketSendInput =
  | string
  | Uint8Array
  | ArrayBuffer
  | LiveSocketSendMessage;

export type LiveSocketStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

export type LiveSocketStatusEvent = {
  status: LiveSocketStatus;
  code?: number;
  reason?: string;
};

type LiveSocketErrorEvent = {
  code: string;
  message: string;
};

type LiveSocketJoinOptions = {
  roomId: number;
  token: string;
  uid?: number;
  platform?: string;
  protover?: number;
};

export type LiveSocketConnectOptions = {
  url: string;
  headers?: Record<string, string>;
  heartbeatIntervalMs?: number;
  join?: LiveSocketJoinOptions;
  maxReconnectDelayMs?: number;
  batchIntervalMs?: number;
  autoReconnect?: boolean;
};

type NativeMessagesEvent = {
  messages: LiveSocketMessage[];
};

type NativePiliLiveModule = {
  isAvailableAsync(): Promise<boolean>;
  connectAsync(
    url: string,
    headers: Record<string, string>,
    heartbeatIntervalMs: number,
    options: {
      join?: LiveSocketJoinOptions;
      maxReconnectDelayMs?: number;
      batchIntervalMs?: number;
      autoReconnect?: boolean;
    },
  ): Promise<boolean>;
  disconnectAsync(): Promise<void>;
  sendAsync(message: LiveSocketSendMessage): Promise<boolean>;
  addListener(
    eventName: 'onMessages' | 'onStatusChange' | 'onError',
    listener: (event: any) => void,
  ): EventSubscription;
};

const NativeModule = requireNativeModule<NativePiliLiveModule>('PiliLive');

function normalizeSendInput(message: LiveSocketSendInput): LiveSocketSendMessage {
  if (typeof message === 'string') {
    return { type: 'text', text: message };
  }
  if (message instanceof Uint8Array) {
    return { type: 'binary', data: message };
  }
  if (message instanceof ArrayBuffer) {
    return { type: 'binary', data: new Uint8Array(message) };
  }
  if (ArrayBuffer.isView(message)) {
    return {
      type: 'binary',
      data: new Uint8Array(message.buffer, message.byteOffset, message.byteLength),
    };
  }
  if (message.type === 'text') {
    return { type: 'text', text: message.text };
  }
  return { type: 'binary', data: message.data };
}

export async function connectLiveSocketAsync(options: LiveSocketConnectOptions): Promise<boolean> {
  return await NativeModule.connectAsync(
    options.url,
    options.headers ?? {},
    options.heartbeatIntervalMs ?? 30000,
    {
      join: options.join ?? undefined,
      maxReconnectDelayMs: options.maxReconnectDelayMs ?? 30000,
      batchIntervalMs: options.batchIntervalMs ?? 150,
      autoReconnect: options.autoReconnect ?? true,
    },
  );
}

export async function disconnectLiveSocketAsync(): Promise<void> {
  await NativeModule.disconnectAsync();
}

export async function sendLiveMessageAsync(message: LiveSocketSendInput): Promise<boolean> {
  return await NativeModule.sendAsync(normalizeSendInput(message));
}

export function addLiveMessageListener(listener: (event: NativeMessagesEvent) => void): EventSubscription {
  return NativeModule.addListener('onMessages', listener);
}

export function addLiveStatusListener(listener: (event: LiveSocketStatusEvent) => void): EventSubscription {
  return NativeModule.addListener('onStatusChange', listener);
}

export function addLiveErrorListener(listener: (event: LiveSocketErrorEvent) => void): EventSubscription {
  return NativeModule.addListener('onError', listener);
}
