/**
 * AudioScreen —— B 站音频播放页。
 * 播放统一走 audio-player.ts（共享 PiliPlayer + PiliAudio 后台会话）。
 *
 * 批次5 P3 补全（02-feature-parity "音频 audio"）：
 *  1. 歌单列表（相关歌曲）：经 songDetail 取 UP 主 uid → userApi.spaceAudio 拉取歌单，可点播切换；
 *  2. 定时关闭：复用 pili-native-core 原生定时器（对齐 PlayerSettingsSheet §1.3）；
 *  3. 音量控制 UI：进度/音量双滑杆（走 theme token，配合设置页 playerVolume 持久化）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, PanResponder, type LayoutChangeEvent } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, useAccent } from '@/components/SwiftUIHost';
import { useType } from '@/components/type-scale';
import { Press } from '@/components/motion';
import { apiClient, get } from '@/api/client';
import { audioApi } from '@/api/audio';
import { userApi } from '@/api/user';
import { formatPlayerTime } from '@/utils/player-utils';
import { biliCover } from '@/utils/image-url';
import { usePlayerStore } from '@/stores/player';
import { useSettingsStore } from '@/stores/settings';
import { startAudioPlayback, releaseAudioPlayer, toggleAudioPlayback } from '@/utils/audio-player';
import { startSleepTimer, cancelSleepTimer } from 'pili-native-core';
import { addSleepRemainingChangedListener, getSleepRemainingMs, setVolumeAsync } from 'pili-audio';
import { PiliPlayer } from 'pili-player';
import { NativeBottomSheet } from '@/components/NativeBottomSheet';
import { showToast } from '@/utils/toast';
import { RADII, continuous } from '@/theme/tokens';
import { formatCount } from '@/utils/format';

/** 页面卸载时串行释放，避免 StrictMode/快速进出时 release 与下一次 load 乱序 */
let pendingAudioRelease: Promise<void> | null = null;

/** 定时关闭选项（分钟）——对齐 PlayerSettingsSheet SLEEP_OPTIONS */
const SLEEP_OPTIONS = [
  { label: '不开启', value: 0 },
  { label: '10分钟', value: 10 },
  { label: '20分钟', value: 20 },
  { label: '30分钟', value: 30 },
  { label: '45分钟', value: 45 },
  { label: '60分钟', value: 60 },
];

interface SongItem {
  id: number;
  title: string;
  cover: string;
  play: number;
  comment: number;
}

/**
 * TrackBar —— 纯 RN 进度/音量滑杆（避免在普通 RN 页包一层 SwiftUI Host）。
 * 手势：按压/拖动实时预览，松手回调 onCommit。
 */
function TrackBar({
  value,
  max,
  accent,
  trackColor,
  onCommit,
  height = 4,
}: {
  value: number;
  max: number;
  accent: string;
  trackColor: string;
  onCommit: (v: number) => void;
  height?: number;
}) {
  const [width, setWidth] = useState(0);

  const ratio = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          if (width <= 0) return;
          const x = Math.min(Math.max(evt.nativeEvent.locationX, 0), width);
          onCommit((x / width) * max);
        },
        onPanResponderMove: (evt) => {
          if (width <= 0) return;
          const x = Math.min(Math.max(evt.nativeEvent.locationX, 0), width);
          onCommit((x / width) * max);
        },
      }),
    [max, width, onCommit],
  );

  const onLayout = (e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width);
  };

  return (
    <View
      onLayout={onLayout}
      {...panResponder.panHandlers}
      style={{ height: height + 14, justifyContent: 'center' }}>
      <View style={[styles.trackBg, { backgroundColor: trackColor, height }]}>
        <View
          style={[
            styles.trackFill,
            { backgroundColor: accent, height, width: width > 0 ? width * ratio : 0 },
          ]}
        />
        <View
          style={[
            styles.trackThumb,
            { backgroundColor: '#FFFFFF', borderColor: accent, left: width > 0 ? width * ratio - 7 : -7 },
          ]}
        />
      </View>
    </View>
  );
}

export default function AudioScreen() {
  const { id, title, cover } = useLocalSearchParams<{ id: string; title?: string; cover?: string }>();
  const colors = useThemeColors();
  const accent = useAccent();
  const T = useType();
  const settings = useSettingsStore();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentSong, setCurrentSong] = useState<{ id: string; title: string; cover: string }>({
    id: String(id),
    title: String(title || '音频'),
    cover: cover ? String(cover) : '',
  });
  const playing = usePlayerStore((s) => s.playing);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);

  /* ===== 歌单（相关歌曲） ===== */
  const [related, setRelated] = useState<SongItem[]>([]);
  const [playlistLoading, setPlaylistLoading] = useState(false);
  /* ===== 定时关闭 ===== */
  const [sleepRemainMin, setSleepRemainMin] = useState(0);
  /* ===== 弹层 ===== */
  const [sheet, setSheet] = useState<'sleep' | 'volume' | null>(null);

  useEffect(() => usePlayerStore.getState().subscribeProgress(), []);

  /* 定时关闭剩余分钟：由原生事件/主动拉取驱动（对齐 PlayerSettingsSheet §1.3） */
  useEffect(() => {
    const remove = addSleepRemainingChangedListener(({ remainingMs }) => {
      setSleepRemainMin(remainingMs > 0 ? Math.max(1, Math.ceil(remainingMs / 60000)) : 0);
    });
    void getSleepRemainingMs()
      .then((ms) => {
        if (ms > 0) setSleepRemainMin(Math.max(1, Math.ceil(ms / 60000)));
      })
      .catch(() => {});
    return remove;
  }, []);

  /* 定时关闭触发：播放停止由原生定时器直接处理（PlayerSettingsSheet 用
     addSleepTimerFiredListener 弹 toast；音频页保持轻量，剩余分钟事件已覆盖） */

  /* 首次进入：取流播放 + 拉歌单 */
  useEffect(() => {
    let cancelled = false;
    let startPromise: Promise<void> | null = null;

    (async () => {
      try {
        if (pendingAudioRelease) {
          await pendingAudioRelease;
          if (cancelled) return;
          pendingAudioRelease = null;
        }
        const res = await get(apiClient, '/audio/music-service-c/web/url', undefined, { params: { sid: id } });
        const url = res?.data?.data?.cdns?.[0] || res?.data?.data?.url;
        if (!url) throw new Error('no url');
        if (cancelled) return;
        startPromise = startAudioPlayback(
          url,
          { bvid: String(id), title: String(title || '音频'), cover: cover ? String(cover) : '' },
          0,
          false,
          false,
        );
        await startPromise;
      } catch {
        if (!cancelled) setError('无法获取音频地址');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      const previousRelease = pendingAudioRelease ?? Promise.resolve();
      pendingAudioRelease = previousRelease
        .catch(() => {})
        .then(async () => {
          if (startPromise) {
            await startPromise.catch(() => {});
          }
          if (cancelled) {
            await releaseAudioPlayer();
          }
        });
    };
  }, []);

  /* 进入页面时按设置同步音频音量（对齐 audio-player.ts 的 setVolumeAsync） */
  useEffect(() => {
    void setVolumeAsync(Math.min(Math.max(settings.playerVolume / 100, 0), 1)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* 拉取歌单（相关歌曲）：songDetail → 取 UP 主 uid → spaceAudio 列表 */
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setPlaylistLoading(true);
    });
    (async () => {
      try {
        const detailRes = await audioApi.songDetail({ sid: String(id) });
        const uploaderUid = detailRes?.data?.data?.uploader?.uid ?? detailRes?.data?.data?.song?.uploader?.uid ?? 0;
        if (!uploaderUid) return;
        const listRes = await userApi.spaceAudio({ mid: uploaderUid, pn: 1 });
        if (cancelled) return;
        const items = (listRes?.data?.data ?? []).map((it: any) => ({
          id: it.id ?? 0,
          title: it.title ?? '',
          cover: it.cover ?? '',
          play: it.statistic?.play ?? it.play ?? 0,
          comment: it.statistic?.comment ?? it.comment ?? 0,
        }));
        setRelated(items);
      } catch {
        /* 歌单拉取失败不阻塞播放 */
      } finally {
        if (!cancelled) setPlaylistLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const togglePlay = useCallback(() => {
    void toggleAudioPlayback().catch(() => {});
  }, []);

  /* 进度跳转：共享播放器处于 audio-only 模式，直接走 PiliPlayer.shared.seekTo */
  const handleSeek = useCallback((sec: number) => {
    const target = Math.min(Math.max(sec, 0), usePlayerStore.getState().duration || sec);
    try {
      PiliPlayer.shared.seekTo(target);
    } catch {
      /* 静默 */
    }
    usePlayerStore.getState().syncProgress(target, usePlayerStore.getState().duration);
  }, []);

  /* 音量：同步原生会话 + 持久化到设置（settings.playerVolume 0-100） */
  const handleVolume = useCallback(
    (v: number) => {
      const clamped = Math.min(Math.max(v, 0), 1);
      void setVolumeAsync(clamped).catch(() => {});
      settings.set({ playerVolume: Math.round(clamped * 100) });
    },
    [settings],
  );

  /* 定时关闭（对齐 PlayerSettingsSheet handleSleep） */
  const handleSleep = useCallback((min: number) => {
    if (min > 0) {
      setSleepRemainMin(min);
      void startSleepTimer(min * 60)
        .then(() => getSleepRemainingMs())
        .then((ms) => {
          if (ms > 0) setSleepRemainMin(Math.max(1, Math.ceil(ms / 60000)));
        })
        .catch(() => {});
      showToast(`${min}分钟后自动关闭`);
    } else {
      void cancelSleepTimer().catch(() => {});
      setSleepRemainMin(0);
    }
    setSheet(null);
  }, []);

  /* 歌单点播：切换当前歌曲 */
  const playSong = useCallback(async (item: SongItem) => {
    const sid = String(item.id);
    if (sid === currentSong.id) return;
    try {
      const res = await get(apiClient, '/audio/music-service-c/web/url', undefined, { params: { sid } });
      const url = res?.data?.data?.cdns?.[0] || res?.data?.data?.url;
      if (!url) throw new Error('no url');
      await startAudioPlayback(
        url,
        { bvid: sid, title: item.title || '音频', cover: item.cover || '' },
        0,
        false,
        false,
      );
      setCurrentSong({ id: sid, title: item.title, cover: item.cover });
    } catch {
      showToast('无法获取音频地址');
    }
  }, [currentSong.id]);

  const volumeBar = (
    <View style={styles.volumeRow}>
      <Ionicons name="volume-low" size={18} color={colors.textSecondary} />
      <View style={styles.volumeSliderWrap}>
        <TrackBar
          value={settings.playerVolume}
          max={100}
          accent={accent}
          trackColor={colors.fill2}
          onCommit={handleVolume}
        />
      </View>
      <Ionicons name="volume-high" size={18} color={colors.textSecondary} />
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Title large>{currentSong.title}</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <View style={styles.content}>
        <View style={styles.playerBlock}>
          {currentSong.cover ? (
            <ExpoImage source={{ uri: biliCover(currentSong.cover, 400, 400) }} recyclingKey={currentSong.cover} cachePolicy="memory-disk" style={[styles.cover, { backgroundColor: colors.fill2 }]} contentFit="cover" />
          ) : (
            <View style={[styles.cover, { backgroundColor: colors.fill2, justifyContent: 'center', alignItems: 'center' }]}>
              <Ionicons name="musical-notes" size={64} color={colors.textTertiary} />
            </View>
          )}
          <Text style={[T.headline, styles.songTitle, { color: colors.text }]} numberOfLines={2}>{currentSong.title}</Text>
          {loading ? <ActivityIndicator color={colors.textSecondary} /> : null}
          {error ? <Text style={[T.footnote, { color: colors.textTertiary, textAlign: 'center' }]}>{error}</Text> : null}
          {!loading && !error ? (
            <>
              {/* 进度条 */}
              <View style={styles.progressWrap}>
                <Text style={[T.caption2, styles.timeText, { color: colors.textTertiary }]}>{formatPlayerTime(currentTime)}</Text>
                <View style={styles.progressBarWrap}>
                  <TrackBar
                    value={currentTime}
                    max={duration}
                    accent={accent}
                    trackColor={colors.fill2}
                    onCommit={handleSeek}
                  />
                </View>
                <Text style={[T.caption2, styles.timeText, { color: colors.textTertiary }]}>{formatPlayerTime(duration)}</Text>
              </View>

              {/* 控制行：播放/定时关闭/音量 */}
              <View style={styles.controlRow}>
                <Press haptic scaleTo={0.9} onPress={() => setSheet('sleep')} style={styles.iconBtn}>
                  <Ionicons name="moon-outline" size={22} color={sleepRemainMin > 0 ? accent : colors.textSecondary} />
                </Press>
                <Press haptic scaleTo={0.9} onPress={togglePlay} style={[styles.playBtn, { backgroundColor: accent }]}>
                  <Ionicons name={playing ? 'pause' : 'play'} size={26} color="#FFFFFF" />
                </Press>
                <Press haptic scaleTo={0.9} onPress={() => setSheet('volume')} style={styles.iconBtn}>
                  <Ionicons name={settings.playerVolume === 0 ? 'volume-mute' : 'volume-medium'} size={22} color={colors.textSecondary} />
                </Press>
              </View>
            </>
          ) : null}
        </View>

        {/* 歌单（相关歌曲） */}
        <View style={styles.playlistHeader}>
          <Ionicons name="list" size={15} color={accent} />
          <Text style={[T.subhead, styles.playlistTitle, { color: colors.text }]}>相关歌曲</Text>
          {playlistLoading ? <ActivityIndicator size="small" color={colors.textTertiary} /> : null}
          <Press
            haptic
            scaleTo={0.94}
            onPress={() => router.push({ pathname: '/main_reply/[oid]', params: { oid: String(id), type: '14', title: String(currentSong.title || '音频评论') } } as any)}
            style={[styles.replyBtn, { backgroundColor: colors.fill2 }]}>
            <Ionicons name="chatbubble-outline" size={13} color={colors.textSecondary} />
            <Text style={[T.caption1, { color: colors.text }]}>评论</Text>
          </Press>
        </View>
        <View style={[styles.playlistCard, { backgroundColor: colors.card, ...continuous }]}>
          {related.length === 0 && !playlistLoading ? (
            <Text style={[T.footnote, { color: colors.textTertiary, textAlign: 'center', paddingVertical: 18 }]}>
              暂未获取到歌单数据（接口未返回 UP 主信息）
            </Text>
          ) : (
            related.map((item, idx) => {
              const isCurrent = String(item.id) === currentSong.id;
              return (
                <Press
                  key={item.id}
                  haptic
                  scaleTo={0.97}
                  onPress={() => playSong(item)}
                  style={[styles.songRow, idx > 0 && { borderTopColor: colors.separator, borderTopWidth: StyleSheet.hairlineWidth }]}>
                  <ExpoImage source={{ uri: biliCover(item.cover, 96, 96) }} recyclingKey={String(item.cover)} cachePolicy="memory-disk" style={[styles.songCover, { backgroundColor: colors.fill2 }]} contentFit="cover" />
                  <View style={styles.songInfo}>
                    <Text style={[T.subhead, styles.songName, { color: isCurrent ? accent : colors.text }]} numberOfLines={1}>{item.title}</Text>
                    <View style={styles.songStat}>
                      <Ionicons name="headset-outline" size={11} color={colors.textTertiary} />
                      <Text style={[T.caption2, { color: colors.textTertiary }]}>{formatCount(item.play)}</Text>
                      <Ionicons name="chatbubble-outline" size={11} color={colors.textTertiary} />
                      <Text style={[T.caption2, { color: colors.textTertiary }]}>{formatCount(item.comment)}</Text>
                    </View>
                  </View>
                  <Ionicons name={isCurrent && playing ? 'volume-high' : isCurrent ? 'volume-medium' : 'play-circle-outline'} size={20} color={isCurrent ? accent : colors.textTertiary} />
                </Press>
              );
            })
          )}
        </View>
      </View>

      {/* 定时关闭弹层（对齐 PlayerSettingsSheet） */}
      <NativeBottomSheet visible={sheet === 'sleep'} onClose={() => setSheet(null)} detents={['medium']} background={colors.bg}>
        <View style={styles.sheetContent}>
          <Text style={[T.headline, styles.sheetTitle, { color: colors.text }]}>定时关闭</Text>
          <Text style={[T.footnote, { color: colors.textTertiary, marginBottom: 14 }]}>
            {sleepRemainMin > 0 ? `已开启，剩余约 ${sleepRemainMin} 分钟` : '播放停止后自动退出'}
          </Text>
          <View style={styles.grid}>
            {SLEEP_OPTIONS.map((opt) => (
              <Press
                key={opt.value}
                haptic
                scaleTo={0.9}
                onPress={() => handleSleep(opt.value)}
                style={[styles.gridBtn, { backgroundColor: sleepRemainMin === opt.value && opt.value > 0 ? accent : colors.fill2, ...continuous }]}>
                <Text style={[T.caption1, { color: sleepRemainMin === opt.value && opt.value > 0 ? '#FFFFFF' : colors.text }]}>{opt.label}</Text>
              </Press>
            ))}
          </View>
        </View>
      </NativeBottomSheet>

      {/* 音量弹层（进度/音量条走 token） */}
      <NativeBottomSheet visible={sheet === 'volume'} onClose={() => setSheet(null)} detents={['medium']} background={colors.bg}>
        <View style={styles.sheetContent}>
          <Text style={[T.headline, styles.sheetTitle, { color: colors.text }]}>音量</Text>
          <View style={styles.sheetVolumeRow}>{volumeBar}</View>
          <Text style={[T.footnote, { color: colors.textTertiary, textAlign: 'center' }]}>{settings.playerVolume}%</Text>
          <View style={[styles.chipRow, { justifyContent: 'center', marginTop: 12 }]}>
            {[0, 25, 50, 75, 100].map((v) => (
              <Press
                key={v}
                haptic
                scaleTo={0.9}
                onPress={() => handleVolume(v / 100)}
                style={[styles.chip, { backgroundColor: settings.playerVolume === v ? accent : colors.fill2, ...continuous }]}>
                <Text style={[T.caption1, { color: settings.playerVolume === v ? '#FFFFFF' : colors.textSecondary }]}>{v}%</Text>
              </Press>
            ))}
          </View>
        </View>
      </NativeBottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1, padding: 20 },
  playerBlock: { alignItems: 'center', gap: 14 },
  cover: { width: 240, height: 240, borderRadius: RADII.lg, ...continuous },
  songTitle: { fontWeight: '700', textAlign: 'center' },
  progressWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'stretch', marginTop: 4 },
  timeText: { width: 44, textAlign: 'center' },
  progressBarWrap: { flex: 1 },
  controlRow: { flexDirection: 'row', alignItems: 'center', gap: 32, marginTop: 6 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  playBtn: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center' },
  playlistHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 22, marginBottom: 10 },
  playlistTitle: { flex: 1, fontWeight: '600' },
  playlistCard: { borderRadius: RADII.card, paddingHorizontal: 12, overflow: 'hidden' },
  songRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  songCover: { width: 44, height: 44, borderRadius: RADII.sm, ...continuous },
  songInfo: { flex: 1, gap: 2 },
  songName: { fontWeight: '600' },
  songStat: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  replyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADII.sm, ...continuous },
  trackBg: { borderRadius: 999, overflow: 'hidden' },
  trackFill: { borderRadius: 999 },
  trackThumb: {
    position: 'absolute',
    top: -5,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
  sheetContent: { padding: 20, paddingBottom: 32 },
  sheetTitle: { fontWeight: '700', marginBottom: 6, textAlign: 'center' },
  volumeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  volumeSliderWrap: { flex: 1, height: 32, justifyContent: 'center' },
  sheetVolumeRow: { marginTop: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  gridBtn: { width: '30%', paddingVertical: 12, borderRadius: RADII.md, alignItems: 'center', ...continuous },
  chipRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADII.sm, ...continuous },
});
