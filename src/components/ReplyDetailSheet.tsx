/**
 * ReplyDetailSheet —— 楼中楼"全部回复"底部弹出页。
 * 使用 @expo/ui SwiftUI BottomSheet + RNHostView。
 * 分页/排序逻辑保留；楼中楼行不再只读：支持点赞/踩、回复、图片、删除。
 */
import { useState, useRef, useCallback, useEffect, memo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TextInput, ActionSheetIOS, Alert } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { formatTime, formatCount } from '@/utils/format';
import { replyApi } from '@/api/reply';
import { dynamicsApi } from '@/api/dynamics';
import { createNativeRequestCancelToken, type NativeRequestCancelToken } from '@/utils/request-cancel';
import { useAuthStore } from '@/stores/auth';
import { showToast } from '@/utils/toast';
import { feedBackSuccess, feedBackSelection } from '@/utils/feedback';
import { biliCover } from '@/utils/image-url';
import { NativeBottomSheet } from '@/components/NativeBottomSheet';
import { VoteCard, type ReplyItem } from '@/components/CommentSection';

interface Props {
  visible: boolean;
  oid: number;
  type: number;
  root: number;
  rcount: number;
  initialReplies: ReplyItem[];
  onClose: () => void;
  upMid?: number;
}

/** 排序模式（对齐 Flutter ReplySortType；楼中楼默认按时间） */
type SortMode = 'time' | 'hot';

const SORT_VALUE: Record<SortMode, number> = { time: 1, hot: 2 };

const PAGE_SIZE = 20;

interface PageInfo {
  num?: number;
  size?: number;
  count?: number;
  is_end?: boolean;
}

interface PageState {
  list: ReplyItem[];
  pn: number;
  hasMore: boolean;
}

interface ReplyPatch {
  like?: number;
  action?: number;
  removed?: boolean;
}

function applyPatch(reply: ReplyItem, patches: Record<number, ReplyPatch>): ReplyItem {
  const p = patches[reply.rpid];
  return p ? { ...reply, like: p.like ?? reply.like, action: p.action ?? reply.action } : reply;
}

export function ReplyDetailSheet({ visible, oid, type, root, rcount, initialReplies, onClose, upMid }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const myMid = useAuthStore((s) => s.userInfo?.mid);
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);

  const [page, setPage] = useState<PageState>({ list: initialReplies, pn: 1, hasMore: rcount > 0 });
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(true);
  const [sort, setSort] = useState<SortMode>('time');
  const [total, setTotal] = useState(rcount);
  const [patches, setPatches] = useState<Record<number, ReplyPatch>>({});
  const [added, setAdded] = useState<ReplyItem[]>([]);
  const [replyText, setReplyText] = useState('');
  const [replyImage, setReplyImage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const pageRef = useRef(page);
  const loadingRef = useRef(false);
  const refreshingRef = useRef(true);
  const sortRef = useRef<SortMode>('time');
  const sessionRef = useRef(0);
  const cancelTokenRef = useRef<NativeRequestCancelToken | null>(null);
  const uploadCancelRef = useRef<NativeRequestCancelToken | null>(null);

  useEffect(() => () => { sessionRef.current += 1; }, []);

  useEffect(() => () => {
    cancelTokenRef.current?.abort();
    uploadCancelRef.current?.abort();
  }, []);

  const isDone = useCallback((arr: ReplyItem[], pg: PageInfo | undefined, loaded: number, count: number): boolean => {
    if (pg?.is_end === true) return true;
    if (pg != null && (pg.num ?? 0) * (pg.size ?? 0) >= (pg.count ?? 0)) return true;
    if (arr.length < PAGE_SIZE) return true;
    return loaded >= count;
  }, []);

  const fetchFirstPage = useCallback(async (sortMode: SortMode, seed: boolean, session: number) => {
    const cancelToken = createNativeRequestCancelToken();
    cancelTokenRef.current?.abort();
    cancelTokenRef.current = cancelToken;
    try {
      const res = await replyApi.reply({ oid, type, root, pn: 1, ps: PAGE_SIZE, sort: SORT_VALUE[sortMode], next: 0 }, { cancelToken });
      if (session !== sessionRef.current) return;
      const arr = (res?.data?.replies as ReplyItem[] | undefined) ?? [];
      const pg = res?.data?.page as PageInfo | undefined;
      const seen = new Set(arr.map((r) => r.rpid));
      const extras = seed ? initialReplies.filter((r) => !seen.has(r.rpid)) : [];
      const merged = [...arr, ...extras];
      const count = typeof pg?.count === 'number' && pg.count > 0 ? pg.count : rcount;
      setTotal(count);
      setPatches({});
      setAdded([]);
      const next: PageState = { list: merged, pn: 2, hasMore: !isDone(arr, pg, merged.length, count) };
      pageRef.current = next;
      setPage(next);
    } catch {
      if (cancelToken.aborted) return;
      if (session === sessionRef.current) {
        const next: PageState = { list: initialReplies, pn: 2, hasMore: initialReplies.length < rcount };
        pageRef.current = next;
        setPage(next);
      }
    } finally {
      if (cancelTokenRef.current === cancelToken) cancelTokenRef.current = null;
      if (session === sessionRef.current && !cancelToken.aborted) {
        loadingRef.current = false;
        refreshingRef.current = false;
        setRefreshing(false);
      }
    }
  }, [oid, type, root, rcount, initialReplies, isDone]);

  const reload = useCallback((sortMode: SortMode, seed: boolean) => {
    sessionRef.current += 1;
    const session = sessionRef.current;
    sortRef.current = sortMode;
    setSort(sortMode);
    loadingRef.current = true;
    refreshingRef.current = true;
    setRefreshing(true);
    void fetchFirstPage(sortMode, seed, session);
  }, [fetchFirstPage]);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => {
      sessionRef.current += 1;
      loadingRef.current = true;
      void fetchFirstPage('time', true, sessionRef.current);
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, root]);

  const loadNext = useCallback(async () => {
    const state = pageRef.current;
    if (loadingRef.current || refreshingRef.current || !visible || !state.hasMore) return;
    loadingRef.current = true;
    setLoading(true);
    const session = sessionRef.current;
    const cancelToken = createNativeRequestCancelToken();
    cancelTokenRef.current?.abort();
    cancelTokenRef.current = cancelToken;
    try {
      const res = await replyApi.reply({ oid, type, root, pn: state.pn, ps: PAGE_SIZE, sort: SORT_VALUE[sortRef.current], next: state.pn - 1 }, { cancelToken });
      if (session !== sessionRef.current) return;
      const arr = (res?.data?.replies as ReplyItem[] | undefined) ?? [];
      const pg = res?.data?.page as PageInfo | undefined;
      const seen = new Set(state.list.map((r) => r.rpid));
      const addedList = arr.filter((r) => !seen.has(r.rpid));
      const merged = [...state.list, ...addedList];
      const count = typeof pg?.count === 'number' && pg.count > 0 ? pg.count : rcount;
      setTotal(count);
      const done = addedList.length === 0 || isDone(arr, pg, merged.length, count);
      const next: PageState = { list: merged, pn: state.pn + 1, hasMore: !done };
      pageRef.current = next;
      setPage(next);
    } catch {
      if (cancelToken.aborted) return;
    } finally {
      if (cancelTokenRef.current === cancelToken) cancelTokenRef.current = null;
      if (session === sessionRef.current && !cancelToken.aborted) {
        loadingRef.current = false;
        setLoading(false);
      }
    }
  }, [oid, type, root, visible, rcount, isDone]);

  const toggleSort = useCallback(() => {
    if (loadingRef.current) return;
    pageRef.current = { list: [], pn: 1, hasMore: true };
    setPage(pageRef.current);
    reload(sortRef.current === 'time' ? 'hot' : 'time', false);
  }, [reload]);

  const patchReply = useCallback((rpid: number, patch: ReplyPatch) => {
    setPatches((prev) => ({ ...prev, [rpid]: { ...prev[rpid], ...patch } }));
  }, []);

  const toggleLike = useCallback(async (item: ReplyItem) => {
    if (!isLoggedIn) { showToast('请先登录'); return; }
    const nextAction = item.action === 1 ? 2 : 1;
    patchReply(item.rpid, { like: Math.max(0, item.like + (nextAction === 1 ? 1 : -1)), action: nextAction === 1 ? 1 : 0 });
    try {
      const res = await replyApi.like({ oid, type, rpid: item.rpid, action: nextAction });
      if (res?.code !== 0) {
        patchReply(item.rpid, { like: item.like, action: item.action });
        showToast(res?.message || '操作失败');
      } else {
        feedBackSuccess();
      }
    } catch {
      patchReply(item.rpid, { like: item.like, action: item.action });
      showToast('操作失败');
    }
  }, [isLoggedIn, oid, type, patchReply]);

  const toggleHate = useCallback(async (item: ReplyItem) => {
    if (!isLoggedIn) { showToast('请先登录'); return; }
    const nextAction = item.action === 2 ? 2 : 1;
    patchReply(item.rpid, { action: nextAction === 1 ? 2 : 0 });
    try {
      const res = await replyApi.hate({ oid, type, rpid: item.rpid, action: nextAction });
      if (res?.code !== 0) {
        patchReply(item.rpid, { action: item.action });
        showToast(res?.message || '操作失败');
      } else {
        feedBackSuccess();
      }
    } catch {
      patchReply(item.rpid, { action: item.action });
      showToast('操作失败');
    }
  }, [isLoggedIn, oid, type, patchReply]);

  const doDelete = useCallback((item: ReplyItem) => {
    Alert.alert('删除回复', '删除后不可恢复，确定删除吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          try {
            const res = await replyApi.del({ oid, type, rpid: item.rpid });
            if (res?.code === 0) {
              patchReply(item.rpid, { removed: true });
              feedBackSuccess();
              showToast('已删除');
            } else {
              showToast(res?.message || '删除失败');
            }
          } catch {
            showToast('删除失败');
          }
        },
      },
    ]);
  }, [oid, type, patchReply]);

  const doTop = useCallback((item: ReplyItem) => {
    const isTop = item.reply_control?.is_up_top === true;
    const action = isTop ? 0 : 1;
    Alert.alert(isTop ? '取消置顶' : '置顶回复', isTop ? '确定取消该回复的置顶吗？' : '确定将该回复置顶吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: isTop ? '取消置顶' : '置顶',
        onPress: async () => {
          try {
            const res = await replyApi.top({ oid, type, rpid: item.rpid, action });
            if (res?.code === 0) {
              feedBackSuccess();
              showToast(isTop ? '已取消置顶' : '已置顶');
            } else {
              showToast(res?.message || '操作失败');
            }
          } catch {
            showToast('操作失败');
          }
        },
      },
    ]);
  }, [oid, type]);

  const openManage = useCallback((item: ReplyItem) => {
    feedBackSelection();
    const actions: { label: string; destructive?: boolean; onPress: () => void }[] = [];
    if (upMid != null && item.member.mid === upMid) {
      actions.push({ label: item.reply_control?.is_up_top ? '取消置顶' : '置顶', onPress: () => doTop(item) });
    }
    if (myMid != null && item.mid === myMid) {
      actions.push({ label: '删除', destructive: true, onPress: () => doDelete(item) });
    }
    actions.push({
      label: '复制',
      onPress: () => {
        Clipboard.setStringAsync(item.content.message).then(() => showToast('已复制')).catch(() => {});
      },
    });
    const destructiveIndex = actions.findIndex((a) => a.destructive);
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: item.member.uname,
        options: [...actions.map((a) => a.label), '取消'],
        cancelButtonIndex: actions.length,
        destructiveButtonIndex: destructiveIndex >= 0 ? destructiveIndex : undefined,
      },
      (index) => {
        if (index >= 0 && index < actions.length) actions[index].onPress();
      },
    );
  }, [myMid, doDelete, doTop, upMid]);

  const uploadPicked = useCallback(async (uri: string) => {
    uploadCancelRef.current?.abort();
    const cancelToken = createNativeRequestCancelToken();
    uploadCancelRef.current = cancelToken;
    const ext = uri.split('.').pop()?.toLowerCase() || 'jpg';
    const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
    try {
      const res = await dynamicsApi.uploadBfs({
        file: { uri, name: `reply_${Date.now()}.${ext}`, type: mime },
        category: 'reply',
        biz: 'reply',
      }, cancelToken);
      return res?.data?.image_url || '';
    } finally {
      if (uploadCancelRef.current === cancelToken) uploadCancelRef.current = null;
    }
  }, []);

  const pickImage = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'] as any,
        quality: 0.82,
      });
      if (!result.canceled && result.assets[0]?.uri) {
        const url = await uploadPicked(result.assets[0].uri);
        if (url) {
          setReplyImage(url);
          showToast('图片已选择');
        } else {
          showToast('图片上传失败');
        }
      }
    } catch {
      showToast('图片选择失败');
    }
  }, [uploadPicked]);

  const sendReply = useCallback(async () => {
    const text = replyText.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const pictures = replyImage
        ? JSON.stringify([{ img_src: replyImage, img_width: 0, img_height: 0 }])
        : undefined;
      const res = await replyApi.add({
        oid, type, root, parent: root, message: text, pictures,
      });
      if (res?.code !== 0) {
        showToast(res?.message || '发送失败');
        return;
      }
      const created = res?.data?.reply as ReplyItem | undefined;
      if (created) {
        setAdded((prev) => [created, ...prev]);
        setTotal((t) => t + 1);
      }
      setReplyText('');
      setReplyImage(null);
      feedBackSuccess();
      showToast('发送成功');
    } catch {
      showToast('发送失败');
    } finally {
      setSending(false);
    }
  }, [replyText, replyImage, sending, oid, type, root]);

  const rawList = page.list.filter((r) => !patches[r.rpid]?.removed).map((r) => applyPatch(r, patches));
  const list = [...rawList, ...added.map((r) => applyPatch(r, patches))];

  const renderItem = useCallback(
    ({ item, index }: { item: ReplyItem; index: number }) => (
      <ReplyRow
        item={item}
        last={index < list.length - 1}
        colors={colors}
        onLike={toggleLike}
        onHate={toggleHate}
        onManage={openManage}
      />
    ),
    [list.length, colors, toggleLike, toggleHate, openManage],
  );
  const keyExtractor = useCallback((r: ReplyItem, idx: number) => (r.rpid ? `r-${r.rpid}` : `add-${idx}`), []);

  const sheetContent = (
    <>
      <View style={[styles.header, { borderBottomColor: colors.separator }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{`全部回复 (${formatCount(total)})`}</Text>
        <Press haptic scaleTo={0.85} onPress={onClose} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="关闭">
          <Ionicons name="close" size={20} color={colors.textSecondary} />
        </Press>
      </View>
      <View style={[styles.sortBar, { borderBottomColor: colors.separator }]}>
        <Text style={[styles.sortCount, { color: colors.textSecondary }]}>
          {total > 0 ? `相关回复共${formatCount(total)}条` : ''}
        </Text>
        <Press haptic scaleTo={0.9} onPress={toggleSort} style={styles.sortBtn} accessibilityRole="button" accessibilityLabel="切换排序">
          <Ionicons name="swap-vertical" size={14} color={colors.textSecondary} />
          <Text style={[styles.sortLabel, { color: colors.textSecondary }]}>
            {sort === 'time' ? '按时间' : '按热度'}
          </Text>
        </Press>
      </View>
      <FlashList
        style={styles.sheetList}
        data={list}
        keyExtractor={keyExtractor}
        contentContainerStyle={[styles.listContent, { flexGrow: 1 }]}
        showsVerticalScrollIndicator={false}
        onEndReached={loadNext}
        onEndReachedThreshold={0.3}
        estimatedItemSize={160}
        windowSize={9}
        initialNumToRender={10}
        maxToRenderPerBatch={12}
        drawDistance={250}
        overrideProps={{ initialDrawBatchSize: 10 }}
        ListEmptyComponent={refreshing ? null : (
          <View style={styles.empty}>
            <Text style={[styles.footerText, { color: colors.textTertiary }]}>暂无回复</Text>
          </View>
        )}
        ListFooterComponent={
          refreshing ? (
            <ActivityIndicator style={{ marginVertical: 16 }} color={colors.textTertiary} />
          ) : loading ? (
            <Animated.View entering={FadeIn.duration(200)} style={styles.footer}>
              <ActivityIndicator size="small" color={colors.textTertiary} />
              <Text style={[styles.footerText, { color: colors.textTertiary }]}>正在加载更多回复…</Text>
            </Animated.View>
          ) : !page.hasMore && list.length > 0 ? (
            <Text style={[styles.footerText, styles.footerEnd, { color: colors.textTertiary }]}>没有更多回复了</Text>
          ) : null
        }
        renderItem={renderItem}
      />
      {isLoggedIn && (
        <View style={[styles.composerBar, { backgroundColor: colors.card, borderTopColor: colors.separator, paddingBottom: Math.max(insets.bottom, 8) }]}>
          <View style={[styles.composerField, { backgroundColor: colors.fill2 }]}>
            <TextInput
              value={replyText}
              onChangeText={setReplyText}
              placeholder="回复该楼中楼…"
              placeholderTextColor={colors.textTertiary}
              style={[styles.composerInput, { color: colors.text }]}
              multiline
              maxLength={500}
            />
            {replyImage ? <ExpoImage source={{ uri: replyImage }} style={styles.composerPic} contentFit="cover" /> : null}
          </View>
          <Press haptic scaleTo={0.9} onPress={pickImage} style={styles.composerIcon}>
            <Ionicons name="image-outline" size={20} color={replyImage ? ACCENT : colors.textTertiary} />
          </Press>
          <Press
            haptic
            scaleTo={0.9}
            disabled={!replyText.trim() || sending}
            onPress={sendReply}
            style={[styles.composerSend, { backgroundColor: replyText.trim() && !sending ? ACCENT : colors.fill3 }]}>
            {sending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="arrow-up" size={20} color={replyText.trim() ? '#FFFFFF' : colors.textTertiary} />}
          </Press>
        </View>
      )}
    </>
  );

  return (
    <NativeBottomSheet visible={visible} onClose={onClose} detents={['medium', 'large']} dragIndicator="visible" background={colors.bg}>
      <View style={{ flex: 1 }}>{sheetContent}</View>
    </NativeBottomSheet>
  );
}

const ReplyRow = memo(function ReplyRow({
  item,
  last,
  colors,
  onLike,
  onHate,
  onManage,
}: {
  item: ReplyItem;
  last: boolean;
  colors: ReturnType<typeof useThemeColors>;
  onLike: (item: ReplyItem) => void;
  onHate: (item: ReplyItem) => void;
  onManage: (item: ReplyItem) => void;
}) {
  const T = useType();
  const voteMatch = /\{vote:(\d+)\}/.exec(item.content.message);
  return (
    <View style={[styles.row, last && { borderBottomColor: colors.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <ExpoImage
        source={{ uri: biliCover(item.member.avatar, 64, 64) }}
        recyclingKey={item.member.avatar}
        cachePolicy="memory-disk"
        style={[styles.avatar, { backgroundColor: colors.fill2 }]}
        contentFit="cover"
      />
      <View style={styles.body}>
        <Text style={[styles.name, { color: colors.textSecondary }]} numberOfLines={1}>{item.member.uname}</Text>
        <Text style={[styles.msg, { color: colors.text }]}>{item.content.message}</Text>
            {item.content.pictures && item.content.pictures.length > 0 && (
          <View style={styles.picRow}>
            {item.content.pictures.slice(0, 3).map((p, i) => (
              <ExpoImage key={i} source={{ uri: biliCover(p.img_src, 160, 160) }} recyclingKey={p.img_src} cachePolicy="memory-disk" style={styles.pic} contentFit="cover" />
            ))}
          </View>
        )}
        <View style={styles.meta}>
          <Text style={[styles.time, { color: colors.textTertiary }]}>{formatTime(item.ctime)}</Text>
          <Press haptic scaleTo={0.9} onPress={() => onLike(item)} style={styles.like}>
            <Ionicons name={item.action === 1 ? 'thumbs-up' : 'thumbs-up-outline'} size={12} color={item.action === 1 ? ACCENT : colors.textTertiary} />
            <Text style={[styles.time, { color: item.action === 1 ? ACCENT : colors.textTertiary }]}>{formatCount(item.like)}</Text>
          </Press>
          <Press haptic scaleTo={0.9} onPress={() => onHate(item)} style={styles.like}>
            <Ionicons name={item.action === 2 ? 'thumbs-down' : 'thumbs-down-outline'} size={12} color={item.action === 2 ? ACCENT : colors.textTertiary} />
          </Press>
          <Press haptic scaleTo={0.9} onPress={() => onManage(item)} style={styles.like}>
            <Ionicons name="ellipsis-horizontal" size={13} color={colors.textTertiary} />
          </Press>
        </View>
        {voteMatch ? <VoteCard voteId={Number(voteMatch[1])} colors={colors} T={T} /> : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  sheetList: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 16, fontWeight: '600' },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  sortBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sortCount: { fontSize: 13 },
  sortBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4 },
  sortLabel: { fontSize: 13, fontWeight: '500' },
  listContent: { paddingHorizontal: 16, paddingBottom: 12 },
  row: { flexDirection: 'row', gap: 10, paddingVertical: 12 },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  body: { flex: 1, gap: 3 },
  name: { fontSize: 12, fontWeight: '500' },
  msg: { fontSize: 13, lineHeight: 19 },
  picRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  pic: { width: 64, height: 64, borderRadius: 8 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 2 },
  time: { fontSize: 12 },
  like: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  footerText: { fontSize: 12 },
  footerEnd: { textAlign: 'center', paddingVertical: 16 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  composerBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  composerField: { flex: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4, maxHeight: 92 },
  composerInput: { fontSize: 14, lineHeight: 19, maxHeight: 84 },
  composerPic: { width: 56, height: 56, borderRadius: 8, marginTop: 4 },
  composerIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  composerSend: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
});
