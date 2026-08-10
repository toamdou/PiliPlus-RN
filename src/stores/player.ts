/**
 * player store —— 全局播放器状态（后台音频"听视频"模式）。
 * 供 MiniPlayerAccessory / video/[id].tsx / audio-player 模块共享。
 */
import { create } from 'zustand';
import type { SBSegment } from '@/api/sponsor-block';

/** 锁屏/系统远程控制命令名 */
export type PlayerRemoteCommand = 'play' | 'pause' | 'togglePlayPause' | 'seek';

interface PlayerState {
  /** 是否处于纯音频（听视频）模式 */
  audioMode: boolean;
  /** 当前播放的 bvid */
  currentBvid: string | null;
  /** 视频标题（MiniPlayer 展示用） */
  title: string;
  /** 封面 URL（MiniPlayer 展示用） */
  cover: string;
  /** 音频是否正在播放 */
  playing: boolean;
  /** 当前播放时间（秒），由 audio-player 模块定期同步 */
  currentTime: number;
  /** 总时长（秒） */
  duration: number;
  /** 当前订阅播放进度的组件数；无订阅者时 audio-player 不持续写 currentTime/duration */
  progressSubscribers: number;
  /** 全屏退出时待回传主播放页的播放器设置 */
  fullscreenState: {
    bvid: string;
    aid: number;
    cid: number;
    title: string;
    pic: string;
    playUrl: string;
    currentTime: number;
    playbackRate: number;
    volume: number;
    dmVisible: boolean;
    subtitleVisible: boolean;
    subtitleData: { from: number; to: number; content: string }[];
    sbSegments: SBSegment[];
    liked: boolean;
    coined: boolean;
    faved: boolean;
    disliked: boolean;
    onlineCount: string;
    qualityList: { quality: number; new_description: string }[];
    currentQn: number;
  } | null;

  /* ===== actions ===== */
  /** 进入音频模式 */
  enterAudioMode: (info: { bvid: string; title: string; cover: string }) => void;
  /** 退出音频模式（恢复视频） */
  exitAudioMode: () => void;
  /** 切换播放/暂停 */
  togglePlaying: () => void;
  /** 设置播放状态 */
  setPlaying: (v: boolean) => void;
  /** 同步播放进度 */
  syncProgress: (currentTime: number, duration: number) => void;
  /** 订阅播放进度，返回取消订阅函数 */
  subscribeProgress: () => () => void;
  /** 远程控制命令回写（播放器引擎操作由 audio-player 负责） */
  handleRemoteCommand: (command: PlayerRemoteCommand, position?: number) => void;
  /** 写入全屏退出状态，主页面恢复焦点时消费 */
  setFullscreenState: (state: NonNullable<PlayerState['fullscreenState']>) => void;
  /** 清空已消费的全屏退出状态 */
  clearFullscreenState: () => void;
  /** 重置（卸载/切换视频时） */
  reset: () => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  audioMode: false,
  currentBvid: null,
  title: '',
  cover: '',
  playing: false,
  currentTime: 0,
  duration: 0,
  progressSubscribers: 0,
  fullscreenState: null,

  enterAudioMode: ({ bvid, title, cover }) =>
    set({ audioMode: true, currentBvid: bvid, title, cover, playing: true }),

  exitAudioMode: () =>
    set({ audioMode: false, playing: false }),

  togglePlaying: () => set((s) => ({ playing: !s.playing })),

  setPlaying: (v) => set({ playing: v }),

  syncProgress: (currentTime, duration) => set({ currentTime, duration }),

  subscribeProgress: () => {
    set((s) => ({ progressSubscribers: s.progressSubscribers + 1 }));
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      set((s) => ({ progressSubscribers: Math.max(0, s.progressSubscribers - 1) }));
    };
  },

  handleRemoteCommand: (command, position) => {
    switch (command) {
      case 'play':
        set({ playing: true });
        break;
      case 'pause':
        set({ playing: false });
        break;
      case 'togglePlayPause':
        set({ playing: !get().playing });
        break;
      case 'seek':
        if (typeof position === 'number' && position >= 0) {
          set({ currentTime: position });
        }
        break;
    }
  },

  setFullscreenState: (fullscreenState) => set({ fullscreenState }),

  clearFullscreenState: () => set({ fullscreenState: null }),

  reset: () =>
    set({
      audioMode: false,
      currentBvid: null,
      title: '',
      cover: '',
      playing: false,
      currentTime: 0,
      duration: 0,
      progressSubscribers: 0,
      fullscreenState: null,
    }),
}));
