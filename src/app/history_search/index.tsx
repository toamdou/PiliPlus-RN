import { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { Stack, useRouter, Link, useScrollToTop } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { favApi } from '@/api/fav';
import { usePagedList } from '@/hooks/use-paged-list';
import { useAuthStore } from '@/stores/auth';
import { SkeletonRow } from '@/components/Skeleton';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { RADII, continuous, shadow } from '@/theme/tokens';
import { feedBackMedium, feedBackSuccess } from '@/utils/feedback';
import { formatDuration, formatTime } from '@/utils/format';
import { showToast } from '@/utils/toast';
import { fixedItemLayout } from '@/utils/list-layout';
import { biliCover } from '@/utils/image-url';

const rowLayout = fixedItemLayout(106);

interface HistorySearchItem {
  kid: number;
  title: string;
  cover: string;
  duration: number;
  progress: number;
  author_name: string;
  view_at: number;
  history: { oid: number; bvid: string; business: string };
}

export default function HistorySearchScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const T = useType();
  const { isLoggedIn } = useAuthStore();
  const [keyword, setKeyword] = useState('');
  const listRef = useRef<FlashListRef<HistorySearchItem>>(null);
  useScrollToTop(listRef);
  const queryRef = useRef('');

  const { items, loading, refreshing, loadingMore, error, refresh, loadMore, setItems } = usePagedList<HistorySearchItem>({
    enabled: isLoggedIn,
    fetchPage: async (page, cancelToken) => {
      const q = queryRef.current.trim();
      if (!q) return { items: [] as HistorySearchItem[], hasMore: false };
      const res = await favApi.searchHistory({ keyword: q, pn: page }, { cancelToken });
      const mapped: HistorySearchItem[] = (res?.data?.list || []).map((i: any) => ({
        kid: i.kid || 0,
        title: i.title || '',
        cover: i.cover || '',
        duration: i.duration || 0,
        progress: i.progress || 0,
        author_name: i.author_name || '',
        view_at: i.view_at || 0,
        history: {
          oid: i.history?.oid || 0,
          bvid: i.history?.bvid || '',
          business: i.history?.business || '',
        },
      }));
      return { items: mapped, hasMore: mapped.length >= 20 };
    },
    onError: (e) => {
      console.error('history search error:', e);
    },
  });

  const submit = useCallback((value?: string) => {
    queryRef.current = value ?? keyword;
    setTimeout(() => refresh(), 0);
  }, [keyword, refresh]);

  const removeItem = useCallback(async (item: HistorySearchItem) => {
    try {
      await favApi.delHistory({ kid: `${item.history.business}_${item.history.oid}` });
      setItems((prev) => prev.filter((x) => x.kid !== item.kid || x.history.oid !== item.history.oid));
      feedBackSuccess();
    } catch {
      showToast('删除失败');
    }
  }, []);

  const renderItem = useCallback(
    ({ item, index }: { item: HistorySearchItem; index: number }) => {
      const pct = item.progress > 0 && item.duration > 0 ? Math.min(100, Math.round((item.progress / item.duration) * 100)) : 0;
      const href = item.history.business === 'live'
        ? { pathname: '/live/[roomId]', params: { roomId: String(item.history.oid) } }
        : { pathname: '/video/[id]', params: { id: item.history.bvid } };
      const row = (
        <Press haptic scaleTo={0.98} style={[styles.row, index < items.length - 1 && { borderBottomColor: colors.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}>
          <View style={styles.coverWrap}>
            <ExpoImage source={{ uri: biliCover((item.cover || ''), 320, 200) }} recyclingKey={item.cover} cachePolicy="memory-disk" style={[styles.cover, { backgroundColor: colors.fill2 }]} contentFit="cover" />
            {item.duration > 0 ? (
              <View style={styles.durationBadge}>
                <Text style={styles.durationText}>{formatDuration(item.duration)}</Text>
              </View>
            ) : null}
            {pct > 0 ? (
              <View style={[styles.progressTrack, { backgroundColor: 'rgba(255,255,255,0.35)' }]}>
                <View style={[styles.progressFill, { width: `${pct}%` }]} />
              </View>
            ) : null}
          </View>
          <View style={styles.info}>
            <Text style={[T.subhead, styles.title, { color: colors.text }]} numberOfLines={2}>{item.title}</Text>
            <Text style={[T.caption1, { color: colors.textSecondary }]} numberOfLines={1}>{item.author_name}</Text>
            <View style={styles.metaRow}>
              <Text style={[T.caption2, { color: colors.textTertiary }]}>{pct > 0 ? `看到 ${pct}%` : '未观看'}</Text>
              <Text style={[T.caption2, { color: colors.textTertiary }]}>{formatTime(item.view_at)}</Text>
            </View>
          </View>
          <Press haptic scaleTo={0.9} onPress={() => removeItem(item)} style={styles.removeBtn}>
            <Ionicons name="close" size={16} color={colors.textTertiary} />
          </Press>
        </Press>
      );
      return (
        <View>
          {item.history.bvid ? <Link href={href as any} asChild>{row}</Link> : row}
        </View>
      );
    },
    [colors, items.length, removeItem, T],
  );

  if (!isLoggedIn) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <Stack.Title large>历史搜索</Stack.Title>
        <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
        <View style={styles.emptyWrap}>
          <Text style={[T.headline, { color: colors.text }]}>请先登录</Text>
          <Press haptic scaleTo={0.94} onPress={() => router.push('/login' as any)} style={[styles.retryBtn, { backgroundColor: ACCENT }]}>
            <Text style={[T.subhead, styles.retryText]}>去登录</Text>
          </Press>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Title large>历史搜索</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <Stack.SearchBar
        placeholder="搜索历史记录"
        autoCapitalize="none"
        onChangeText={(e: any) => setKeyword(typeof e === 'string' ? e : e?.nativeEvent?.text ?? '')}
        onSearchButtonPress={(e: any) => submit(typeof e === 'string' ? e : e?.nativeEvent?.text ?? keyword)}
        tintColor={ACCENT}
        textColor={colors.text}
        hintTextColor={colors.textTertiary}
        headerIconColor={colors.textSecondary}
      />
      <FlashList
        ref={listRef}
        data={items}
        keyExtractor={(it) => `${it.history.business}-${it.history.oid}-${it.kid}`}
        contentContainerStyle={[styles.listContent, items.length > 0 && { backgroundColor: colors.card, borderRadius: RADII.lg, marginHorizontal: 14, marginTop: 12, ...continuous, ...shadow('sm', colors.isDark) }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { feedBackMedium(); refresh(); }} tintColor={colors.textSecondary} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        estimatedItemSize={106}
        overrideItemLayout={rowLayout}
        windowSize={9}
        initialNumToRender={10}
        maxToRenderPerBatch={12}
        drawDistance={250}
        overrideProps={{ initialDrawBatchSize: 10 }}
        ListFooterComponent={loadingMore ? <ActivityIndicator size="small" color={colors.textTertiary} style={{ marginVertical: 14 }} /> : null}
        ListEmptyComponent={
          loading ? null : error ? (
            <View style={styles.emptyWrap}>
              <View style={[styles.emptyIconBox, { backgroundColor: colors.fill2 }]}>
                <Ionicons name="cloud-offline-outline" size={38} color={colors.textTertiary} />
              </View>
              <Text style={[T.headline, { color: colors.text }]}>{error}</Text>
              <Press haptic scaleTo={0.94} onPress={refresh} style={[styles.retryBtn, { backgroundColor: ACCENT }]}>
                <Text style={[T.subhead, styles.retryText]}>重试</Text>
              </Press>
            </View>
          ) : (
            <View style={styles.emptyWrap}>
              <View style={[styles.emptyIconBox, { backgroundColor: colors.fill2 }]}>
                <Ionicons name="search-outline" size={38} color={colors.textTertiary} />
              </View>
              <Text style={[T.headline, { color: colors.text }]}>输入关键词搜索历史记录</Text>
            </View>
          )
        }
        renderItem={renderItem}
      />
      {loading && items.length === 0 && (
        <View style={[styles.skeletonCard, { backgroundColor: colors.card }]}>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingBottom: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  coverWrap: { position: 'relative' },
  cover: { width: 132, height: 82, borderRadius: RADII.sm, ...continuous },
  durationBadge: { position: 'absolute', top: 5, right: 5, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1.5 },
  durationText: { color: '#FFFFFF', fontSize: 10.5, fontWeight: '600' },
  progressTrack: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, borderBottomLeftRadius: 8, borderBottomRightRadius: 8, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: ACCENT },
  info: { flex: 1, gap: 4, justifyContent: 'center' },
  title: { fontWeight: '600' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  removeBtn: { padding: 8, alignSelf: 'center' },
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingTop: 110, paddingHorizontal: 40, gap: 8 },
  emptyIconBox: { width: 84, height: 84, borderRadius: 42, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  retryBtn: { marginTop: 14, borderRadius: RADII.lg, paddingHorizontal: 30, paddingVertical: 10, ...continuous },
  retryText: { color: '#FFFFFF', fontWeight: '600' },
  skeletonCard: { position: 'absolute', top: 0, left: 14, right: 14, borderRadius: RADII.lg, paddingHorizontal: 16, paddingTop: 8, gap: 4, ...continuous },
});
