import {
  useCallback,
  useMemo,
  useRef,
  type ComponentType,
  type Ref,
} from 'react';
import {
  View,
  Text,
  Alert,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import {
  FlashList,
  FlashListRef,
  type FlashListProps,
} from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedScrollHandler,
  useComposedEventHandler,
  useSharedValue,
  withTiming,
  type AnimatedProps,
} from 'react-native-reanimated';
import { useRouter, useScrollToTop } from 'expo-router';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { Press, useScrollHide } from '@/components/motion';
import { LoginGate } from '@/components/LoginGate';
import { useScrollHideTabBar } from '@/hooks/use-scroll-hide-tab-bar';
import { dynamicsApi } from '@/api/dynamics';
import { useType } from '@/components/type-scale';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { showToast } from '@/utils/toast';
import { saveImageToAlbum } from '@/utils/save-image';
import { videoApi } from '@/api/video';
import { av2bv } from '@/utils/id-utils';
import { useDynamicPoll } from '@/utils/dynamic-polling';
import { feedBackMedium, openInAppBrowser } from '@/utils/feedback';
import { RADII, continuous } from '@/theme/tokens';
import { UpPanel } from '@/components/dynamics/UpPanel';
import { DynamicCard } from '@/components/dynamics/DynamicCard';
import { DynamicSkeleton } from '@/components/dynamics/DynamicSkeleton';
import { getArchiveLike, getLiveInfo } from '@/components/dynamics/DynamicMediaPreview';
import { useDynamicFeed } from '@/hooks/use-dynamic-feed';
import type { DynamicCardAction, DynamicItem } from '@/components/dynamics/feed-types';

const WATERFALL_GAP = 12;

const DYNAMIC_REPORT_REASONS = [
  { code: 1, label: '色情低俗' },
  { code: 2, label: '垃圾广告' },
  { code: 3, label: '违法违规' },
  { code: 4, label: '人身攻击' },
];

type AnimatedFlashListProps = AnimatedProps<FlashListProps<DynamicItem>> & {
  ref?: Ref<FlashListRef<DynamicItem>>;
};

/* FlashList 内部会把 onScroll 当 JS 函数调用，Reanimated 事件处理器需要
   包一层 Animated 组件才会在原生事件系统上注册 worklet。 */
const AnimatedFlashList = Animated.createAnimatedComponent(
  FlashList as ComponentType<FlashListProps<DynamicItem>>,
) as ComponentType<AnimatedFlashListProps>;

export default function DynamicsScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const T = useType();
  const { width: SCREEN_W } = useWindowDimensions();
  const WATERFALL_CARD_W = (SCREEN_W - 28 - WATERFALL_GAP) / 2;
  const waterfall = useSettingsStore((s) => s.dynamicsWaterfallFlow);
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const insets = useSafeAreaInsets();
  const dynHeaderH = insets.top + 44;
  const { headerAnim, onScroll: hideOnScroll } = useScrollHide(dynHeaderH);
  // 顶栏 hairline 底边透明度：滚动越过阈值后淡入，静止顶部时淡出
  const edgeOpacity = useSharedValue(0);
  const { onScroll: tabBarOnScroll } = useScrollHideTabBar(8, insets.top);
  const edgeOnScroll = useAnimatedScrollHandler((event) => {
    edgeOpacity.set(withTiming(event.contentOffset.y > 10 ? 1 : 0, { duration: 150 }));
  });
  const handleScroll = useComposedEventHandler([
    hideOnScroll,
    tabBarOnScroll,
    edgeOnScroll,
  ]);
  const {
    items,
    loading,
    refreshing,
    portal,
    refreshPortal,
    fetchDynamics,
    loadMore,
  } = useDynamicFeed(isLoggedIn);
  /* 3.10：点底栏动态 Tab 回顶（expo-router useScrollToTop 绑定列表 ref） */
  const listRef = useRef<FlashListRef<DynamicItem>>(null);
  useScrollToTop(listRef);

  const handleOpenLiveFollow = useCallback(() => {
    router.push('/live_follow');
  }, [router]);

  const handleOpenLive = useCallback(
    (roomId: number) => {
      router.push({ pathname: '/live/[roomId]', params: { roomId } });
    },
    [router],
  );

  const handleOpenMember = useCallback(
    (mid: number) => {
      router.push({ pathname: '/member/[mid]', params: { mid } });
    },
    [router],
  );

  const header = useMemo(
    () => (
      <View style={styles.entriesWrap}>
        {portal ? (
          <UpPanel
            portal={portal}
            colors={colors}
            onOpenLiveFollow={handleOpenLiveFollow}
            onOpenLive={handleOpenLive}
            onOpenMember={handleOpenMember}
          />
        ) : null}
        <View style={styles.entryRow}>
          <Press
            haptic
            scaleTo={0.94}
            onPress={() => router.push('/dynamics_topic_rcmd' as any)}
            style={[styles.entryChip, { backgroundColor: colors.fill2 }]}>
            <Ionicons name="pricetag" size={14} color={ACCENT} />
            <Text style={[T.caption1, styles.entryText, { color: colors.textSecondary }]}>推荐话题</Text>
          </Press>
          <Press
            haptic
            scaleTo={0.94}
            onPress={() => router.push({ pathname: '/bubble', params: { id: '1' } } as any)}
            style={[styles.entryChip, { backgroundColor: colors.fill2 }]}>
            <Ionicons name="flame" size={14} color={ACCENT} />
            <Text style={[T.caption1, styles.entryText, { color: colors.textSecondary }]}>部落</Text>
          </Press>
        </View>
      </View>
    ),
    [portal, colors, router, handleOpenLiveFollow, handleOpenLive, handleOpenMember, T],
  );

  /* ===== §2.6 长按 ContextMenu 操作回调 ===== */
  const handleCardAction = useCallback(
    async (item: DynamicItem, action: DynamicCardAction) => {
      const dyn = item.modules?.module_dynamic;
      const videoInfo = getArchiveLike(dyn?.major);
      if (action === 'repost') {
        if (item.id_str) router.push(`/dynamics_repost/${item.id_str}` as any);
        else showToast('动态ID缺失');
      } else if (action === 'edit') {
        const desc = dyn?.desc?.text || dyn?.major?.opus?.summary?.text || dyn?.major?.opus?.title || '';
        router.push({ pathname: '/dynamics/create', params: { editId: item.id_str, text: desc } } as any);
      } else if (action === 'delete') {
        Alert.alert('删除动态', '删除后无法恢复，确定继续吗？', [
          { text: '取消', style: 'cancel' },
          {
            text: '删除',
            style: 'destructive',
            onPress: async () => {
              try {
                const res = await dynamicsApi.remove({ dyn_id_str: item.id_str });
                if (res?.code === 0) {
                  showToast('已删除');
                  fetchDynamics(true);
                } else {
                  showToast(res?.message || '删除失败');
                }
              } catch {
                showToast('删除失败，请重试');
              }
            },
          },
        ]);
      } else if (action === 'setTop' || action === 'rmTop') {
        try {
          const res = await (action === 'setTop'
            ? dynamicsApi.setTop({ dyn_str: item.id_str })
            : dynamicsApi.rmTop({ dyn_str: item.id_str }));
          showToast(res?.code === 0 ? (action === 'setTop' ? '已置顶' : '已取消置顶') : res?.message || '操作失败');
          if (res?.code === 0) fetchDynamics(true);
        } catch {
          showToast('操作失败');
        }
      } else if (action === 'private' || action === 'public') {
        try {
          const res = await dynamicsApi.privatePubSetting({
            dyn_id: item.id_str,
            private_pub: action === 'private' ? 1 : 0,
          });
          showToast(res?.code === 0 ? (action === 'private' ? '已设为私密' : '已设为公开') : res?.message || '操作失败');
          if (res?.code === 0) fetchDynamics(true);
        } catch {
          showToast('操作失败');
        }
      } else if (action === 'report') {
        Alert.alert('举报动态', undefined, [
          ...DYNAMIC_REPORT_REASONS.map((r) => ({
            text: r.label,
            onPress: async () => {
              try {
                const res = await dynamicsApi.report({ dynamic_id: item.id_str, reason: r.code });
                showToast(res?.code === 0 ? '举报已提交' : res?.message || '举报失败');
              } catch {
                showToast('举报失败，请重试');
              }
            },
          })),
          { text: '取消', style: 'cancel' },
        ]);
      } else if (action === 'later') {
        try {
          const res = await videoApi.toViewLater({ aid: videoInfo?.aid ?? 0, bvid: videoInfo?.bvid ?? '' });
          showToast(res?.code === 0 ? '已添加至稍后再看' : res?.message || '操作失败');
        } catch {
          showToast('操作失败');
        }
      } else if (action === 'copy') {
        await Clipboard.setStringAsync(`https://t.bilibili.com/${item.id_str}`);
        showToast('链接已复制');
      } else if (action === 'share') {
        router.push({
          pathname: '/save_panel',
          params: {
            title: item.modules?.module_author?.name
              ? `${item.modules.module_author.name} 的动态`
              : '动态',
            url: `https://t.bilibili.com/${item.id_str}`,
          },
        } as any);
      } else if (action === 'cover') {
        const cover = videoInfo?.cover;
        if (cover) await saveImageToAlbum(cover);
      }
    },
    [router, fetchDynamics],
  );

  const handlePress = useCallback(
    (item: DynamicItem) => {
      const major = item.modules?.module_dynamic?.major;
      if (item.type === 'DYNAMIC_TYPE_AV' || item.type === 'DYNAMIC_TYPE_UGC_SEASON') {
        const arc = getArchiveLike(major);
        const bvid = arc?.bvid || (arc?.aid ? av2bv(arc.aid) : '');
        if (bvid) {
          router.push(`/video/${bvid}` as any);
          return;
        }
      }
      if (item.type === 'DYNAMIC_TYPE_PGC' || item.type === 'DYNAMIC_TYPE_PGC_UNION' || item.type === 'DYNAMIC_TYPE_COURSES_SEASON') {
        const arc = getArchiveLike(major);
        const seasonId = arc?.season_id ?? (item.type === 'DYNAMIC_TYPE_COURSES_SEASON' ? arc?.id : undefined);
        if (seasonId) {
          router.push({ pathname: '/pgc/[id]', params: { id: String(seasonId) } });
          return;
        }
      }
      if (item.type === 'DYNAMIC_TYPE_LIVE' || item.type === 'DYNAMIC_TYPE_LIVE_RCMD' || item.type === 'DYNAMIC_TYPE_SUBSCRIPTION_NEW') {
        const live = getLiveInfo(major);
        if (live) {
          router.push({ pathname: '/live/[roomId]', params: { roomId: String(live.id) } });
          return;
        }
      }
      if (item.type === 'DYNAMIC_TYPE_COMMON_SQUARE') {
        const common = major?.common ?? major?.upower_common;
        if (common?.jump_url) {
          openInAppBrowser(common.jump_url).catch(() => {});
          return;
        }
      }
      if (item.type === 'DYNAMIC_TYPE_MEDIALIST') {
        const url = major?.medialist?.jump_url;
        if (url) {
          openInAppBrowser(url).catch(() => {});
          return;
        }
      }
      router.push(`/dynamics/${item.id_str}` as any);
    },
    [router],
  );

  /* renderItem/分隔器 memo：FlashList v2 按 props 引用相等性跳过单元格重渲染 */
  const renderItem = useCallback(
    ({ item, index }: { item: DynamicItem; index: number }) => {
      const card = (
        <DynamicCard
          item={item}
          colors={colors}
          compact={waterfall}
          onPress={handlePress}
          onAction={handleCardAction}
        />
      );
      if (!waterfall) return card;
      return (
        <View style={[styles.dynCell, { width: WATERFALL_CARD_W }, index % 2 === 1 && styles.dynCellRight]}>
          {card}
        </View>
      );
    },
    [colors, handlePress, handleCardAction, waterfall, WATERFALL_CARD_W],
  );
  /* V2 单元格绝对定位，contentContainerStyle 的 gap 不生效 → 用 ItemSeparatorComponent
     还原原 gap:16（仅行间插入、尾部不追加，语义与 FlatList 一致） */
  const ItemSeparator = useCallback(() => <View style={styles.dynGap} />, []);

  /* ===== 未登录空态 ===== */
  if (!isLoggedIn) {
    return (
      // collapsable={false}：iOS 26 minimize 检测要求（同 index.tsx）
      // 注意：return ( 后不能直接写 {/* JSX 注释 */}——首个 token 是 { 会被解析成对象字面量
      <View collapsable={false} style={[styles.root, { backgroundColor: colors.bg }]}>
        <LoginGate title="请先登录查看动态" subtitle="关注的人都在这里更新内容" />
      </View>
    );
  }

  return (
    /* collapsable={false}：iOS 26 minimize 检测要求（同 index.tsx） */
    <View collapsable={false} style={[styles.root, { backgroundColor: colors.bg }]}>
      <AnimatedFlashList
        key={waterfall ? 'dyn-waterfall' : 'dyn-list'}
        ref={listRef}
        data={items}
        keyExtractor={(it) => it.id_str}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={handleScroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              feedBackMedium(); // 4.9：下拉刷新触发中等冲击触觉反馈
              useDynamicPoll.getState().markRead();
              fetchDynamics(true);
              refreshPortal();
            }}
            tintColor={colors.textSecondary}
          />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        estimatedItemSize={waterfall ? 220 : 160}
        numColumns={waterfall ? 2 : 1}
        masonry={waterfall}
        windowSize={9}
        initialNumToRender={10}
        maxToRenderPerBatch={12}
        drawDistance={250}
        overrideProps={{ initialDrawBatchSize: 10 }}
        ItemSeparatorComponent={waterfall ? undefined : ItemSeparator}
        ListHeaderComponent={header}
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.emptyWrap}>
              <View style={[styles.emptyIconBox, { backgroundColor: colors.fill2 }]}>
                <Ionicons name="leaf-outline" size={38} color={colors.textTertiary} />
              </View>
              <Text style={[T.headline, styles.emptyTitle, { color: colors.text }]}>暂无动态</Text>
              <Text style={[T.footnote, styles.emptySub, { color: colors.textSecondary }]}>
                下拉刷新试试，或去关注更多 UP 主
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          loading && items.length > 0 ? (
            <ActivityIndicator size="small" color={colors.textTertiary} style={{ marginVertical: 18 }} />
          ) : null
        }
        renderItem={renderItem}
      />
      {/* ===== 顶栏（静态半透明，上滑隐藏 / 下滑显示）===== */}
      <Animated.View style={[styles.dynHeader, { paddingTop: insets.top }, headerAnim]}>
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.headerBlurBg }]} />
        <Text style={[T.title3, styles.dynHeaderTitle, { color: colors.text }]}>动态</Text>
        {/* 滚动时显现的 hairline 底边，消除顶栏的硬边裁切 */}
        <Animated.View style={[styles.headerHairline, { backgroundColor: colors.separator, opacity: edgeOpacity }]} />
      </Animated.View>
      {/* 首屏骨架 */}
      {loading && items.length === 0 && (
        <DynamicSkeleton colors={colors} top={dynHeaderH + 8} waterfall={waterfall} />
      )}
      {/* 发布动态 FAB（对齐 Flutter 动态页右下角按钮） */}
      <Press
        haptic
        scaleTo={0.9}
        onPress={() => router.push('/dynamics/create' as any)}
        style={[styles.fab, { backgroundColor: ACCENT }]}>
        <Ionicons name="add" size={24} color="#FFFFFF" />
      </Press>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  dynHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingHorizontal: 16,
  },
  dynHeaderTitle: { fontWeight: '700', height: 44, lineHeight: 44 },
  headerHairline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
  },
  listContent: {
    paddingHorizontal: 14,
    /* 顶留白 52pt：为悬浮玻璃顶栏（44 + 8）让位，由页面 JSX 显式给出 */
    paddingTop: 52,
    paddingBottom: 40,
  },
  /* 行间距 16pt（原 gap:16 的等价实现，见 ItemSeparatorComponent） */
  dynGap: {
    height: 16,
  },
  /* 双列瀑布流单元格：FlashList 网格按列等宽切分，列间距用右列 padding 补偿 */
  dynCell: {
    marginBottom: WATERFALL_GAP,
  },
  dynCellRight: {
    paddingLeft: WATERFALL_GAP / 2,
  },
  /* ===== 顶部快速入口 ===== */
  entriesWrap: { marginBottom: 16 },
  entryRow: { flexDirection: 'row', gap: 8 },
  entryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: RADII.circle,
    paddingHorizontal: 13,
    paddingVertical: 7,
    ...continuous,
  },
  entryText: { fontWeight: '500' },
  /* 空态 */
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 120,
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
  /* 发布动态 FAB */
  fab: {
    position: 'absolute',
    bottom: 80,
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 100,
  },
});
