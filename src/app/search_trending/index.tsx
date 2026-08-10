import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { Stack, useRouter, useScrollToTop } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { searchApi } from '@/api/search';
import { createNativeRequestCancelToken, type NativeRequestCancelToken } from '@/utils/request-cancel';
import { SkeletonRow } from '@/components/Skeleton';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { RADII, continuous, shadow } from '@/theme/tokens';
import { feedBackMedium } from '@/utils/feedback';
import { fixedItemLayout } from '@/utils/list-layout';

const rowLayout = fixedItemLayout(48);

interface TrendingItem {
  keyword: string;
  icon: string;
  showLiveIcon: boolean;
}

function mapTrending(raw: any): TrendingItem | null {
  const keyword = raw?.keyword || raw?.show_name || '';
  if (!keyword) return null;
  return {
    keyword,
    icon: raw?.icon || '',
    showLiveIcon: raw?.show_live_icon === true,
  };
}

export default function SearchTrendingScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const T = useType();
  const [items, setItems] = useState<TrendingItem[]>([]);
  const [topCount, setTopCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<FlashListRef<TrendingItem>>(null);
  useScrollToTop(listRef);
  const cancelTokenRef = useRef<NativeRequestCancelToken | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    const cancelToken = createNativeRequestCancelToken();
    cancelTokenRef.current?.abort();
    cancelTokenRef.current = cancelToken;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await searchApi.trending({ cancelToken });
      const top = (res?.data?.top_list || []).map(mapTrending).filter((x: TrendingItem | null): x is TrendingItem => !!x);
      const list = (res?.data?.list || []).map(mapTrending).filter((x: TrendingItem | null): x is TrendingItem => !!x);
      setTopCount(top.length);
      setItems([...top, ...list]);
    } catch (e) {
      if (cancelToken.aborted) return;
      console.error('search trending error:', e);
      setError('加载失败，请重试');
    } finally {
      if (cancelTokenRef.current === cancelToken) cancelTokenRef.current = null;
      if (!cancelToken.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => () => {
    cancelTokenRef.current?.abort();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { load(); }, 0);
    return () => clearTimeout(t);
  }, [load]);

  const goSearch = useCallback((keyword: string) => {
    router.push({ pathname: '/search/results', params: { keyword } } as any);
  }, [router]);

  const renderItem = useCallback(
    ({ item, index }: { item: TrendingItem; index: number }) => {
      return (
        <View>
          <Press
            haptic
            scaleTo={0.98}
            onPress={() => goSearch(item.keyword)}
            style={[styles.row, index < items.length - 1 && { borderBottomColor: colors.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}>
            <View style={styles.rankWrap}>
              {index < topCount ? (
                <Ionicons name="flame" size={17} color={index === 0 ? '#FF3B30' : '#FF9500'} />
              ) : (
                <Text style={[T.subhead, styles.rank, { color: index - topCount < 3 ? ACCENT : colors.textTertiary }]}>
                  {index + 1 - topCount}
                </Text>
              )}
            </View>
            <Text style={[T.subhead, styles.keyword, { color: colors.text }]} numberOfLines={1}>
              {item.keyword}
            </Text>
            {item.icon ? (
              <View style={[styles.tag, { backgroundColor: item.icon.includes('new') ? '#FF9500' : '#FF3B30' }]}>
                <Text style={styles.tagText}>{item.icon.includes('new') ? '新' : '热'}</Text>
              </View>
            ) : item.showLiveIcon ? (
              <View style={[styles.tag, { backgroundColor: '#FF3B30' }]}>
                <Text style={styles.tagText}>直播</Text>
              </View>
            ) : null}
          </Press>
        </View>
      );
    },
    [colors, items.length, topCount, T, goSearch],
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Title large>bilibili热搜</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <FlashList
        ref={listRef}
        data={items}
        keyExtractor={(it, idx) => `${it.keyword}-${idx}`}
        contentContainerStyle={[styles.listContent, items.length > 0 && { backgroundColor: colors.card, borderRadius: RADII.lg, marginHorizontal: 14, marginTop: 12, ...continuous, ...shadow('sm', colors.isDark) }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { feedBackMedium(); load(true); }} tintColor={colors.textSecondary} />}
        estimatedItemSize={48}
        overrideItemLayout={rowLayout}
        windowSize={9}
        initialNumToRender={16}
        maxToRenderPerBatch={20}
        drawDistance={250}
        overrideProps={{ initialDrawBatchSize: 16 }}
        ListEmptyComponent={
          loading ? null : error ? (
            <View style={styles.emptyWrap}>
              <View style={[styles.emptyIconBox, { backgroundColor: colors.fill2 }]}>
                <Ionicons name="cloud-offline-outline" size={38} color={colors.textTertiary} />
              </View>
              <Text style={[T.headline, styles.emptyTitle, { color: colors.text }]}>{error}</Text>
              <Press haptic scaleTo={0.94} onPress={() => load()} style={[styles.retryBtn, { backgroundColor: ACCENT }]}>
                <Text style={[T.subhead, styles.retryText]}>重试</Text>
              </Press>
            </View>
          ) : (
            <View style={styles.emptyWrap}>
              <View style={[styles.emptyIconBox, { backgroundColor: colors.fill2 }]}>
                <Ionicons name="trending-up-outline" size={38} color={colors.textTertiary} />
              </View>
              <Text style={[T.headline, styles.emptyTitle, { color: colors.text }]}>暂无热搜</Text>
            </View>
          )
        }
        renderItem={renderItem}
      />
      {loading && items.length === 0 && (
        <View style={[styles.skeletonCard, { backgroundColor: colors.card }]}>
          <SkeletonRow height={44} />
          <SkeletonRow height={44} />
          <SkeletonRow height={44} />
          <SkeletonRow height={44} />
        </View>
      )}
      {loading && items.length > 0 ? (
        <ActivityIndicator size="small" color={colors.textTertiary} style={{ marginVertical: 14 }} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingBottom: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 4 },
  rankWrap: { width: 26, alignItems: 'center' },
  rank: { fontWeight: '700', fontStyle: 'italic' },
  keyword: { flex: 1, fontWeight: '500' },
  tag: { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1.5 },
  tagText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingTop: 110, paddingHorizontal: 40, gap: 8 },
  emptyIconBox: { width: 84, height: 84, borderRadius: 42, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  emptyTitle: { fontWeight: '600' },
  retryBtn: { marginTop: 14, borderRadius: RADII.lg, paddingHorizontal: 30, paddingVertical: 10, ...continuous },
  retryText: { color: '#FFFFFF', fontWeight: '600' },
  skeletonCard: { position: 'absolute', top: 12, left: 14, right: 14, borderRadius: RADII.lg, paddingHorizontal: 16, paddingTop: 8, gap: 4, ...continuous },
});
