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
import { userApi } from '@/api/user';
import { usePagedList } from '@/hooks/use-paged-list';
import type { NativeRequestCancelToken } from '@/utils/request-cancel';
import { formatCount, formatTime } from '@/utils/format';
import { showToast } from '@/utils/toast';
import { feedBackMedium } from '@/utils/feedback';
import { RADII, continuous, shadow } from '@/theme/tokens';
import { fixedItemLayout } from '@/utils/list-layout';
import { biliCover } from '@/utils/image-url';

const rowLayout = fixedItemLayout(102);

interface WebVideoItem {
  bvid: string;
  title: string;
  pic: string;
  play: number;
  created: number;
  length: string;
  badge?: string;
}

interface WebVideoTag {
  tid: number;
  name: string;
  count?: number;
  specialType?: string;
}

const ORDERS: { key: string; label: string }[] = [
  { key: 'pubdate', label: '最新发布' },
  { key: 'click', label: '最多播放' },
  { key: 'stow', label: '最多收藏' },
];

const WebVideoRow = memo(function WebVideoRow({
  item,
  index,
  colors,
  T,
}: {
  item: WebVideoItem;
  index: number;
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
}) {
  return (
    <>
      <Link href={{ pathname: '/video/[id]', params: { id: item.bvid } }} asChild>
        <Press
          haptic
          scaleTo={0.98}
          style={[styles.card, { backgroundColor: colors.card, ...shadow('sm', colors.isDark) }]}>
          <View style={styles.coverWrap}>
            <ExpoImage
              source={{ uri: biliCover((item.pic || ''), 320, 200) }}
              recyclingKey={item.pic || ''}
              cachePolicy="memory-disk"
              style={[styles.cover, { backgroundColor: colors.fill2 }]}
              contentFit="cover"
            />
            {item.length ? (
              <View style={styles.lengthBadge}>
                <Text style={styles.lengthText}>{item.length}</Text>
              </View>
            ) : null}
            {item.badge ? (
              <View style={[styles.badge, { backgroundColor: ACCENT }]}>
                <Text style={styles.badgeText}>{item.badge}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.info}>
            <Text style={[T.subhead, styles.title, { color: colors.text }]} numberOfLines={2}>{item.title}</Text>
            <Text style={[T.caption2, { color: colors.textTertiary }]} numberOfLines={1}>
              {formatCount(item.play)}播放 · {formatTime(item.created)}
            </Text>
          </View>
        </Press>
      </Link>
    </>
  );
});

export default function MemberVideoWebScreen() {
  const { mid } = useLocalSearchParams<{ mid: string }>();
  const colors = useThemeColors();
  const T = useType();
  const listRef = useRef<any>(null);
  useScrollToTop(listRef);
  const midNum = Number(mid);
  const orderRef = useRef('pubdate');
  const tidRef = useRef(0);
  const specialTypeRef = useRef<string | undefined>(undefined);
  const [order, setOrder] = useState('pubdate');
  const [tags, setTags] = useState<WebVideoTag[]>([]);
  const [activeTag, setActiveTag] = useState(0);
  const [activeSpecialType, setActiveSpecialType] = useState<string | undefined>(undefined);
  const [count, setCount] = useState<number | null>(null);

  const list = usePagedList<WebVideoItem>({
    enabled: midNum > 0,
    fetchPage: async (page, cancelToken?: NativeRequestCancelToken) => {
      const res = await userApi.archive({
        mid: midNum,
        pn: page,
        order: orderRef.current,
        tid: tidRef.current,
        special_type: specialTypeRef.current,
      }, cancelToken ? { cancelToken } : undefined);
      const data = res?.data;
      const vlist: any[] = data?.list?.vlist ?? [];
      const total = data?.page?.count;
      if (page === 1) {
        const rawTags: any[] = data?.list?.tags ?? [];
        setTags([
          { tid: 0, name: '全部类型' },
          ...rawTags.map((t) => ({
            tid: t.tid ?? 0,
            name: t.name || '',
            count: t.count,
            specialType: t.special_type,
          })),
        ]);
        if (typeof data?.page?.count === 'number') setCount(data.page.count);
      }
      return {
        items: vlist.map((v) => ({
          bvid: v.bvid || '',
          title: v.title || '',
          pic: v.pic || '',
          play: v.play ?? 0,
          created: v.created ?? 0,
          length: v.length || '',
          badge: v.is_charging_arc === true ? '充电专属' : v.is_lesson_video === 1 ? '课堂' : v.is_union_video === 1 ? '合作' : undefined,
        })),
        hasMore: typeof total === 'number' ? page * 30 < total : vlist.length >= 30,
      };
    },
    onError: (e) => {
      console.error('member video web error:', e);
      showToast('投稿加载失败');
    },
  });

  const changeOrder = useCallback((key: string) => {
    if (orderRef.current === key) return;
    orderRef.current = key;
    setOrder(key);
    list.refresh();
  }, [list]);

  const changeTag = useCallback((tag: WebVideoTag) => {
    if (tidRef.current === tag.tid && specialTypeRef.current === tag.specialType) return;
    tidRef.current = tag.tid;
    specialTypeRef.current = tag.specialType;
    setActiveTag(tag.tid);
    setActiveSpecialType(tag.specialType);
    list.refresh();
  }, [list]);

  const renderItem = useCallback(
    ({ item, index }: { item: WebVideoItem; index: number }) => (
      <WebVideoRow item={item} index={index} colors={colors} T={T} />
    ),
    [colors, T],
  );

  const ItemSeparator = useCallback(() => <View style={{ height: 10 }} />, []);

  const header = (
    <View style={styles.header}>
      <View style={styles.headerRow}>
        <View style={styles.sortRow}>
          {ORDERS.map((o) => (
            <Press
              key={o.key}
              haptic
              scaleTo={0.94}
              onPress={() => changeOrder(o.key)}
              style={[styles.chip, order === o.key ? styles.chipActive : { backgroundColor: colors.fill2 }]}>
              <Text style={[T.caption1, { color: order === o.key ? '#FFFFFF' : colors.textSecondary, fontWeight: order === o.key ? '600' : '400' }]}>
                {o.label}
              </Text>
            </Press>
          ))}
        </View>
        {count != null ? (
          <Text style={[T.caption2, styles.countText, { color: colors.textTertiary }]}>{count}个视频</Text>
        ) : null}
      </View>
      {tags.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tagRow}>
          {tags.map((tag) => (
            <Press
              key={`${tag.tid}-${tag.specialType || 'all'}`}
              haptic
              scaleTo={0.94}
              onPress={() => changeTag(tag)}
              style={[styles.chip, activeTag === tag.tid && !tag.specialType ? styles.chipActive : activeTag === tag.tid && activeSpecialType === tag.specialType ? styles.chipActive : { backgroundColor: colors.fill2 }]}>
              <Text style={[T.caption1, { color: activeTag === tag.tid ? '#FFFFFF' : colors.textSecondary, fontWeight: activeTag === tag.tid ? '600' : '400' }]}>
                {`${tag.name || '全部类型'}${tag.count != null ? ` ${tag.count}` : ''}`}
              </Text>
            </Press>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Title large>UP 投稿</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <FlashList
        ref={listRef}
        data={list.items}
        keyExtractor={(it, i) => it.bvid || `web_video_${i}`}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={header}
        renderItem={renderItem}
        ItemSeparatorComponent={ItemSeparator}
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
        ListFooterComponent={
          list.loadingMore ? (
            <ActivityIndicator size="small" color={colors.textTertiary} style={{ marginVertical: 16 }} />
          ) : null
        }
        ListEmptyComponent={
          list.loading ? (
            <View style={styles.skeletonWrap}>
              <SkeletonRow height={64} />
              <SkeletonRow height={64} />
              <SkeletonRow height={64} />
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
              <Ionicons name="videocam-outline" size={38} color={colors.textTertiary} />
              <Text style={[T.headline, styles.emptyTitle, { color: colors.text }]}>暂无投稿</Text>
            </View>
          )
        }
        estimatedItemSize={102}
        overrideItemLayout={rowLayout}
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
  listContent: { padding: 14, paddingBottom: 40 },
  header: { gap: 10, marginBottom: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  sortRow: { flexDirection: 'row', gap: 8, flexShrink: 1 },
  countText: { flexShrink: 0 },
  tagRow: { gap: 8, paddingVertical: 2 },
  chip: { borderRadius: RADII.circle, paddingHorizontal: 13, paddingVertical: 6, ...continuous },
  chipActive: { backgroundColor: ACCENT },
  card: {
    flexDirection: 'row',
    gap: 10,
    borderRadius: RADII.card,
    padding: 10,
    overflow: 'hidden',
    ...continuous,
  },
  coverWrap: { position: 'relative' },
  cover: { width: 132, height: 82, borderRadius: RADII.sm, ...continuous },
  lengthBadge: { position: 'absolute', right: 5, bottom: 5, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1.5 },
  lengthText: { color: '#FFFFFF', fontSize: 10, fontWeight: '600' },
  badge: { position: 'absolute', left: 5, top: 5, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1.5 },
  badgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '600' },
  info: { flex: 1, justifyContent: 'space-between', paddingVertical: 2 },
  title: { fontWeight: '600', lineHeight: 20 },
  skeletonWrap: { gap: 10 },
  emptyWrap: { alignItems: 'center', paddingTop: 90, gap: 8 },
  emptyTitle: { fontWeight: '600' },
  retryBtn: { marginTop: 10, borderRadius: RADII.lg, paddingHorizontal: 28, paddingVertical: 9, ...continuous },
  retryText: { fontWeight: '600' },
});
