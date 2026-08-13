import React from 'react';
import { View, type ViewProps } from 'react-native';
import {
  requireNativeViewManager,
  requireNativeModule,
  type SharedRef,
  type EventSubscription,
} from 'expo-modules-core';

type PiliPlayerLike = {
  getSharedPlayerId?: () => number | null;
  __expo_shared_object_id__?: unknown;
};

type PiliPlayerStatus = 'idle' | 'loading' | 'readyToPlay' | 'error';

type PiliPlayerSource = {
  uri: string;
  headers?: Record<string, string>;
};

type PiliPlayerVideoTrack = {
  size?: { width: number; height: number };
  frameRate?: number | null;
  mimeType?: string | null;
};

type PiliPlayerErrorPayload = {
  code?: string;
  message?: string;
};

type PiliPlayerEventMap = {
  timeUpdate: { currentTime: number; duration?: number };
  statusChange: {
    status: PiliPlayerStatus;
    oldStatus?: PiliPlayerStatus | null;
    error?: { message?: string } | null;
  };
  playingChange: { isPlaying: boolean; oldIsPlaying?: boolean | null };
  videoTrackChange: { videoTrack?: PiliPlayerVideoTrack | null };
  playToEnd: Record<string, never>;
  error: PiliPlayerErrorPayload;
  firstFrameRender: Record<string, never>;
  /** 缓冲中状态（04-P0/3.4）：原生 timeControlStatus == .waitingToPlayAtSpecifiedRate 时透出 */
  buffering: { isBuffering: boolean };
  /** PiP 激活状态变化（批次5 P3）：true=小窗已开启，false=小窗已关闭 */
  pictureInPictureActiveChange: { active: boolean };
};

export type PiliSeekThumbnailImage = SharedRef<'image'>;

type NativePiliPlayerModule = {
  isAvailableAsync(): Promise<boolean>;
  create(): void;
  replaceAsync(source: PiliPlayerSource | null): Promise<void>;
  enterAudioOnlyAsync(source: PiliPlayerSource | null, startTime: number): Promise<void>;
  exitAudioOnlyAsync(): Promise<boolean>;
  play(): void;
  pause(): void;
  seekTo(seconds: number): void;
  setRate(rate: number): void;
  setVolume(volume: number): void;
  setMuted(muted: boolean): void;
  setLoop(loop: boolean): void;
  setTimeUpdateInterval(interval: number): void;
  setBufferConfig(seconds: number): void;
  setStreamingLimits(maxWidth: number, maxHeight: number, peakBitRate: number): void;
  setLiveMode(live: boolean): void;
  setSkipSegments(segments: number[][]): void;
  currentTime(): number;
  duration(): number;
  status(): PiliPlayerStatus;
  isPlaying(): boolean;
  getRate(): number;
  getVolume(): number;
  isMuted(): boolean;
  getLoop(): boolean;
  getVideoTrack(): PiliPlayerVideoTrack | null;
  getSharedPlayer(): unknown;
  generateScreenshotAsync(): Promise<string>;
  saveScreenshotToPhotosAsync(): Promise<boolean>;
  presentFullscreenAsync(options: Record<string, any>): Promise<boolean>;
  dismissFullscreen(): void;
  // 画中画 PiP（批次5 P3）
  setPiPEnabled(enabled: boolean): void;
  setPiPRequiresLinearPlayback(enabled: boolean): void;
  startPictureInPicture(): void;
  stopPictureInPicture(): void;
  isPictureInPictureActive(): boolean;
  isPictureInPicturePossible(): boolean;
  cropSeekThumbnailAsync(
    uri: string,
    col: number,
    row: number,
    frameW: number,
    frameH: number,
    targetWidth: number,
    targetHeight: number,
  ): Promise<PiliSeekThumbnailImage>;
  addListener<EventName extends keyof PiliPlayerEventMap>(
    eventName: EventName,
    listener: (payload: PiliPlayerEventMap[EventName]) => void,
  ): EventSubscription;
  removeListener<EventName extends keyof PiliPlayerEventMap>(
    eventName: EventName,
    listener: (payload: PiliPlayerEventMap[EventName]) => void,
  ): void;
};

const NativeModule = requireNativeModule<NativePiliPlayerModule>('PiliPlayer');

type NativePiliPlayerViewProps = {
  player: number;
  videoGravity?: string;
};

type NativePiliSeekThumbnailViewProps = {
  image: PiliSeekThumbnailImage | null;
};

type NativePiliPlayerProgressViewProps = {
  progressTintColor?: string;
  trackTintColor?: string;
};

const NativePiliPlayerView = requireNativeViewManager<NativePiliPlayerViewProps>(
  'PiliPlayer',
  'PiliPlayerView',
);

const NativePiliSeekThumbnailView = requireNativeViewManager<NativePiliSeekThumbnailViewProps>(
  'PiliPlayer',
  'PiliSeekThumbnailView',
);

const NativePiliPlayerProgressView = requireNativeViewManager<NativePiliPlayerProgressViewProps>(
  'PiliPlayer',
  'PiliPlayerProgressView',
);

type PiliPlayerViewProps = ViewProps & {
  player?: PiliPlayerLike | PiliPlayer | null;
  playerId?: number | null;
  videoGravity?: 'contain' | 'cover' | 'fill' | 'resizeAspect' | 'resizeAspectFill' | 'resize';
};

function getSharedObjectId(value: unknown): number | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as {
    getSharedPlayerId?: () => number | null;
    __expo_shared_object_id__?: unknown;
  };
  if (typeof candidate.getSharedPlayerId === 'function') {
    const id = candidate.getSharedPlayerId();
    return typeof id === 'number' ? id : null;
  }
  const id = candidate.__expo_shared_object_id__;
  return typeof id === 'number' ? id : null;
}

/**
 * Shared native AVPlayer session controller. No expo-video runtime fallback is kept.
 */
export class PiliPlayer {
  static readonly shared = new PiliPlayer();

  private readonly native: NativePiliPlayerModule;
  private sharedRef: unknown | null = null;
  private listeners = new Map<keyof PiliPlayerEventMap, Set<(payload: never) => void>>();
  private nativeSubscriptions = new Map<keyof PiliPlayerEventMap, EventSubscription>();
  private source: PiliPlayerSource | null = null;
  private audioOnlyPreviousSource: PiliPlayerSource | null = null;
  private cachedStatus: PiliPlayerStatus = 'idle';
  private cachedPlaying = false;
  private cachedDuration = 0;
  private cachedCurrentTime = 0;
  private cachedRate = 1;
  private cachedVolume = 1;
  private cachedMuted = false;
  private cachedLoop = false;
  private cachedVideoTrack: PiliPlayerVideoTrack | null = null;
  private cachedTimeUpdateInterval = 0;

  constructor() {
    this.native = NativeModule;
    try {
      this.native.create();
    } catch {}
  }

  addListener<EventName extends keyof PiliPlayerEventMap>(
    eventName: EventName,
    listener: (payload: PiliPlayerEventMap[EventName]) => void,
  ): { remove(): void } {
    let set = this.listeners.get(eventName);
    if (!set) {
      set = new Set();
      this.listeners.set(eventName, set);
    }
    if (eventName === 'timeUpdate' && set.size === 0) {
      this.setTimeUpdateInterval(0.5);
    }
    set.add(listener as (payload: never) => void);
    this.ensureNativeSubscription(eventName);
    return {
      remove: () => this.removeListener(eventName, listener),
    };
  }

  removeListener<EventName extends keyof PiliPlayerEventMap>(
    eventName: EventName,
    listener: (payload: PiliPlayerEventMap[EventName]) => void,
  ): void {
    const set = this.listeners.get(eventName);
    if (!set) return;
    set.delete(listener as (payload: never) => void);
    if (set.size === 0) {
      this.listeners.delete(eventName);
      const subscription = this.nativeSubscriptions.get(eventName);
      if (subscription) {
        subscription.remove();
        this.nativeSubscriptions.delete(eventName);
      }
      if (eventName === 'timeUpdate') {
        this.setTimeUpdateInterval(0);
      }
    }
  }

  async replaceAsync(source: PiliPlayerSource | null): Promise<void> {
    // 04-3.7：放开 null 路径——页面卸载时可用 replaceAsync(null) 主动清空
    // AVPlayerItem，释放解码器 + 前向缓冲常驻内存。原生 load(source: nil)
    // 会 replaceCurrentItem(with: nil) 并置 status=idle。
    this.source = source;
    const oldStatus = this.cachedStatus;
    if (source) {
      this.cachedStatus = 'loading';
      this.emitLocal('statusChange', { status: 'loading', oldStatus });
    } else {
      this.cachedStatus = 'idle';
    }
    await this.native.replaceAsync(source);
  }

  async enterAudioOnlyAsync(source: PiliPlayerSource, startTime = 0): Promise<void> {
    this.audioOnlyPreviousSource = this.source;
    this.source = source;
    await this.native.enterAudioOnlyAsync(source, Math.max(0, startTime));
  }

  async exitAudioOnlyAsync(): Promise<boolean> {
    const restored = await this.native.exitAudioOnlyAsync();
    if (restored) this.source = this.audioOnlyPreviousSource;
    this.audioOnlyPreviousSource = null;
    return restored;
  }

  play(): void {
    this.native.play();
    if (!this.cachedPlaying) {
      this.cachedPlaying = true;
      this.emitLocal('playingChange', { isPlaying: true, oldIsPlaying: false });
    }
  }

  pause(): void {
    this.native.pause();
    if (this.cachedPlaying) {
      this.cachedPlaying = false;
      this.emitLocal('playingChange', { isPlaying: false, oldIsPlaying: true });
    }
  }

  seekTo(seconds: number): void {
    const target = Math.max(0, seconds);
    this.native.seekTo(target);
    this.cachedCurrentTime = target;
    this.emitLocal('timeUpdate', { currentTime: target });
  }

  setRate(rate: number): void {
    this.cachedRate = rate;
    this.native.setRate(rate);
  }

  setVolume(volume: number): void {
    this.cachedVolume = Math.min(Math.max(volume, 0), 1);
    this.native.setVolume(this.cachedVolume);
  }

  setMuted(muted: boolean): void {
    this.cachedMuted = muted;
    this.native.setMuted(muted);
  }

  setLoop(loop: boolean): void {
    this.cachedLoop = loop;
    this.native.setLoop(loop);
  }

  setTimeUpdateInterval(interval: number): void {
    this.cachedTimeUpdateInterval = interval > 0 ? interval : 0;
    this.native.setTimeUpdateInterval(this.cachedTimeUpdateInterval);
  }

  setBufferConfig(seconds: number): void {
    this.native.setBufferConfig(Math.max(0, seconds));
  }

  setStreamingLimits(maxWidth: number, maxHeight: number, peakBitRate: number): void {
    this.native.setStreamingLimits(
      Math.max(0, maxWidth),
      Math.max(0, maxHeight),
      Math.max(0, peakBitRate),
    );
  }

  setLiveMode(live: boolean): void {
    this.native.setLiveMode(live);
  }

  setSkipSegments(segments: number[][]): void {
    this.native.setSkipSegments(segments);
  }

  getSharedPlayer(): unknown {
    if (!this.sharedRef) {
      this.sharedRef = this.native.getSharedPlayer();
    }
    return this.sharedRef;
  }

  getSharedPlayerId(): number | null {
    return getSharedObjectId(this.getSharedPlayer());
  }

  generateScreenshotAsync(): Promise<string> {
    return this.native.generateScreenshotAsync();
  }

  saveScreenshotToPhotosAsync(): Promise<boolean> {
    return this.native.saveScreenshotToPhotosAsync();
  }

  presentFullscreenAsync(options: Record<string, any>): Promise<boolean> {
    return this.native.presentFullscreenAsync(options);
  }

  dismissFullscreen(): void {
    this.native.dismissFullscreen();
  }

  // ===== 画中画 PiP（批次5 P3） =====

  /** 后台画中画开关：同步原生，开启后进入后台自动拉起系统 PiP 小窗 */
  setPiPEnabled(enabled: boolean): void {
    this.native.setPiPEnabled(enabled);
  }

  /** PiP 小窗内是否锁定线性播放（禁用进度/倍速控件），默认 true */
  setPiPRequiresLinearPlayback(enabled: boolean): void {
    this.native.setPiPRequiresLinearPlayback(enabled);
  }

  /** 手动开启画中画（仅当 isPictureInPicturePossible 为 true 时生效） */
  startPictureInPicture(): void {
    this.native.startPictureInPicture();
  }

  /** 手动关闭画中画 */
  stopPictureInPicture(): void {
    this.native.stopPictureInPicture();
  }

  get isPictureInPictureActive(): boolean {
    try {
      return this.native.isPictureInPictureActive();
    } catch {}
    return false;
  }

  get isPictureInPicturePossible(): boolean {
    try {
      return this.native.isPictureInPicturePossible();
    } catch {}
    return false;
  }

  cropSeekThumbnailAsync(
    uri: string,
    col: number,
    row: number,
    frameW: number,
    frameH: number,
    targetWidth = 160,
    targetHeight = 90,
  ): Promise<PiliSeekThumbnailImage> {
    return this.native.cropSeekThumbnailAsync(
      uri,
      col,
      row,
      frameW,
      frameH,
      targetWidth,
      targetHeight,
    );
  }

  get currentTime(): number {
    try {
      return this.native.currentTime();
    } catch {}
    return this.cachedCurrentTime;
  }

  set currentTime(value: number) {
    this.seekTo(value);
  }

  get duration(): number {
    try {
      return this.native.duration();
    } catch {}
    return this.cachedDuration;
  }

  get playbackRate(): number {
    try {
      return this.native.getRate();
    } catch {}
    return this.cachedRate;
  }

  set playbackRate(value: number) {
    this.setRate(value);
  }

  get volume(): number {
    try {
      return this.native.getVolume();
    } catch {}
    return this.cachedVolume;
  }

  set volume(value: number) {
    this.setVolume(value);
  }

  get muted(): boolean {
    try {
      return this.native.isMuted();
    } catch {}
    return this.cachedMuted;
  }

  set muted(value: boolean) {
    this.setMuted(value);
  }

  get loop(): boolean {
    try {
      return this.native.getLoop();
    } catch {}
    return this.cachedLoop;
  }

  set loop(value: boolean) {
    this.setLoop(value);
  }

  get status(): PiliPlayerStatus {
    try {
      return this.native.status();
    } catch {}
    return this.cachedStatus;
  }

  get playing(): boolean {
    try {
      return this.native.isPlaying();
    } catch {}
    return this.cachedPlaying;
  }

  get videoTrack(): PiliPlayerVideoTrack | null {
    try {
      return this.native.getVideoTrack();
    } catch {}
    return this.cachedVideoTrack;
  }

  get sourceUri(): string | null {
    return this.source?.uri ?? null;
  }

  private ensureNativeSubscription(eventName: keyof PiliPlayerEventMap): void {
    if (this.nativeSubscriptions.has(eventName)) return;
    const subscription = this.native.addListener(eventName, (payload) => {
      this.handleNativeEvent(eventName, payload);
    });
    this.nativeSubscriptions.set(eventName, subscription);
  }

  private handleNativeEvent(
    eventName: keyof PiliPlayerEventMap,
    payload: PiliPlayerEventMap[keyof PiliPlayerEventMap],
  ): void {
    const event = payload as any;
    if (eventName === 'timeUpdate' && typeof event.currentTime === 'number') {
      this.cachedCurrentTime = event.currentTime;
      if (typeof event.duration === 'number' && event.duration > 0) {
        this.cachedDuration = event.duration;
      }
    } else if (eventName === 'statusChange' && typeof event.status === 'string') {
      this.cachedStatus = event.status as PiliPlayerStatus;
    } else if (eventName === 'playingChange' && typeof event.isPlaying === 'boolean') {
      this.cachedPlaying = event.isPlaying;
    } else if (eventName === 'videoTrackChange') {
      this.cachedVideoTrack = event.videoTrack ?? null;
    }

    const set = this.listeners.get(eventName);
    if (!set) return;
    for (const listener of [...set]) {
      try {
        (listener as (event: unknown) => void)(payload);
      } catch {}
    }
  }

  private emitLocal(
    eventName: keyof PiliPlayerEventMap,
    payload: PiliPlayerEventMap[keyof PiliPlayerEventMap],
  ): void {
    const set = this.listeners.get(eventName);
    if (!set) return;
    for (const listener of [...set]) {
      try {
        (listener as (event: unknown) => void)(payload);
      } catch {}
    }
  }
}

export function PiliPlayerView(props: PiliPlayerViewProps) {
  const { player, playerId, ...viewProps } = props;
  const resolvedPlayerId = playerId ?? getSharedObjectId(player);

  if (resolvedPlayerId == null) {
    return <View {...viewProps} />;
  }

  return (
    <NativePiliPlayerView
      {...viewProps}
      player={resolvedPlayerId}
    />
  );
}

type PiliSeekThumbnailViewProps = ViewProps & {
  image: PiliSeekThumbnailImage | null;
};

export function PiliSeekThumbnailView({
  image,
  ...viewProps
}: PiliSeekThumbnailViewProps) {
  return <NativePiliSeekThumbnailView {...viewProps} image={image} />;
}

type PiliPlayerProgressBarProps = ViewProps & {
  progressTintColor?: string;
  trackTintColor?: string;
};

export function PiliPlayerProgressBar(props: PiliPlayerProgressBarProps) {
  const { progressTintColor, trackTintColor, ...viewProps } = props;
  return (
    <NativePiliPlayerProgressView
      {...viewProps}
      {...(progressTintColor ? { progressTintColor } : {})}
      {...(trackTintColor ? { trackTintColor } : {})}
    />
  );
}
