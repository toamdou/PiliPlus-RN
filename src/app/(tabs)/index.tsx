import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, View, StyleSheet } from 'react-native';
import {
  useAnimatedScrollHandler,
  useComposedEventHandler,
  useSharedValue,
  withSpring,
  type WithSpringConfig,
} from 'react-native-reanimated';
import { useRouter, useFocusEffect, useScrollToTop } from 'expo-router';
import { FlashListRef } from '@shopify/flash-list';
import { useThemeColors } from '@/components/SwiftUIHost';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { msgApi } from '@/api/msg';
import { feedBackSelection, feedBackSuccess } from '@/utils/feedback';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassSearchBar } from '@/components/GlassSearchBar';
import { useScrollHideTabBar } from '@/hooks/use-scroll-hide-tab-bar';
import { type VideoItem } from '@/components/video/VideoCard';
import { HomeFeedList } from '@/components/home/HomeFeedList';
import { HomeCategoryBar } from '@/components/home/HomeCategoryBar';
import { useRcmdFeed } from '@/hooks/use-rcmd-feed';

/* 顶栏隐藏弹簧：临界阻尼（不 overshoot）、约 300ms 快速收敛。 */
const HIDE_SPRING: WithSpringConfig = { duration: 300, dampingRatio: 1 };

function toUnread(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export default function HomeScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  /* 滚动时搜索栏（头像+pill+按钮）折叠隐藏，分类栏常驻 */
  const hideProgress = useSharedValue(0);
  const headerLastY = useSharedValue(0);
  const hideTopBar = useSettingsStore((s) => s.hideTopBar);
  const hideBottomBar = useSettingsStore((s) => s.hideBottomBar);
  const { onScroll: tabBarOnScroll } = useScrollHideTabBar(8, 0, hideBottomBar);

  const headerOnScroll = useAnimatedScrollHandler((event) => {
    const y = event.contentOffset.y;
    const delta = y - headerLastY.value;
    headerLastY.set(y);
    if (y <= 0) {
      hideProgress.set(withSpring(0, HIDE_SPRING));
    } else if (hideTopBar && delta > 6) {
      hideProgress.set(withSpring(1, HIDE_SPRING));
    } else if (delta < -6) {
      hideProgress.set(withSpring(0, HIDE_SPRING));
    }
  });
  const handleScroll = useComposedEventHandler([
    headerOnScroll,
    tabBarOnScroll,
  ]);

  const {
    videos,
    loading,
    refreshing,
    loadingMore,
    activeCategory,
    activePartitionIdx,
    selectCategory,
    setActivePartitionIdx,
    fetchVideos,
    handleEndReached,
    handleDisliked,
  } = useRcmdFeed();

  /* 点击底栏首页 Tab 时列表回顶（expo-router useScrollToTop 绑定 FlashList ref） */
  const listRef = useRef<FlashListRef<VideoItem>>(null);
  useScrollToTop(listRef);

  const feedLayout = useSettingsStore((s) => s.feedLayout);
  const msgBadgeMode = useSettingsStore((s) => s.msgBadgeMode);
  const msgUnReadTypes = useSettingsStore((s) => s.msgUnReadTypes);
  const disableLikeMsg = useSettingsStore((s) => s.disableLikeMsg);
  const userInfo = useAuthStore((s) => s.userInfo);
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const [unreadCount, setUnreadCount] = useState(0);
  const unreadRequestIdRef = useRef(0);

  /* 未读角标统一刷新：私信与通知同批拉取，角标可见时在 Tab 聚焦和应用回前台时一起更新。 */
  const refreshUnread = useCallback(() => {
    const requestId = ++unreadRequestIdRef.current;
    if (!isLoggedIn || msgBadgeMode === 0 || msgUnReadTypes.length === 0) {
      setUnreadCount(0);
      return;
    }
    const selected = new Set(msgUnReadTypes);
    const jobs: Promise<number>[] = [];
    if (selected.has(0)) {
      jobs.push(msgApi.unread().then((res: any) => {
        const d = res?.data || {};
        return toUnread(d.follow_unread)
          + toUnread(d.unfollow_unread)
          + toUnread(d.biz_msg_follow_unread)
          + toUnread(d.biz_msg_unfollow_unread)
          + toUnread(d.unfollow_push_msg)
          + toUnread(d.custom_unread);
      }).catch(() => 0));
    }
    if (selected.has(1) || selected.has(2) || selected.has(3) || selected.has(4)) {
      jobs.push(msgApi.feedUnread().then((res: any) => {
        const d = res?.data || {};
        let total = 0;
        if (selected.has(1)) total += toUnread(d.reply);
        if (selected.has(2)) total += toUnread(d.at);
        if (selected.has(3) && !disableLikeMsg) total += toUnread(d.like);
        if (selected.has(4)) total += toUnread(d.sys_msg ?? d.sysMsg);
        return total;
      }).catch(() => 0));
    }
    Promise.all(jobs)
      .then((counts) => {
        if (unreadRequestIdRef.current === requestId) {
          setUnreadCount(counts.reduce((sum, n) => sum + n, 0));
        }
      })
      .catch(() => {});
  }, [isLoggedIn, msgBadgeMode, msgUnReadTypes, disableLikeMsg]);

  useFocusEffect(
    useCallback(() => {
      refreshUnread();
    }, [refreshUnread]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshUnread();
    });
    return () => sub.remove();
  }, [refreshUnread]);

  const handleRefresh = useCallback(() => {
    feedBackSuccess();
    fetchVideos(true);
  }, [fetchVideos]);

  /* 刷新标记点击：回顶 + 换一批 */
  const handleRefreshPress = useCallback(() => {
    feedBackSelection();
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    fetchVideos(true);
  }, [fetchVideos]);

  const handleSelectPartition = useCallback((index: number) => {
    setActivePartitionIdx(index);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [setActivePartitionIdx]);

  return (
    <View collapsable={false} style={[styles.root, { backgroundColor: colors.bg }]}>
      <HomeFeedList
        listRef={listRef}
        data={videos}
        loading={loading}
        refreshing={refreshing}
        loadingMore={loadingMore}
        feedLayout={feedLayout}
        activeCategory={activeCategory}
        insets={insets}
        onScroll={handleScroll}
        onRefresh={handleRefresh}
        onEndReached={handleEndReached}
        onRefreshMarkerPress={handleRefreshPress}
        onDisliked={handleDisliked}
      />

      <GlassSearchBar
        hideProgress={hideProgress}
        avatarUri={userInfo?.face}
        showBadge={isLoggedIn && unreadCount > 0 && msgBadgeMode !== 0}
        unreadCount={unreadCount}
        badgeMode={msgBadgeMode}
        onSearchPress={() => router.push('/search' as any)}
        onAvatarPress={() => router.push(`/member/${userInfo?.mid || 0}` as any)}
        onBellPress={() => router.push('/notifications' as any)}
        topInset={insets.top}
      />

      <HomeCategoryBar
        activeCategory={activeCategory}
        activePartitionIdx={activePartitionIdx}
        hideProgress={hideProgress}
        insets={insets}
        onSelectCategory={selectCategory}
        onSelectPartition={handleSelectPartition}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
