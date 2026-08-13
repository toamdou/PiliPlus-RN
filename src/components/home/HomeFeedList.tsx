import {
  memo,
  useCallback,
  useEffect,
  useRef,
  type ComponentType,
  type Ref,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
  RefreshControl,
  Platform,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import {
  FlashList,
  FlashListRef,
  type FlashListProps,
  type ListRenderItemInfo,
} from '@shopify/flash-list';
import Animated, { type AnimatedProps } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '@/components/SwiftUIHost';
import { useType } from '@/components/type-scale';
import { Press, stagger } from '@/components/motion';
import { RADII, continuous } from '@/theme/tokens';
import {
  VideoCard,
  cellHeightFor,
  type VideoItem,
  cardWidthFor,
  COLUMN_GAP,
  SIDE_PADDING,
} from '@/components/video/VideoCard';
import { SkeletonCard } from '@/components/Skeleton';
import { GlassCardEntryAnimationDisabledProvider } from '@/components/GlassCard';
import { HomeRefreshMarker, MARKER_HEIGHT } from './HomeRefreshMarker';
import { isPowerConstrainedNow } from '@/utils/power-state';
import {
  SEARCH_BAR_H,
  CATEGORY_BAR_H,
  PARTITION_BAR_H,
  type Category,
} from './home-feed-constants';
import type { EdgeInsets } from 'react-native-safe-area-context';

const isIOS = Platform.OS === 'ios';
/* 预取预算：约首屏 + 后续 1-2 屏（推荐/热门页常见 8-20 条/页） */
const PREFETCH_ITEMS = 24;

type AnimatedFlashListProps = AnimatedProps<FlashListProps<VideoItem>> & {
  ref?: Ref<FlashListRef<VideoItem>>;
};

/* FlashList 内部会把 onScroll 当 JS 函数调用，Reanimated 事件处理器需要
   包一层 Animated 组件才会在原生事件系统上注册 worklet。 */
const AnimatedFlashList = Animated.createAnimatedComponent(
  FlashList as ComponentType<FlashListProps<VideoItem>>,
) as ComponentType<AnimatedFlashListProps>;

/* ================= 骨架屏（共享 SkeletonCard + 首页卡片布局） ================= */
const FeedSkeletonCard = memo(function FeedSkeletonCard({ width }: { width: number }) {
  return (
    <View style={[styles.skelCard, { width }]}>
      <SkeletonCard height={(width * 10) / 16} />
    </View>
  );
});

interface HomeFeedListProps {
  listRef: { current: FlashListRef<VideoItem> | null };
  data: VideoItem[];
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  feedLayout: 'immersive' | 'compact';
  activeCategory: Category;
  insets: EdgeInsets;
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onRefresh: () => void;
  onEndReached: () => void;
  onRefreshMarkerPress: () => void;
  onDisliked: (aid: number) => void;
}

export const HomeFeedList = memo(function HomeFeedList({
  listRef,
  data,
  loading,
  refreshing,
  loadingMore,
  feedLayout,
  activeCategory,
  insets,
  onScroll,
  onRefresh,
  onEndReached,
  onRefreshMarkerPress,
  onDisliked,
}: HomeFeedListProps) {
  const colors = useThemeColors();
  const T = useType();
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const cardWidth = cardWidthFor(windowWidth);
  const headerH = insets.top + SEARCH_BAR_H + CATEGORY_BAR_H + 12;
  const prefetchedCoversRef = useRef<Set<string>>(new Set());

  /* 预取首屏及后续 1-2 屏封面：按数据更新逐批推进，URL 去重，失败静默 */
  useEffect(() => {
    const urls: string[] = [];
    for (const item of data) {
      if (urls.length >= PREFETCH_ITEMS) break;
      const url = item.pic;
      if (url && !prefetchedCoversRef.current.has(url) && !urls.includes(url)) {
        urls.push(url);
      }
    }
    if (urls.length === 0) return;
    for (const url of urls) prefetchedCoversRef.current.add(url);
    void isPowerConstrainedNow().then((constrained) => {
      if (!constrained) ExpoImage.prefetch(urls).catch(() => {});
    });
  }, [data]);

  /* renderItem：卡片宿主链（Link/缩放转场/GlassCard）收敛在 VideoCard */
  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<VideoItem>) => {
      if (item.__marker) {
        return <HomeRefreshMarker onPress={onRefreshMarkerPress} />;
      }
      const isCompact = feedLayout === 'compact';
      const delay = stagger(isCompact ? index % 8 : index % 6);
      const card = (
        <VideoCard
          item={item}
          mode={isCompact ? 'compact' : 'immersive'}
          delay={delay}
          onDisliked={onDisliked}
        />
      );
      const rank = activeCategory === '分区' ? (item as VideoItem & { rank?: number }).rank : undefined;
      const rankBadge = rank ? (
        <View style={[styles.rankBadge, { backgroundColor: rank <= 3 ? 'rgba(251,114,153,0.92)' : 'rgba(0,0,0,0.72)' }]}>
          <Text style={styles.rankBadgeText}>{rank}</Text>
        </View>
      ) : null;
      if (rankBadge) {
        const wrapped = <View style={styles.rankCellWrap}>{card}{rankBadge}</View>;
        if (isCompact && index % 2 === 1) {
          return <View style={styles.compactColPad}>{wrapped}</View>;
        }
        return wrapped;
      }
      if (isCompact && index % 2 === 1) {
        return <View style={styles.compactColPad}>{card}</View>;
      }
      return card;
    },
    [feedLayout, activeCategory, onRefreshMarkerPress, onDisliked],
  );

  const getItemType = useCallback(
    (item: VideoItem) => (item.__marker ? 'refresh' : (item.goto ?? 'av')),
    [],
  );
  const keyExtractor = useCallback(
    (item: VideoItem, index: number) =>
      item.__marker ? '__refresh-marker' : item.bvid || `item-${index}`,
    [],
  );

  const overrideItemLayout = useCallback(
    (
      layout: { span?: number; size?: number },
      item: VideoItem,
      _index: number,
      maxColumns: number,
    ) => {
      const isCompact = feedLayout === 'compact';
      if (item.__marker) {
        layout.span = maxColumns;
        layout.size = MARKER_HEIGHT;
        return;
      }
      layout.span = 1;
      layout.size =
        cellHeightFor(
          isCompact ? 'compact' : 'immersive',
          T.subhead.lineHeight ?? 20,
          T.caption1.lineHeight ?? 16,
          windowWidth,
        ) +
        (isCompact ? 14 : 16);
    },
    [feedLayout, T, windowWidth],
  );

  return (
    <GlassCardEntryAnimationDisabledProvider>
      <AnimatedFlashList
        ref={listRef}
        key={feedLayout}
        data={data}
        estimatedItemSize={
          cellHeightFor(
            feedLayout === 'compact' ? 'compact' : 'immersive',
            T.subhead.lineHeight ?? 20,
            T.caption1.lineHeight ?? 16,
            windowWidth,
          ) +
          (feedLayout === 'compact' ? 14 : 16)
        }
        numColumns={feedLayout === 'compact' ? 2 : 1}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        getItemType={getItemType}
        overrideItemLayout={overrideItemLayout}
        drawDistance={400}
        overrideProps={{ initialDrawBatchSize: 8 }}
        contentInsetAdjustmentBehavior="never"
        style={styles.list}
        contentContainerStyle={[
          feedLayout === 'compact' ? styles.listContentCompact : styles.listContentImmersive,
          {
            paddingTop: headerH + (activeCategory === '分区' ? PARTITION_BAR_H : 0),
            paddingBottom: insets.bottom + (isIOS ? 49 + 12 : 24),
          },
        ]}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={onScroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.textSecondary}
            progressViewOffset={headerH}
          />
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          activeCategory === '热门' ? (
            <View style={styles.hotEntranceRow}>
              <Press
                haptic
                scaleTo={0.95}
                onPress={() => router.push('/popular_series' as any)}
                style={[styles.hotEntrance, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                <View style={[styles.hotEntranceIcon, { backgroundColor: '#FB7299' }]}>
                  <Text style={styles.hotEntranceIconText}>周</Text>
                </View>
                <View style={styles.hotEntranceInfo}>
                  <Text style={[T.subhead, { color: colors.text, fontWeight: '700' }]}>每周必看</Text>
                  <Text style={[T.caption2, { color: colors.textSecondary }]}>官方精选</Text>
                </View>
                <Ionicons name="chevron-forward" size={15} color={colors.textTertiary} />
              </Press>
              <Press
                haptic
                scaleTo={0.95}
                onPress={() => router.push('/popular_precious' as any)}
                style={[styles.hotEntrance, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                <View style={[styles.hotEntranceIcon, { backgroundColor: '#FF9500' }]}>
                  <Text style={styles.hotEntranceIconText}>刷</Text>
                </View>
                <View style={styles.hotEntranceInfo}>
                  <Text style={[T.subhead, { color: colors.text, fontWeight: '700' }]}>入站必刷</Text>
                  <Text style={[T.caption2, { color: colors.textSecondary }]}>经典回顾</Text>
                </View>
                <Ionicons name="chevron-forward" size={15} color={colors.textTertiary} />
              </Press>
            </View>
          ) : null
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.grid}>
              {feedLayout === 'compact'
                ? Array.from({ length: 6 }).map((_, i) => <FeedSkeletonCard key={i} width={cardWidth} />)
                : Array.from({ length: 3 }).map((_, i) => (
                    <FeedSkeletonCard key={i} width={windowWidth - 32} />
                  ))}
            </View>
          ) : (
            <View style={styles.emptyWrap}>
              <Text style={[T.caption1, { color: colors.textSecondary }]}>
                暂无内容，下拉刷新试试
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.footerLoading}>
              {feedLayout === 'compact' ? (
                <>
                  <FeedSkeletonCard width={cardWidth} />
                  <FeedSkeletonCard width={cardWidth} />
                </>
              ) : (
                <FeedSkeletonCard width={windowWidth - 32} />
              )}
            </View>
          ) : null
        }
      />
    </GlassCardEntryAnimationDisabledProvider>
  );
});

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  listContentCompact: {
    paddingHorizontal: SIDE_PADDING,
  },
  listContentImmersive: {
    paddingHorizontal: 16,
  },
  hotEntranceRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  hotEntrance: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: RADII.md,
    borderWidth: StyleSheet.hairlineWidth,
    ...continuous,
  },
  hotEntranceIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hotEntranceIconText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  hotEntranceInfo: {
    flex: 1,
    gap: 1,
  },
  rankCellWrap: {
    position: 'relative',
  },
  rankBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    minWidth: 24,
    height: 22,
    borderRadius: 6,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  rankBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  compactColPad: {
    paddingLeft: COLUMN_GAP / 2,
  },
  grid: {
    paddingTop: 4,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: COLUMN_GAP,
  },
  skelCard: {
    borderRadius: 16,
    ...continuous,
    overflow: 'hidden',
    paddingBottom: 10,
  },
  footerLoading: {
    flexDirection: 'row',
    gap: COLUMN_GAP,
  },
  emptyWrap: {
    paddingVertical: 80,
    alignItems: 'center',
  },
});
