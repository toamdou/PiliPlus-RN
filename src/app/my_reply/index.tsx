import { memo, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Stack, useRouter, useScrollToTop } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Host, useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { ConfirmationDialog, Button as SwiftButton, Text as SwiftText } from '@expo/ui/swift-ui';
import { SkeletonRow } from '@/components/Skeleton';
import { replyApi } from '@/api/reply';
import { formatTime, formatCount } from '@/utils/format';
import { av2bv } from '@/utils/id-utils';
import { useAuthStore } from '@/stores/auth';
import { usePagedList } from '@/hooks/use-paged-list';
import type { NativeRequestCancelToken } from '@/utils/request-cancel';
import { LoginGate } from '@/components/LoginGate';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { RADII, continuous } from '@/theme/tokens';
import { feedBack, feedBackSuccess } from '@/utils/feedback';
import { showToast } from '@/utils/toast';
import * as Clipboard from 'expo-clipboard';
import { biliCover } from '@/utils/image-url';
import EmptyState from '@/components/EmptyState';
import ErrorState from '@/components/ErrorState';

interface MyReplyItem {
  rpid: number;
  oid: number;
  type: number;
  /** 评论状态：0 正常；1 已删除；2 审核中（详见 B站 reply.state 位掩码） */
  state: number;
  ctime: number;
  like: number;
  liked: boolean;
  message: string;
  uname: string;
  avatar: string;
}

const isUnavailable = (it: MyReplyItem) => it.state !== 0 || !it.message;
const unavailableText = (it: MyReplyItem) => (it.state === 2 ? '评论审核中' : '该评论已删除');

/* ===== 我的评论行（memo：点赞/删除闭包只在行内重建） ===== */
const MyReplyRow = memo(function MyReplyRow({
  item,
  colors,
  T,
  onOpen,
  onToggleLike,
  onLongPress,
}: {
  item: MyReplyItem;
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
  onOpen: (item: MyReplyItem) => void;
  onToggleLike: (item: MyReplyItem) => void;
  onLongPress: (item: MyReplyItem) => void;
}) {
  const unavailable = isUnavailable(item);
  return (
    <Press
      haptic
      scaleTo={0.98}
      onPress={() => onOpen(item)}
      onLongPress={() => { if (!unavailable) onLongPress(item); }}
      style={styles.row}
      pressDelay={80}>
      <ExpoImage
        source={item.avatar ? { uri: biliCover(item.avatar, 88, 88) } : require('../../../assets/noface.jpeg')}
        recyclingKey={item.avatar || 'noface'}
        cachePolicy="memory-disk"
        style={[styles.avatar, { backgroundColor: colors.fill2, opacity: unavailable ? 0.5 : 1 }]}
        contentFit="cover"
      />
      <View style={styles.info}>
        <View style={styles.metaRow}>
          <Text style={[T.caption1, { color: unavailable ? colors.textTertiary : colors.textSecondary }]} numberOfLines={1}>
            {item.uname || '我'}
          </Text>
          <Text style={[T.caption2, { color: colors.textTertiary }]}>{formatTime(item.ctime)}</Text>
          {unavailable ? (
            <View style={[styles.stateTag, { backgroundColor: colors.fill2 }]}>
              <Text style={[T.caption2, { color: colors.textTertiary }]}>{unavailableText(item)}</Text>
            </View>
          ) : null}
        </View>
        <Text
          style={[T.subhead, styles.message, { color: unavailable ? colors.textTertiary : colors.text }]}
          numberOfLines={3}>
          {unavailable ? unavailableText(item) : item.message}
        </Text>
        <View style={styles.metaRow}>
          <Ionicons name="play-circle-outline" size={13} color={colors.textTertiary} />
          <Text style={[T.caption2, { color: colors.textTertiary }]}>{item.type === 1 ? '查看视频' : '查看详情'}</Text>
          <View style={{ flex: 1 }} />
          <Press
            haptic
            scaleTo={0.88}
            disabled={unavailable}
            onPress={() => onToggleLike(item)}
            style={[styles.likeBtn, { backgroundColor: item.liked ? 'rgba(251,114,153,0.12)' : colors.fill2, opacity: unavailable ? 0.4 : 1 }]}>
            <Ionicons name={item.liked ? 'thumbs-up' : 'thumbs-up-outline'} size={12} color={item.liked ? ACCENT : colors.textSecondary} />
            <Text style={[T.caption2, { color: item.liked ? ACCENT : colors.textSecondary, fontWeight: '600' }]}>
              {formatCount(item.like)}
            </Text>
          </Press>
        </View>
      </View>
    </Press>
  );
});

export default function MyReplyScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const T = useType();
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const listRef = useRef<any>(null);
  useScrollToTop(listRef);

  const { items, loading, refreshing, loadingMore, error, refresh, loadMore, setItems } = usePagedList<MyReplyItem>({
    enabled: isLoggedIn,
    fetchPage: async (page, cancelToken?: NativeRequestCancelToken) => {
      const res = await replyApi.mine({ pn: page, ps: 20 }, cancelToken ? { cancelToken } : undefined);
      const list: any[] = res?.data?.replies || [];
      const cursor = res?.data?.cursor;
      return {
        items: list.map((r: any) => ({
          rpid: r.rpid,
          oid: r.oid,
          type: r.type ?? 1,
          state: r.state ?? 0,
          ctime: r.ctime ?? 0,
          like: r.like ?? 0,
          liked: !!r.up_action?.like,
          message: r.content?.message || '',
          uname: r.member?.uname || '',
          avatar: r.member?.avatar || '',
        })),
        /* 已删除/审核中的评论仍会出现在列表中（内容为空），不影响分页判断 */
        hasMore: cursor ? !cursor.is_end : list.length === 20,
      };
    },
    onError: (e) => {
      console.error('myReply fetch error:', e);
      showToast('加载失败，请重试');
    },
  });

  /* 点赞/取消点赞（乐观更新，失败回滚） */
  const toggleLike = useCallback(async (item: MyReplyItem) => {
    const prev = item;
    const next = !item.liked;
    setItems((prevItems) =>
      prevItems.map((it) => (it.rpid === item.rpid ? { ...it, liked: next, like: it.like + (next ? 1 : -1) } : it)),
    );
    try {
      const res = await replyApi.like({ oid: item.oid, type: item.type || 1, rpid: item.rpid, action: next ? 1 : 2 });
      if (res?.code !== 0) throw new Error(res?.message || '操作失败');
      feedBack();
    } catch (e) {
      console.error('myReply like error:', e);
      setItems((prevItems) => prevItems.map((it) => (it.rpid === item.rpid ? prev : it)));
      showToast('操作失败，请重试');
    }
  }, [setItems]);

  /* 删除确认目标 */
  const [deleteTarget, setDeleteTarget] = useState<MyReplyItem | null>(null);

  const doDelete = useCallback(async (item: MyReplyItem) => {
    try {
      const res = await replyApi.del({ oid: item.oid, type: item.type || 1, rpid: item.rpid });
      if (res?.code !== 0) throw new Error(res?.message || '删除失败');
      setItems((prevItems) => prevItems.filter((it) => it.rpid !== item.rpid));
      feedBackSuccess();
      showToast('已删除');
    } catch (e) {
      console.error('myReply delete error:', e);
      showToast('删除失败，请重试');
    }
  }, [setItems]);

  const onLongPress = useCallback((item: MyReplyItem) => {
    setDeleteTarget(item);
  }, []);

  const exportRecords = useCallback(async () => {
    const json = JSON.stringify(items, null, 2);
    await Clipboard.setStringAsync(json);
    showToast('已导出当前列表到剪贴板');
  }, [items]);

  const importRecords = useCallback(async () => {
    const text = await Clipboard.getStringAsync();
    try {
      const arr = JSON.parse(text);
      if (!Array.isArray(arr)) throw new Error('invalid');
      setItems((prev) => {
        const seen = new Set(prev.map((i) => i.rpid));
        const merged = arr.filter((i) => i && typeof i.rpid === 'number' && !seen.has(i.rpid));
        return [...merged, ...prev];
      });
      showToast('已导入剪贴板记录');
    } catch {
      showToast('剪贴板内容不是有效的评论记录');
    }
  }, [setItems]);

  const confirmImport = useCallback(() => {
    Alert.alert('导入本地评论记录', '将从剪贴板读取 JSON 并合并到当前列表。', [
      { text: '取消', style: 'cancel' },
      { text: '导入', onPress: importRecords },
    ]);
  }, [importRecords]);

  /* 点击行：跳转视频（仅 type=1 视频可跳转） */
  const openTarget = useCallback((item: MyReplyItem) => {
    if (item.type !== 1) {
      showToast('仅支持跳转视频评论');
      return;
    }
    router.push(`/video/${av2bv(item.oid)}` as any);
  }, [router]);

  const renderRow = useCallback(
    ({ item }: { item: MyReplyItem }) => (
      <MyReplyRow item={item} colors={colors} T={T} onOpen={openTarget} onToggleLike={toggleLike} onLongPress={onLongPress} />
    ),
    [colors, T, openTarget, toggleLike, onLongPress],
  );

  const ItemSeparator = useCallback(
    () => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.separator, marginLeft: 66 }} />,
    [colors.separator],
  );

  if (!isLoggedIn) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <Stack.Title large>我的评论</Stack.Title>
        <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
        <LoginGate />
      </View>
    );
  }

  return (
    <Host style={{ flex: 1 }} useViewportSizeMeasurement>
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <Stack.Title large>我的评论</Stack.Title>
        <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
        <View style={styles.toolbar}>
          <Press haptic scaleTo={0.94} onPress={exportRecords} style={[styles.toolbarBtn, { backgroundColor: colors.fill2 }]}>
            <Ionicons name="download-outline" size={15} color={colors.text} />
            <Text style={[T.footnote, { color: colors.text }]}>导出</Text>
          </Press>
          <Press haptic scaleTo={0.94} onPress={confirmImport} style={[styles.toolbarBtn, { backgroundColor: colors.fill2 }]}>
            <Ionicons name="cloud-upload-outline" size={15} color={colors.text} />
            <Text style={[T.footnote, { color: colors.text }]}>导入</Text>
          </Press>
        </View>
      <FlashList
        ref={listRef}
        data={items}
        keyExtractor={(it) => String(it.rpid)}
        contentContainerStyle={[styles.listContent, items.length > 0 && { backgroundColor: colors.card, borderRadius: RADII.lg, marginHorizontal: 14, marginTop: 12, ...continuous }]}
        showsVerticalScrollIndicator={false}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        estimatedItemSize={160}
        drawDistance={250}
        overrideProps={{ initialDrawBatchSize: 10 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { feedBackSuccess(); refresh(); }} tintColor={colors.textSecondary} />}
        ItemSeparatorComponent={ItemSeparator}
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator size="small" color={colors.textTertiary} style={{ marginVertical: 16 }} />
          ) : null
        }
        ListEmptyComponent={
          loading ? null : error ? (
            <ErrorState title="加载失败" onRetry={refresh} />
          ) : (
            <EmptyState
              icon="chatbox-ellipses-outline"
              title="暂无评论"
              subtitle="发表过的评论会显示在这里"
            />
          )
        }
        renderItem={renderRow}
      />
      {loading && items.length === 0 && (
        <View style={[styles.skeletonCard, { backgroundColor: colors.card }]}>
          <SkeletonRow height={44} round />
          <SkeletonRow height={44} round />
          <SkeletonRow height={44} round />
          <SkeletonRow height={44} round />
        </View>
      )}
      </View>
      {/* 删除评论确认 → SwiftUI ConfirmationDialog */}
      <ConfirmationDialog
        title="删除评论"
        isPresented={!!deleteTarget}
        onIsPresentedChange={(v) => { if (!v) setDeleteTarget(null); }}
        titleVisibility="visible">
        <ConfirmationDialog.Trigger>
          <SwiftButton label="" onPress={() => {}} />
        </ConfirmationDialog.Trigger>
        <ConfirmationDialog.Actions>
          <SwiftButton
            label="删除"
            role="destructive"
            onPress={() => { const t = deleteTarget; setDeleteTarget(null); if (t) doDelete(t); }}
          />
          <SwiftButton label="取消" role="cancel" />
        </ConfirmationDialog.Actions>
        <ConfirmationDialog.Message>
          <SwiftText>确定删除这条评论吗？</SwiftText>
        </ConfirmationDialog.Message>
      </ConfirmationDialog>
    </Host>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  toolbar: { flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingTop: 10 },
  toolbarBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14 },
  listContent: { paddingHorizontal: 16, paddingBottom: 40 },
  /* 行 */
  row: { flexDirection: 'row', gap: 12, paddingVertical: 12, alignItems: 'flex-start' },
  avatar: { width: 44, height: 44, borderRadius: 22, marginTop: 2 },
  info: { flex: 1, gap: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  message: { lineHeight: 21 },
  stateTag: { paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 4 },
  likeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  /* 骨架 */
  skeletonCard: { position: 'absolute', top: 12, left: 14, right: 14, borderRadius: RADII.lg, paddingHorizontal: 16, paddingTop: 4, ...continuous },
});
