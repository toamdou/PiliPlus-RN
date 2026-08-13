/**
 * MusicScreen —— B 站音乐 MV 详情页（music_id 参数，R5 已修：bgmDetail/bgmRecommend 用 music_id）。
 *
 * 批次5 P3 补全（02-feature-parity "音乐 MV music"）：
 *  - 播放器完整控制：页内播放（audio-only 流）/ 播放进度滑杆 / 上一首 / 下一首；
 *  - 歌单切换：bgmRecommend 相关推荐列表，点击即切曲。
 *
 * 播放说明：MV 取流统一走音频服务 web 接口（与 audio/[id] 一致），
 * 复用一个共享 TrackBar（进度/音量）；无独立 MV 播放器（视频轨能力由 pili-player 承担）。
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Share, ActivityIndicator,
  PanResponder, type LayoutChangeEvent,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, useAccent } from '@/components/SwiftUIHost';
import { useType } from '@/components/type-scale';
import { Press } from '@/components/motion';
import { musicApi } from '@/api/music';
import { apiClient, get } from '@/api/client';
import { formatCount } from '@/utils/format';
import { formatPlayerTime } from '@/utils/player-utils';
import { biliCover } from '@/utils/image-url';
import { usePlayerStore } from '@/stores/player';
import { useSettingsStore } from '@/stores/settings';
import { startAudioPlayback, releaseAudioPlayer, toggleAudioPlayback } from '@/utils/audio-player';
import { setVolumeAsync } from 'pili-audio';
import { PiliPlayer } from 'pili-player';
import { showToast } from '@/utils/toast';
import { RADII, continuous } from '@/theme/tokens';

interface MusicDetail {
  musicId: string;
  title: string;
  cover: string;
  author: string;
  play: number;
  collect: number;
  comment: number;
  commentOid?: number;
  commentType?: number;
  intro?: string;
}

interface PlaylistItem {
  id: string;
  title: string;
  cover: string;
  author: string;
}

/** 页面卸载时串行释放播放器（对齐 audio 页） */
let pendingAudioRelease: Promise<void> | null = null;

/**
 * TrackBar —— 纯 RN 进度/音量滑杆（普通 RN 页内联，不引入 SwiftUI Host）。
 * 拖拽过程中实时 onCommit；startAudioPlayback 播放时 seek 走共享播放器。
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

export default function MusicDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colors = useThemeColors();
  const accent = useAccent();
  const T = useType();
  const settings = useSettingsStore();
  const [detail, setDetail] = useState<MusicDetail | null>(null);
  const [loading, setLoading] = useState(true);
  /* ===== 歌单切换 ===== */
  const [playlist, setPlaylist] = useState<PlaylistItem[]>([]);
  const [playlistLoading, setPlaylistLoading] = useState(false);
  /* ===== 页内播放器 ===== */
  const [current, setCurrent] = useState<PlaylistItem | null>(null);
  const [streamError, setStreamError] = useState('');
  const playing = usePlayerStore((s) => s.playing);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const currentBvid = usePlayerStore((s) => s.currentBvid);

  useEffect(() => usePlayerStore.getState().subscribeProgress(), []);

  /* 进入页面时同步音量（对齐 audio-player.ts） */
  useEffect(() => {
    void setVolumeAsync(Math.min(Math.max(settings.playerVolume / 100, 0), 1)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* 卸载串行释放播放器 */
  useEffect(() => {
    return () => {
      const previousRelease = pendingAudioRelease ?? Promise.resolve();
      pendingAudioRelease = previousRelease.catch(() => {}).then(() => releaseAudioPlayer());
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await musicApi.bgmDetail({ id: String(id || '') });
      const d = res?.data?.detail || res?.data;
      if (d) {
        setDetail({
          musicId: String(d.music_id ?? d.id ?? id),
          title: d.title || d.song_title || '',
          cover: d.cover || d.pic || '',
          author: d.author || d.singer_name || '',
          play: d.statistic?.play ?? d.play ?? 0,
          collect: d.statistic?.collect ?? d.collect ?? 0,
          comment: d.statistic?.comment ?? d.comment ?? 0,
          commentOid: d.music_comment?.oid ?? d.comment_oid ?? 0,
          commentType: d.music_comment?.page_type ?? d.comment_type ?? 47,
          intro: d.intro || d.desc || '',
        });
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  /* 加载相关推荐列表（bgmRecommend，R5 参数已修复） */
  const loadPlaylist = useCallback(async () => {
    setPlaylistLoading(true);
    try {
      const res = await musicApi.bgmRecommend({ id: String(id || '') });
      const list = res?.data?.list ?? res?.data?.data ?? res?.data?.recommend ?? [];
      const items = (Array.isArray(list) ? list : []).map((it: any) => ({
        id: String(it.music_id ?? it.id),
        title: it.title || it.song_title || '',
        cover: it.cover || it.pic || '',
        author: it.author || it.singer_name || '',
      }));
      setPlaylist(items);
    } catch {
      /* 推荐列表失败不阻塞详情 */
    } finally {
      setPlaylistLoading(false);
    }
  }, [id]);

  useEffect(() => {
    const t = setTimeout(loadPlaylist, 0);
    return () => clearTimeout(t);
  }, [loadPlaylist]);

  /* 播放指定曲目：取音频流 → startAudioPlayback（audio-only） */
  const playTrack = useCallback(
    async (track: PlaylistItem) => {
      setStreamError('');
      if (pendingAudioRelease) {
        await pendingAudioRelease;
        pendingAudioRelease = null;
      }
      try {
        const res = await get(apiClient, '/audio/music-service-c/web/url', undefined, { params: { sid: track.id } });
        const url = res?.data?.data?.cdns?.[0] || res?.data?.data?.url;
        if (!url) throw new Error('no url');
        await startAudioPlayback(
          url,
          { bvid: track.id, title: track.title || '音乐', cover: track.cover || '' },
          0,
          false,
          false,
        );
        setCurrent(track);
      } catch {
        setStreamError('无法获取该曲目音频地址');
      }
    },
    [],
  );

  const togglePlay = useCallback(() => {
    void toggleAudioPlayback().catch(() => {});
  }, []);

  /* 上一首 / 下一首（歌单内循环切换） */
  const skipTo = useCallback(
    (dir: 1 | -1) => {
      if (playlist.length === 0) return;
      const idx = playlist.findIndex((t) => t.id === (current?.id ?? detail?.musicId));
      const next = (idx < 0 ? 0 : (idx + dir + playlist.length) % playlist.length);
      void playTrack(playlist[next]);
    },
    [playlist, current, detail, playTrack],
  );

  /* 进度 seek：audio-only 模式走共享播放器 */
  const handleSeek = useCallback((sec: number) => {
    const target = Math.min(Math.max(sec, 0), usePlayerStore.getState().duration || sec);
    try {
      PiliPlayer.shared.seekTo(target);
    } catch {
      /* 静默 */
    }
    usePlayerStore.getState().syncProgress(target, usePlayerStore.getState().duration);
  }, []);

  const share = async () => {
    try {
      await Share.share({ message: `${detail?.title || '音乐'} - ${detail?.author || ''}` });
    } catch {}
  };

  if (loading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <Stack.Title large>音乐详情</Stack.Title>
        <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      </View>
    );
  }

  const playingCurrent =
    !!current && playing && current.id === currentBvid;

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Title large>{detail?.title || '音乐详情'}</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <ScrollView contentContainerStyle={styles.content}>
        {detail?.cover ? (
          <ExpoImage source={{ uri: biliCover(detail.cover, 400, 400) }} recyclingKey={detail.cover} cachePolicy="memory-disk" style={[styles.cover, { backgroundColor: colors.fill2 }]} contentFit="cover" />
        ) : null}
        <Text style={[T.headline, styles.title, { color: colors.text }]}>{detail?.title || '未找到音乐信息'}</Text>
        {detail?.author ? <Text style={[T.subhead, { color: colors.textSecondary }]}>{detail.author}</Text> : null}
        <View style={styles.stats}>
          <View style={styles.stat}><Ionicons name="play" size={14} color={colors.textTertiary} /><Text style={[T.caption1, { color: colors.textTertiary }]}>{formatCount(detail?.play ?? 0)}</Text></View>
          <View style={styles.stat}><Ionicons name="heart-outline" size={14} color={colors.textTertiary} /><Text style={[T.caption1, { color: colors.textTertiary }]}>{formatCount(detail?.collect ?? 0)}</Text></View>
          <View style={styles.stat}><Ionicons name="chatbubble-outline" size={14} color={colors.textTertiary} /><Text style={[T.caption1, { color: colors.textTertiary }]}>{formatCount(detail?.comment ?? 0)}</Text></View>
        </View>
        {detail?.intro ? <Text style={[T.footnote, styles.intro, { color: colors.textSecondary }]}>{detail.intro}</Text> : null}

        {/* ===== 页内播放器（进度/歌单切换） ===== */}
        <View style={[styles.playerCard, { backgroundColor: colors.card, ...continuous }]}>
          {current ? (
            <>
              <View style={styles.playingRow}>
                <ExpoImage source={{ uri: biliCover(current.cover, 96, 96) }} recyclingKey={current.cover} cachePolicy="memory-disk" style={[styles.miniCover, { backgroundColor: colors.fill2 }]} contentFit="cover" />
                <View style={styles.playingInfo}>
                  <Text style={[T.subhead, styles.playingName, { color: colors.text }]} numberOfLines={1}>{current.title}</Text>
                  {current.author ? <Text style={[T.caption1, { color: colors.textSecondary }]} numberOfLines={1}>{current.author}</Text> : null}
                </View>
                <Ionicons name={playingCurrent ? 'volume-high' : 'musical-notes'} size={20} color={playingCurrent ? accent : colors.textTertiary} />
              </View>
              <View style={styles.progressRow}>
                <Text style={[T.caption2, styles.timeText, { color: colors.textTertiary }]}>{formatPlayerTime(currentTime)}</Text>
                <View style={styles.progressBarWrap}>
                  <TrackBar value={currentTime} max={duration} accent={accent} trackColor={colors.fill2} onCommit={handleSeek} />
                </View>
                <Text style={[T.caption2, styles.timeText, { color: colors.textTertiary }]}>{formatPlayerTime(duration)}</Text>
              </View>
              <View style={styles.ctrlRow}>
                <Press haptic scaleTo={0.9} onPress={() => skipTo(-1)} style={styles.ctrlBtn}>
                  <Ionicons name="play-skip-back" size={22} color={colors.textSecondary} />
                </Press>
                <Press haptic scaleTo={0.9} onPress={togglePlay} style={[styles.playBtn, { backgroundColor: accent }]}>
                  <Ionicons name={playing ? 'pause' : 'play'} size={24} color="#FFFFFF" />
                </Press>
                <Press haptic scaleTo={0.9} onPress={() => skipTo(1)} style={styles.ctrlBtn}>
                  <Ionicons name="play-skip-forward" size={22} color={colors.textSecondary} />
                </Press>
              </View>
              {streamError ? <Text style={[T.caption1, { color: colors.badge, textAlign: 'center' }]}>{streamError}</Text> : null}
            </>
          ) : (
            <View style={styles.playerIdle}>
              <Ionicons name="musical-notes" size={22} color={colors.textTertiary} />
              <Text style={[T.footnote, { color: colors.textTertiary }]}>从下方歌单选择一首开始播放</Text>
            </View>
          )}
        </View>

        <View style={styles.actions}>
          <Press haptic scaleTo={0.94} onPress={() => playTrack({ id: String(detail?.musicId || id), title: detail?.title || '', cover: detail?.cover || '', author: detail?.author || '' })} style={[styles.btn, { backgroundColor: accent }]}>
            <Ionicons name="play" size={16} color="#FFFFFF" />
            <Text style={[T.subhead, styles.btnText]}>播放</Text>
          </Press>
          <Press haptic scaleTo={0.94} onPress={share} style={[styles.btn, { backgroundColor: colors.fill2 }]}>
            <Text style={[T.subhead, { color: colors.text }]}>分享</Text>
          </Press>
          <Press
            haptic
            scaleTo={0.94}
            onPress={() => router.push({ pathname: '/main_reply/[oid]', params: { oid: String(detail?.commentOid || id), type: String(detail?.commentType || 47), title: detail?.title || '评论' } } as any)}
            style={[styles.btn, { backgroundColor: colors.fill2 }]}>
            <Ionicons name="chatbubble-outline" size={16} color={colors.text} />
            <Text style={[T.subhead, { color: colors.text }]}>评论</Text>
          </Press>
        </View>

        {/* ===== 歌单（相关推荐） ===== */}
        <View style={styles.playlistHeader}>
          <Ionicons name="list" size={15} color={accent} />
          <Text style={[T.subhead, styles.playlistTitle, { color: colors.text }]}>歌单</Text>
          {playlistLoading ? <ActivityIndicator size="small" color={colors.textTertiary} /> : null}
        </View>
        <View style={[styles.listCard, { backgroundColor: colors.card, ...continuous }]}>
          {playlist.length === 0 && !playlistLoading ? (
            <Text style={[T.footnote, { color: colors.textTertiary, textAlign: 'center', paddingVertical: 18 }]}>暂无相关推荐</Text>
          ) : (
            playlist.map((item, idx) => {
              const isCurrent = current?.id === item.id;
              return (
                <Press
                  key={item.id}
                  haptic
                  scaleTo={0.97}
                  onPress={() => playTrack(item)}
                  style={[styles.songRow, idx > 0 && { borderTopColor: colors.separator, borderTopWidth: StyleSheet.hairlineWidth }]}>
                  <ExpoImage source={{ uri: biliCover(item.cover, 96, 96) }} recyclingKey={item.cover} cachePolicy="memory-disk" style={[styles.songCover, { backgroundColor: colors.fill2 }]} contentFit="cover" />
                  <View style={styles.songInfo}>
                    <Text style={[T.subhead, styles.songName, { color: isCurrent ? accent : colors.text }]} numberOfLines={1}>{item.title}</Text>
                    {item.author ? <Text style={[T.caption1, { color: colors.textTertiary }]} numberOfLines={1}>{item.author}</Text> : null}
                  </View>
                  <Ionicons name={isCurrent && playing ? 'volume-high' : isCurrent ? 'volume-medium' : 'play-circle-outline'} size={20} color={isCurrent ? accent : colors.textTertiary} />
                </Press>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 20, alignItems: 'center', gap: 14 },
  cover: { width: 240, height: 240, borderRadius: RADII.lg, ...continuous },
  title: { fontWeight: '700', textAlign: 'center' },
  stats: { flexDirection: 'row', gap: 18 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  intro: { textAlign: 'center', lineHeight: 20 },
  playerCard: {
    alignSelf: 'stretch',
    borderRadius: RADII.card,
    padding: 14,
    gap: 6,
  },
  playerIdle: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  playingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  miniCover: { width: 44, height: 44, borderRadius: RADII.sm, ...continuous },
  playingInfo: { flex: 1, gap: 1 },
  playingName: { fontWeight: '600' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  timeText: { width: 42, textAlign: 'center' },
  progressBarWrap: { flex: 1 },
  ctrlRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 36, marginTop: 4 },
  ctrlBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  playBtn: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: 12, marginTop: 6 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingVertical: 11, borderRadius: RADII.md, ...continuous },
  btnText: { color: '#FFFFFF', fontWeight: '600' },
  playlistHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'stretch', marginTop: 8 },
  playlistTitle: { flex: 1, fontWeight: '600' },
  listCard: { alignSelf: 'stretch', borderRadius: RADII.card, paddingHorizontal: 12, overflow: 'hidden' },
  songRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  songCover: { width: 44, height: 44, borderRadius: RADII.sm, ...continuous },
  songInfo: { flex: 1, gap: 1 },
  songName: { fontWeight: '600' },
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
});
