import { useCallback, useRef } from 'react';
import { View, Text, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { Stack, useScrollToTop } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { userApi } from '@/api/user';
import { useAuthStore } from '@/stores/auth';
import { usePagedList } from '@/hooks/use-paged-list';
import type { NativeRequestCancelToken } from '@/utils/request-cancel';
import { SkeletonRow } from '@/components/Skeleton';
import { LoginGate } from '@/components/LoginGate';
import { showToast } from '@/utils/toast';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { continuous, RADII } from '@/theme/tokens';
import { feedBackMedium } from '@/utils/feedback';
import { DeltaLogRow } from '@/components/log/DeltaLogRow';

interface ExpLogItem {
  time: string;
  delta: number;
  reason: string;
}

export default function ExpLogScreen() {
  const colors = useThemeColors();
  const T = useType();
  const { isLoggedIn } = useAuthStore();
  const listRef = useRef<FlashListRef<ExpLogItem>>(null);
  useScrollToTop(listRef);

  /* 分页列表 */
  const fetchPage = useCallback(async (page: number, cancelToken?: NativeRequestCancelToken) => {
    const res = await userApi.expLog({ pn: page, ps: 20 }, cancelToken ? { cancelToken } : undefined);
    const list: ExpLogItem[] = res?.data?.list ?? [];
    return { items: list, hasMore: list.length >= 20 };
  }, []);

  const onError = useCallback((e: unknown) => {
    console.error('经验日志加载失败:', e);
    showToast('经验日志加载失败');
  }, []);

  const { items, loading, refreshing, loadingMore, error, refresh, loadMore } = usePagedList<ExpLogItem>({
    fetchPage,
    enabled: isLoggedIn,
    onError,
  });

  const handleRefresh = useCallback(() => {
    feedBackMedium();
    refresh();
  }, [refresh]);

  const renderRow = useCallback(
    ({ item, index }: { item: ExpLogItem; index: number }) => (
      <DeltaLogRow item={item} index={index} colors={colors} T={T} />
    ),
    [colors, T],
  );

  /* 未登录空态 */
  if (!isLoggedIn) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <Stack.Title large>经验记录</Stack.Title>
        <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
        <LoginGate />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Title large>经验记录</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <FlashList
        ref={listRef}
        data={items}
        keyExtractor={(it, idx) => `${it.time}-${idx}`}
        contentContainerStyle={[styles.listContent, items.length > 0 && styles.listCard]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.textSecondary} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        estimatedItemSize={70}
        windowSize={9}
        initialNumToRender={10}
        maxToRenderPerBatch={12}
        drawDistance={250}
        overrideProps={{ initialDrawBatchSize: 10 }}
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator size="small" color={colors.textTertiary} style={{ marginVertical: 16 }} />
          ) : null
        }
        ListEmptyComponent={
          loading ? null : error ? (
            <View style={styles.emptyWrap}>
              <View style={[styles.emptyIconBox, { backgroundColor: colors.fill2 }]}>
                <Ionicons name="cloud-offline-outline" size={38} color={colors.textTertiary} />
              </View>
              <Text style={[T.headline, styles.emptyTitle, { color: colors.text }]}>加载失败</Text>
              <Text style={[T.footnote, styles.emptySub, { color: colors.textSecondary }]}>网络开小差了，试试重新加载</Text>
              <Press haptic scaleTo={0.94} onPress={refresh} style={styles.retryBtn}>
                <Text style={[T.subhead, styles.retryBtnText]}>重新加载</Text>
              </Press>
            </View>
          ) : (
            <View style={styles.emptyWrap}>
              <View style={[styles.emptyIconBox, { backgroundColor: colors.fill2 }]}>
                <Ionicons name="flash-outline" size={38} color={colors.textTertiary} />
              </View>
              <Text style={[T.headline, styles.emptyTitle, { color: colors.text }]}>暂无经验记录</Text>
              <Text style={[T.footnote, styles.emptySub, { color: colors.textSecondary }]}>获得经验值的记录会显示在这里</Text>
            </View>
          )
        }
        renderItem={renderRow}
      />

      {loading && items.length === 0 && (
        <View style={styles.skeletonOverlay}>
          <SkeletonRow height={44} />
          <SkeletonRow height={44} />
          <SkeletonRow height={44} />
          <SkeletonRow height={44} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  listContent: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 40 },
  listCard: { borderRadius: RADII.lg, overflow: 'hidden', ...continuous },
  /* 空态 / 错误态 */
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingTop: 110, paddingHorizontal: 40, gap: 8 },
  emptyIconBox: { width: 84, height: 84, borderRadius: 42, justifyContent: 'center', alignItems: 'center', marginBottom: 8, ...continuous },
  emptyTitle: { fontWeight: '600' },
  emptySub: { textAlign: 'center' },
  retryBtn: { marginTop: 14, backgroundColor: ACCENT, borderRadius: RADII.lg, paddingHorizontal: 30, paddingVertical: 10 },
  retryBtnText: { color: '#FFFFFF', fontWeight: '600' },
  /* 骨架 */
  skeletonOverlay: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 14, paddingTop: 12, gap: 12 },
});
