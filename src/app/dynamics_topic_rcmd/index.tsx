import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Stack, Link, useScrollToTop } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { SkeletonRow } from '@/components/Skeleton';
import { dynamicsApi } from '@/api/dynamics';
import { createNativeRequestCancelToken, type NativeRequestCancelToken } from '@/utils/request-cancel';
import { formatCount } from '@/utils/format';
import { showToast } from '@/utils/toast';
import { feedBackMedium } from '@/utils/feedback';
import { RADII, continuous, shadow } from '@/theme/tokens';

interface TopicItem {
  id: number;
  name: string;
  view?: number;
  discuss?: number;
  description?: string;
  is_fav?: boolean;
}

const TopicRcmdRow = memo(function TopicRcmdRow({
  item,
  colors,
  T,
}: {
  item: TopicItem;
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
}) {
  return (
    <Link href={{ pathname: '/dynamics_topic/[id]', params: { id: String(item.id) } }} asChild>
      <Press
        haptic
        scaleTo={0.98}
        style={[styles.card, { backgroundColor: colors.card, ...shadow('sm', colors.isDark) }]}>
        <View style={[styles.iconBox, { backgroundColor: 'rgba(251,114,153,0.12)' }]}>
          <Ionicons name="pricetag" size={18} color={ACCENT} />
        </View>
        <View style={styles.info}>
          <Text style={[T.subhead, styles.title, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
          {item.description ? (
            <Text style={[T.caption1, styles.desc, { color: colors.textSecondary }]} numberOfLines={2}>{item.description}</Text>
          ) : null}
          <View style={styles.meta}>
            <Text style={[T.caption2, { color: colors.textTertiary }]}>{formatCount(item.view || 0)}浏览</Text>
            <View style={[styles.metaDot, { backgroundColor: colors.quaternaryLabel }]} />
            <Text style={[T.caption2, { color: colors.textTertiary }]}>{formatCount(item.discuss || 0)}讨论</Text>
            {item.is_fav ? (
              <View style={[styles.favTag, { backgroundColor: 'rgba(251,114,153,0.12)' }]}>
                <Ionicons name="star" size={10} color={ACCENT} />
                <Text style={[T.caption2, { color: ACCENT, fontWeight: '600' }]}>已收藏</Text>
              </View>
            ) : null}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.quaternaryLabel} />
      </Press>
    </Link>
  );
});

export default function DynamicsTopicRcmdScreen() {
  const colors = useThemeColors();
  const T = useType();
  const listRef = useRef<any>(null);
  useScrollToTop(listRef);
  const [items, setItems] = useState<TopicItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasItemsRef = useRef(false);
  const cancelTokenRef = useRef<NativeRequestCancelToken | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    const cancelToken = createNativeRequestCancelToken();
    cancelTokenRef.current?.abort();
    cancelTokenRef.current = cancelToken;
    if (isRefresh) setRefreshing(true);
    else if (!hasItemsRef.current) setLoading(true);
    try {
      const res = await dynamicsApi.topicRcmd({ source: 'Web', page_size: 25, web_location: 333.1365 }, { cancelToken });
      const list = res?.data?.topic_items ?? [];
      setItems(list);
      hasItemsRef.current = list.length > 0;
      setError(null);
    } catch (e) {
      if (cancelToken.aborted) return;
      console.error('load topic rcmd error:', e);
      if (!hasItemsRef.current) setError('加载失败，请重试');
      else showToast('推荐话题加载失败');
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
    const t = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(t);
  }, [load]);

  const renderItem = useCallback(
    ({ item }: { item: TopicItem }) => (
      <TopicRcmdRow item={item} colors={colors} T={T} />
    ),
    [colors, T],
  );

  const ItemSeparator = useCallback(() => <View style={{ height: 10 }} />, []);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Title large>推荐话题</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <FlashList
        ref={listRef}
        data={items}
        keyExtractor={(it) => String(it.id)}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        renderItem={renderItem}
        ItemSeparatorComponent={ItemSeparator}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              feedBackMedium();
              void load(true);
            }}
            tintColor={colors.textSecondary}
          />
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.skeletonWrap}>
              <SkeletonRow height={64} />
              <SkeletonRow height={64} />
              <SkeletonRow height={64} />
            </View>
          ) : error ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="cloud-offline-outline" size={38} color={colors.textTertiary} />
              <Text style={[T.headline, styles.emptyTitle, { color: colors.text }]}>加载失败</Text>
              <Press haptic scaleTo={0.94} onPress={() => load()} style={[styles.retryBtn, { backgroundColor: colors.card }]}>
                <Text style={[T.subhead, styles.retryText, { color: ACCENT }]}>重试</Text>
              </Press>
            </View>
          ) : (
            <View style={styles.emptyWrap}>
              <Ionicons name="pricetag-outline" size={38} color={colors.textTertiary} />
              <Text style={[T.headline, styles.emptyTitle, { color: colors.text }]}>暂无推荐话题</Text>
            </View>
          )
        }
        estimatedItemSize={96}
        windowSize={9}
        initialNumToRender={10}
        maxToRenderPerBatch={12}
        drawDistance={250}
        overrideProps={{ initialDrawBatchSize: 10 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  listContent: { padding: 16, paddingBottom: 40 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: RADII.card,
    padding: 14,
    ...continuous,
  },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    ...continuous,
  },
  info: { flex: 1, gap: 4 },
  title: { fontWeight: '700' },
  desc: { lineHeight: 17 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  metaDot: { width: 3, height: 3, borderRadius: 1.5 },
  favTag: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 },
  skeletonWrap: { gap: 10 },
  emptyWrap: { alignItems: 'center', paddingTop: 100, gap: 8 },
  emptyTitle: { fontWeight: '600' },
  retryBtn: { marginTop: 10, borderRadius: RADII.lg, paddingHorizontal: 28, paddingVertical: 9, ...continuous },
  retryText: { fontWeight: '600' },
});
