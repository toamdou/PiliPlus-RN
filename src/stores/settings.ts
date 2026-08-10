import { create } from 'zustand';
import { storage, secureStorage } from '@/utils/storage';
import { configureNetworkAsync, getSettingsSnapshotAsync, setSettingsSnapshotAsync } from 'pili-native-core';
import { buildNativeNetworkSettings } from '@/utils/native-network-settings';

const WEBDAV_PASSWORD_KEY = 'settings.webdavPassword';
let settingsPersistTimer: ReturnType<typeof setTimeout> | null = null;

export interface SettingsState {
  // ===== 通用 =====
  theme: 'light' | 'dark' | 'system';
  fontSize: number;
  enableDynamicColor: boolean;
  searchSuggestion: boolean;
  recordSearchHistory: boolean;
  enableHotKey: boolean;
  enableSearchRcmd: boolean;
  enableSearchWord: boolean;
  openInBrowser: boolean;
  feedBackEnable: boolean;
  showDecorate: boolean;
  showMedal: boolean;
  enableAi: boolean;
  disableLikeMsg: boolean;
  autoUpdate: boolean;

  // ===== 首页推荐 =====
  appRcmd: boolean;
  enableSaveLastData: boolean;
  savedRcmdTip: boolean;
  minLikeRatio: number;
  minDuration: number;
  minPlay: number;
  banWordForRecommend: string;
  banWordForZone: string;
  exemptFilterForFollowed: boolean;
  applyFilterToRelated: boolean;
  showHotRcmd: boolean;

  // ===== 视频/画质 =====
  enableHA: boolean;
  p1080: boolean;
  defaultQuality: number;
  cellularQuality: number;
  defaultAudioQa: number;
  cellularAudioQa: number;
  liveQuality: number;
  cellularLiveQuality: number;
  cdnService: string;
  liveCdnUrl: string;
  cdnSpeedTest: boolean;
  disableAudioCDN: boolean;
  preferCodec: string;
  bufferSize: number;
  bufferSec: number;

  // ===== 播放 =====
  autoPlay: boolean;
  playOnWifi: boolean;
  enableSuperResolution: boolean;
  enableFrameInterpolation: boolean;
  enableSdrToHdr: boolean;
  enableQuickDouble: boolean;
  enableAutoLongPressSpeed: boolean;
  longPressSpeedDefault: number;
  speedList: number[];
  enableSlideVolumeBrightness: boolean;
  enableSlideFS: boolean;
  fastForBackwardDuration: number;
  sliderDuration: number;
  subtitlePreference: number;
  enableVerticalExpand: boolean;
  enableAutoEnter: boolean;
  enableAutoExit: boolean;
  continuePlayInBackground: boolean;
  fullScreenGestureReverse: boolean;
  showFSActionItem: boolean;
  showFSLockBtn: boolean;
  showFsScreenshotBtn: boolean;
  enableOnlineTotal: boolean;
  fullScreenMode: number;
  btmProgressBehavior: number;
  playRepeat: number;
  showSeekPreview: boolean;
  enableShrinkVideoSize: boolean;
  playerVolume: number;

  // ===== 播放(补充) =====
  defaultPlaySpeed: number;
  showBatteryLevel: boolean;
  useRelativeSlide: boolean;
  superChatType: number;
  fullScreenScScale: number;
  enableLongShowControl: boolean;
  tempPlayerConf: boolean;
  enableBackgroundPlay: boolean;
  autoRotate: boolean; // 重力感应自动旋转全屏
  enableHeartbeat: boolean; // 上报播放进度（历史记录/续播）

  // ===== 弹幕 =====
  danmakuEnabled: boolean;
  danmakuColor: string;
  danmakuOpacity: number;
  danmakuFontSize: number;
  danmakuSpeed: number;
  danmakuLineHeight: number;
  showVipDanmaku: boolean;
  mergeDanmaku: boolean;
  showDmChart: boolean;
  enableTapDm: boolean;

  // ===== 内容显示 =====
  showViewPoints: boolean;
  showRelatedVideo: boolean;
  showVideoReply: boolean;
  showBangumiReply: boolean;
  alwaysExpandIntro: boolean;
  replyLengthLimit: number;
  showArgueMsg: boolean;
  showDynDispute: boolean;
  reverseFromFirst: boolean;
  continuePlayingPart: boolean;
  showDynActionBar: boolean;
  showPgcTimeline: boolean;
  defaultShowComment: boolean;
  enableQuickFav: boolean;
  enableWordRe: boolean;
  showDynInteraction: boolean;
  replySortType: number;
  defaultDynamicType: number;
  memberTab: number;
  showMemberShop: boolean;

  // ===== 内容显示(补充) =====
  enableSponsorBlock: boolean;
  sponsorBlockServer: string;
  sponsorBlockCategories: string[];
  sponsorBlockSkipTypes: Record<string, string>;
  pgcSkipType: number;
  preInitPlayer: boolean;
  enableLivePhoto: boolean;
  saveReply: boolean;
  enableDragSubtitle: boolean;
  silentDownImg: boolean;
  enableImgMenu: boolean;

  // ===== 动态 =====
  checkDynamic: boolean;
  dynamicPeriod: number;
  banWordForDyn: string;
  banWordForReply: string;
  antiGoodsDyn: boolean;
  antiGoodsReply: boolean;
  enableCreateDynAntifraud: boolean;
  enableCommAntifraud: boolean;
  dynamicsWaterfallFlow: boolean;
  dynamicsShowAllFollowedUp: boolean;
  expandDynLivePanel: boolean;
  dynamicBadgeMode: number;

  // ===== 网络 =====
  enableHttp2: boolean;
  badCertificateCallback: boolean;
  retryCount: number;
  retryDelay: number;
  enableSystemProxy: boolean;
  systemProxyHost: string;
  systemProxyPort: string;

  // ===== 隐私 =====
  // (blacklist is a page, not a toggle)

  // ===== 外观(补充) =====
  msgBadgeMode: number;
  msgUnReadTypes: number[];
  accentColor: string;
  picQuality: number;
  previewQuality: number;
  isPureBlackTheme: boolean;
  defaultHomePage: number;
  tabBarSort: string[];
  navBarSort: string[];
  /** 首页/动态 feed 布局：immersive=单列沉浸（大卡片+玻璃叠层），compact=双列紧凑（小卡片+底部玻璃） */
  feedLayout: 'immersive' | 'compact';
  hideTopBar: boolean;      // 首页顶栏收起（滚动时隐藏搜索栏）
  hideBottomBar: boolean;   // 首页底栏收起（滚动时隐藏 tab 栏）
  darkVideoPage: boolean;   // 视频播放页使用深色主题
  removeSafeArea: boolean;  // 播放页移除安全边距

  // ===== 字幕 =====
  subtitleFontScale: number;
  subtitleFontScaleFS: number;
  subtitleFontWeight: number;
  subtitleStrokeWidth: number;
  subtitlePaddingH: number;
  subtitlePaddingB: number;
  subtitleBgOpacity: number;

  // ===== 缓存 =====
  maxCacheSize: number; // MB

  // ===== WebDAV =====
  webdavUri: string;
  webdavUsername: string;
  webdavPassword: string;
  webdavDirectory: string;

  // ===== Actions =====
  init: () => Promise<void>;
  hydrate: (partial: Partial<SettingsState>) => void;
  set: (partial: Partial<SettingsState>) => void;
}

const defaults = {
  theme: 'system' as const,
  fontSize: 14,
  enableDynamicColor: true,
  searchSuggestion: true,
  recordSearchHistory: true,
  enableHotKey: true,
  enableSearchRcmd: true,
  enableSearchWord: false,
  openInBrowser: false,
  feedBackEnable: false,
  showDecorate: true,
  showMedal: true,
  enableAi: false,
  disableLikeMsg: false,
  autoUpdate: true,

  appRcmd: true,
  enableSaveLastData: true,
  savedRcmdTip: true,
  minLikeRatio: 0,
  minDuration: 0,
  minPlay: 0,
  banWordForRecommend: '',
  banWordForZone: '',
  exemptFilterForFollowed: true,
  applyFilterToRelated: true,
  showHotRcmd: false,

  enableHA: true,
  p1080: true,
  defaultQuality: 80,
  cellularQuality: 64,
  defaultAudioQa: 30280,
  cellularAudioQa: 30232,
  liveQuality: 10000,
  cellularLiveQuality: 400,
  cdnService: 'ali',
  liveCdnUrl: '',
  cdnSpeedTest: true,
  disableAudioCDN: false,
  preferCodec: 'avc',
  bufferSize: 32,
  bufferSec: 60,

  autoPlay: true,
  playOnWifi: false,
  enableSuperResolution: false,
  enableFrameInterpolation: false,
  enableSdrToHdr: false,
  enableQuickDouble: true,
  enableAutoLongPressSpeed: true,
  longPressSpeedDefault: 3.0,
  speedList: [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 3.0],
  enableSlideVolumeBrightness: true,
  enableSlideFS: true,
  fastForBackwardDuration: 10,
  sliderDuration: 90,
  subtitlePreference: 0,
  enableVerticalExpand: false,
  enableAutoEnter: false,
  enableAutoExit: true,
  continuePlayInBackground: false,
  fullScreenGestureReverse: false,
  showFSActionItem: true,
  showFSLockBtn: true,
  showFsScreenshotBtn: true,
  enableOnlineTotal: false,
  fullScreenMode: 0,
  btmProgressBehavior: 0,
  playRepeat: 0,
  showSeekPreview: true,
  enableShrinkVideoSize: true,
  playerVolume: 100,

  defaultPlaySpeed: 1.0,
  showBatteryLevel: true,
  useRelativeSlide: false,
  superChatType: 0,
  fullScreenScScale: 100,
  enableLongShowControl: false,
  tempPlayerConf: false,
  enableBackgroundPlay: true,
  autoRotate: true,
  enableHeartbeat: true,

  danmakuEnabled: true,
  danmakuColor: '#FFFFFF',
  danmakuOpacity: 1,
  danmakuFontSize: 15,
  danmakuSpeed: 8,
  danmakuLineHeight: 1.6,
  showVipDanmaku: true,
  mergeDanmaku: false,
  showDmChart: false,
  enableTapDm: true,

  showViewPoints: true,
  showRelatedVideo: true,
  showVideoReply: true,
  showBangumiReply: true,
  alwaysExpandIntro: false,
  replyLengthLimit: 6,
  showArgueMsg: true,
  showDynDispute: false,
  reverseFromFirst: true,
  continuePlayingPart: true,
  showDynActionBar: true,
  showPgcTimeline: true,
  defaultShowComment: true,
  enableQuickFav: false,
  enableWordRe: false,
  showDynInteraction: true,
  replySortType: 0,
  defaultDynamicType: 0,
  memberTab: 0,
  showMemberShop: false,

  enableSponsorBlock: false,
  sponsorBlockServer: 'https://www.bsbsb.top',
  sponsorBlockCategories: ['sponsor', 'selfpromo', 'interaction', 'intro', 'outro', 'preview'],
  sponsorBlockSkipTypes: {
    sponsor: 'skipOnce',
    selfpromo: 'skipOnce',
    interaction: 'skipOnce',
    intro: 'skipOnce',
    outro: 'skipOnce',
    preview: 'skipOnce',
    filler: 'skipOnce',
    music_offtopic: 'skipOnce',
    exclusive_access: 'skipOnce',
    poi_highlight: 'skipOnce',
    padding: 'skipOnce',
  },
  pgcSkipType: 0,
  preInitPlayer: false,
  enableLivePhoto: true,
  saveReply: true,
  enableDragSubtitle: false,
  silentDownImg: false,
  enableImgMenu: false,

  checkDynamic: true,
  dynamicPeriod: 5,
  banWordForDyn: '',
  banWordForReply: '',
  antiGoodsDyn: false,
  antiGoodsReply: false,
  enableCreateDynAntifraud: false,
  enableCommAntifraud: false,
  dynamicsWaterfallFlow: false,
  dynamicsShowAllFollowedUp: false,
  expandDynLivePanel: false,
  dynamicBadgeMode: 0,

  enableHttp2: false,
  badCertificateCallback: false,
  retryCount: 3,
  retryDelay: 500,
  enableSystemProxy: false,
  systemProxyHost: '',
  systemProxyPort: '',

  msgBadgeMode: 1,
  msgUnReadTypes: [0, 1, 2, 3],
  accentColor: '#FB7299',
  picQuality: 80,
  previewQuality: 90,
  isPureBlackTheme: false,
  defaultHomePage: 0,
  tabBarSort: ['recommend', 'hot', 'bangumi', 'live'],
  navBarSort: ['home', 'dynamics', 'media', 'mine'],
  feedLayout: 'immersive' as const,
  hideTopBar: true,
  hideBottomBar: true,
  darkVideoPage: false,
  removeSafeArea: false,

  subtitleFontScale: 1.0,
  subtitleFontScaleFS: 1.5,
  subtitleFontWeight: 5,
  subtitleStrokeWidth: 2,
  subtitlePaddingH: 24,
  subtitlePaddingB: 24,
  subtitleBgOpacity: 0.67,

  maxCacheSize: 512,

  webdavUri: '',
  webdavUsername: '',
  webdavPassword: '',
  webdavDirectory: '/',
};

export type SettingsSnapshot = Omit<SettingsState, 'init' | 'hydrate' | 'set'>;

export function getSettingsSnapshot(): SettingsSnapshot {
  const { init: _init, hydrate: _hydrate, set: _set, ...snapshot } = useSettingsStore.getState();
  return snapshot;
}

const NETWORK_SETTING_KEYS = new Set([
  'enableSystemProxy',
  'systemProxyHost',
  'systemProxyPort',
  'enableHttp2',
  'badCertificateCallback',
  'maxCacheSize',
  'retryCount',
  'retryDelay',
]);

function syncNativeNetworkConfig(state: SettingsState) {
  void configureNetworkAsync(buildNativeNetworkSettings(state) as Parameters<typeof configureNetworkAsync>[0]).catch(() => {});
}

/** 设置变更统一 debounce 为一次整表快照写入，避免滑杆/连续开关逐 key 写放大。 */
function scheduleSettingsPersist() {
  if (settingsPersistTimer) clearTimeout(settingsPersistTimer);
  settingsPersistTimer = setTimeout(() => {
    settingsPersistTimer = null;
    const { webdavPassword: _webdavPassword, ...safeSnapshot } = getSettingsSnapshot();
    void setSettingsSnapshotAsync(JSON.stringify(safeSnapshot)).catch(() => {});
  }, 150);
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...defaults,

  init: async () => {
    const nativeRaw = await getSettingsSnapshotAsync();
    if (nativeRaw) {
      try {
        const nativeSnapshot = JSON.parse(nativeRaw) as Partial<SettingsState>;
        delete nativeSnapshot.webdavPassword;
        const savedWebdavPassword = await secureStorage.get(WEBDAV_PASSWORD_KEY);
        if (savedWebdavPassword != null) {
          nativeSnapshot.webdavPassword = savedWebdavPassword;
        }
        if (Object.keys(nativeSnapshot).length > 0) {
          get().hydrate(nativeSnapshot);
        }
        syncNativeNetworkConfig(get());
        return;
      } catch {
        // 原生快照损坏时走旧版 AsyncStorage 迁移路径
      }
    }
    const snapshot = await storage.getJSON<Partial<SettingsState>>('settings');
    const keys = await storage.getKeysByPrefix('settings.');
    const entries = keys.length > 0 ? await storage.getMany(keys) : {};
    const merged: Partial<SettingsState> = { ...(snapshot ?? {}) };
    // 旧版逐 key 存储仅在新快照缺失时回填，避免陈旧值覆盖新值。
    for (const key of keys) {
      const field = key.slice('settings.'.length) as keyof SettingsState;
      if (field in merged) continue;
      const raw = entries[key];
      if (raw == null) continue;
      try {
        (merged as Record<string, unknown>)[field] = JSON.parse(raw);
      } catch {
        // 单个 key 损坏时跳过，不阻塞启动
      }
    }
    const mergedRecord = merged as Record<string, unknown>;
    const webdavPassword = mergedRecord.webdavPassword;
    delete mergedRecord.webdavPassword;
    const savedWebdavPassword = await secureStorage.get(WEBDAV_PASSWORD_KEY);
    if (savedWebdavPassword != null) {
      mergedRecord.webdavPassword = savedWebdavPassword;
    } else if (typeof webdavPassword === 'string' && webdavPassword !== '') {
      await secureStorage.set(WEBDAV_PASSWORD_KEY, webdavPassword);
      mergedRecord.webdavPassword = webdavPassword;
    }
    await storage.remove(WEBDAV_PASSWORD_KEY);
    if (Object.keys(merged).length > 0) {
      get().hydrate(merged);
    }
    syncNativeNetworkConfig(get());
    const { webdavPassword: _webdavPassword, ...initSnapshot } = getSettingsSnapshot();
    await setSettingsSnapshotAsync(JSON.stringify(initSnapshot)).catch(() => {});
    await storage.remove('settings').catch(() => {});
    for (const key of keys) {
      await storage.remove(key).catch(() => {});
    }
  },

  set: (partial) => {
    set(partial);
    let touchesNetwork = false;
    for (const [key, value] of Object.entries(partial)) {
      if (key === 'init' || key === 'hydrate' || key === 'set') continue;
      if (NETWORK_SETTING_KEYS.has(key)) touchesNetwork = true;
      if (key === 'webdavPassword') {
        if (typeof value === 'string' && value !== '') {
          void secureStorage.set(WEBDAV_PASSWORD_KEY, value);
        } else {
          void secureStorage.remove(WEBDAV_PASSWORD_KEY);
        }
        continue;
      }
    }
    scheduleSettingsPersist();
    if (touchesNetwork) syncNativeNetworkConfig(get());
  },

  hydrate: (partial) => {
    set(partial);
  },
}));
