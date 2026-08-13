import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type Ref,
} from 'react';
import {
  View,
  Text,
  Alert,
  StyleSheet,
  Platform,
  ScrollView,
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
import { BlurView } from 'expo-blur';
import Animated, {
  useAnimatedScrollHandler,
  useAnimatedStyle,
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
import { RADII, continuous, shadow } from '@/theme/tokens';
import { UpPanel } from '@/components/dynamics/UpPanel';
import { DynamicCard } from '@/components/dynamics/DynamicCard';
import { DynamicSkeleton } from '@/components/dynamics/DynamicSkeleton';
import { getArchiveLike, getLiveInfo } from '@/components/dynamics/DynamicMediaPreview';
import { useDynamicFeed, DYNAMIC_TYPE_TABS } from '@/hooks/use-dynamic-feed';
import ErrorState from '@/components/ErrorState';
import EmptyState from '@/components/EmptyState';
import type { DynamicCardAction, DynamicItem } from '@/components/dynamics/feed-types';

const WATERFALL_GAP = 12;

/* batch-5 P1：动态类型 Tab 条高度（顶栏标题 44 下方新增的 40pt 分段条，
   参与 useScrollHide 的上滑隐藏量计算与列表顶留白） */
const DYN_TYPE_TAB_H = 40;

/** iOS 26+：底栏显隐交给系统 minimizeBehavior，不渲染 JS 侧玻璃帘 */
const IS_IOS_26 = Platform.OS === 'ios' && parseInt(String(Platform.Version), 10) >= 26;

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
  const { width: SCREEN_W, height: SCREEN_H } = useWindowDimensions();
  const WATERFALL_CARD_W = (SCREEN_W - 28 - WATERFALL_GAP) / 2;
  const waterfall = useSettingsStore((s) => s.dynamicsWaterfallFlow);
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const insets = useSafeAreaInsets();
  /* 顶栏总高：状态栏 + 标题行 44 + 类型 Tab 条 40（batch-5 P1），
     上滑隐藏与骨架屏占位都按此计算 */
  const dynHeaderH = insets.top + 44 + DYN_TYPE_TAB_H;
  /* batch-5 P1：动态类型筛选 Tab（全部/投稿/番剧/专栏）。
     选中项只用于"切换后重新拉取"，渲染期读本地 state（不订阅 store），
     避免每次 setState 都触发订阅重渲染。 */
  const [dynTypeIdx, setDynTypeIdx] = useState(0);
  /* 渲染期用 ref 读最新选中值（FlashList 行内回调不依赖 state 重渲染） */
  const dynTypeIdxRef = useRef(dynTypeIdx);
  useEffect(() => {
    dynTypeIdxRef.current = dynTypeIdx;
  }, [dynTypeIdx]);
  const { headerAnim, onScroll: hideOnScroll } = useScrollHide(dynHeaderH);
  // 顶栏 hairline 底边透明度：滚动越过阈值后淡入，静止顶部时淡出
  const edgeOpacity = useSharedValue(0);
  /* #42a：retract 为底栏"收帘"进度（0=展开可见 / 1=收起隐藏，iOS<26 才写入）。
     原生 hidden 切换是瞬时的，这里用同源弹簧驱动玻璃帘与 FAB 的
     translate/opacity 过渡，把"闪没闪回"柔化为平滑收放。 */
  const { onScroll: tabBarOnScroll, retract } = useScrollHideTabBar(8, insets.top);
  /* 原生 tab bar（49）+ 底部安全区 = 底栏总高，玻璃帘覆盖位与 FAB 平移量共用 */
  const tabBarExtent = 49 + insets.bottom;
  /* 玻璃帘：始终覆盖屏幕底部 tab bar 所在条带（屏幕坐标绝对定位，
     不随根视图在底栏显隐时的伸缩漂移），收起时向下滑出 + 淡入，
     把内容"填进"旧 tab bar 条带的瞬间柔化为玻璃帘拉开的效果；
     展开时自下方升起并淡出，tab bar 在玻璃帘下"浮现"。 */
  const veilRetractStyle = useAnimatedStyle(() => ({
    opacity: retract.value,
    transform: [{ translateY: retract.value * tabBarExtent }],
  }));
  /* FAB 反补平移：内容视图随底栏显隐瞬时伸缩，FAB 会瞬跳 83pt，
     用 -retract*extent 弹簧回拉，使其锚定在底栏原占位上方不跳变。 */
  const fabRetractStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -retract.value * tabBarExtent }],
  }));
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
    error,
    portal,
    refreshPortal,
    fetchDynamics,
    loadMore,
  } = useDynamicFeed(isLoggedIn, dynTypeIdx);
  /* batch-5 P1：切换类型 Tab → 重置 offset 并刷新（useDynamicFeed 内按新索引
     重新拉取，旧请求被原生取消令牌中断）。轻触反馈对齐分段控件习惯。 */
  const handleDynTypeChange = useCallback(
    (idx: number) => {
      if (idx === dynTypeIdxRef.current) return;
      feedBackMedium();
      setDynTypeIdx(idx);
    },
    [],
  );
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

  /* getItemType：异构卡片（视频/图文/直播/专栏/转发/已失效）按 item.type 分组，
     让 FlashList 回收池按形态复用单元格，减少异构重渲染（对齐首页 HomeFeedList 写法）。
     注意：该方法调用频繁，只用 item.type 常量比较，保持轻量。 */
  const getItemType = useCallback((item: DynamicItem) => {
    const t = item.type;
    if (
      t === 'DYNAMIC_TYPE_AV' ||
      t === 'DYNAMIC_TYPE_UGC_SEASON' ||
      t === 'DYNAMIC_TYPE_PGC' ||
      t === 'DYNAMIC_TYPE_PGC_UNION' ||
      t === 'DYNAMIC_TYPE_COURSES_SEASON'
    ) {
      return 'archive';
    }
    if (t === 'DYNAMIC_TYPE_DRAW' || t === 'DYNAMIC_TYPE_OPUS') return 'draw';
    if (t === 'DYNAMIC_TYPE_LIVE' || t === 'DYNAMIC_TYPE_LIVE_RCMD' || t === 'DYNAMIC_TYPE_SUBSCRIPTION_NEW') return 'live';
    if (t === 'DYNAMIC_TYPE_ARTICLE') return 'article';
    if (t === 'DYNAMIC_TYPE_FORWARD') return 'forward';
    if (t === 'DYNAMIC_TYPE_NONE') return 'none';
    return 'default';
  }, []);

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
        getItemType={getItemType}
        drawDistance={250}
        overrideProps={{ initialDrawBatchSize: 10 }}
        ItemSeparatorComponent={waterfall ? undefined : ItemSeparator}
        ListHeaderComponent={header}
        ListEmptyComponent={
          loading ? null : (
            /* #39：空态收敛为共享 EmptyState（84px 圆图标 + 标题 + 副标题 + 入场动效），
               文案与图标沿用原手写空态。 */
            <EmptyState
              icon="leaf-outline"
              title="暂无动态"
              subtitle="下拉刷新试试，或去关注更多 UP 主"
            />
          )
        }
        ListFooterComponent={
          loading && items.length > 0 ? (
            <ActivityIndicator size="small" color={colors.textTertiary} style={{ marginVertical: 18 }} />
          ) : null
        }
        renderItem={renderItem}
      />
      {/* ===== 顶栏（真毛玻璃，上滑隐藏 / 下滑显示）=====
          #40a：BlurView 实时模糊下方滚动内容，替换原纯色 rgba(0.85) 假毛玻璃
          （此前内容滚到下面直接消失而非透出模糊）；低透明度底色叠加保证标题可读。 */}
      <Animated.View style={[styles.dynHeader, { paddingTop: insets.top }, headerAnim]}>
        <BlurView
          intensity={50}
          tint={colors.isDark ? 'systemMaterialDark' : 'systemMaterialLight'}
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
        />
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg, opacity: 0.35 }]}
        />
        <Text style={[T.title3, styles.dynHeaderTitle, { color: colors.text }]}>动态</Text>
        {/* batch-5 P1：动态类型筛选 4 Tab（全部/投稿/番剧/专栏）。
            样式对齐搜索页 SearchTypeTabs 分段控件（ACCENT 填充 + 白字 + continuous 圆角），
            置于顶栏标题下方、hairline 之上，随顶栏一起上滑隐藏；选中即按 dynType 重新拉取。 */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.dynTypeBar}
          contentContainerStyle={styles.dynTypeBarContent}>
          {DYNAMIC_TYPE_TABS.map((tab, i) => {
            const active = dynTypeIdx === i;
            return (
              <Press
                key={tab.value}
                haptic
                scaleTo={0.94}
                onPress={() => handleDynTypeChange(i)}
                style={[styles.dynTypeTab, continuous, active ? { backgroundColor: ACCENT } : { backgroundColor: colors.fill2 }]}>
                <Text style={[T.footnote, styles.dynTypeTabText, { color: active ? '#FFFFFF' : colors.textSecondary }]}>
                  {tab.label}
                </Text>
              </Press>
            );
          })}
        </ScrollView>
        {/* 滚动时显现的 hairline 底边，消除顶栏的硬边裁切 */}
        <Animated.View style={[styles.headerHairline, { backgroundColor: colors.separator, opacity: edgeOpacity }]} />
      </Animated.View>
      {/* D1：加载失败静默空态 → 统一 ErrorState + 重试。
          仅"加载结束且列表为空"时遮罩（有缓存旧数据则正常展示，下拉刷新可恢复）。 */}
      {!loading && error && items.length === 0 && (
        <View style={styles.errorOverlay}>
          <ErrorState
            title="动态加载失败"
            message="网络似乎开小差了，请检查后重试"
            onRetry={() => fetchDynamics(true)}
          />
        </View>
      )}
      {/* 首屏骨架 */}
      {loading && items.length === 0 && (
        <DynamicSkeleton colors={colors} top={dynHeaderH + 8} waterfall={waterfall} />
      )}
      {/* 发布动态 FAB（对齐 Flutter 动态页右下角按钮）。
          #40a：手写阴影（opacity 0.2）收敛为 shadow('lg') 环境光阴影。 */}
      <Animated.View
        style={[
          styles.fabWrap,
          /* #42a：iOS<26 底栏收放时 FAB 反补平移，锚定在底栏原占位上方不瞬跳 */
          ...(IS_IOS_26 ? [] : [fabRetractStyle]),
        ]}>
        <Press
          haptic
          scaleTo={0.9}
          onPress={() => router.push('/dynamics/create' as any)}
          style={[styles.fab, { backgroundColor: ACCENT }, shadow('lg', colors.isDark)]}>
          <Ionicons name="add" size={24} color="#FFFFFF" />
        </Press>
      </Animated.View>
      {/* #42a：iOS<26 底栏显隐过渡玻璃帘。
          原生 hidden 瞬时切换（内容视图瞬间伸缩、tab bar 原条带瞬间变成列表），
          玻璃帘以屏幕坐标绝对定位于 tab bar 条带，随 retract 弹簧滑出/升起，
          把"闪没闪回"柔化为平滑收放；iOS 26+ 由系统 minimizeBehavior 接管，不渲染。 */}
      {!IS_IOS_26 && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.veil,
            {
              top: SCREEN_H - tabBarExtent,
              height: tabBarExtent,
              borderTopColor: colors.separator,
            },
            veilRetractStyle,
          ]}>
          <BlurView
            intensity={55}
            tint={colors.isDark ? 'systemMaterialDark' : 'systemMaterialLight'}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  /* D1 错误态遮罩：覆盖列表区域（低于顶栏 zIndex 10 / FAB zIndex 100） */
  errorOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 5,
  },
  dynHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingHorizontal: 16,
  },
  dynHeaderTitle: { fontWeight: '700', height: 44, lineHeight: 44 },
  /* batch-5 P1：动态类型筛选 Tab 条（顶栏标题下方，随顶栏上滑隐藏） */
  dynTypeBar: { height: DYN_TYPE_TAB_H },
  dynTypeBarContent: { gap: 8, alignItems: 'center' },
  dynTypeTab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: RADII.sm,
  },
  dynTypeTabText: { fontWeight: '500' },
  headerHairline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
  },
  listContent: {
    paddingHorizontal: 14,
    /* 顶留白 92pt：为悬浮玻璃顶栏（标题 44 + 类型 Tab 条 40 + 8）让位，由页面 JSX 显式给出 */
    paddingTop: 52 + DYN_TYPE_TAB_H,
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
  /* 发布动态 FAB：外层承担 #42a 底栏收放的反补平移（不影响 Press 内部缩放动画） */
  fabWrap: {
    position: 'absolute',
    bottom: 80,
    right: 20,
    zIndex: 100,
  },
  /* 发布动态 FAB（#40a：阴影收敛为 shadow('lg') 环境光阴影） */
  fab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
  },
  /* #42a：iOS<26 底栏显隐过渡玻璃帘（覆盖屏幕底部 tab bar 条带） */
  veil: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    zIndex: 99,
  },
});
