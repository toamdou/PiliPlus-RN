import { memo, useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, ActionSheetIOS } from 'react-native';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { Stack, useLocalSearchParams, Link, useScrollToTop, useRouter } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Host, useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { userApi } from '@/api/user';
import { useAuthStore } from '@/stores/auth';
import { usePagedList } from '@/hooks/use-paged-list';
import type { NativeRequestCancelToken } from '@/utils/request-cancel';
import { SkeletonRow } from '@/components/Skeleton';
import { LoginGate } from '@/components/LoginGate';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { RADII, continuous, shadow } from '@/theme/tokens';
import { showToast } from '@/utils/toast';
import { feedBackMedium, feedBackSuccess } from '@/utils/feedback';
import { fixedItemLayout } from '@/utils/list-layout';
import { biliCover } from '@/utils/image-url';
import { NativeBottomSheet } from '@/components/NativeBottomSheet';

const rowLayout = fixedItemLayout(72);

interface UserItem {
  mid: number;
  uname: string;
  face: string;
  sign: string;
}

interface FollowTag {
  tagid: number;
  name: string;
  count?: number;
}

interface FollowApiUser {
  mid: number;
  uname: string;
  face: string;
  sign?: string;
}

/* ===== 关注/粉丝行（memo：长按闭包只在行内重建） ===== */
const FollowRow = memo(function FollowRow({
  item,
  colors,
  T,
  canManage,
  onOpenLongPress,
}: {
  item: UserItem;
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
  canManage: boolean;
  onOpenLongPress: (item: UserItem) => void;
}) {
  return (
    <>
      <Link href={{ pathname: '/member/[mid]', params: { mid: String(item.mid) } }} asChild>
        <Press
          haptic
          scaleTo={0.98}
          onLongPress={canManage ? () => onOpenLongPress(item) : undefined}
          style={styles.row}>
          <ExpoImage
            source={{ uri: biliCover(item.face, 96, 96) }}
            recyclingKey={item.face}
            cachePolicy="memory-disk"
            style={[styles.avatar, { backgroundColor: colors.fill2 }]}
            contentFit="cover" />
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

const PAGE_SIZE = 50;

function mapUser(u: FollowApiUser): UserItem {
  return { mid: u.mid, uname: u.uname, face: u.face, sign: u.sign || '' };
}

export default function FollowScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ type?: string; vmid?: string; tagid?: string; name?: string }>();
  const colors = useThemeColors();
  const T = useType();
  const { userInfo, isLoggedIn } = useAuthStore();
  const listRef = useRef<FlashListRef<UserItem>>(null);
  useScrollToTop(listRef);

  const tagidRaw = params.tagid ? parseInt(params.tagid, 10) : NaN;
  const tagid = Number.isNaN(tagidRaw) ? undefined : tagidRaw;
  const isTag = tagid !== undefined;
  const isFollowing = params.type === 'following';
  const targetMid = params.vmid ? parseInt(params.vmid, 10) : (userInfo?.mid || 0);
  const isOwner = !params.vmid || targetMid === userInfo?.mid;
  const canManage = isOwner && isLoggedIn;
  const title = isTag ? (params.name || '关注分组') : isFollowing ? '关注' : '粉丝';

  /* relation 请求序号：响应返回时校验发起者一致才写入，丢弃过期响应 */
  const relationReqRef = useRef(0);
  /* 移入分组选择器 */
  const [pickerUser, setPickerUser] = useState<UserItem | null>(null);
  const [pickerTags, setPickerTags] = useState<FollowTag[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [savingMove, setSavingMove] = useState(false);

  const { items: users, loading, refreshing, loadingMore, error, refresh, loadMore, setItems } = usePagedList<UserItem>({
    enabled: targetMid > 0,
    fetchPage: async (page, cancelToken?: NativeRequestCancelToken) => {
      const res = isTag
        ? await userApi.followGroup({ tagid, pn: page }, cancelToken ? { cancelToken } : undefined)
        : isFollowing
          ? await userApi.followings({ vmid: targetMid, pn: page }, cancelToken ? { cancelToken } : undefined)
          : await userApi.fans({ vmid: targetMid, pn: page }, cancelToken ? { cancelToken } : undefined);
      const list = (res?.data?.list ?? []) as FollowApiUser[];
      return { items: list.map(mapUser), hasMore: list.length >= PAGE_SIZE };
    },
    onError: (e) => {
      console.error('load follow list error:', e);
      showToast('加载失败，请重试');
    },
  });

  const toggleSpecial = useCallback(async (item: UserItem, adding: boolean) => {
    try {
      const res = adding
        ? await userApi.addSpecial({ fid: item.mid })
        : await userApi.delSpecial({ fid: item.mid });
      if (res?.code === 0) {
        showToast(adding ? '已加入特别关注' : '已取消特别关注');
        feedBackSuccess();
        /* 在「特别关注」分组内取消时，将该用户移出列表 */
        if (!adding && tagid === -10) {
          setItems((prev) => prev.filter((u) => u.mid !== item.mid));
        }
      } else {
        showToast(res?.message || '操作失败');
      }
    } catch (e) {
      console.error('toggle special error:', e);
      showToast('操作失败');
    }
  }, [tagid, setItems]);

  const openPicker = useCallback(async (item: UserItem) => {
    setPickerUser(item);
    setPickerLoading(true);
    setPickerTags([]);
    setPicked([]);
    try {
      const [tagsRes, relRes] = await Promise.allSettled([
        userApi.followTags(),
        userApi.relation({ fid: item.mid }),
      ]);
      if (tagsRes.status === 'rejected') {
        console.error('load move groups error:', tagsRes.reason);
        showToast('分组加载失败');
      } else {
        setPickerTags(((tagsRes.value?.data ?? []) as FollowTag[]).filter((t) => t.tagid !== 0));
      }
      if (relRes.status === 'fulfilled') {
        const relData = relRes.value?.data;
        setPicked(Array.isArray(relData?.tag) ? (relData.tag as number[]) : []);
      }
    } finally {
      setPickerLoading(false);
    }
  }, []);

  const handleLongPress = useCallback(async (item: UserItem) => {
    feedBackMedium();
    const reqId = relationReqRef.current + 1;
    relationReqRef.current = reqId;
    try {
      const res = await userApi.relation({ fid: item.mid });
      if (relationReqRef.current !== reqId) return;
      const adding = res?.data?.special !== 1;
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: item.uname,
          options: [adding ? '特别关注' : '取消特别关注', '移入分组', '取消'],
          cancelButtonIndex: 2,
        },
        (index) => {
          if (index === 0) void toggleSpecial(item, adding);
          else if (index === 1) void openPicker(item);
        },
      );
    } catch (e) {
      console.error('query relation error:', e);
      if (relationReqRef.current === reqId) {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            title: item.uname,
            options: ['特别关注', '移入分组', '取消'],
            cancelButtonIndex: 2,
          },
          (index) => {
            if (index === 0) void toggleSpecial(item, false);
            else if (index === 1) void openPicker(item);
          },
        );
      }
    }
  }, [toggleSpecial, openPicker]);

  const togglePick = useCallback((tagid: number) => {
    setPicked((prev) => (prev.includes(tagid) ? prev.filter((t) => t !== tagid) : [...prev, tagid]));
  }, []);

  const saveMove = useCallback(async () => {
    if (!pickerUser) return;
    setSavingMove(true);
    try {
      const tagids = picked.length > 0 ? picked.join(',') : '0';
      const res = await userApi.addUsersToTag({ fids: String(pickerUser.mid), tagids });
      if (res?.code === 0) {
        showToast('保存成功');
        feedBackSuccess();
        /* 在自定义分组内取消勾选当前分组 → 该用户移出当前列表 */
        if (tagid !== undefined && tagid > 0 && !picked.includes(tagid)) {
          setItems((prev) => prev.filter((u) => u.mid !== pickerUser.mid));
        }
        setPickerUser(null);
      } else {
        showToast(res?.message || '保存失败');
      }
    } catch (e) {
      console.error('move user to tag error:', e);
      showToast('保存失败');
    } finally {
      setSavingMove(false);
    }
  }, [pickerUser, picked, tagid, setItems]);

  const renderRow = useCallback(
    ({ item }: { item: UserItem }) => (
      <FollowRow
        item={item}
        colors={colors}
        T={T}
        canManage={canManage}
        onOpenLongPress={handleLongPress}
      />
    ),
    [colors, T, canManage, handleLongPress],
  );

  const RowSeparator = useCallback(
    () => <View style={[styles.rowSeparator, { backgroundColor: colors.separator }]} />,
    [colors.separator],
  );

  const emptyView = () => {
    if (loading) return null;
    if (error) {
      return (
        <View style={styles.emptyWrap}>
          <View style={[styles.emptyIconBox, { backgroundColor: colors.fill2 }]}>
            <Ionicons name="cloud-offline-outline" size={38} color={colors.textTertiary} />
          </View>
          <Text style={[T.headline, styles.emptyTitle, { color: colors.text }]}>加载失败</Text>
          <Text style={[T.footnote, styles.emptySub, { color: colors.textSecondary }]}>网络开小差了，请重试</Text>
          <Press haptic scaleTo={0.94} onPress={refresh} style={[styles.retryBtn, { backgroundColor: ACCENT }]}>
            <Text style={[T.subhead, styles.retryText]}>重试</Text>
          </Press>
        </View>
      );
    }
    return (
      <View style={styles.emptyWrap}>
        <View style={[styles.emptyIconBox, { backgroundColor: colors.fill2 }]}>
          <Ionicons name="people-outline" size={38} color={colors.textTertiary} />
        </View>
        <Text style={[T.headline, styles.emptyTitle, { color: colors.text }]}>暂无数据</Text>
        <Text style={[T.footnote, styles.emptySub, { color: colors.textSecondary }]}>
          {isTag ? '该分组还没有用户' : isFollowing ? '还没有关注任何人' : '还没有粉丝'}
        </Text>
      </View>
    );
  };

  if (isOwner && !isLoggedIn) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <Stack.Title large>{title}</Stack.Title>
        <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
        <LoginGate />
      </View>
    );
  }

  const pickerBody = () => (
    <>
      <Text style={[T.headline, styles.pickerTitle, { color: colors.text }]}>移入分组</Text>
      <ScrollView
        style={[styles.pickerList, styles.pickerListNative]}
        contentContainerStyle={styles.pickerListContent}
        showsVerticalScrollIndicator={false}>
        {pickerLoading ? (
          <ActivityIndicator size="small" color={colors.textTertiary} style={{ marginVertical: 28 }} />
        ) : pickerTags.length === 0 ? (
          <Text style={[T.footnote, styles.pickerEmpty, { color: colors.textTertiary }]}>暂无分组</Text>
        ) : (
          pickerTags.map((tag) => {
            const checked = picked.includes(tag.tagid);
            return (
              <Press
                key={tag.tagid}
                haptic
                scaleTo={0.98}
                onPress={() => togglePick(tag.tagid)}
                style={[styles.pickerRow, { borderBottomColor: colors.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}>
                <Ionicons name="folder-outline" size={18} color={colors.textSecondary} />
                <Text style={[T.subhead, styles.pickerRowText, { color: colors.text }]} numberOfLines={1}>{tag.name}</Text>
                {tag.count != null ? (
                  <Text style={[T.caption1, styles.pickerCount, { color: colors.textTertiary }]}>{tag.count}</Text>
                ) : null}
                <Ionicons
                  name={checked ? 'checkmark-circle' : 'ellipse-outline'}
                  size={20}
                  color={checked ? ACCENT : colors.textTertiary} />
              </Press>
            );
          })
        )}
      </ScrollView>
      <Press
        haptic
        scaleTo={0.97}
        disabled={savingMove || pickerLoading}
        onPress={saveMove}
        style={[styles.pickerSave, { backgroundColor: ACCENT, opacity: savingMove || pickerLoading ? 0.6 : 1 }]}>
        <Text style={[T.subhead, styles.pickerSaveText]}>{savingMove ? '保存中…' : '保存'}</Text>
      </Press>
    </>
  );

  return (
    <Host style={{ flex: 1 }} useViewportSizeMeasurement>
      <View style={{ flex: 1 }}>
        <View style={[styles.root, { backgroundColor: colors.bg }]}>
          <Stack.Title large>{title}</Stack.Title>
          <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
          {canManage && (
            <Stack.Toolbar placement="right">
              <Stack.Toolbar.Button onPress={() => router.push('/follow_search' as any)}>搜索</Stack.Toolbar.Button>
              <Stack.Toolbar.Button onPress={() => router.push('/follow/tags')}>分组</Stack.Toolbar.Button>
            </Stack.Toolbar>
          )}
          <FlashList
            ref={listRef}
            data={users}
            keyExtractor={(it) => String(it.mid)}
            contentContainerStyle={[styles.listContent, users.length > 0 && { backgroundColor: colors.card, borderRadius: RADII.lg, marginHorizontal: 14, marginTop: 12, ...continuous, ...shadow('sm', colors.isDark) }]}
            showsVerticalScrollIndicator={false}
            refreshing={refreshing}
            onRefresh={refresh}
            onEndReached={loadMore}
            onEndReachedThreshold={0.4}
            estimatedItemSize={72}
            overrideItemLayout={rowLayout}
            windowSize={9}
            initialNumToRender={10}
            maxToRenderPerBatch={12}
            drawDistance={250}
            overrideProps={{ initialDrawBatchSize: 10 }}
            ItemSeparatorComponent={RowSeparator}
            ListFooterComponent={
              loadingMore ? (
                <ActivityIndicator size="small" color={colors.textTertiary} style={{ marginVertical: 16 }} />
              ) : null
            }
            ListEmptyComponent={emptyView()}
            renderItem={renderRow}
          />
          {loading && users.length === 0 && (
            <View style={[styles.skeletonCard, { backgroundColor: colors.card }]}>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </View>
          )}
        </View>

      </View>
      <NativeBottomSheet
        visible={pickerUser !== null}
        onClose={() => setPickerUser(null)}
        detents={['medium', 'large']}
        dragIndicator="visible"
        background={colors.card}>
        <View style={styles.pickerBody}>
          {pickerBody()}
        </View>
      </NativeBottomSheet>
    </Host>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingBottom: 40 },
  /* 行 */
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowSeparator: { height: StyleSheet.hairlineWidth },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  info: { flex: 1, gap: 3 },
  name: { fontWeight: '600' },
  sign: {},
  /* 空态 */
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingTop: 110, paddingHorizontal: 40, gap: 8 },
  emptyIconBox: { width: 84, height: 84, borderRadius: 42, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  emptyTitle: { fontWeight: '600' },
  emptySub: { textAlign: 'center' },
  retryBtn: { marginTop: 14, borderRadius: RADII.lg, paddingHorizontal: 30, paddingVertical: 10, ...continuous },
  retryText: { color: '#FFFFFF', fontWeight: '600' },
  /* 骨架 */
  skeletonCard: { position: 'absolute', top: 12, left: 14, right: 14, borderRadius: RADII.lg, paddingHorizontal: 16, paddingTop: 4, ...continuous },
  /* 移入分组选择器 */
  pickerBody: { flex: 1, paddingTop: 16, paddingHorizontal: 16, paddingBottom: 12 },
  pickerTitle: { fontWeight: '600', textAlign: 'center', marginBottom: 6 },
  pickerList: { flexGrow: 0 },
  pickerListNative: { flex: 1 },
  pickerListContent: { paddingBottom: 4 },
  pickerEmpty: { textAlign: 'center', paddingVertical: 28 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13 },
  pickerRowText: { flex: 1 },
  pickerCount: { fontWeight: '500' },
  pickerSave: { marginTop: 10, borderRadius: RADII.md, alignItems: 'center', paddingVertical: 12, ...continuous },
  pickerSaveText: { color: '#FFFFFF', fontWeight: '600' },
});
