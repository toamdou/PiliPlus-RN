/**
 * live_follow —— 直播关注页（正在直播的关注主播列表）。
 *
 * 数据：liveApi.follow({ page, page_size })（对齐 Flutter LiveHttp.liveFollow），
 * 仅展示 live_status === 1（正在直播）的房间；
 * 分页走共享 usePagedList；未登录用 LoginGate 空态。
 */
import { memo, useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { Stack, useRouter, useScrollToTop } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { liveApi } from '@/api/live';
import { usePagedList } from '@/hooks/use-paged-list';
import type { NativeRequestCancelToken } from '@/utils/request-cancel';
import { LoginGate } from '@/components/LoginGate';
import { SkeletonCard } from '@/components/Skeleton';
import { useAuthStore } from '@/stores/auth';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { RADII, continuous } from '@/theme/tokens';
import { feedBackMedium } from '@/utils/feedback';
import { showToast } from '@/utils/toast';
import { biliCover } from '@/utils/image-url';

interface LiveFollowItem {
  roomid: number;
  uname: string;
  title: string;
  area_name: string;
  text_small: string;
  room_cover: string;
}

/* 接口原始项（对齐 Flutter LiveFollowItem）：
   live_status === 1 过滤的前提是 API 按直播状态排序、过滤后仍保持原序 */
interface LiveFollowApiItem {
  roomid: number;
  uname: string;
  title: string;
  area_name: string;
  text_small: string;
  room_cover: string;
  live_status: number;
}

const SIDE_PADDING = 14;
const COLUMN_GAP = 12;
const ROW_GAP = 12;
const PAGE_SIZE = 9;

/* ===== 正在直播卡片（对齐 Flutter LiveCardVFollow：封面 + 分区/围观数 + 标题 + UP主） ===== */
const LiveFollowCard = memo(function LiveFollowCard({
  item,
  index,
  colors,
  onPress,
}: {
  item: LiveFollowItem;
  index: number;
  colors: ReturnType<typeof useThemeColors>;
  onPress: (roomid: number) => void;
}) {
  const T = useType();
  const { width: windowWidth } = useWindowDimensions();
  const coverH = ((windowWidth - SIDE_PADDING * 2 - COLUMN_GAP) * 9) / 32;
  return (
    <>
      <Press
        haptic
        scaleTo={0.97}
        onPress={() => onPress(item.roomid)}
        style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }, continuous]}>
        {/* 封面 + 底部渐变数据条（图上压字，恒深底不随主题翻转） */}
        <View style={[styles.coverWrap, { height: coverH }]}>
          <ExpoImage
            source={{ uri: biliCover(item.room_cover, 320, 200) }}
            recyclingKey={item.room_cover}
            cachePolicy="memory-disk"
            style={[StyleSheet.absoluteFill, { backgroundColor: colors.fill2 }]}
            contentFit="cover"
          />
          <View style={styles.coverGradient}>
            <View style={styles.coverMetaRow}>
              <View style={styles.areaPill}>
                <View style={styles.liveDot} />
                <Text style={styles.coverMetaText} numberOfLines={1}>
                  {item.area_name}
                </Text>
              </View>
              {!!item.text_small && (
                <Text style={styles.coverMetaText} numberOfLines={1}>
                  {item.text_small}围观
                </Text>
              )}
            </View>
          </View>
        </View>
        {/* 文字区（非图上文字，随主题翻转） */}
        <View style={styles.cardBody}>
          <Text style={[T.subhead, styles.cardTitle, { color: colors.text }]} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={[T.caption1, styles.cardAuthor, { color: colors.textSecondary }]} numberOfLines={1}>
            {item.uname}
          </Text>
        </View>
      </Press>
    </>
  );
});

export default function LiveFollowScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const T = useType();
  const { width: windowWidth } = useWindowDimensions();
  const cardW = (windowWidth - SIDE_PADDING * 2 - COLUMN_GAP) / 2;
  const coverH = (cardW * 9) / 16;
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const listRef = useRef<FlashListRef<LiveFollowItem>>(null);
  useScrollToTop(listRef);
  /* Flutter 标题 "$count人正在直播"：live_count 在首页响应里带上 */
  const [liveCount, setLiveCount] = useState<number | null>(null);

  const { items, loading, refreshing, loadingMore, error, refresh, loadMore } =
    usePagedList<LiveFollowItem>({
      fetchPage: async (page, cancelToken?: NativeRequestCancelToken) => {
        const res = await liveApi.follow({ page, page_size: PAGE_SIZE }, cancelToken ? { cancelToken } : undefined);
        const data = res?.data;
        const rawList: LiveFollowApiItem[] = data?.list ?? [];
        const list = rawList
          .filter((it) => it.live_status === 1)
          .map((it) => ({
            roomid: it.roomid,
            uname: it.uname,
            title: it.title,
            area_name: it.area_name,
            text_small: it.text_small,
            room_cover: it.room_cover,
          }));
        if (page === 1) setLiveCount(data?.live_count ?? null);
        /* totalPage 缺失时兜底：整页即认为还有更多（等价 Flutter 累计长度判定），
           避免静默截断分页；前提同上——API 按直播状态排序，过滤后仍保持原序 */
        const totalPage = data?.totalPage ?? 0;
        return {
          items: list,
          hasMore: (totalPage > 0 && page < totalPage) || list.length === PAGE_SIZE,
        };
      },
      enabled: isLoggedIn,
      onError: (e) => {
        console.error('liveFollow error:', e);
        showToast('加载失败，请重试');
      },
    });

  const handleOpenLive = useCallback(
    (roomid: number) => {
      router.push({ pathname: '/live/[roomId]', params: { roomId: roomid } });
    },
    [router],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: LiveFollowItem; index: number }) => (
      <View style={[styles.cell, { width: cardW }, index % 2 === 1 && styles.colPad]}>
        <LiveFollowCard item={item} index={index} colors={colors} onPress={handleOpenLive} />
      </View>
    ),
    [cardW, colors, handleOpenLive],
  );

  const keyExtractor = useCallback((it: LiveFollowItem) => String(it.roomid), []);

  /* 未登录空态 */
  if (!isLoggedIn) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <Stack.Title large>关注直播</Stack.Title>
        <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
        <LoginGate />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Title large>{liveCount != null ? `${liveCount}人正在直播` : '关注直播'}</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <FlashList
        ref={listRef}
        data={items}
        numColumns={2}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
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
        estimatedItemSize={220}
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
          loading ? null : error ? (
            <View style={styles.emptyWrap}>
              <View style={[styles.emptyIconBox, { backgroundColor: colors.fill2 }]}>
                <Ionicons name="cloud-offline-outline" size={38} color={colors.textTertiary} />
              </View>
              <Text style={[T.headline, styles.emptyTitle, { color: colors.text }]}>{error}</Text>
              <Press haptic scaleTo={0.94} onPress={refresh} style={styles.retryBtn}>
                <Text style={[T.subhead, styles.retryBtnText]}>重试</Text>
              </Press>
            </View>
          ) : (
            <View style={styles.emptyWrap}>
              <View style={[styles.emptyIconBox, { backgroundColor: colors.fill2 }]}>
                <Ionicons name="radio-outline" size={38} color={colors.textTertiary} />
              </View>
              <Text style={[T.headline, styles.emptyTitle, { color: colors.text }]}>暂无关注的直播</Text>
              <Text style={[T.footnote, styles.emptySub, { color: colors.textSecondary }]}>
                关注的UP开播后会出现在这里
              </Text>
            </View>
          )
        }
        renderItem={renderItem}
      />
      {/* 首屏骨架：双列网格 */}
      {loading && items.length === 0 && (
        <View style={styles.skeletonWrap}>
          <View style={styles.skeletonRow}>
            <View style={styles.skeletonCol}>
              <SkeletonCard height={coverH} />
            </View>
            <View style={styles.skeletonCol}>
              <SkeletonCard height={coverH} />
            </View>
          </View>
          <View style={styles.skeletonRow}>
            <View style={styles.skeletonCol}>
              <SkeletonCard height={coverH} />
            </View>
            <View style={styles.skeletonCol}>
              <SkeletonCard height={coverH} />
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  listContent: { paddingHorizontal: SIDE_PADDING, paddingTop: 12, paddingBottom: 40 },
  /* 双列列间距补偿：FlashList 网格按列等宽切分（无 gap 支持），
     单元格宽度 = cardW（比半宽少 COLUMN_GAP/2），奇数列补 paddingLeft = COLUMN_GAP/2 */
  cell: {
    marginBottom: ROW_GAP,
  },
  colPad: {
    paddingLeft: COLUMN_GAP / 2,
  },
  /* 卡片 */
  card: {
    borderRadius: RADII.card,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    ...continuous,
  },
  coverWrap: {
  },
  coverGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 36,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
    paddingHorizontal: 8,
    paddingBottom: 5,
  },
  coverMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  areaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FF4D6A',
  },
  /* 图上压字：白字恒白（黑色渐变底），属 5.10 合理例外 */
  coverMetaText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFFFFF',
    flexShrink: 1,
  },
  cardBody: {
    padding: 10,
    gap: 4,
  },
  cardTitle: {
    minHeight: 38,
    fontWeight: '600',
  },
  cardAuthor: {},
  /* 空态 / 错误态 */
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 110,
    paddingHorizontal: 40,
    gap: 8,
  },
  emptyIconBox: {
    width: 84,
    height: 84,
    borderRadius: 42,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  emptyTitle: { fontWeight: '600' },
  emptySub: { textAlign: 'center' },
  retryBtn: {
    marginTop: 14,
    backgroundColor: ACCENT,
    borderRadius: RADII.lg,
    paddingHorizontal: 30,
    paddingVertical: 10,
  },
  retryBtnText: { color: '#FFFFFF', fontWeight: '600' },
  /* 骨架 */
  skeletonWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: SIDE_PADDING,
    paddingTop: 12,
    gap: ROW_GAP,
  },
  skeletonRow: {
    flexDirection: 'row',
    gap: COLUMN_GAP,
  },
  skeletonCol: { flex: 1 },
});
