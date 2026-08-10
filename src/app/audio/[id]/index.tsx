/**
 * AudioScreen —— B 站音乐播放页。
 * 播放统一走 audio-player.ts（共享 PiliPlayer + PiliAudio 后台会话），
 * 页面只负责取流、显示与播放/暂停；锁屏/远程命令/中断由原生统一处理。
 */
import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { useType } from '@/components/type-scale';
import { Press } from '@/components/motion';
import { apiClient, get } from '@/api/client';
import { formatPlayerTime } from '@/utils/player-utils';
import { biliCover } from '@/utils/image-url';
import { usePlayerStore } from '@/stores/player';
import { startAudioPlayback, releaseAudioPlayer, toggleAudioPlayback } from '@/utils/audio-player';

/** 页面卸载时串行释放，避免 StrictMode/快速进出时 release 与下一次 load 乱序 */
let pendingAudioRelease: Promise<void> | null = null;

export default function AudioScreen() {
  const { id, title, cover } = useLocalSearchParams<{ id: string; title?: string; cover?: string }>();
  const router = useRouter();
  const colors = useThemeColors();
  const T = useType();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const playing = usePlayerStore((s) => s.playing);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);

  useEffect(() => usePlayerStore.getState().subscribeProgress(), []);

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
          {
            bvid: String(id),
            title: String(title || '音频'),
            cover: cover ? String(cover) : '',
          },
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
  }, [id, title, cover]);

  const togglePlay = useCallback(() => {
    void toggleAudioPlayback().catch(() => {});
  }, []);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Title large>{String(title || '音频播放')}</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <View style={styles.content}>
        {cover ? (
          <ExpoImage source={{ uri: biliCover(String(cover), 400, 400) }} recyclingKey={String(cover)} cachePolicy="memory-disk" style={[styles.cover, { backgroundColor: colors.fill2 }]} contentFit="cover" />
        ) : (
          <View style={[styles.cover, { backgroundColor: colors.fill2, justifyContent: 'center', alignItems: 'center' }]}>
            <Ionicons name="musical-notes" size={64} color={colors.textTertiary} />
          </View>
        )}
        <Text style={[T.headline, styles.songTitle, { color: colors.text }]} numberOfLines={2}>{String(title || '音频')}</Text>
        {loading ? <ActivityIndicator color={colors.textSecondary} /> : null}
        {error ? <Text style={[T.footnote, { color: colors.textTertiary, textAlign: 'center' }]}>{error}</Text> : null}
        {!loading && !error ? (
          <>
            <Text style={[T.caption1, { color: colors.textSecondary }]}>
              {formatPlayerTime(currentTime)} / {formatPlayerTime(duration)}
            </Text>
            <Press haptic scaleTo={0.9} onPress={togglePlay} style={[styles.playBtn, { backgroundColor: ACCENT }]}>
              <Ionicons name={playing ? 'pause' : 'play'} size={26} color="#FFFFFF" />
            </Press>
            <Press
              haptic
              scaleTo={0.94}
              onPress={() => router.push({ pathname: '/main_reply/[oid]', params: { oid: String(id), type: '14', title: String(title || '音频评论') } } as any)}
              style={[styles.replyBtn, { backgroundColor: colors.fill2 }]}>
              <Ionicons name="chatbubble-outline" size={16} color={colors.textSecondary} />
              <Text style={[T.subhead, { color: colors.text }]}>评论</Text>
            </Press>
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  cover: { width: 260, height: 260, borderRadius: 18 },
  songTitle: { fontWeight: '700', textAlign: 'center' },
  playBtn: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  replyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 16 },
});
