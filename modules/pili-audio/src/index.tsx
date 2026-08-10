import { requireNativeModule } from 'expo-modules-core';

type RemoteCommandName =
  | 'play'
  | 'pause'
  | 'togglePlayPause'
  | 'seek'
  | 'skipForward'
  | 'skipBackward';

export type RemoteCommandEvent = {
  command: RemoteCommandName;
  position?: number;
  interval?: number;
};

type RouteChangedEvent = {
  shouldPause: boolean;
};

type InterruptionEvent = {
  state: 'begin' | 'end';
  options: string[];
};

export type PlaybackStatus = {
  isLoaded: boolean;
  playing: boolean;
  currentTime: number;
  duration: number;
  didJustFinish: boolean;
};

type SleepRemainingChangedEvent = {
  remainingMs: number;
};

type NativePiliAudioModule = {
  isAvailableAsync(): Promise<boolean>;
  configureAsync(playsInSilentMode: boolean, shouldPlayInBackground: boolean): Promise<void>;
  setNowPlayingAsync(
    title: string,
    artist: string,
    artworkUrl: string,
    duration: number,
    currentTime: number,
    rate: number,
    isLiveStream: boolean,
  ): Promise<void>;
  clearNowPlayingAsync(): Promise<void>;
  syncNowPlayingAsync(currentTime: number, duration: number, rate: number): Promise<void>;
  setActiveAsync(active: boolean): Promise<void>;
  beginAudioTransitionTaskAsync(): Promise<string>;
  endAudioTransitionTaskAsync(token: string): Promise<void>;
  setPlaybackStatusUpdatesAsync(listenerCount: number): Promise<void>;
  getSleepRemainingMsAsync(): Promise<number>;
  setSleepRemainingUpdatesAsync(enabled: boolean): Promise<void>;
  bindSharedPlayerAsync(player: unknown): Promise<void>;
  playAsync(): Promise<void>;
  pauseAsync(): Promise<void>;
  setVolumeAsync(volume: number): Promise<void>;
  releaseAsync(): Promise<void>;
  addListener(
    eventName: 'onRemoteCommand',
    listener: (event: RemoteCommandEvent) => void,
  ): { remove(): void };
  addListener(
    eventName: 'onInterruption',
    listener: (event: InterruptionEvent) => void,
  ): { remove(): void };
  addListener(
    eventName: 'onRouteChanged',
    listener: (event: RouteChangedEvent) => void,
  ): { remove(): void };
  addListener(
    eventName: 'onPlaybackStatus',
    listener: (event: PlaybackStatus) => void,
  ): { remove(): void };
  addListener(
    eventName: 'onSleepRemainingChanged',
    listener: (event: SleepRemainingChangedEvent) => void,
  ): { remove(): void };
};

const NativeAudioModule = requireNativeModule<NativePiliAudioModule>('PiliAudio');

let playbackStatusListenerCount = 0;
let sleepRemainingListenerCount = 0;

function syncPlaybackStatusUpdates() {
  void NativeAudioModule.setPlaybackStatusUpdatesAsync(playbackStatusListenerCount).catch(() => {});
}

function setSleepRemainingUpdates(enabled: boolean) {
  void NativeAudioModule.setSleepRemainingUpdatesAsync(enabled).catch(() => {});
}

export function isModuleAvailable(): boolean {
  return true;
}

export async function configureAudioSessionAsync(
  playsInSilentMode: boolean,
  shouldPlayInBackground: boolean,
): Promise<void> {
  await NativeAudioModule.configureAsync(playsInSilentMode, shouldPlayInBackground);
}

export async function setNowPlayingAsync(
  title: string,
  artist: string,
  artworkUrl: string,
  duration: number,
  currentTime: number,
  rate: number,
  isLiveStream = false,
): Promise<void> {
  await NativeAudioModule.setNowPlayingAsync(
    title,
    artist,
    artworkUrl,
    duration,
    currentTime,
    rate,
    isLiveStream,
  );
}

export async function clearNowPlayingAsync(): Promise<void> {
  await NativeAudioModule.clearNowPlayingAsync();
}

export async function syncNowPlayingAsync(
  currentTime: number,
  duration: number,
  rate: number,
): Promise<void> {
  await NativeAudioModule.syncNowPlayingAsync(currentTime, duration, rate);
}

export async function setActiveAsync(active: boolean): Promise<void> {
  await NativeAudioModule.setActiveAsync(active);
}

export async function beginAudioTransitionTaskAsync(): Promise<string> {
  return await NativeAudioModule.beginAudioTransitionTaskAsync();
}

export async function endAudioTransitionTaskAsync(token: string): Promise<void> {
  if (!token) return;
  await NativeAudioModule.endAudioTransitionTaskAsync(token);
}

export async function bindSharedPlayerAsync(player: unknown): Promise<void> {
  await NativeAudioModule.bindSharedPlayerAsync(player);
}

export async function playAudioAsync(): Promise<void> {
  await NativeAudioModule.playAsync();
}

export async function pauseAudioAsync(): Promise<void> {
  await NativeAudioModule.pauseAsync();
}

export async function setVolumeAsync(volume: number): Promise<void> {
  await NativeAudioModule.setVolumeAsync(volume);
}

export async function releaseAudioAsync(): Promise<void> {
  await NativeAudioModule.releaseAsync();
}

export async function getSleepRemainingMs(): Promise<number> {
  return await NativeAudioModule.getSleepRemainingMsAsync();
}

export function addRemoteCommandListener(
  listener: (event: RemoteCommandEvent) => void,
): () => void {
  const subscription = NativeAudioModule.addListener('onRemoteCommand', listener);
  return () => subscription.remove();
}

export function addInterruptionListener(
  listener: (event: InterruptionEvent) => void,
): () => void {
  const subscription = NativeAudioModule.addListener('onInterruption', listener);
  return () => subscription.remove();
}

export function addRouteChangedListener(
  listener: (event: RouteChangedEvent) => void,
): () => void {
  const subscription = NativeAudioModule.addListener('onRouteChanged', listener);
  return () => subscription.remove();
}

export function addPlaybackStatusListener(
  listener: (event: PlaybackStatus) => void,
): () => void {
  playbackStatusListenerCount += 1;
  if (playbackStatusListenerCount === 1) syncPlaybackStatusUpdates();
  const subscription = NativeAudioModule.addListener('onPlaybackStatus', listener);
  return () => {
    subscription.remove();
    playbackStatusListenerCount = Math.max(0, playbackStatusListenerCount - 1);
    if (playbackStatusListenerCount === 0) syncPlaybackStatusUpdates();
  };
}

export function addSleepRemainingChangedListener(
  listener: (event: SleepRemainingChangedEvent) => void,
): () => void {
  sleepRemainingListenerCount += 1;
  if (sleepRemainingListenerCount === 1) setSleepRemainingUpdates(true);
  const subscription = NativeAudioModule.addListener('onSleepRemainingChanged', listener);
  return () => {
    subscription.remove();
    sleepRemainingListenerCount = Math.max(0, sleepRemainingListenerCount - 1);
    if (sleepRemainingListenerCount === 0) setSleepRemainingUpdates(false);
  };
}
