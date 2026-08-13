import { memo, useCallback, useRef } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Stack, Link, useScrollToTop } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { SkeletonRow } from '@/components/Skeleton';
import { userApi } from '@/api/user';
import { useAuthStore } from '@/stores/auth';
import { usePagedList } from '@/hooks/use-paged-list';
import type { NativeRequestCancelToken } from '@/utils/request-cancel';
import { LoginGate } from '@/components/LoginGate';
import { showToast } from '@/utils/toast';
import { RADII, continuous, shadow } from '@/theme/tokens';
import { fixedItemLayout } from '@/utils/list-layout';
import { biliCover } from '@/utils/image-url';

const rowLayout = fixedItemLayout(72);

interface FollowedItem {
  mid: number;
  uname: string;
  face: string;
  sign: string;
}

const FollowedRow = memo(function FollowedRow({
  item,
  index,
  colors,
  T,
}: {
  item: FollowedItem;
  index: number;
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
}) {
  return (
    <>
      <Link href={{ pathname: '/member/[mid]', params: { mid: String(item.mid) } }} asChild>
        <Press haptic scaleTo={0.98} style={[styles.row, index > 0 && { borderTopColor: colors.separator, borderTopWidth: StyleSheet.hairlineWidth }]}>
          <ExpoImage
            source={{ uri: biliCover(item.face, 96, 96) }}
            recyclingKey={item.face}
            cachePolicy="memory-disk"
            style={[styles.avatar, { backgroundColor: colors.fill2 }]}
            contentFit="cover"
          />
          <View style={styles.info}>
            <Text style={[T.subhead, styles.name, { color: colors.text }]} numberOfLines={1}>{item.uname}</Text>
            <Text style={[T.caption1, styles.sign, { color: colors.textSecondary }]} numberOfLines={1}>{item.sign || '这个人很懒'}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.quaternaryLabel} />
        </Press>
      </Link>
    </>
  );
});

export default function FollowedScreen() {
  const colors = useThemeColors();
  const T = useType();
  const { isLoggedIn, userInfo } = useAuthStore();
  const listRef = useRef<any>(null);
  useScrollToTop(listRef);
  const myMid = userInfo?.mid || 0;

  const list = usePagedList<FollowedItem>({
    enabled: isLoggedIn && myMid > 0,
    fetchPage: async (page, cancelToken?: NativeRequestCancelToken) => {
      const res = await userApi.followedUp({ mid: myMid, pn: page }, cancelToken ? { cancelToken } : undefined);
      const arr = (res?.data?.list ?? []) as any[];
      return {
        items: arr.map((u) => ({ mid: u.mid, uname: u.uname, face: u.face, sign: u.sign || '' })),
        hasMore: arr.length >= 50,
      };
    },
    onError: (e) => {
      console.error('followedUp error:', e);
      showToast('加载失败，请重试');
    },
  });

  const renderRow = useCallback(
    ({ item, index }: { item: FollowedItem; index: number }) => (
      <FollowedRow item={item} index={index} colors={colors} T={T} />
    ),
    [colors, T],
  );

  if (!isLoggedIn) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <Stack.Title large>关注我的</Stack.Title>
        <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
        <LoginGate />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Title large>关注我的</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <FlashList
        ref={listRef}
        data={list.items}
        keyExtractor={(it) => String(it.mid)}
        contentContainerStyle={[styles.listContent, list.items.length > 0 && { backgroundColor: colors.card, borderRadius: RADII.lg, marginHorizontal: 14, marginTop: 12, ...continuous, ...shadow('sm', colors.isDark) }]}
        showsVerticalScrollIndicator={false}
        renderItem={renderRow}
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.4}
        estimatedItemSize={72}
        overrideItemLayout={rowLayout}
        drawDistance={250}
        overrideProps={{ initialDrawBatchSize: 10 }}
        ListFooterComponent={
          list.loadingMore ? (
            <ActivityIndicator size="small" color={colors.textTertiary} style={{ marginVertical: 16 }} />
          ) : null
        }
        ListEmptyComponent={
          list.loading ? (
            <View style={styles.skeletonWrap}>
              <SkeletonRow height={48} round />
              <SkeletonRow height={48} round />
              <SkeletonRow height={48} round />
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
              <Ionicons name="people-outline" size={38} color={colors.textTertiary} />
              <Text style={[T.headline, styles.emptyTitle, { color: colors.text }]}>暂无关注者</Text>
              <Text style={[T.footnote, styles.emptySub, { color: colors.textSecondary }]}>还没有人关注你</Text>
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  listContent: { paddingBottom: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  info: { flex: 1, gap: 3 },
  name: { fontWeight: '600' },
  sign: {},
  skeletonWrap: { padding: 16, gap: 12 },
  emptyWrap: { alignItems: 'center', paddingTop: 110, paddingHorizontal: 40, gap: 8 },
  emptyTitle: { fontWeight: '600' },
  emptySub: { textAlign: 'center' },
  retryBtn: { marginTop: 10, borderRadius: RADII.lg, paddingHorizontal: 28, paddingVertical: 9, ...continuous },
  retryText: { fontWeight: '600' },
});
