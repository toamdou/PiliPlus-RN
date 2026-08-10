import React from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { requireNativeModule, requireNativeViewManager } from 'expo-modules-core';

export type NativeRequestOptions = {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | string;
  headers?: Record<string, string>;
  body?: string;
  requestId?: string;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  useSystemProxy?: boolean;
  skipCookies?: boolean;
  proxyHost?: string;
  proxyPort?: number;
  enableHttp2?: boolean;
  badCertificateCallback?: boolean;
  maxCacheSize?: number;
  responseType?: 'text' | 'arraybuffer' | 'json';
};

export type NativeRequestResult = {
  status: number;
  ok: boolean;
  data: string | Record<string, any> | any[];
  headers: Record<string, string>;
  url: string;
};

export type NativeBinaryResponseResult = {
  status: number;
  ok: boolean;
  data: Uint8Array;
  headers: Record<string, string>;
  setCookieHeaders?: string[];
  url: string;
};

export type QRCodePollEvent = {
  code: number;
  message?: string;
  data?: any;
};

export type SleepTimerFiredEvent = {
  seconds: number;
};

export type PowerState = {
  lowPowerMode: boolean;
  thermalState: 'nominal' | 'fair' | 'serious' | 'critical';
  batteryLevel: number;
  batteryState: 'unknown' | 'charging' | 'full' | 'unplugged';
};

export type DownloadProgressEvent = {
  id: string;
  fractionCompleted: number;
  bytesWritten: number;
  totalBytesExpected: number;
};

export type DownloadCompleteEvent = {
  id: string;
  uri?: string;
  error?: string;
};

export type DownloadPendingCompletion = {
  id: string;
  uri?: string;
  error?: string;
};

export type DownloadStateChangeEvent = {
  id: string;
  state: 'waiting' | 'paused' | 'resumed' | 'error';
};

export type NativeDownloadStatus = 'downloading' | 'done' | 'error' | 'paused';

export type NativeDownloadRecord = {
  id: string;
  title: string;
  pic: string;
  url: string;
  destination: string;
  path: string;
  createdAt: number;
  status: NativeDownloadStatus;
  progress: number;
  error?: string;
};

export type DynamicCheckResult = {
  success: boolean;
  newCount: number;
  latestId: string | null;
  lastSeenId: string | null;
};

export type NativeUploadOptions = {
  url: string;
  fileUri: string;
  requestId?: string;
  fileName?: string;
  mimeType?: string;
  category?: string;
  biz?: string;
  csrf?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  useSystemProxy?: boolean;
  skipCookies?: boolean;
  proxyHost?: string;
  proxyPort?: number;
  enableHttp2?: boolean;
  badCertificateCallback?: boolean;
  responseType?: 'text' | 'arraybuffer' | 'json';
};

export type NativeUploadResult = {
  status: number;
  ok: boolean;
  data: string | Record<string, any> | any[];
  headers: Record<string, string>;
  url: string;
};

export type NativeCookieInput = {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: 'strict' | 'lax' | 'none';
};

export type NativeDetailedCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number | null;
  secure: boolean;
  httpOnly: boolean;
  sameSite: 'strict' | 'lax' | 'none';
};

export type NativeAccountRecord = {
  mid: number;
  name: string;
  face: string;
  accessKey: string;
  userInfo: Record<string, any>;
  cookies?: NativeCookieInput[];
};

export type NativeAccountStore = {
  records: NativeAccountRecord[];
  currentIndex: number;
  anonymousMode: boolean;
  activeAccessKey: string | null;
};

export type BackgroundCheckOptions = {
  minimumIntervalMinutes: number;
  accountId?: string;
  mixinKey?: string;
  badgeMode?: number;
};

export type PiliImageViewerProps = {
  visible: boolean;
  images: string[];
  initialIndex?: number;
  contextMenuEnabled?: boolean;
  onClose?: () => void;
  onIndexChange?: (event: { nativeEvent?: { index?: number }; index?: number }) => void;
  style?: StyleProp<ViewStyle>;
};

type NativeCoreModule = {
  isAvailableAsync(): Promise<boolean>;
  configureNetworkAsync(options: Partial<NativeRequestOptions>): Promise<void>;
  setSettingsSnapshotAsync(json: string): Promise<boolean>;
  getSettingsSnapshotAsync(): Promise<string | null>;
  setRecommendCacheAsync(json: string): Promise<boolean>;
  getRecommendCacheAsync(): Promise<string | null>;
  clearNetworkCachesAsync(): Promise<void>;
  setDownloadProgressEventsEnabledAsync(enabled: boolean): Promise<void>;
  getBrightness(): number;
  setBrightness(value: number): void;
  signAppParamsAsync(params: Record<string, any>): Promise<Record<string, any>>;
  wbiSignAsync(params: Record<string, any>, mixinKey: string): Promise<Record<string, any>>;
  ensureWbiMixinKeyAsync(): Promise<string>;
  encryptLoginRSAAsync(plaintext: string, pemKey: string): Promise<string>;
  md5HexAsync(input: string): Promise<string>;
  generateLoginBuvidAsync(): Promise<string>;
  getOrCreateLoginBuvidAsync(): Promise<string>;
  randomHexAsync(length: number, upper: boolean): Promise<string>;
  randomAlnumAsync(length: number): Promise<string>;
  randomBase64StringAsync(length: number): Promise<string>;
  generateUploadIdAsync(prefix: string): Promise<string>;
  generateBuvid3Async(): Promise<string>;
  nativeRequestAsync(
    options: NativeRequestOptions,
    bodyData: Uint8Array,
  ): Promise<NativeRequestResult>;
  nativeBinaryRequestAsync(
    options: NativeRequestOptions,
    bodyData: Uint8Array,
  ): Promise<Uint8Array>;
  nativeBinaryRequestWithHeadersAsync(
    options: NativeRequestOptions,
    bodyData: Uint8Array,
  ): Promise<NativeBinaryResponseResult>;
  cancelRequestAsync(requestId: string): Promise<void>;
  resolveShortLinkAsync(url: string): Promise<string | null>;
  uploadFileAsync(options: NativeUploadOptions): Promise<NativeUploadResult>;
  saveImageToPhotosAsync(uri: string): Promise<boolean>;
  startDownloadAsync(
    url: string,
    destinationPath: string,
    title: string,
    pic: string,
    id: string | null,
  ): Promise<string>;
  fetchDownloadsAsync(): Promise<NativeDownloadRecord[]>;
  replaceDownloadRecordsAsync(records: NativeDownloadRecord[]): Promise<boolean>;
  removeDownloadRecordAsync(id: string): Promise<boolean>;
  clearDownloadsAsync(): Promise<boolean>;
  cancelDownloadAsync(id: string): Promise<boolean>;
  fetchPendingCompletionsAsync(): Promise<DownloadPendingCompletion[]>;
  ackDownloadCompletionAsync(id: string): Promise<void>;
  nativeGetCookiesDetailedAsync(domain: string): Promise<NativeDetailedCookie[]>;
  nativeSetCookiesAsync(cookies: NativeCookieInput[]): Promise<boolean>;
  nativeClearCookiesAsync(): Promise<boolean>;
  nativeGetStringAsync(key: string): Promise<string | null>;
  nativeSetStringAsync(key: string, value: string): Promise<boolean>;
  nativeRemoveStringAsync(key: string): Promise<boolean>;
  nativeGetKeysByPrefixAsync(prefix: string): Promise<string[]>;
  getCacheSizeBytesAsync(): Promise<number>;
  clearCacheFilesAsync(): Promise<boolean>;
  getDocumentsDirectoryPathAsync(): Promise<string>;
  writeTextFileAsync(path: string, content: string): Promise<boolean>;
  readTextFileAsync(path: string): Promise<string | null>;
  getAccountRecordsAsync(): Promise<NativeAccountStore | null>;
  setAccountRecordsAsync(
    records: NativeAccountRecord[],
    currentIndex: number,
    anonymousMode: boolean,
  ): Promise<boolean>;
  setActiveAccountAsync(
    key: string,
    records: NativeAccountRecord[],
    currentIndex: number,
    anonymousMode: boolean,
    cookies: NativeCookieInput[],
  ): Promise<boolean>;
  clearAccountRecordsAsync(): Promise<boolean>;
  copyTextAsync(text: string): Promise<boolean>;
  readClipboardAsync(): Promise<string | null>;
  shareTextAsync(text: string): Promise<boolean>;
  shareFileAsync(uri: string): Promise<boolean>;
  createQRCodeAsync(text: string, size: number): Promise<string>;
  registerBackgroundDynamicCheckAsync(options: BackgroundCheckOptions): Promise<boolean>;
  unregisterBackgroundDynamicCheckAsync(): Promise<boolean>;
  resetDynamicAccountAsync(): Promise<boolean>;
  clearDynamicNotificationsAsync(): Promise<void>;
  setDynamicBadgeCountAsync(count: number): Promise<boolean>;
  markDynamicReadAsync(): Promise<boolean>;
  startSleepTimerAsync(seconds: number): Promise<void>;
  cancelSleepTimerAsync(): Promise<void>;
  getSleepRemainingAsync(): Promise<number>;
  showToastAsync(message: string, durationMs: number, announce?: boolean): Promise<boolean>;
  getLogsAsync(limit: number): Promise<string[]>;
  clearLogsAsync(): Promise<void>;
  getPowerStateAsync(): Promise<PowerState>;
  presentTextInputAsync(
    title: string,
    message: string | null,
    initialValue: string,
  ): Promise<string | null>;
  startDynamicPollingAsync(intervalMs: number): Promise<void>;
  startQRCodePollingAsync(authCode: string, intervalMs: number): Promise<void>;
  stopDynamicPollingAsync(): Promise<void>;
  stopQRCodePollingAsync(): Promise<void>;
  addListener(
    eventName: 'onDynamicCheck',
    listener: (event: DynamicCheckResult) => void,
  ): { remove(): void };
  addListener(
    eventName: 'onQRCodePoll',
    listener: (event: QRCodePollEvent) => void,
  ): { remove(): void };
  addListener(
    eventName: 'onDownloadProgress',
    listener: (event: DownloadProgressEvent) => void,
  ): { remove(): void };
  addListener(
    eventName: 'onDownloadComplete',
    listener: (event: DownloadCompleteEvent) => void,
  ): { remove(): void };
  addListener(
    eventName: 'onDownloadStateChange',
    listener: (event: DownloadStateChangeEvent) => void,
  ): { remove(): void };
  addListener(
    eventName: 'onPowerStateChange',
    listener: (event: PowerState) => void,
  ): { remove(): void };
  addListener(
    eventName: 'onSleepTimerFired',
    listener: (event: SleepTimerFiredEvent) => void,
  ): { remove(): void };
};

const NativeModule = requireNativeModule<NativeCoreModule>('PiliNativeCore');

const NativeImageViewer = requireNativeViewManager('PiliNativeCore', 'PiliImageViewer');

export async function configureNetworkAsync(
  options: Partial<NativeRequestOptions>,
): Promise<void> {
  if (!NativeModule) throw new Error('PiliNativeCore is unavailable');
  await NativeModule.configureNetworkAsync(options);
}

export async function setSettingsSnapshotAsync(json: string): Promise<void> {
  await NativeModule.setSettingsSnapshotAsync(json);
}

export async function getSettingsSnapshotAsync(): Promise<string | null> {
  return await NativeModule.getSettingsSnapshotAsync();
}

export async function setRecommendCache(json: string): Promise<void> {
  await NativeModule.setRecommendCacheAsync(json);
}

export async function getRecommendCache(): Promise<string | null> {
  return await NativeModule.getRecommendCacheAsync();
}

export async function clearNetworkCaches(): Promise<void> {
  if (!NativeModule) throw new Error('PiliNativeCore is unavailable');
  await NativeModule.clearNetworkCachesAsync();
}

let downloadProgressListenerCount = 0;

export function getBrightness(): number {
  if (!NativeModule) throw new Error('PiliNativeCore is unavailable');
  return NativeModule.getBrightness();
}

export function setBrightness(value: number): void {
  if (!NativeModule) throw new Error('PiliNativeCore is unavailable');
  NativeModule.setBrightness(value);
}

export async function signAppParamsAsync(
  params: Record<string, any>,
): Promise<Record<string, any>> {
  if (!NativeModule) throw new Error('PiliNativeCore is unavailable');
  return await NativeModule.signAppParamsAsync(params);
}

export async function wbiSignAsync(
  params: Record<string, any>,
  mixinKey: string,
): Promise<Record<string, any>> {
  if (!NativeModule) throw new Error('PiliNativeCore is unavailable');
  return await NativeModule.wbiSignAsync(params, mixinKey);
}

export async function ensureWbiMixinKeyAsync(): Promise<string> {
  return await NativeModule.ensureWbiMixinKeyAsync();
}

export async function encryptLoginRSAAsync(plaintext: string, pemKey: string): Promise<string> {
  if (!NativeModule) throw new Error('PiliNativeCore is unavailable');
  return await NativeModule.encryptLoginRSAAsync(plaintext, pemKey);
}

export async function md5HexAsync(input: string): Promise<string> {
  if (!NativeModule) throw new Error('PiliNativeCore is unavailable');
  return await NativeModule.md5HexAsync(input);
}

export async function generateLoginBuvidAsync(): Promise<string> {
  if (!NativeModule) throw new Error('PiliNativeCore is unavailable');
  return await NativeModule.generateLoginBuvidAsync();
}

export async function getOrCreateLoginBuvidAsync(): Promise<string> {
  if (!NativeModule) throw new Error('PiliNativeCore is unavailable');
  return await NativeModule.getOrCreateLoginBuvidAsync();
}

export async function randomHexAsync(length: number, upper = false): Promise<string> {
  if (!NativeModule) throw new Error('PiliNativeCore is unavailable');
  return await NativeModule.randomHexAsync(length, upper);
}

export async function randomAlnumAsync(length: number): Promise<string> {
  if (!NativeModule) throw new Error('PiliNativeCore is unavailable');
  return await NativeModule.randomAlnumAsync(length);
}

export async function randomBase64StringAsync(length: number): Promise<string> {
  if (!NativeModule) throw new Error('PiliNativeCore is unavailable');
  return await NativeModule.randomBase64StringAsync(length);
}

export async function generateUploadIdAsync(prefix: string): Promise<string> {
  if (!NativeModule) throw new Error('PiliNativeCore is unavailable');
  return await NativeModule.generateUploadIdAsync(prefix);
}

export async function generateBuvid3Async(): Promise<string> {
  if (!NativeModule) throw new Error('PiliNativeCore is unavailable');
  return await NativeModule.generateBuvid3Async();
}

export async function nativeRequestAsync(
  options: NativeRequestOptions,
  bodyData: Uint8Array = new Uint8Array(0),
): Promise<NativeRequestResult> {
  if (!NativeModule) throw new Error('PiliNativeCore is unavailable');
  return await NativeModule.nativeRequestAsync(options, bodyData);
}

export async function nativeBinaryRequestAsync(
  options: NativeRequestOptions,
  bodyData: Uint8Array = new Uint8Array(0),
): Promise<Uint8Array> {
  if (!NativeModule) throw new Error('PiliNativeCore is unavailable');
  return await NativeModule.nativeBinaryRequestAsync(options, bodyData);
}

export async function nativeBinaryRequestWithHeadersAsync(
  options: NativeRequestOptions,
  bodyData: Uint8Array = new Uint8Array(0),
): Promise<NativeBinaryResponseResult> {
  if (!NativeModule) throw new Error('PiliNativeCore is unavailable');
  return await NativeModule.nativeBinaryRequestWithHeadersAsync(options, bodyData);
}

export async function cancelNativeRequest(requestId: string): Promise<void> {
  await NativeModule.cancelRequestAsync(requestId);
}

export async function saveImageToPhotosAsync(uri: string): Promise<boolean> {
  if (!NativeModule) throw new Error('PiliNativeCore is unavailable');
  return await NativeModule.saveImageToPhotosAsync(uri);
}

export async function resolveShortLinkAsync(url: string): Promise<string | null> {
  try {
    const location = await NativeModule.resolveShortLinkAsync(url);
    return location || null;
  } catch {
    return null;
  }
}

export async function getLogs(limit = 200): Promise<string[]> {
  return await NativeModule.getLogsAsync(limit);
}

export async function clearLogs(): Promise<void> {
  await NativeModule.clearLogsAsync();
}

export async function uploadFileAsync(
  options: NativeUploadOptions,
): Promise<NativeUploadResult> {
  if (!NativeModule) throw new Error('PiliNativeCore is unavailable');
  return await NativeModule.uploadFileAsync(options);
}

export async function startDownload(
  url: string,
  destinationPath: string,
  title = '',
  pic = '',
  id: string | null = null,
): Promise<string | null> {
  return await NativeModule.startDownloadAsync(url, destinationPath, title, pic, id);
}

export async function fetchDownloads(): Promise<NativeDownloadRecord[]> {
  if (!NativeModule) throw new Error('PiliNativeCore is unavailable');
  return await NativeModule.fetchDownloadsAsync();
}

export async function replaceDownloadRecords(
  records: NativeDownloadRecord[],
): Promise<void> {
  if (!NativeModule) throw new Error('PiliNativeCore is unavailable');
  await NativeModule.replaceDownloadRecordsAsync(records);
}

export async function removeDownloadRecord(id: string): Promise<void> {
  if (!NativeModule) throw new Error('PiliNativeCore is unavailable');
  await NativeModule.removeDownloadRecordAsync(id);
}

export async function clearNativeDownloads(): Promise<void> {
  if (!NativeModule) throw new Error('PiliNativeCore is unavailable');
  await NativeModule.clearDownloadsAsync();
}

export async function cancelDownload(id: string): Promise<boolean> {
  return await NativeModule.cancelDownloadAsync(id);
}

export async function fetchPendingCompletions(): Promise<DownloadPendingCompletion[]> {
  return await NativeModule.fetchPendingCompletionsAsync();
}

export async function ackDownloadCompletion(id: string): Promise<void> {
  await NativeModule.ackDownloadCompletionAsync(id);
}

export function addDownloadProgressListener(
  listener: (event: DownloadProgressEvent) => void,
): (() => void) | null {
  downloadProgressListenerCount += 1;
  void NativeModule.setDownloadProgressEventsEnabledAsync(true).catch(() => {});
  const subscription = NativeModule.addListener('onDownloadProgress', listener);
  return () => {
    subscription.remove();
    downloadProgressListenerCount = Math.max(0, downloadProgressListenerCount - 1);
    if (downloadProgressListenerCount === 0) {
      void NativeModule.setDownloadProgressEventsEnabledAsync(false).catch(() => {});
    }
  };
}

export function addDownloadCompleteListener(
  listener: (event: DownloadCompleteEvent) => void,
): (() => void) | null {
  const subscription = NativeModule.addListener('onDownloadComplete', listener);
  return () => subscription.remove();
}

export function addDownloadStateChangeListener(
  listener: (event: DownloadStateChangeEvent) => void,
): (() => void) | null {
  const subscription = NativeModule.addListener('onDownloadStateChange', listener);
  return () => subscription.remove();
}

export async function nativeGetCookiesDetailedAsync(domain: string): Promise<NativeDetailedCookie[]> {
  if (!NativeModule) throw new Error('PiliNativeCore is unavailable');
  return await NativeModule.nativeGetCookiesDetailedAsync(domain);
}

export async function nativeSetCookiesAsync(cookies: NativeCookieInput[]): Promise<boolean> {
  if (!NativeModule) throw new Error('PiliNativeCore is unavailable');
  return await NativeModule.nativeSetCookiesAsync(cookies);
}

export async function nativeClearCookiesAsync(): Promise<boolean> {
  if (!NativeModule) throw new Error('PiliNativeCore is unavailable');
  return await NativeModule.nativeClearCookiesAsync();
}

export async function nativeGetString(key: string): Promise<string | null> {
  return await NativeModule.nativeGetStringAsync(key);
}

export async function nativeSetString(key: string, value: string): Promise<boolean> {
  if (!NativeModule) throw new Error('PiliNativeCore is unavailable');
  return await NativeModule.nativeSetStringAsync(key, value);
}

export async function nativeRemoveString(key: string): Promise<boolean> {
  if (!NativeModule) throw new Error('PiliNativeCore is unavailable');
  return await NativeModule.nativeRemoveStringAsync(key);
}

export async function nativeGetKeysByPrefix(prefix: string): Promise<string[]> {
  return await NativeModule.nativeGetKeysByPrefixAsync(prefix);
}

export async function getCacheSizeBytes(): Promise<number> {
  if (!NativeModule) throw new Error('PiliNativeCore is unavailable');
  return await NativeModule.getCacheSizeBytesAsync();
}

export async function clearCacheFiles(): Promise<boolean> {
  if (!NativeModule) throw new Error('PiliNativeCore is unavailable');
  return await NativeModule.clearCacheFilesAsync();
}

export async function getDocumentsDirectoryPath(): Promise<string> {
  if (!NativeModule) throw new Error('PiliNativeCore is unavailable');
  return await NativeModule.getDocumentsDirectoryPathAsync();
}

export async function writeTextFile(path: string, content: string): Promise<boolean> {
  if (!NativeModule) throw new Error('PiliNativeCore is unavailable');
  return await NativeModule.writeTextFileAsync(path, content);
}

export async function readTextFile(path: string): Promise<string | null> {
  return await NativeModule.readTextFileAsync(path);
}

export async function getAccountRecords(): Promise<NativeAccountStore | null> {
  return await NativeModule.getAccountRecordsAsync();
}

export async function setAccountRecords(
  records: NativeAccountRecord[],
  currentIndex: number,
  anonymousMode: boolean,
): Promise<boolean> {
  if (!NativeModule) throw new Error('PiliNativeCore is unavailable');
  return await NativeModule.setAccountRecordsAsync(records, currentIndex, anonymousMode);
}

export async function setActiveAccount(
  key: string,
  records: NativeAccountRecord[],
  currentIndex: number,
  anonymousMode: boolean,
  cookies: NativeCookieInput[],
): Promise<boolean> {
  if (!NativeModule) throw new Error('PiliNativeCore is unavailable');
  return await NativeModule.setActiveAccountAsync(key, records, currentIndex, anonymousMode, cookies);
}

export async function clearAccountRecords(): Promise<boolean> {
  if (!NativeModule) throw new Error('PiliNativeCore is unavailable');
  return await NativeModule.clearAccountRecordsAsync();
}

export async function copyText(text: string): Promise<boolean> {
  if (!NativeModule) throw new Error('PiliNativeCore is unavailable');
  return await NativeModule.copyTextAsync(text);
}

export async function readClipboard(): Promise<string | null> {
  return await NativeModule.readClipboardAsync();
}

export async function shareText(text: string): Promise<boolean> {
  if (!NativeModule) throw new Error('PiliNativeCore is unavailable');
  return await NativeModule.shareTextAsync(text);
}

export async function shareFile(uri: string): Promise<boolean> {
  if (!NativeModule) throw new Error('PiliNativeCore is unavailable');
  return await NativeModule.shareFileAsync(uri);
}

export async function createQRCodeAsync(text: string, size = 200): Promise<string | null> {
  try {
    const uri = await NativeModule.createQRCodeAsync(text, size);
    return uri || null;
  } catch {
    return null;
  }
}

export async function registerBackgroundDynamicCheckAsync(
  options: BackgroundCheckOptions,
): Promise<boolean> {
  if (!NativeModule) throw new Error('PiliNativeCore is unavailable');
  return await NativeModule.registerBackgroundDynamicCheckAsync(options);
}

export async function unregisterBackgroundDynamicCheckAsync(): Promise<boolean> {
  if (!NativeModule) throw new Error('PiliNativeCore is unavailable');
  return await NativeModule.unregisterBackgroundDynamicCheckAsync();
}

export async function resetDynamicAccountAsync(): Promise<boolean> {
  if (!NativeModule) throw new Error('PiliNativeCore is unavailable');
  return await NativeModule.resetDynamicAccountAsync();
}

export async function clearDynamicNotifications(): Promise<void> {
  await NativeModule.clearDynamicNotificationsAsync();
}

export async function setDynamicBadgeCountAsync(count: number): Promise<boolean> {
  if (!NativeModule) throw new Error('PiliNativeCore is unavailable');
  return await NativeModule.setDynamicBadgeCountAsync(count);
}

export async function markDynamicReadAsync(): Promise<boolean> {
  if (!NativeModule) throw new Error('PiliNativeCore is unavailable');
  return await NativeModule.markDynamicReadAsync();
}

export async function startSleepTimer(seconds: number): Promise<void> {
  if (!NativeModule) throw new Error('PiliNativeCore is unavailable');
  await NativeModule.startSleepTimerAsync(seconds);
}

export async function cancelSleepTimer(): Promise<void> {
  if (!NativeModule) throw new Error('PiliNativeCore is unavailable');
  await NativeModule.cancelSleepTimerAsync();
}

export async function getSleepRemaining(): Promise<number> {
  try {
    return await NativeModule.getSleepRemainingAsync();
  } catch {
    return 0;
  }
}

export function addSleepTimerFiredListener(
  listener: (event: SleepTimerFiredEvent) => void,
): (() => void) | null {
  const subscription = NativeModule.addListener('onSleepTimerFired', listener);
  return () => subscription.remove();
}

export async function showToastAsync(
  message: string,
  durationMs: number,
  announce = false,
): Promise<boolean> {
  if (!NativeModule) throw new Error('PiliNativeCore is unavailable');
  return await NativeModule.showToastAsync(message, durationMs, announce);
}

export async function getPowerState(): Promise<PowerState> {
  return await NativeModule.getPowerStateAsync();
}

export function addPowerStateListener(
  listener: (event: PowerState) => void,
): (() => void) | null {
  const subscription = NativeModule.addListener('onPowerStateChange', listener);
  return () => subscription.remove();
}

export async function presentTextInputAsync(
  title: string,
  message: string | null,
  initialValue = '',
): Promise<string | null> {
  return await NativeModule.presentTextInputAsync(title, message, initialValue);
}

export async function startDynamicPolling(intervalMs: number): Promise<boolean> {
  await NativeModule.startDynamicPollingAsync(intervalMs);
  return true;
}

export async function stopDynamicPolling(): Promise<boolean> {
  await NativeModule.stopDynamicPollingAsync();
  return true;
}

export async function startQRCodePolling(
  authCode: string,
  intervalMs = 2000,
): Promise<boolean> {
  await NativeModule.startQRCodePollingAsync(authCode, intervalMs);
  return true;
}

export async function stopQRCodePolling(): Promise<boolean> {
  await NativeModule.stopQRCodePollingAsync();
  return true;
}

export function addDynamicCheckListener(
  listener: (event: DynamicCheckResult) => void,
): (() => void) | null {
  const subscription = NativeModule.addListener('onDynamicCheck', listener);
  return () => subscription.remove();
}

export function addQRCodePollListener(
  listener: (event: QRCodePollEvent) => void,
): (() => void) | null {
  const subscription = NativeModule.addListener('onQRCodePoll', listener);
  return () => subscription.remove();
}

export function PiliImageViewer(props: PiliImageViewerProps) {
  const { style, ...viewProps } = props;
  return <NativeImageViewer {...viewProps} style={[StyleSheet.absoluteFill, style]} />;
}
