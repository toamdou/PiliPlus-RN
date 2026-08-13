import { memo, useCallback, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Stack, Link, useLocalSearchParams, useScrollToTop } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { SkeletonRow } from '@/components/Skeleton';
import { dynamicsApi } from '@/api/dynamics';
import { usePagedList } from '@/hooks/use-paged-list';
import type { NativeRequestCancelToken } from '@/utils/request-cancel';
import { showToast } from '@/utils/toast';
import { feedBackMedium } from '@/utils/feedback';
import { RADII, continuous, shadow } from '@/theme/tokens';
import { biliCover } from '@/utils/image-url';

interface BubbleDyn {
  dynId: string;
  title: string;
  author: string;
  timeText: string;
  replyCount: string;
  viewStat: string;
}

interface BubbleCategory {
  id: string;
  name: string;
  type?: number;
}

interface BubbleSortItem {
  sortType?: number;
  text?: string;
}

const BubbleRow = memo(function BubbleRow({
  item,
  index,
  colors,
  T,
}: {
  item: BubbleDyn;
  index: number;
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
}) {
  return (
    <View>
      <Link href={{ pathname: '/dynamics/[id]', params: { id: item.dynId } }} asChild>
        <Press
          haptic
          scaleTo={0.98}
          style={[styles.card, { backgroundColor: colors.card, ...shadow('sm', colors.isDark) }]}>
          <View style={styles.cardIcon}>
            <Ionicons name="flame" size={16} color={ACCENT} />
          </View>
          <View style={styles.cardInfo}>
            <Text style={[T.subhead, styles.cardTitle, { color: colors.text }]} numberOfLines={2}>{item.title || '部落动态'}</Text>
            <View style={styles.cardMeta}>
              <Text style={[T.caption2, styles.metaText, { color: colors.textSecondary }]} numberOfLines={1}>{item.author}</Text>
              {item.timeText ? <Text style={[T.caption2, styles.metaText, { color: colors.textTertiary }]}>{item.timeText}</Text> : null}
            </View>
            <View style={styles.cardStats}>
              <Ionicons name="chatbubble-ellipses-outline" size={12} color={colors.textTertiary} />
              <Text style={[T.caption2, { color: colors.textTertiary }]}>{item.replyCount || '0'}</Text>
              <Ionicons name="eye-outline" size={12} color={colors.textTertiary} />
              <Text style={[T.caption2, { color: colors.textTertiary }]}>{item.viewStat || '0'}</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={15} color={colors.quaternaryLabel} />
        </Press>
      </Link>
    </View>
  );
});

export default function BubbleScreen() {
  const params = useLocalSearchParams<{ id?: string; category_id?: string; sort_type?: string }>();
  const colors = useThemeColors();
  const T = useType();
  const listRef = useRef<any>(null);
  useScrollToTop(listRef);
  const tribeId = params.id || '1';
  const categoryRef = useRef<string | undefined>(params.category_id || undefined);
  const sortRef = useRef<number | undefined>(params.sort_type ? Number(params.sort_type) : undefined);
  const [categories, setCategories] = useState<BubbleCategory[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | undefined>(params.category_id || undefined);
  const [sortItems, setSortItems] = useState<BubbleSortItem[]>([]);
  const [sortType, setSortType] = useState<number | undefined>(params.sort_type ? Number(params.sort_type) : undefined);
  const [tribeTitle, setTribeTitle] = useState('');
  const [tribeSubtitle, setTribeSubtitle] = useState('');
  const [tribeFace, setTribeFace] = useState('');
  const [tribeSummary, setTribeSummary] = useState('');

  const list = usePagedList<BubbleDyn>({
    fetchPage: async (page, cancelToken?: NativeRequestCancelToken) => {
      const res = await dynamicsApi.bubble({
        tribee_id: tribeId,
        ...(categoryRef.current ? { category_id: categoryRef.current } : {}),
        ...(sortRef.current != null ? { sort_type: sortRef.current } : {}),
        page_size: 20,
        page_num: page,
        web_location: 333.40165,
        'x-bili-device-req-json': '{"platform":"web","device":"pc","spmid":"333.40165"}',
      }, cancelToken ? { cancelToken } : undefined);
      const data = res?.data;
      const dynList: any[] = data?.content?.dyn_list ?? [];
      if (page === 1) {
        const tribe = data?.base_info?.tribee_info;
        setTribeTitle(tribe?.title || '');
        setTribeSubtitle(tribe?.sub_title || '');
        setTribeFace(tribe?.face_url || '');
        setTribeSummary(tribe?.summary || '');
        const cats = data?.category?.category_list ?? [];
        if (Array.isArray(cats)) {
          setCategories(cats.map((c: any) => ({ id: String(c.id ?? ''), name: c.name || '', type: c.type })));
        }
        const sort = data?.sort_info;
        if (sort?.showSort && Array.isArray(sort.sort_items)) {
          setSortItems(sort.sort_items.map((s: any) => ({ sortType: s.sort_type, text: s.text })));
          if (sort.cur_sort_type != null) {
            sortRef.current = sort.cur_sort_type;
            setSortType(sort.cur_sort_type);
          }
        }
      }
      const count = Number(data?.content?.count || 0);
      const mapped = dynList.map((d: any) => ({
        dynId: d.dyn_id ?? '',
        title: d.title ?? '',
        author: d.meta?.author ?? '',
        timeText: d.meta?.time_text ?? '',
        replyCount: d.meta?.reply_count ?? '',
        viewStat: d.meta?.view_stat ?? '',
      }));
      return {
        items: mapped,
        hasMore: count > 0 ? page * 20 < count : mapped.length >= 20,
      };
    },
    onError: (e) => {
      console.error('bubble error:', e);
      showToast('部落动态加载失败');
    },
  });

  const changeCategory = useCallback((id: string) => {
    if (categoryRef.current === id) return;
    categoryRef.current = id || undefined;
    setActiveCategory(id || undefined);
    list.refresh();
  }, [list]);

  const changeSort = useCallback((st: number) => {
    if (sortRef.current === st) return;
    sortRef.current = st;
    setSortType(st);
    list.refresh();
  }, [list]);

  const renderItem = useCallback(
    ({ item, index }: { item: BubbleDyn; index: number }) => (
      <BubbleRow item={item} index={index} colors={colors} T={T} />
    ),
    [colors, T],
  );

  const ItemSeparator = useCallback(() => <View style={{ height: 10 }} />, []);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Title large>{tribeTitle ? `${tribeTitle}小站` : '部落动态'}</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <FlashList
        ref={listRef}
        data={list.items}
        keyExtractor={(it, i) => it.dynId || `bubble_${i}`}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        renderItem={renderItem}
        ItemSeparatorComponent={ItemSeparator}
        ListHeaderComponent={
          <View style={styles.header}>
            {(tribeTitle || tribeFace) ? (
              <View style={[styles.tribeCard, { backgroundColor: colors.card, ...shadow('sm', colors.isDark) }]}>
                {tribeFace ? (
                  <TribeFace uri={tribeFace} />
                ) : (
                  <View style={[styles.tribeIcon, { backgroundColor: 'rgba(251,114,153,0.12)' }]}>
                    <Ionicons name="flame" size={20} color={ACCENT} />
                  </View>
                )}
                <View style={styles.tribeInfo}>
                  <Text style={[T.subhead, styles.tribeTitle, { color: colors.text }]} numberOfLines={1}>{tribeTitle || '部落'}</Text>
                  {tribeSubtitle ? <Text style={[T.caption2, { color: colors.textSecondary }]} numberOfLines={1}>{tribeSubtitle}</Text> : null}
                  {tribeSummary ? <Text style={[T.caption2, styles.tribeSummary, { color: colors.textTertiary }]} numberOfLines={2}>{tribeSummary}</Text> : null}
                </View>
              </View>
            ) : null}
            {categories.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {[{ id: '', name: '全部' }, ...categories].map((c) => {
                  const active = activeCategory === c.id;
                  return (
                    <Press
                      key={c.id || 'all'}
                      haptic
                      scaleTo={0.94}
                      onPress={() => changeCategory(c.id)}
                      style={[styles.chip, active ? styles.chipActive : { backgroundColor: colors.fill2 }]}>
                      <Text style={[T.caption1, { color: active ? '#FFFFFF' : colors.textSecondary, fontWeight: active ? '600' : '400' }]}>
                        {c.name || '全部'}
                      </Text>
                    </Press>
                  );
                })}
              </ScrollView>
            ) : null}
            {sortItems.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {sortItems.map((s) => {
                  const active = sortType === s.sortType;
                  return (
                    <Press
                      key={s.sortType ?? 0}
                      haptic
                      scaleTo={0.94}
                      onPress={() => s.sortType != null && changeSort(s.sortType)}
                      style={[styles.chip, active ? styles.chipActive : { backgroundColor: colors.fill2 }]}>
                      <Text style={[T.caption1, { color: active ? '#FFFFFF' : colors.textSecondary, fontWeight: active ? '600' : '400' }]}>
                        {s.text || '排序'}
                      </Text>
                    </Press>
                  );
                })}
              </ScrollView>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          list.loading ? (
            <View style={styles.skeletonWrap}>
              <SkeletonRow height={68} />
              <SkeletonRow height={68} />
              <SkeletonRow height={68} />
            </View>
          ) : list.error ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="cloud-offline-outline" size={38} color={colors.textTertiary} />
              <Text style={[T.headline, styles.emptyTitle, { color: colors.text }]}>加载失败</Text>
              <Press haptic scaleTo={0.94} onPress={list.refresh} style={[styles.retryBtn, { backgroundColor: colors.card }]}>
                <Text style={[T.subhead, styles.retryText, { color: ACCENT }]}>重试</Text>
              </Press>
            </View>
          ) : (
            <View style={styles.emptyWrap}>
              <Ionicons name="flame-outline" size={38} color={colors.textTertiary} />
              <Text style={[T.headline, styles.emptyTitle, { color: colors.text }]}>暂无部落动态</Text>
            </View>
          )
        }
        ListFooterComponent={
          list.loadingMore ? (
            <ActivityIndicator size="small" color={colors.textTertiary} style={{ marginVertical: 16 }} />
          ) : null
        }
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl
            refreshing={list.refreshing}
            onRefresh={() => {
              feedBackMedium();
              list.refresh();
            }}
            tintColor={colors.textSecondary}
          />
        }
        estimatedItemSize={92}
        drawDistance={250}
        overrideProps={{ initialDrawBatchSize: 10 }}
      />
    </View>
  );
}

function TribeFace({ uri }: { uri: string }) {
  const colors = useThemeColors();
  return (
    <View style={[styles.tribeFaceWrap, { backgroundColor: colors.fill2 }]}>
      <ExpoImage source={{ uri: biliCover(uri, 96, 96) }} recyclingKey={uri} cachePolicy="memory-disk" style={styles.tribeFace} contentFit="cover" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  listContent: { padding: 16, paddingBottom: 40 },
  header: { marginBottom: 12, gap: 10 },
  tribeCard: { flexDirection: 'row', gap: 12, borderRadius: RADII.card, padding: 14, ...continuous },
  tribeFaceWrap: { width: 52, height: 52, borderRadius: 26, overflow: 'hidden', ...continuous },
  tribeFace: { width: '100%', height: '100%' },
  tribeIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', ...continuous },
  tribeInfo: { flex: 1, gap: 3 },
  tribeTitle: { fontWeight: '700' },
  tribeSummary: { lineHeight: 16 },
  chipRow: { gap: 8, paddingVertical: 2 },
  chip: { borderRadius: RADII.circle, paddingHorizontal: 13, paddingVertical: 6, ...continuous },
  chipActive: { backgroundColor: ACCENT },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: RADII.card,
    padding: 13,
    ...continuous,
  },
  cardIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(251,114,153,0.12)',
    ...continuous,
  },
  cardInfo: { flex: 1, gap: 4 },
  cardTitle: { fontWeight: '600', lineHeight: 20 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { flexShrink: 1 },
  cardStats: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  skeletonWrap: { gap: 10 },
  emptyWrap: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyTitle: { fontWeight: '600' },
  retryBtn: { marginTop: 10, borderRadius: RADII.lg, paddingHorizontal: 28, paddingVertical: 9, ...continuous },
  retryText: { fontWeight: '600' },
});
