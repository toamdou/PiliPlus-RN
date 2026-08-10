import { useState, useCallback, useRef, memo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { Stack, Link, useScrollToTop } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Host, useThemeColors } from '@/components/SwiftUIHost';
import { userApi } from '@/api/user';
import { usePagedList } from '@/hooks/use-paged-list';
import { feedBackSuccess } from '@/utils/feedback';
import { useAuthStore } from '@/stores/auth';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { ConfirmationDialog, Button as SwiftButton, Text as SwiftText } from '@expo/ui/swift-ui';
import { RADII, continuous } from '@/theme/tokens';
import { fixedItemLayout } from '@/utils/list-layout';
import { biliCover } from '@/utils/image-url';
import { SkeletonRow } from '@/components/Skeleton';

const rowLayout = fixedItemLayout(72);

interface BlackItem {
  mid: number;
  uname: string;
  face: string;
  sign: string;
}

/* ===== 黑名单行（memo：按 item/颜色/回调引用跳过回收复用时的重渲染） ===== */
const BlackRow = memo(function BlackRow({
  item,
  index,
  colors,
  T,
  usersLength,
  onRemove,
}: {
  item: BlackItem;
  index: number;
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
  usersLength: number;
  onRemove: (item: BlackItem) => void;
}) {
  return (
    <View style={[styles.row, index < usersLength - 1 && { borderBottomColor: colors.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <Link href={{ pathname: '/member/[mid]', params: { mid: String(item.mid) } }} asChild>
        <Press
          haptic
          scaleTo={0.98}
          style={styles.rowMain}>
          <ExpoImage
            source={{ uri: biliCover(item.face, 96, 96) }}
            /* recyclingKey：FlashList 回收单元格时防止旧用户头像残留 */
            recyclingKey={item.face}
            cachePolicy="memory-disk"
            style={[styles.avatar, { backgroundColor: colors.fill2 }]}
            contentFit="cover"
          />
          <View style={styles.info}>
            <Text style={[T.subhead, styles.name, { color: colors.text }]} numberOfLines={1}>{item.uname}</Text>
            <Text style={[T.caption1, styles.sign, { color: colors.textSecondary }]} numberOfLines={1}>{item.sign || '这个人很懒'}</Text>
          </View>
        </Press>
      </Link>
      <Press
        haptic
        scaleTo={0.9}
        onPress={() => onRemove(item)}
        style={[styles.removeBtn, { backgroundColor: colors.fill2 }]}>
        <Ionicons name="person-remove-outline" size={16} color={colors.textSecondary} />
        <Text style={[T.caption1, styles.removeText, { color: colors.textSecondary }]}>移出</Text>
      </Press>
    </View>
  );
});

export default function BlacklistScreen() {
  const colors = useThemeColors();
  const T = useType();
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const [total, setTotal] = useState(0);
  const listRef = useRef<FlashListRef<BlackItem>>(null);
  useScrollToTop(listRef);
  const [removeTarget, setRemoveTarget] = useState<BlackItem | null>(null);

  const { items: users, loading, refreshing, loadingMore, refresh, loadMore, setItems } = usePagedList<BlackItem>({
    enabled: isLoggedIn,
    fetchPage: async (page, cancelToken) => {
      const res = await userApi.blacks({ pn: page }, { cancelToken });
      const mapped: BlackItem[] = (res?.data?.list || []).map((u: any) => ({
        mid: u.mid, uname: u.uname, face: u.face, sign: u.sign || '',
      }));
      const totalCount = res?.data?.total || 0;
      setTotal(totalCount);
      return { items: mapped, hasMore: totalCount > 0 ? page * 20 < totalCount : mapped.length >= 20 };
    },
    onError: (e) => { console.error('load blacklist error:', e); },
  });

  /* 移出黑名单（act: 6 = 取消拉黑）*/
  const doRemove = useCallback(async (item: BlackItem) => {
    try {
      const res = await userApi.modifyRelation({ fid: item.mid, act: 6, re_src: 11 });
      if (res?.code === 0) {
        setItems((prev) => prev.filter((u) => u.mid !== item.mid));
        setTotal((t) => Math.max(0, t - 1));
        feedBackSuccess();
      }
    } catch {}
  }, [setItems]);

  const removeUser = useCallback((item: BlackItem) => {
    setRemoveTarget(item);
  }, []);

  /* renderItem memo：FlashList v2 按引用相等性跳过单元格重渲染 */
  const renderRow = useCallback(
    ({ item, index }: { item: BlackItem; index: number }) => (
      <BlackRow item={item} index={index} colors={colors} T={T} usersLength={users.length} onRemove={removeUser} />
    ),
    [colors, users.length, T, removeUser],
  );

  const title = total > 0 ? `黑名单: ${total}` : '黑名单';

  const screen = (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ title, headerShown: true, headerLargeTitle: true }} />
      {title && <Stack.Title large>{title}</Stack.Title>}
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <FlashList
        ref={listRef}
        data={isLoggedIn ? users : []}
        keyExtractor={(it) => String(it.mid)}
        contentContainerStyle={[styles.listContent, isLoggedIn && users.length > 0 && { backgroundColor: colors.card, borderRadius: RADII.lg, marginHorizontal: 14, marginTop: 12, ...continuous }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.textSecondary} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        estimatedItemSize={72}
        overrideItemLayout={rowLayout}
        windowSize={9}
        initialNumToRender={10}
        maxToRenderPerBatch={12}
        overrideProps={{ initialDrawBatchSize: 10 }}
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator size="small" color={colors.textTertiary} style={{ marginVertical: 16 }} />
          ) : null
        }
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.emptyWrap}>
              <View style={[styles.emptyIconBox, { backgroundColor: colors.fill2 }]}>
                <Ionicons name={isLoggedIn ? 'hand-right-outline' : 'lock-closed-outline'} size={38} color={colors.textTertiary} />
              </View>
              <Text style={[T.headline, styles.emptyTitle, { color: colors.text }]}>
                {isLoggedIn ? '黑名单为空' : '请先登录'}
              </Text>
              <Text style={[T.footnote, styles.emptySub, { color: colors.textSecondary }]}>
                {isLoggedIn ? '被你拉黑的用户会显示在这里' : '登录后可查看和管理黑名单'}
              </Text>
            </View>
          )
        }
        renderItem={renderRow}
      />
      {isLoggedIn && loading && users.length === 0 && (
        <View style={[styles.skeletonCard, { backgroundColor: colors.card }]}>
          <SkeletonRow height={48} trailing={<View style={{ width: 52, height: 28, borderRadius: RADII.md, ...continuous, backgroundColor: colors.fill2, opacity: 0.5 }} />} />
          <SkeletonRow height={48} trailing={<View style={{ width: 52, height: 28, borderRadius: RADII.md, ...continuous, backgroundColor: colors.fill2, opacity: 0.5 }} />} />
          <SkeletonRow height={48} trailing={<View style={{ width: 52, height: 28, borderRadius: RADII.md, ...continuous, backgroundColor: colors.fill2, opacity: 0.5 }} />} />
          <SkeletonRow height={48} trailing={<View style={{ width: 52, height: 28, borderRadius: RADII.md, ...continuous, backgroundColor: colors.fill2, opacity: 0.5 }} />} />
        </View>
      )}
    </View>
  );

  return (
    <Host style={{ flex: 1 }} useViewportSizeMeasurement>
      {screen}
      {/* 2.6 移出黑名单确认 → SwiftUI ConfirmationDialog（iOS） */}
      <ConfirmationDialog
        title="移出黑名单"
        isPresented={!!removeTarget}
        onIsPresentedChange={(v) => { if (!v) setRemoveTarget(null); }}
        titleVisibility="visible">
        <ConfirmationDialog.Trigger>
          <SwiftButton label="" onPress={() => {}} />
        </ConfirmationDialog.Trigger>
        <ConfirmationDialog.Actions>
          <SwiftButton
            label="移出"
            role="destructive"
            onPress={() => { if (removeTarget) { doRemove(removeTarget); setRemoveTarget(null); } }}
          />
          <SwiftButton label="取消" role="cancel" />
        </ConfirmationDialog.Actions>
        <ConfirmationDialog.Message>
          <SwiftText>{removeTarget ? `确定将「${removeTarget.uname}」移出黑名单？移出后将恢复正常的关注/互动关系。` : ''}</SwiftText>
        </ConfirmationDialog.Message>
      </ConfirmationDialog>
    </Host>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingBottom: 40 },
  /* 行 */
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  info: { flex: 1, gap: 3 },
  name: { fontWeight: '600' },
  sign: {},
  removeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADII.md, ...continuous },
  removeText: { fontWeight: '500' },
  /* 空态 */
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingTop: 110, paddingHorizontal: 40, gap: 8 },
  emptyIconBox: { width: 84, height: 84, borderRadius: 42, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  emptyTitle: { fontWeight: '600' },
  emptySub: { textAlign: 'center' },
  /* 骨架 */
  skeletonCard: { position: 'absolute', top: 12, left: 14, right: 14, borderRadius: RADII.lg, paddingHorizontal: 16, paddingTop: 4, ...continuous },
});
