/**
 * 舰长 tab（对应 Flutter member_guard）：前三名舰队展示（带 1/2/3 级舰长挂件），
 * 其余为普通列表行；点击进入对应用户空间。
 * 分页：has_more === 1 时继续翻页。
 */
import { memo, useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Host, ProgressView } from '@expo/ui/swift-ui';
import { Link } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { useThemeColors } from '@/components/SwiftUIHost';
import { userApi } from '@/api/user';
import { usePagedList } from '@/hooks/use-paged-list';
import type { NativeRequestCancelToken } from '@/utils/request-cancel';
import { SkeletonRow } from '@/components/Skeleton';
import { showToast } from '@/utils/toast';
import { biliCover } from '@/utils/image-url';
import { fixedItemLayout } from '@/utils/list-layout';
import { RADII, continuous, shadow } from '@/theme/tokens';
import { TabEmpty, TabError, type MemberTabProps } from '@/components/member/tab-states';

const rowLayout = fixedItemLayout(68);

interface GuardItem {
  uid: number;
  username: string;
  face: string;
  guardLevel: number;
}

/** 舰长挂件图（guard_level 1 总督 / 2 提督 / 3 舰长），与 Flutter _pendantUrl 一致 */
const PENDANT: Record<number, string> = {
  1: 'https://i0.hdslb.com/bfs/live/a454275dea465ac15a03f121f0d7edaf96e30bcf.png',
  2: 'https://i0.hdslb.com/bfs/live/3b46129e796df42ec7356fcba77c8a79d47db682.png',
  3: 'https://i0.hdslb.com/bfs/live/80f732943cc3367029df65e267960d56736a82ee.png',
};

/* ===== 舰长普通行（memo：回收复用时不重建闭包） ===== */
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
        <Press
          haptic
          scaleTo={0.98}
          style={StyleSheet.flatten([
            styles.row,
            { backgroundColor: colors.card, ...shadow('sm', colors.isDark) },
          ])}>
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
          <Text style={[T.subhead, styles.rowName, { color: colors.text }]} numberOfLines={1}>
            {item.username}
          </Text>
        </Press>
      </Link>
    </>
  );
});

export default function GuardTab({ mid, header, listRef }: MemberTabProps) {
  const colors = useThemeColors();
  const T = useType();

  const list = usePagedList<GuardItem>({
    fetchPage: async (page, cancelToken?: NativeRequestCancelToken) => {
      const res = await userApi.memberGuard({ ruid: mid, page }, cancelToken ? { cancelToken } : undefined);
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
      showToast('舰长加载失败');
    },
  });

  /* 前三名特殊展示（与 Flutter customHandleResponse 一致），其余进列表 */
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
    <FlashList
      ref={listRef}
      data={rest}
      keyExtractor={(item, index) => String(item.uid || `guard_${index}`)}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <>
          {header}
          {!list.loading && tops.length > 0 ? (
            <View style={styles.topsRow}>
              {tops[1] ? renderTop(tops[1], 42) : <View style={styles.topItem} />}
              {tops[0] ? renderTop(tops[0], 50) : <View style={styles.topItem} />}
              {tops[2] ? renderTop(tops[2], 42) : <View style={styles.topItem} />}
            </View>
          ) : null}
        </>
      }
      onEndReached={list.loadMore}
      onEndReachedThreshold={0.4}
      estimatedItemSize={68}
      windowSize={9}
      initialNumToRender={10}
      maxToRenderPerBatch={12}
      overrideItemLayout={rowLayout}
      drawDistance={250}
      overrideProps={{ initialDrawBatchSize: 10 }}
      onRefresh={list.refresh}
      refreshing={list.refreshing}
      ListFooterComponent={
        list.loadingMore ? (
          <View style={styles.footer}>
            <Host matchContents><ProgressView /></Host>
          </View>
        ) : null
      }
      ListEmptyComponent={
        list.loading ? (
          <View>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <View key={i} style={styles.skelGap}>
                <SkeletonRow height={48} />
              </View>
            ))}
          </View>
        ) : list.error ? (
          <TabError message={list.error} onRetry={list.refresh} />
        ) : list.items.length === 0 ? (
          <TabEmpty icon="shield-outline" text="暂无舰长" />
        ) : null
      }
      renderItem={renderRow}
      ItemSeparatorComponent={ItemSeparator}
    />
  );
}

const styles = StyleSheet.create({
  listContent: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 40 },
  /* 前三名舰队 */
  topsRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 4, paddingVertical: 8 },
  topItem: { flex: 1, alignItems: 'center', gap: 5, paddingVertical: 4 },
  topAvatarWrap: { justifyContent: 'center', alignItems: 'center', height: 68 },
  topAvatar: { borderRadius: RADII.circle, overflow: 'hidden', ...continuous },
  topFace: { width: '100%', height: '100%' },
  topPendant: { position: 'absolute' },
  topName: { maxWidth: '90%' },
  /* 普通行 */
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: RADII.card, padding: 12, ...continuous,
  },
  rowAvatarWrap: { justifyContent: 'center', alignItems: 'center', width: 44, height: 44 },
  rowAvatar: { width: 32, height: 32, borderRadius: 16, overflow: 'hidden', ...continuous },
  rowFace: { width: '100%', height: '100%' },
  rowPendant: { position: 'absolute', width: 43, height: 43 },
  rowName: { flex: 1, fontWeight: '600' },
  footer: { marginVertical: 18, alignItems: 'center' },
  skelGap: { marginBottom: 10 },
});

