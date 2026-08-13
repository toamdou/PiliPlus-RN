import { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { useType } from '@/components/type-scale';
import { Press } from '@/components/motion';
import {
  discoverDlnaDevices,
  dlnaPause,
  dlnaPlay,
  dlnaSetUrl,
  dlnaStop,
  stopDlnaDiscovery,
  type DlnaDevice,
} from '@/utils/dlna';
import { showToast } from '@/utils/toast';
import { PiliPlayer } from 'pili-player';
import { usePlayerStore } from '@/stores/player';

export default function DlnaScreen() {
  const params = useLocalSearchParams<{ url?: string; title?: string }>();
  const router = useRouter();
  const colors = useThemeColors();
  const T = useType();
  const url = String(params.url || '');
  const title = String(params.title || '');
  const [devices, setDevices] = useState<DlnaDevice[]>([]);
  const [searching, setSearching] = useState(false);
  const [currentKey, setCurrentKey] = useState('');
  const mountedRef = useRef(true);
  const searchIdRef = useRef(0);
  // 04-3.6：记录本机播放器是否因投屏被暂停，以及投屏时的进度位置，
  // 停止投屏时据此恢复本机播放（可选续播）。
  const pausedByCastRef = useRef(false);
  const castProgressRef = useRef(0);

  const search = useCallback(async () => {
    searchIdRef.current += 1;
    const searchId = searchIdRef.current;
    await stopDlnaDiscovery().catch(() => {});
    if (searchId !== searchIdRef.current) return;
    setSearching(true);
    setDevices([]);
    try {
      const found = await discoverDlnaDevices(8500);
      if (!mountedRef.current || searchId !== searchIdRef.current) return;
      setDevices(found);
      setSearching(false);
      if (found.length === 0) showToast('未发现投屏设备');
    } catch (e) {
      if (!mountedRef.current || searchId !== searchIdRef.current) return;
      setSearching(false);
      showToast(e instanceof Error ? e.message : '投屏设备搜索失败');
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const timer = setTimeout(() => search(), 0);
    return () => {
      clearTimeout(timer);
      mountedRef.current = false;
      searchIdRef.current += 1;
      void stopDlnaDiscovery().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cast = useCallback(
    async (device: DlnaDevice) => {
      if (!url) {
        showToast('没有可投屏的播放地址');
        return;
      }
      try {
        if (currentKey && currentKey !== device.key) {
          const prev = devices.find((d) => d.key === currentKey);
          if (prev) await dlnaPause(prev).catch(() => {});
        }
        setCurrentKey(device.key);
        await dlnaSetUrl(device, url, title);
        await dlnaPlay(device);
        // 04-3.6：投屏成功后暂停本机播放（避免声音双出）+ 记录进度，
        // 停止投屏时可据此恢复续播。
        const player = PiliPlayer.shared;
        if (player.playing) {
          castProgressRef.current = player.currentTime || 0;
          try { player.pause(); } catch {}
          try {
            usePlayerStore.getState().syncProgress(
              player.currentTime || 0,
              player.duration || 0,
            );
          } catch {}
          pausedByCastRef.current = true;
        }
        showToast(`已投屏到 ${device.friendlyName}`);
      } catch (e) {
        showToast(`投屏失败：${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [url, title, currentKey, devices],
  );

  const stopCast = useCallback(
    async (device: DlnaDevice) => {
      try {
        await dlnaStop(device);
        // 04-3.6：停止投屏后恢复本机播放（此前若因投屏被暂停则续播）
        const player = PiliPlayer.shared;
        if (pausedByCastRef.current) {
          pausedByCastRef.current = false;
          try {
            const pos = castProgressRef.current;
            if (pos > 0) player.currentTime = pos;
            player.play();
          } catch {}
        }
        setCurrentKey('');
        showToast('已停止投屏');
      } catch {
        showToast('停止失败');
      }
    },
    [],
  );

  const renderRow = useCallback(
    ({ item }: { item: DlnaDevice }) => (
      <Press
        haptic
        scaleTo={0.97}
        onPress={() => cast(item)}
        onLongPress={() => stopCast(item)}
        style={[styles.row, { backgroundColor: item.key === currentKey ? ACCENT : colors.card }]}>
        <Ionicons name="tv-outline" size={22} color={item.key === currentKey ? '#FFFFFF' : colors.textSecondary} />
        <View style={styles.info}>
          <Text style={[T.subhead, { color: item.key === currentKey ? '#FFFFFF' : colors.text }]} numberOfLines={1}>
            {item.friendlyName}
          </Text>
          <Text style={[T.caption2, { color: item.key === currentKey ? 'rgba(255,255,255,0.7)' : colors.textTertiary }]} numberOfLines={1}>
            {item.key}
          </Text>
        </View>
        {item.key === currentKey ? <Ionicons name="play" size={18} color="#FFFFFF" /> : null}
      </Press>
    ),
    [colors, T, cast, stopCast, currentKey],
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Title large>投屏</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <View style={styles.headerRow}>
        <Text style={[T.caption1, { color: colors.textTertiary }]}>
          {url ? `即将投屏：${title || '视频'}` : '当前没有播放地址，请从视频页进入'}
        </Text>
        <Press haptic scaleTo={0.92} onPress={search} style={[styles.searchBtn, { backgroundColor: colors.fill2 }]}>
          <Ionicons name="refresh" size={16} color={colors.text} />
          <Text style={[T.footnote, { color: colors.text }]}>搜索</Text>
        </Press>
      </View>
      {searching ? <ActivityIndicator color={colors.textSecondary} style={{ marginVertical: 18 }} /> : null}
      <FlashList
        data={devices}
        keyExtractor={(it) => it.key}
        contentContainerStyle={styles.listContent}
        estimatedItemSize={72}
        drawDistance={250}
        overrideProps={{ initialDrawBatchSize: 10 }}
        refreshControl={<RefreshControl refreshing={searching} onRefresh={search} tintColor={colors.textSecondary} />}
        ListEmptyComponent={
          searching ? null : (
            <View style={styles.empty}>
              <Ionicons name="tv-outline" size={38} color={colors.textTertiary} />
              <Text style={[T.headline, { color: colors.text }]}>没有发现投屏设备</Text>
              <Text style={[T.footnote, { color: colors.textSecondary }]}>请确认电视/盒子已开启 DLNA 并处于同一网络</Text>
            </View>
          )
        }
        renderItem={renderRow}
      />
      {url ? (
        <Press haptic scaleTo={0.94} onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.fill2 }]}>
          <Text style={[T.subhead, { color: colors.text }]}>返回播放</Text>
        </Press>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 14, paddingTop: 10 },
  searchBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14 },
  listContent: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 80, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14 },
  info: { flex: 1, gap: 3 },
  empty: { alignItems: 'center', paddingTop: 120, gap: 10 },
  backBtn: { position: 'absolute', left: 14, right: 14, bottom: 20, alignItems: 'center', paddingVertical: 13, borderRadius: 16 },
});
