import { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import { View, Text, StyleSheet, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Stack, useRouter, Link, useScrollToTop } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { favApi } from '@/api/fav';
import { videoApi } from '@/api/video';
import { usePagedList } from '@/hooks/use-paged-list';
import { formatTime, formatDuration } from '@/utils/format';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { RADII, continuous } from '@/theme/tokens';
import { feedBackMedium, feedBackSuccess } from '@/utils/feedback';
import { showToast } from '@/utils/toast';
import { biliCover } from '@/utils/image-url';
import { SkeletonMediaRow } from '@/components/Skeleton';

interface HistoryItem {
  title: string;
  cover: string;
  uri: string;
  history: { oid: number; bvid: string; business: string; dt: number };
  duration: number;
  progress: number;
  author_name: string;
  view_at: number;
}

/* ===== 历史行 ===== */
const HistoryRow = memo(function HistoryRow({
  item,
  index: _index,
  colors,
  onRemove,
}: {
  item: HistoryItem;
  index: number;
  colors: ReturnType<typeof useThemeColors>;
  onRemove?: (item: HistoryItem) => void;
}) {
  const T = useType();
  const continuePlayingPart = useSettingsStore((s) => s.continuePlayingPart);
  const pct = item.progress > 0 && item.duration > 0 ? Math.min(100, Math.round((item.progress / item.duration) * 100)) : 0;
  /* 根据设置决定是否携带续播进度 */
  const href = item.history.business === 'live'
    ? { pathname: '/live/[roomId]', params: { roomId: String(item.history.oid) } }
    : (continuePlayingPart && item.progress > 0)
      ? { pathname: '/video/[id]', params: { id: item.history.bvid, t: String(item.progress) } }
      : { pathname: '/video/[id]', params: { id: item.history.bvid } };
  return (
    <>
      <Link href={href as any} asChild>
      <Press haptic scaleTo={0.98} style={styles.row}>
        <View style={styles.coverWrap}>
          <ExpoImage
            source={{ uri: biliCover(item.cover, 320, 200) }}
            recyclingKey={item.cover}
            cachePolicy="memory-disk"
            style={[styles.cover, { backgroundColor: colors.fill2 }]}
            contentFit="cover"
          />
          <View style={styles.durationBadge}>
            <Text style={styles.durationText}>{formatDuration(item.duration)}</Text>
          </View>
          {/* 观看进度条 */}
          <View style={[styles.progressTrack, { backgroundColor: 'rgba(255,255,255,0.35)' }]}>
            <View style={[styles.progressFill, { width: `${pct}%` }]} />
          </View>
        </View>
        <View style={styles.rowInfo}>
          <Text style={[T.subhead, styles.title, { color: colors.text }]} numberOfLines={2}>{item.title}</Text>
          <Text style={[T.caption1, styles.author, { color: colors.textSecondary }]} numberOfLines={1}>{item.author_name}</Text>
          <View style={styles.metaRow}>
            <View style={[styles.progressPill, { backgroundColor: pct > 0 ? colors.fill3 : colors.fill2 }]}>
              <Text style={[T.caption2, styles.progressText, { color: pct > 0 ? ACCENT : colors.textTertiary }]}>
                {pct > 0 ? `看到 ${pct}%` : '未观看'}
              </Text>
            </View>
            <Text style={[T.caption2, styles.timeText, { color: colors.textTertiary }]}>{formatTime(item.view_at)}</Text>
          </View>
        </View>
        {onRemove ? (
          <Press haptic scaleTo={0.9} onPress={() => onRemove(item)} style={styles.removeBtn}>
            <Ionicons name="close" size={16} color={colors.textTertiary} />
          </Press>
        ) : null}
      </Press>
      </Link>
    </>
  );
});

export default function HistoryScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const T = useType();
  const { isLoggedIn } = useAuthStore();
  const [typeFilter, setTypeFilter] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [paused, setPaused] = useState(false);
  // FlashList v2 是函数组件、无实例类型；useScrollToTop 只需可滚动对象的 ref
  const listRef = useRef<any>(null);
  useScrollToTop(listRef);
  const cursorRef = useRef<{ max: number; view_at: number }>({ max: 0, view_at: 0 });

  const { items, loading, refreshing, loadingMore, refresh, loadMore, setItems } = usePagedList<HistoryItem>({
    enabled: isLoggedIn,
    fetchPage: async (page, cancelToken) => {
      const params = page === 1 ? {} : { max: cursorRef.current.max, view_at: cursorRef.current.view_at };
      const res = await favApi.history(params, { cancelToken });
      const mapped: HistoryItem[] = (res?.data?.list || []).map((i: any) => ({
        title: i.title,
        cover: i.cover,
        uri: i.uri,
        history: { oid: i.history.oid, bvid: i.history.bvid, business: i.history.business, dt: i.history.dt },
        duration: i.duration,
        progress: i.progress,
        author_name: i.author_name,
        view_at: i.view_at,
      }));
      if (res?.data?.cursor) {
        cursorRef.current = { max: res.data.cursor.max || 0, view_at: res.data.cursor.view_at || 0 };
      }
      return { items: mapped, hasMore: mapped.length > 0 };
    },
    onError: (e) => {
      console.error('fetchHistory error:', e);
    },
  });

  const filteredItems = useMemo(
    () => items.filter(
      (i) =>
        (typeFilter === 'all' || i.history.business === typeFilter) &&
        (!keyword || i.title.toLowerCase().includes(keyword.toLowerCase())),
    ),
    [items, typeFilter, keyword],
  );

  useEffect(() => {
    const t = setTimeout(() => {
      if (isLoggedIn) {
        videoApi.historyStatus().then((r) => {
          if (r?.code === 0) setPaused(r.data === 1);
        }).catch(() => {});
      }
    }, 0);
    return () => clearTimeout(t);
  }, [isLoggedIn]);

  const removeItem = useCallback(async (item: HistoryItem) => {
    try {
      await favApi.delHistory({ kid: `${item.history.business}_${item.history.oid}` });
      setItems((prev) => prev.filter((x) => x !== item));
      feedBackSuccess();
    } catch {
      showToast('删除失败');
    }
  }, [setItems]);

  const clearAll = useCallback(() => {
    Alert.alert('清空历史记录', '确定清空全部观看历史吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '清空',
        style: 'destructive',
        onPress: async () => {
          try {
            await favApi.clearHistory();
            setItems([]);
            feedBackSuccess();
          } catch {
            showToast('清空失败');
          }
        },
      },
    ]);
  }, [setItems]);

  const togglePause = useCallback(async () => {
    const next = !paused;
    try {
      await favApi.pauseHistory({ switch: next });
      setPaused(next);
      showToast(next ? '已暂停记录观看历史' : '已恢复记录观看历史');
    } catch {
      showToast('操作失败');
    }
  }, [paused]);

  const renderRow = useCallback(
    ({ item, index }: { item: HistoryItem; index: number }) => (
      <HistoryRow item={item} index={index} colors={colors} onRemove={removeItem} />
    ),
    [colors, removeItem],
  );

  const ItemSeparator = useCallback(() => <View style={{ height: 12 }} />, []);



  /* 未登录空态 */
  if (!isLoggedIn) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <Stack.Title large>历史记录</Stack.Title>
        <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
        <View style={styles.emptyWrap}>
          <View style={[styles.emptyIconBox, { backgroundColor: colors.fill2 }]}>
            <Ionicons name="person-circle-outline" size={40} color={colors.textTertiary} />
          </View>
          <Text style={[T.headline, styles.emptyTitle, { color: colors.text }]}>请先登录</Text>
          <Text style={[T.footnote, styles.emptySub, { color: colors.textSecondary }]}>登录后查看观看历史</Text>
          <Press haptic scaleTo={0.94} onPress={() => router.push('/login' as any)} style={styles.loginBtn}>
            <Text style={[T.subhead, styles.loginBtnText]}>去登录</Text>
          </Press>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Title large>历史记录</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <Stack.SearchBar
        placeholder="搜索历史记录"
        autoCapitalize="none"
        onChangeText={(e: any) => setKeyword(typeof e === 'string' ? e : e?.nativeEvent?.text ?? '')}
        tintColor={ACCENT}
        textColor={colors.text}
        hintTextColor={colors.textTertiary}
        headerIconColor={colors.textSecondary}
      />
      <View style={styles.toolbar}>
        <View style={styles.chipRow}>
          {[
            { key: 'all', label: '全部' },
            { key: 'archive', label: '视频' },
            { key: 'live', label: '直播' },
            { key: 'pgc', label: '番剧' },
            { key: 'article', label: '文章' },
          ].map((c) => (
            <Press
              key={c.key}
              haptic
              scaleTo={0.92}
              onPress={() => setTypeFilter(c.key)}
              style={[styles.chip, { backgroundColor: typeFilter === c.key ? ACCENT : colors.fill2 }]}>
              <Text style={[T.caption1, { color: typeFilter === c.key ? '#FFFFFF' : colors.textSecondary }]}>{c.label}</Text>
            </Press>
          ))}
        </View>
        <View style={styles.actionRow}>
          <Press haptic scaleTo={0.94} onPress={() => router.push('/history_search' as any)} style={[styles.actionBtn, { backgroundColor: colors.fill2 }]}>
            <Ionicons name="search" size={15} color={colors.text} />
            <Text style={[T.footnote, { color: colors.text }]}>搜索</Text>
          </Press>
          <Press haptic scaleTo={0.94} onPress={togglePause} style={[styles.actionBtn, { backgroundColor: colors.fill2 }]}>
            <Ionicons name={paused ? 'play' : 'pause'} size={15} color={colors.text} />
            <Text style={[T.footnote, { color: colors.text }]}>{paused ? '恢复记录' : '暂停记录'}</Text>
          </Press>
          <Press haptic scaleTo={0.94} onPress={clearAll} style={[styles.actionBtn, { backgroundColor: colors.fill2 }]}>
            <Ionicons name="trash-outline" size={15} color={colors.text} />
            <Text style={[T.footnote, { color: colors.text }]}>清空</Text>
          </Press>
        </View>
      </View>
      <FlashList
        ref={listRef}
        data={filteredItems}
        keyExtractor={(it, idx) => `${it.history.oid}-${idx}`}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { feedBackMedium(); refresh(); }} tintColor={colors.textSecondary} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        estimatedItemSize={82}
        windowSize={9}
        initialNumToRender={10}
        maxToRenderPerBatch={12}
        drawDistance={250}
        overrideProps={{ initialDrawBatchSize: 10 }}
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator size="small" color={colors.textTertiary} style={{ marginVertical: 18 }} />
          ) : null
        }
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.emptyWrap}>
              <View style={[styles.emptyIconBox, { backgroundColor: colors.fill2 }]}>
                <Ionicons name="time-outline" size={38} color={colors.textTertiary} />
              </View>
              <Text style={[T.headline, styles.emptyTitle, { color: colors.text }]}>暂无观看记录</Text>
              <Text style={[T.footnote, styles.emptySub, { color: colors.textSecondary }]}>看过的视频会出现在这里</Text>
            </View>
          )
        }
        renderItem={renderRow}
        ItemSeparatorComponent={ItemSeparator}
      />

      {loading && items.length === 0 && (
        <View style={styles.skeletonOverlay}>
          <SkeletonMediaRow mediaWidth={132} mediaHeight={82} lines={3} />
          <SkeletonMediaRow mediaWidth={132} mediaHeight={82} lines={3} />
          <SkeletonMediaRow mediaWidth={132} mediaHeight={82} lines={3} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  listContent: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 40 },
  /* 行 */
  row: { flexDirection: 'row', gap: 12 },
  coverWrap: { position: 'relative' },
  cover: { width: 132, height: 82, borderRadius: RADII.sm, ...continuous },
  durationBadge: { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  durationText: { color: '#FFFFFF', fontSize: 10.5, fontWeight: '600' },
  progressTrack: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, borderBottomLeftRadius: 10, borderBottomRightRadius: 10, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: ACCENT },
  rowInfo: { flex: 1, justifyContent: 'space-between', paddingVertical: 2 },
  title: { fontWeight: '600' },
  author: { marginTop: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  progressPill: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2.5 },
  progressText: { fontWeight: '600' },
  timeText: {},
  removeBtn: { padding: 8, alignSelf: 'center' },
  toolbar: { paddingHorizontal: 14, paddingTop: 12, gap: 10 },
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16 },
  actionRow: { flexDirection: 'row', gap: 10 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14 },
  /* 空态 */
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingTop: 110, paddingHorizontal: 40, gap: 8 },
  emptyIconBox: { width: 84, height: 84, borderRadius: 42, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  emptyTitle: { fontWeight: '600' },
  emptySub: { textAlign: 'center' },
  loginBtn: { marginTop: 14, backgroundColor: ACCENT, borderRadius: 20, paddingHorizontal: 30, paddingVertical: 10 },
  loginBtnText: { color: '#FFFFFF', fontWeight: '600' },
  /* 骨架 */
  skeletonOverlay: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 14, paddingTop: 12, gap: 12 },
});
