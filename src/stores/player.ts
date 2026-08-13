/**
 * player store —— 全局播放器状态（后台音频"听视频"模式）。
 * 供 MiniPlayerAccessory / video/[id].tsx / audio-player 模块共享。
 */
import { create } from 'zustand';
import { storage } from '@/utils/storage';
import type { SBSegment } from '@/api/sponsor-block';

/** 锁屏/系统远程控制命令名 */
export type PlayerRemoteCommand = 'play' | 'pause' | 'togglePlayPause' | 'seek';

/** 画面比例（原生 PiliPlayerView videoGravity 三档直通，04-B3/B4） */
export type VideoGravity = 'contain' | 'cover' | 'fill';

/** 画面比例持久化 key（settings store 为并行代理 G 独占，故收敛到 player store 持久化） */
const VIDEO_GRAVITY_KEY = 'player.videoGravity';

/** 双击循环切换顺序：contain → cover → fill → contain */
const VIDEO_GRAVITY_CYCLE: VideoGravity[] = ['contain', 'cover', 'fill'];

/** 下一个画面比例（双击循环用） */
export function nextVideoGravity(g: VideoGravity): VideoGravity {
  const i = VIDEO_GRAVITY_CYCLE.indexOf(g);
  return VIDEO_GRAVITY_CYCLE[(i < 0 ? 0 : i + 1) % VIDEO_GRAVITY_CYCLE.length];
}

async function loadPersistedVideoGravity() {
  try {
    const raw = await storage.get(VIDEO_GRAVITY_KEY);
    if (raw === 'contain' || raw === 'cover' || raw === 'fill') {
      usePlayerStore.setState({ videoGravity: raw });
    }
  } catch {}
}

/** 某屏的最后播放进度（key = `${bvid}:${cid}`） */
export interface PlayerScreenProgress {
  currentTime: number;
  duration: number;
  playbackRate: number;
}

/**
 * 共享单例播放器（PiliPlayer.shared）当前加载源的归属声明。
 * 由各播放屏在 replaceAsync 成功后写入，用于：
 *  1. 页面重新获得焦点时校验"播放器当前源 ≠ 本页期望源"→ 重新加载并恢复进度（审计 06-N1）；
 *  2. 为长期"播放态收敛进 store"（06-6.7）铺底。
 */
export interface PlayerActiveSource {
  /** 源归属键：`${bvid}:${cid}` */
  key: string;
  bvid: string;
  cid: number;
  /** 源指纹：当前加载的 playUrl */
  playUrl: string;
  /** 归属页面路由名（如 /video/[id]、/video/fullscreen） */
  screen: string;
  /** 声明时的播放进度（秒） */
  currentTime: number;
  /** 声明时间戳，用于判定"谁最后占用" */
  timestamp: number;
}

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
    /** 全屏会话标识（04-3.2/06-6.7）：进入全屏时写入，页面消费后清空。
     *  退出全屏回写时校验一致，避免"写一次-读一次-清空"协议在快速进出/
     *  页面先卸载时把陈旧会话回写、残留脏状态。 */
    sessionId?: number;
  } | null;
  /** 画面比例（contain/cover/fill，原生 videoGravity 直通，跨屏共享并持久化） */
  videoGravity: VideoGravity;
  /** 共享播放器当前加载源的归属声明（由各播放屏在 replaceAsync 后写入） */
  activeSource: PlayerActiveSource | null;
  /** 各屏最后进度：key=`${bvid}:${cid}` → 进度快照，返回该视频页时恢复 */
  screenProgresses: Record<string, PlayerScreenProgress>;

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
  /** 设置画面比例（并持久化） */
  setVideoGravity: (g: VideoGravity) => void;
  /** 声明当前播放源归属（replaceAsync 成功后调用），并同步记录该屏进度 */
  claimSource: (info: Omit<PlayerActiveSource, 'timestamp'>) => void;
  /** 清空源归属声明（播放器源被释放/页面卸载时调用） */
  clearSource: () => void;
  /** 保存某屏最后进度 */
  saveScreenProgress: (key: string, progress: PlayerScreenProgress) => void;
  /** 读取某屏最后进度（无记录返回 undefined） */
  getScreenProgress: (key: string) => PlayerScreenProgress | undefined;
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
  videoGravity: 'contain',
  activeSource: null,
  screenProgresses: {},

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

  setVideoGravity: (videoGravity) => {
    set({ videoGravity });
    void storage.set(VIDEO_GRAVITY_KEY, videoGravity).catch(() => {});
  },

  claimSource: (info) =>
    set((s) => ({
      activeSource: { ...info, timestamp: Date.now() },
      // 声明归属的同时把该屏进度并入 screenProgresses（保留旧的 duration/rate）
      screenProgresses: {
        ...s.screenProgresses,
        [info.key]: {
          currentTime: info.currentTime,
          duration: s.screenProgresses[info.key]?.duration ?? 0,
          playbackRate: s.screenProgresses[info.key]?.playbackRate ?? 1,
        },
      },
    })),

  clearSource: () => set({ activeSource: null }),

  saveScreenProgress: (key, progress) =>
    set((s) => ({
      screenProgresses: { ...s.screenProgresses, [key]: progress },
    })),

  getScreenProgress: (key) => get().screenProgresses[key],

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
      activeSource: null,
      screenProgresses: {},
    }),
}));

// 启动时异步恢复持久化的画面比例（storage 读取为异步，完成后 setState 覆盖默认值）
void loadPersistedVideoGravity();
