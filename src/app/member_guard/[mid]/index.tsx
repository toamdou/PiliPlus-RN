import { memo, useCallback, useRef } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Stack, Link, useLocalSearchParams, useScrollToTop } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '@/components/SwiftUIHost';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { SkeletonRow } from '@/components/Skeleton';
import { userApi } from '@/api/user';
import { usePagedList } from '@/hooks/use-paged-list';
import type { NativeRequestCancelToken } from '@/utils/request-cancel';
import { showToast } from '@/utils/toast';
import { feedBackMedium } from '@/utils/feedback';
import { biliCover } from '@/utils/image-url';
import { fixedItemLayout } from '@/utils/list-layout';
import { RADII, continuous, shadow } from '@/theme/tokens';

const rowLayout = fixedItemLayout(68);

interface GuardItem {
  uid: number;
  username: string;
  face: string;
  guardLevel: number;
}

const PENDANT: Record<number, string> = {
  1: 'https://i0.hdslb.com/bfs/live/a454275dea465ac15a03f121f0d7edaf96e30bcf.png',
  2: 'https://i0.hdslb.com/bfs/live/3b46129e796df42ec7356fcba77c8a79d47db682.png',
  3: 'https://i0.hdslb.com/bfs/live/80f732943cc3367029df65e267960d56736a82ee.png',
};

const GuardRow = memo(function GuardRow({
  item,
  index,
  colors,
  T,
}: {
  item: GuardItem;
  index: number;
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
}) {
  return (
    <>
      <Link href={{ pathname: '/member/[mid]', params: { mid: String(item.uid) } }} asChild>
        <Press haptic scaleTo={0.98} style={[styles.row, { backgroundColor: colors.card, ...shadow('sm', colors.isDark) }]}>
          <View style={styles.rowAvatarWrap}>
            <View style={[styles.rowAvatar, { backgroundColor: colors.fill2 }]}>
              <ExpoImage
                source={{ uri: biliCover(item.face, 96, 96) }}
                recyclingKey={item.face}
                cachePolicy="memory-disk"
                style={styles.rowFace}
                contentFit="cover"
              />
            </View>
            {PENDANT[item.guardLevel] ? (
              <ExpoImage
                source={{ uri: biliCover(PENDANT[item.guardLevel], 64, 64) }}
                recyclingKey={PENDANT[item.guardLevel]}
                cachePolicy="memory-disk"
                style={styles.rowPendant}
                contentFit="contain"
              />
            ) : null}
          </View>
          <View style={styles.rowInfo}>
            <Text style={[T.subhead, styles.rowName, { color: colors.text }]} numberOfLines={1}>{item.username}</Text>
            <Text style={[T.caption2, { color: colors.textTertiary }]}>
              {item.guardLevel === 1 ? '总督' : item.guardLevel === 2 ? '提督' : '舰长'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.quaternaryLabel} />
        </Press>
      </Link>
    </>
  );
});

export default function MemberGuardScreen() {
  const { mid } = useLocalSearchParams<{ mid: string }>();
  const colors = useThemeColors();
  const T = useType();
  const listRef = useRef<any>(null);
  useScrollToTop(listRef);
  const midNum = Number(mid);

  const list = usePagedList<GuardItem>({
    enabled: midNum > 0,
    fetchPage: async (page, cancelToken?: NativeRequestCancelToken) => {
      const res = await userApi.memberGuard({ ruid: midNum, page }, cancelToken ? { cancelToken } : undefined);
      const data = res?.data;
      return {
        items: (data?.guard_top_list ?? []).map((it: any) => ({
          uid: it.uid ?? 0,
          username: it.username ?? '',
          face: it.face ?? '',
          guardLevel: it.guard_level ?? 0,
        })),
        hasMore: data?.has_more === 1,
      };
    },
    onError: (e) => {
      console.error('memberGuard error:', e);
      showToast('舰队加载失败');
    },
  });

  const tops = list.items.slice(0, 3);
  const rest = list.items.slice(3);

  const renderTop = (item: GuardItem, size: number) => {
    const pendant = PENDANT[item.guardLevel];
    return (
      <Link key={item.uid} href={{ pathname: '/member/[mid]', params: { mid: String(item.uid) } }} asChild>
        <Press haptic scaleTo={0.94} style={styles.topItem}>
          <View style={styles.topAvatarWrap}>
            <View style={[styles.topAvatar, { width: size, height: size }]}>
              <ExpoImage
                source={{ uri: biliCover(item.face, 96, 96) }}
                style={[styles.topFace, { backgroundColor: colors.fill2 }]}
                contentFit="cover"
              />
            </View>
            {pendant ? (
              <ExpoImage
                source={{ uri: biliCover(pendant, 192, 192) }}
                style={[styles.topPendant, { width: size * 1.35, height: size * 1.35 }]}
                contentFit="contain"
              />
            ) : null}
          </View>
          <Text style={[T.caption1, styles.topName, { color: colors.textSecondary }]} numberOfLines={1}>
            {item.username}
          </Text>
        </Press>
      </Link>
    );
  };

  const renderRow = useCallback(
    ({ item, index }: { item: GuardItem; index: number }) => (
      <GuardRow item={item} index={index} colors={colors} T={T} />
    ),
    [colors, T],
  );

  const ItemSeparator = useCallback(() => <View style={{ height: 10 }} />, []);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Title large>舰队/大航海</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <FlashList
        ref={listRef}
        data={rest}
        keyExtractor={(item, index) => String(item.uid || `guard_${index}`)}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          !list.loading && tops.length > 0 ? (
            <View style={styles.topsRow}>
              {tops[1] ? renderTop(tops[1], 42) : <View style={styles.topItem} />}
              {tops[0] ? renderTop(tops[0], 50) : <View style={styles.topItem} />}
              {tops[2] ? renderTop(tops[2], 42) : <View style={styles.topItem} />}
            </View>
          ) : null
        }
        renderItem={renderRow}
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
              <SkeletonRow height={56} />
              <SkeletonRow height={56} />
              <SkeletonRow height={56} />
            </View>
          ) : list.error ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="cloud-offline-outline" size={38} color={colors.textTertiary} />
              <Text style={[T.headline, styles.emptyTitle, { color: colors.text }]}>加载失败</Text>
              <Press haptic scaleTo={0.94} onPress={list.refresh} style={[styles.retryBtn, { backgroundColor: colors.card }]}>
                <Text style={[T.subhead, styles.retryText, { color: '#FB7299' }]}>重试</Text>
              </Press>
            </View>
          ) : (
            <View style={styles.emptyWrap}>
              <Ionicons name="shield-outline" size={38} color={colors.textTertiary} />
              <Text style={[T.headline, styles.emptyTitle, { color: colors.text }]}>暂无舰队</Text>
            </View>
          )
        }
        estimatedItemSize={68}
        windowSize={9}
        initialNumToRender={10}
        maxToRenderPerBatch={12}
        overrideItemLayout={rowLayout}
        drawDistance={250}
        overrideProps={{ initialDrawBatchSize: 10 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  listContent: { padding: 14, paddingBottom: 40 },
  topsRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 4, paddingVertical: 8 },
  topItem: { flex: 1, alignItems: 'center', gap: 5, paddingVertical: 4 },
  topAvatarWrap: { justifyContent: 'center', alignItems: 'center', height: 68 },
  topAvatar: { borderRadius: RADII.circle, overflow: 'hidden', ...continuous },
  topFace: { width: '100%', height: '100%' },
  topPendant: { position: 'absolute' },
  topName: { maxWidth: '90%' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: RADII.card,
    padding: 12,
    ...continuous,
  },
  rowAvatarWrap: { justifyContent: 'center', alignItems: 'center', width: 44, height: 44 },
  rowAvatar: { width: 32, height: 32, borderRadius: 16, overflow: 'hidden', ...continuous },
  rowFace: { width: '100%', height: '100%' },
  rowPendant: { position: 'absolute', width: 43, height: 43 },
  rowInfo: { flex: 1, gap: 3 },
  rowName: { fontWeight: '600' },
  skeletonWrap: { gap: 10 },
  emptyWrap: { alignItems: 'center', paddingTop: 90, gap: 8 },
  emptyTitle: { fontWeight: '600' },
  retryBtn: { marginTop: 10, borderRadius: RADII.lg, paddingHorizontal: 28, paddingVertical: 9, ...continuous },
  retryText: { fontWeight: '600' },
});

