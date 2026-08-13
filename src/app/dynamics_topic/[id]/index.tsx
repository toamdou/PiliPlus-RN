import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, Stack, Link, useScrollToTop } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { usePagedList } from '@/hooks/use-paged-list';
import type { NativeRequestCancelToken } from '@/utils/request-cancel';
import { SkeletonRow } from '@/components/Skeleton';
import { dynamicsApi } from '@/api/dynamics';
import { useAuthStore } from '@/stores/auth';
import { formatCount } from '@/utils/format';
import { feedBackMedium } from '@/utils/feedback';
import { showToast } from '@/utils/toast';
import { biliCover } from '@/utils/image-url';
import { RADII, continuous, shadow } from '@/theme/tokens';
import { TopicCardRow, TopicFoldRow, type TopicCardItem, type TopicFeedList, type TopicTop } from '@/components/dynamics/TopicCardBody';

export default function DynamicsTopicScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useThemeColors();
  const T = useType();
  const topicId = Number(id);

  const [top, setTop] = useState<TopicTop | null>(null);
  const [topLoading, setTopLoading] = useState(true);
  const [sortBy, setSortBy] = useState(0);
  const [sorts, setSorts] = useState<{ sort_by: number; sort_name: string }[]>([]);
  const [topicFav, setTopicFav] = useState(false);
  const [topicLike, setTopicLike] = useState(false);
  const [topicActionBusy, setTopicActionBusy] = useState(false);
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const myMid = useAuthStore((s) => s.userInfo?.mid);
  const offsetRef = useRef('');
  const sortByRef = useRef(0);
  const listRef = useRef<any>(null);
  useScrollToTop(listRef);

  const loadTop = useCallback(async () => {
    try {
      const res = await dynamicsApi.topicTop({ topic_id: topicId, source: 'Web' });
      const details: TopicTop | undefined = res?.data?.top_details;
      setTop(details ?? null);
      setTopicFav(details?.topic_item?.is_fav ?? false);
      setTopicLike(details?.topic_item?.is_like ?? false);
    } catch (e) {
      console.error('load topic top error:', e);
      showToast('话题信息加载失败');
    } finally {
      setTopLoading(false);
    }
  }, [topicId]);

  const fetchPage = useCallback(
    async (page: number, cancelToken?: NativeRequestCancelToken) => {
      const res = await dynamicsApi.topicFeed({
        topic_id: topicId,
        sort_by: sortByRef.current,
        ...(page > 1 && offsetRef.current ? { offset: offsetRef.current } : {}),
        page_size: 20,
        source: 'Web',
        features: 'itemOpusStyle,listOnlyfans,onlyfansQaCard',
      }, cancelToken ? { cancelToken } : undefined);
      const list: TopicFeedList | undefined = res?.data?.topic_card_list;
      if (!list) return { items: [], hasMore: false };
      offsetRef.current = list.offset ?? '';
      if (list.topic_sort_by_conf?.all_sort_by) {
        setSorts(
          list.topic_sort_by_conf.all_sort_by
            .map((s) => ({ sort_by: s.sort_by ?? 0, sort_name: s.sort_name ?? '' }))
            .filter((s) => s.sort_name),
        );
      }
      return { items: list.items ?? [], hasMore: list.has_more !== false };
    },
    [topicId],
  );

  const {
    items,
    loading,
    refreshing,
    loadingMore,
    hasMore,
    error,
    refresh,
    loadMore,
    setItems,
  } = usePagedList<TopicCardItem>({
    fetchPage,
    onError: (e) => {
      console.error('topic feed error:', e);
      showToast('话题动态加载失败');
    },
  });

  useEffect(() => {
    const t = setTimeout(() => {
      void loadTop();
    }, 0);
    return () => clearTimeout(t);
  }, [loadTop]);

  const changeSort = useCallback((sb: number) => {
    if (sb === sortByRef.current) return;
    sortByRef.current = sb;
    offsetRef.current = '';
    setSortBy(sb);
    refresh();
  }, [refresh]);

  const expandFold = useCallback(async () => {
    try {
      const res = await dynamicsApi.topicFold({ topic_id: topicId, sort_by: sortByRef.current });
      const list: { items?: TopicCardItem[] } | undefined = res?.data?.topic_card_list;
      const more = list?.items;
      if (more && more.length > 0) {
        setItems((prev) => [...prev.filter((it) => !it.fold_card_item), ...more]);
      } else {
        showToast('没有更多内容');
      }
    } catch (e) {
      console.error('topic fold error:', e);
      showToast('展开失败，请重试');
    }
  }, [topicId, setItems]);

  const toggleTopicFav = useCallback(async () => {
    if (!isLoggedIn) {
      showToast('请先登录');
      return;
    }
    if (topicActionBusy) return;
    const next = !topicFav;
    setTopicFav(next);
    setTop((prev) => prev?.topic_item ? { ...prev, topic_item: { ...prev.topic_item, fav: Math.max(0, prev.topic_item.fav + (next ? 1 : -1)), is_fav: next } } : prev);
    setTopicActionBusy(true);
    try {
      const res = next
        ? await dynamicsApi.addFavTopic({ topic_id: topicId })
        : await dynamicsApi.delFavTopic({ topic_id: topicId });
      if (res?.code !== 0) {
        showToast(res?.message || '操作失败');
        setTopicFav(!next);
        setTop((prev) => prev?.topic_item ? { ...prev, topic_item: { ...prev.topic_item, fav: Math.max(0, prev.topic_item.fav + (next ? -1 : 1)), is_fav: !next } } : prev);
      }
    } catch (e) {
      console.error('toggle topic fav error:', e);
      setTopicFav(!next);
      setTop((prev) => prev?.topic_item ? { ...prev, topic_item: { ...prev.topic_item, fav: Math.max(0, prev.topic_item.fav + (next ? -1 : 1)), is_fav: !next } } : prev);
      showToast('操作失败');
    } finally {
      setTopicActionBusy(false);
    }
  }, [isLoggedIn, topicFav, topicActionBusy, topicId]);

  const toggleTopicLike = useCallback(async () => {
    if (!isLoggedIn) {
      showToast('请先登录');
      return;
    }
    if (topicActionBusy) return;
    const next = !topicLike;
    setTopicLike(next);
    setTop((prev) => prev?.topic_item ? { ...prev, topic_item: { ...prev.topic_item, like: Math.max(0, prev.topic_item.like + (next ? 1 : -1)), is_like: next } } : prev);
    setTopicActionBusy(true);
    try {
      const res = await dynamicsApi.likeTopic({
        topic_id: topicId,
        up_mid: myMid ?? 0,
        action: next ? 'like' : 'cancel_like',
      });
      if (res?.code !== 0) {
        showToast(res?.message || '操作失败');
        setTopicLike(!next);
        setTop((prev) => prev?.topic_item ? { ...prev, topic_item: { ...prev.topic_item, like: Math.max(0, prev.topic_item.like + (next ? -1 : 1)), is_like: !next } } : prev);
      }
    } catch (e) {
      console.error('toggle topic like error:', e);
      setTopicLike(!next);
      setTop((prev) => prev?.topic_item ? { ...prev, topic_item: { ...prev.topic_item, like: Math.max(0, prev.topic_item.like + (next ? -1 : 1)), is_like: !next } } : prev);
      showToast('操作失败');
    } finally {
      setTopicActionBusy(false);
    }
  }, [isLoggedIn, topicLike, topicActionBusy, topicId, myMid]);

  const renderCard = useCallback(
    ({ item }: { item: TopicCardItem }) => {
      if (item.fold_card_item) {
        return <TopicFoldRow item={item} colors={colors} T={T} onPress={expandFold} />;
      }
      return <TopicCardRow item={item} colors={colors} T={T} />;
    },
    [colors, T, expandFold],
  );

  const getItemType = useCallback((item: TopicCardItem) => (item.fold_card_item ? 'fold' : 'card'), []);

  const ItemSeparator = useCallback(() => <View style={styles.gap} />, []);

  const header = useMemo(() => (
    <View>
      {topLoading ? (
        <View style={[styles.topCard, { backgroundColor: colors.card, ...shadow('md', colors.isDark) }]}>
          <SkeletonRow height={20} />
          <SkeletonRow height={14} />
        </View>
      ) : top?.topic_item ? (
        <View style={[styles.topCard, { backgroundColor: colors.card, ...shadow('md', colors.isDark) }]}>
          <View style={styles.topHead}>
            <Text style={[T.title3, styles.topName, { color: colors.text }]}>{top.topic_item.name}</Text>
            {top.topic_creator ? (
              <Link
                href={{ pathname: '/member/[mid]', params: { mid: String(top.topic_creator.uid) } }}
                asChild>
                <Press haptic scaleTo={0.96} style={styles.creatorRow}>
                  <ExpoImage source={{ uri: biliCover(top.topic_creator.face || '', 96, 96) }} style={[styles.creatorAvatar, { backgroundColor: colors.fill2 }]} contentFit="cover" />
                  <Text style={[T.caption2, { color: colors.textSecondary }]} numberOfLines={1}>
                    {top.topic_creator.name}
                  </Text>
                </Press>
              </Link>
            ) : null}
          </View>
          {top.topic_item.description ? (
            <Text style={[T.footnote, styles.topDesc, { color: colors.textSecondary }]}>{top.topic_item.description}</Text>
          ) : null}
          <View style={styles.topStats}>
            <Text style={[T.caption1, { color: colors.textTertiary }]}>
              {formatCount(top.topic_item.view ?? 0)}浏览 · {formatCount(top.topic_item.discuss ?? 0)}讨论
            </Text>
            <View style={styles.topStatsRight}>
              <Press
                haptic
                scaleTo={0.92}
                disabled={topicActionBusy}
                onPress={toggleTopicLike}
                style={[styles.statChip, { backgroundColor: colors.fill2, opacity: topicActionBusy ? 0.6 : 1 }]}>
                <Ionicons name={topicLike ? 'thumbs-up' : 'thumbs-up-outline'} size={13} color={topicLike ? ACCENT : colors.textSecondary} />
                <Text style={[T.caption1, { color: topicLike ? ACCENT : colors.textSecondary, fontWeight: topicLike ? '600' : '400' }]}>
                  {formatCount(top.topic_item.like ?? 0)}
                </Text>
              </Press>
              <Press
                haptic
                scaleTo={0.92}
                disabled={topicActionBusy}
                onPress={toggleTopicFav}
                style={[styles.statChip, { backgroundColor: colors.fill2, opacity: topicActionBusy ? 0.6 : 1 }]}>
                <Ionicons name={topicFav ? 'star' : 'star-outline'} size={13} color={topicFav ? ACCENT : colors.textSecondary} />
                <Text style={[T.caption1, { color: topicFav ? ACCENT : colors.textSecondary, fontWeight: topicFav ? '600' : '400' }]}>
                  {formatCount(top.topic_item.fav ?? 0)}
                </Text>
              </Press>
            </View>
          </View>
        </View>
      ) : null}
      {sorts.length > 1 ? (
        <View style={styles.sortBar}>
          {sorts.map((s) => (
            <Press
              key={s.sort_by}
              haptic
              scaleTo={0.94}
              onPress={() => changeSort(s.sort_by)}
              style={[styles.sortChip, sortBy === s.sort_by && styles.sortChipActive]}>
              <Text
                style={[
                  T.caption1,
                  sortBy === s.sort_by ? { color: '#FFFFFF', fontWeight: '600' } : { color: colors.textSecondary },
                ]}>
                {s.sort_name}
              </Text>
            </Press>
          ))}
        </View>
      ) : null}
    </View>
  ), [topLoading, top, colors, T, topicActionBusy, topicLike, topicFav, toggleTopicLike, toggleTopicFav, sorts, sortBy, changeSort]);

  const pageTitle = top?.topic_item?.name || '话题';

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      {pageTitle ? <Stack.Title large>{pageTitle}</Stack.Title> : null}
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <FlashList
        ref={listRef}
        data={items}
        keyExtractor={(it, i) => it.dynamic_card_item?.id_str ?? `fold-${i}`}
        renderItem={renderCard}
        getItemType={getItemType}
        ListHeaderComponent={header}
        ListEmptyComponent={
          loading ? (
            <View style={styles.skeletonWrap}>
              <SkeletonRow height={56} />
              <SkeletonRow height={56} />
              <SkeletonRow height={56} />
            </View>
          ) : error ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="cloud-offline-outline" size={38} color={colors.textTertiary} />
              <Text style={[T.headline, styles.emptyTitle, { color: colors.text }]}>加载失败</Text>
              <Press haptic scaleTo={0.94} onPress={refresh} style={[styles.retryBtn, { backgroundColor: colors.card }]}>
                <Text style={[T.subhead, styles.retryBtnText, { color: colors.text }]}>重试</Text>
              </Press>
            </View>
          ) : (
            <View style={styles.emptyWrap}>
              <Ionicons name="pricetag-outline" size={38} color={colors.textTertiary} />
              <Text style={[T.headline, styles.emptyTitle, { color: colors.text }]}>暂无话题动态</Text>
            </View>
          )
        }
        ListFooterComponent={
          loadingMore && hasMore ? (
            <ActivityIndicator size="small" color={colors.textTertiary} style={{ marginVertical: 18 }} />
          ) : null
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              feedBackMedium();
              refresh();
            }}
            tintColor={colors.textSecondary}
          />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ItemSeparatorComponent={ItemSeparator}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        estimatedItemSize={160}
        drawDistance={250}
        overrideProps={{ initialDrawBatchSize: 10 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  listContent: { padding: 16, paddingBottom: 40 },
  gap: { height: 14 },
  /* 话题头卡 */
  topCard: { borderRadius: RADII.lg, padding: 16, gap: 10, ...continuous },
  topHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  topName: { flex: 1, fontWeight: '700' },
  creatorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 2 },
  creatorAvatar: { width: 24, height: 24, borderRadius: 12 },
  topDesc: { lineHeight: 18 },
  topStats: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  topStatsRight: { flexDirection: 'row', gap: 6 },
  statChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: RADII.circle, paddingHorizontal: 9, paddingVertical: 4, ...continuous },
  /* 排序 */
  sortBar: { flexDirection: 'row', gap: 8, marginTop: 14, marginBottom: 2 },
  sortChip: {
    borderRadius: RADII.circle,
    borderWidth: 1,
    borderColor: 'rgba(120,120,128,0.3)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    ...continuous,
  },
  sortChipActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  /* 空态 / 骨架 */
  skeletonWrap: { gap: 14, paddingTop: 4 },
  emptyWrap: { alignItems: 'center', paddingTop: 90, gap: 8, paddingHorizontal: 40 },
  emptyTitle: { fontWeight: '600' },
  retryBtn: { marginTop: 12, borderRadius: RADII.lg, paddingHorizontal: 30, paddingVertical: 10, ...continuous },
  retryBtnText: { fontWeight: '600' },
});
