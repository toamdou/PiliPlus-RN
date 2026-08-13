import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Stack, useLocalSearchParams, useRouter, useScrollToTop } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { SkeletonRow } from '@/components/Skeleton';
import { replyApi } from '@/api/reply';
import { useAuthStore } from '@/stores/auth';
import { usePagedList } from '@/hooks/use-paged-list';
import { formatCount, formatTime } from '@/utils/format';
import { showToast } from '@/utils/toast';
import { feedBack, feedBackSuccess } from '@/utils/feedback';
import { RADII, continuous, shadow } from '@/theme/tokens';
import { biliCover } from '@/utils/image-url';

interface MainReplyItem {
  rpid: number;
  oid: number;
  type: number;
  mid?: number;
  member: { mid?: number; uname: string; avatar: string };
  content: { message: string };
  like: number;
  action: number;
  ctime: number;
  rcount: number;
}

const ReplyRow = memo(function ReplyRow({
  item,
  index,
  colors,
  T,
  onLike,
}: {
  item: MainReplyItem;
  index: number;
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
  onLike: (item: MainReplyItem) => void;
}) {
  return (
    <View style={[styles.replyRow, index > 0 && { borderTopColor: colors.separator, borderTopWidth: StyleSheet.hairlineWidth }]}>
      <ExpoImage
        source={{ uri: biliCover((item.member.avatar || ''), 72, 72) }}
        recyclingKey={item.member.avatar || ''}
        cachePolicy="memory-disk"
        style={[styles.avatar, { backgroundColor: colors.fill2 }]}
        contentFit="cover"
      />
      <View style={styles.replyBody}>
        <View style={styles.replyMeta}>
          <Text style={[T.footnote, styles.replyName, { color: colors.text }]} numberOfLines={1}>
            {item.member.uname || `用户${item.mid ?? ''}`}
          </Text>
          <Text style={[T.caption2, { color: colors.textTertiary }]}>{formatTime(item.ctime)}</Text>
        </View>
        <Text style={[T.footnote, styles.replyMessage, { color: colors.textSecondary }]}>{item.content.message || ''}</Text>
        <View style={styles.replyActions}>
          <Press
            haptic
            scaleTo={0.9}
            onPress={() => onLike(item)}
            style={[styles.likeBtn, { backgroundColor: item.action === 1 ? 'rgba(251,114,153,0.12)' : colors.fill2 }]}>
            <Ionicons name={item.action === 1 ? 'thumbs-up' : 'thumbs-up-outline'} size={12} color={item.action === 1 ? ACCENT : colors.textTertiary} />
            <Text style={[T.caption2, { color: item.action === 1 ? ACCENT : colors.textTertiary, fontWeight: item.action === 1 ? '600' : '400' }]}>
              {formatCount(item.like)}
            </Text>
          </Press>
          {item.rcount > 0 ? (
            <View style={styles.subReplyTag}>
              <Ionicons name="chatbubble-outline" size={11} color={colors.textTertiary} />
              <Text style={[T.caption2, { color: colors.textTertiary }]}>{formatCount(item.rcount)}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
});

export default function MainReplyScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const T = useType();
  const insets = useSafeAreaInsets();
  const { oid, type, title, rootId } = useLocalSearchParams<{ oid: string; type?: string; title?: string; rootId?: string }>();
  const oidNum = Number(oid);
  const typeNum = Number(type || '1') || 1;
  // M1：通知深链带 comment_root_id 进入，用于数据加载后滚动定位到目标评论
  const rootIdNum = rootId ? Number(rootId) : NaN;
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const listRef = useRef<any>(null);
  useScrollToTop(listRef);

  const [mode, setMode] = useState(3);
  const [composer, setComposer] = useState('');
  const [composing, setComposing] = useState(false);
  const modeRef = useRef(3);
  const cursorRef = useRef('{"offset":""}');

  const { items: replies, loading, loadingMore, error, hasMore, refresh, loadMore, setItems } = usePagedList<MainReplyItem>({
    enabled: oidNum > 0,
    fetchPage: async (page, cancelToken) => {
      const params = isLoggedIn
        ? { oid: oidNum, type: typeNum, mode: modeRef.current, pn: page }
        : { oid: oidNum, type: typeNum, mode: modeRef.current, pagination_str: cursorRef.current };
      const res = await replyApi.main(params, { cancelToken });
      if (res?.code !== 0) {
        throw new Error(res?.message || '评论加载失败');
      }
      const list: MainReplyItem[] = (res?.data?.replies ?? []).map((r: any) => ({
        rpid: r.rpid,
        oid: oidNum,
        type: typeNum,
        mid: r.mid,
        member: {
          mid: r.member?.mid,
          uname: r.member?.uname || '',
          avatar: r.member?.avatar || '',
        },
        content: { message: r.content?.message || '' },
        like: r.like ?? 0,
        // M2：点赞初始态用评论自身的 action（0=无 1=已赞 2=已踩），
        // 而非 up_action.like（"UP主觉得很赞"标记，会导致 UP 赞过的评论误显为"我已赞"）
        action: r.action ?? 0,
        ctime: r.ctime ?? 0,
        rcount: r.rcount ?? 0,
      }));
      if (res.data?.cursor?.pagination_str) cursorRef.current = res.data.cursor.pagination_str;
      const pageInfo = res?.data?.page;
      const total = res?.data?.total ?? pageInfo?.count;
      const hasMoreByPage = typeof total === 'number'
        ? page * (pageInfo?.size || 20) < total
        : (pageInfo?.num || 0) * (pageInfo?.size || 20) < (pageInfo?.count || 0);
      return {
        items: list,
        hasMore: list.length > 0 && res?.data?.cursor?.is_end !== true && hasMoreByPage,
      };
    },
    onError: (e) => {
      console.error('main reply load error:', e);
      showToast('评论加载失败');
    },
  });

  const loaded = !loading && !error;

  /* M1：带 comment_root_id（rootId 参数）进入时，首屏数据加载完成后滚动定位到目标评论。
     受限于分页数据可能不含目标评论，定位逻辑如下：
       1) 目标评论在已加载列表中 → scrollToIndex 居中定位；
       2) 不在当前页 → 自动加载后续页直到命中或拉完（有上限保护，未命中时静默放弃）。
     注意：unmount 后不再触发 scrollToIndex。 */
  const rootIdLocateDoneRef = useRef(false);
  const rootIdUnmountedRef = useRef(false);
  useEffect(() => () => { rootIdUnmountedRef.current = true; }, []);

  const locateRootReply = useCallback((target: number, searchItems: MainReplyItem[]): boolean => {
    if (rootIdUnmountedRef.current) return true;
    const idx = searchItems.findIndex((r) => r.rpid === target);
    if (idx < 0) return false;
    rootIdLocateDoneRef.current = true;
    setTimeout(() => {
      if (rootIdUnmountedRef.current) return;
      try {
        listRef.current?.scrollToIndex({
          index: idx,
          viewPosition: 0.4,
          viewOffset: 8,
          animated: true,
        });
      } catch {}
    }, 120);
    return true;
  }, []);

  useEffect(() => {
    if (loading || !loaded || rootIdLocateDoneRef.current || !Number.isFinite(rootIdNum)) return;
    if (locateRootReply(rootIdNum, replies)) return;
    // 目标不在当前页：继续拉取直到命中或耗尽（上限保护，避免深链循环拉取）
    let hops = 0;
    let alive = true;
    const timer = setInterval(() => {
      if (!alive || hops >= 8 || !hasMore) {
        clearInterval(timer);
        return;
      }
      hops += 1;
      loadMore();
    }, 450);
    return () => { alive = false; clearInterval(timer); };
  }, [loading, loaded, rootIdNum, replies, hasMore, loadMore, locateRootReply]);

  // 已加载列表中可能随后续页加载而包含目标评论，命中后停止
  useEffect(() => {
    if (rootIdLocateDoneRef.current || !Number.isFinite(rootIdNum)) return;
    locateRootReply(rootIdNum, replies);
  }, [replies, rootIdNum, locateRootReply]);

  const changeMode = useCallback((m: number) => {
    if (modeRef.current === m) return;
    modeRef.current = m;
    cursorRef.current = '{"offset":""}';
    setMode(m);
    setItems([]);
    setTimeout(() => refresh(), 0);
  }, [refresh, setItems]);

  const toggleLike = useCallback(async (item: MainReplyItem) => {
    if (!isLoggedIn) {
      showToast('请先登录');
      return;
    }
    const next = item.action === 1 ? 0 : 1;
    const prev = item;
    setItems((prevList) => prevList.map((r) => (
      r.rpid === item.rpid ? { ...r, action: next, like: Math.max(0, r.like + (next ? 1 : -1)) } : r
    )));
    try {
      // M3：/x/v2/reply/action 的 action 语义为 1=赞 2=踩 0=取消，
      // 取消赞应发 0（撤销）而非 2（会把点赞变成踩）
      const res = await replyApi.like({ oid: item.oid, type: item.type, rpid: item.rpid, action: next ? 1 : 0 });
      if (res?.code !== 0) throw new Error(res?.message || '操作失败');
      feedBack();
    } catch (e) {
      console.error('main reply like error:', e);
      setItems((prevList) => prevList.map((r) => (r.rpid === item.rpid ? prev : r)));
      showToast('操作失败，请重试');
    }
  }, [isLoggedIn, setItems]);

  const sendComment = useCallback(async () => {
    const text = composer.trim();
    if (!text) {
      showToast('请输入评论内容');
      return;
    }
    if (!isLoggedIn) {
      router.push('/login');
      return;
    }
    setComposing(true);
    try {
      const res = await replyApi.add({ oid: oidNum, type: typeNum, message: text });
      if (res?.code !== 0) {
        showToast(res?.message || '发送失败');
        return;
      }
      const created = res?.data?.reply;
      if (created) {
        setItems((prev) => [{
          rpid: created.rpid ?? Date.now(),
          oid: oidNum,
          type: typeNum,
          mid: created.mid,
          member: { mid: created.member?.mid, uname: created.member?.uname || '我', avatar: created.member?.avatar || '' },
          content: { message: created.content?.message || text },
          like: created.like ?? 0,
          action: 0,
          ctime: created.ctime ?? Math.floor(Date.now() / 1000),
          rcount: created.rcount ?? 0,
        }, ...prev]);
      }
      setComposer('');
      feedBackSuccess();
      showToast('发送成功');
    } catch (e) {
      console.error('main reply add error:', e);
      showToast('发送失败，请重试');
    } finally {
      setComposing(false);
    }
  }, [composer, isLoggedIn, oidNum, typeNum, router, setItems]);

  const renderItem = useCallback(
    ({ item, index }: { item: MainReplyItem; index: number }) => (
      <ReplyRow item={item} index={index} colors={colors} T={T} onLike={toggleLike} />
    ),
    [colors, T, toggleLike],
  );

  const ItemSeparator = useCallback(() => <View style={{ height: StyleSheet.hairlineWidth }} />, []);

  return (
    <KeyboardAvoidingView style={[styles.root, { backgroundColor: colors.bg }]} behavior="padding" keyboardVerticalOffset={0}>
      <Stack.Title large>{title || '评论'}</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <FlashList
        ref={listRef}
        data={replies}
        style={{ flex: 1 }}
        keyExtractor={(it) => String(it.rpid)}
        contentContainerStyle={[styles.listContent, replies.length > 0 && { backgroundColor: colors.card, borderRadius: RADII.lg, marginHorizontal: 14, marginTop: 12, ...continuous, ...shadow('sm', colors.isDark) }]}
        showsVerticalScrollIndicator={false}
        renderItem={renderItem}
        ItemSeparatorComponent={ItemSeparator}
        ListHeaderComponent={
          <View style={styles.sortRow}>
            {[
              { value: 3, label: '最热' },
              { value: 2, label: '最新' },
            ].map((opt) => (
              <Press
                key={opt.value}
                haptic
                scaleTo={0.94}
                onPress={() => changeMode(opt.value)}
                style={[styles.sortChip, mode === opt.value && styles.sortChipActive]}>
                <Text style={[T.caption1, { color: mode === opt.value ? '#FFFFFF' : colors.textSecondary, fontWeight: mode === opt.value ? '600' : '400' }]}>
                  {opt.label}
                </Text>
              </Press>
            ))}
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.skeletonWrap}>
              <SkeletonRow height={48} round />
              <SkeletonRow height={48} round />
              <SkeletonRow height={48} round />
            </View>
          ) : error ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="cloud-offline-outline" size={38} color={colors.textTertiary} />
              <Text style={[T.headline, styles.emptyTitle, { color: colors.text }]}>加载失败</Text>
              <Text style={[T.footnote, styles.emptySub, { color: colors.textSecondary }]}>{error}</Text>
              <Press haptic scaleTo={0.94} onPress={refresh} style={[styles.retryBtn, { backgroundColor: colors.card }]}>
                <Text style={[T.subhead, styles.retryText, { color: ACCENT }]}>重试</Text>
              </Press>
            </View>
          ) : loaded ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="chatbubble-ellipses-outline" size={38} color={colors.textTertiary} />
              <Text style={[T.headline, styles.emptyTitle, { color: colors.text }]}>暂无评论</Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator size="small" color={colors.textTertiary} style={{ marginVertical: 16 }} />
          ) : hasMore ? (
            <Press haptic scaleTo={0.97} onPress={loadMore} style={[styles.moreBtn, { backgroundColor: colors.fill2 }]}>
              <Text style={[T.footnote, { color: ACCENT, fontWeight: '600' }]}>查看更多评论</Text>
            </Press>
          ) : replies.length > 0 ? (
            <Text style={[T.caption2, styles.endText, { color: colors.textTertiary }]}>没有更多评论了</Text>
          ) : null
        }
        onEndReached={() => hasMore && loadMore()}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={() => {
              cursorRef.current = '{"offset":""}';
              refresh();
            }}
            tintColor={colors.textSecondary}
          />
        }
        estimatedItemSize={92}
        windowSize={9}
        initialNumToRender={10}
        maxToRenderPerBatch={12}
        drawDistance={250}
        overrideProps={{ initialDrawBatchSize: 10 }}
      />

      <View style={[styles.composerWrap, { paddingBottom: insets.bottom + 10, borderTopColor: colors.separator }]}>
        <TextInput
          style={[styles.composer, T.footnote, { color: colors.text }]}
          placeholder="发一条友善的评论..."
          placeholderTextColor={colors.textTertiary}
          value={composer}
          onChangeText={setComposer}
          multiline
          maxLength={500}
        />
        <Press
          haptic
          scaleTo={0.9}
          disabled={!composer.trim() || composing}
          onPress={sendComment}
          style={[styles.sendBtn, { backgroundColor: composer.trim() && !composing ? ACCENT : colors.fill3 }]}>
          {composing ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="arrow-up" size={16} color={composer.trim() ? '#FFFFFF' : colors.textTertiary} />}
        </Press>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  listContent: { paddingBottom: 90 },
  sortRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  sortChip: { borderRadius: RADII.circle, paddingHorizontal: 14, paddingVertical: 6, ...continuous },
  sortChipActive: { backgroundColor: ACCENT },
  replyRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 14, paddingVertical: 12, alignItems: 'flex-start' },
  avatar: { width: 38, height: 38, borderRadius: 19, marginTop: 2 },
  replyBody: { flex: 1, gap: 4 },
  replyMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  replyName: { flex: 1, fontWeight: '600' },
  replyMessage: { lineHeight: 20 },
  replyActions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  likeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4 },
  subReplyTag: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  skeletonWrap: { padding: 16, gap: 12 },
  emptyWrap: { alignItems: 'center', paddingTop: 90, paddingHorizontal: 32, gap: 8 },
  emptyTitle: { fontWeight: '600' },
  emptySub: { textAlign: 'center' },
  retryBtn: { marginTop: 8, borderRadius: RADII.lg, paddingHorizontal: 26, paddingVertical: 9, ...continuous },
  retryText: { fontWeight: '600' },
  moreBtn: { marginHorizontal: 14, borderRadius: RADII.md, paddingVertical: 11, alignItems: 'center', marginTop: 8, ...continuous },
  endText: { textAlign: 'center', paddingVertical: 14 },
  composerWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  composer: {
    flex: 1,
    minHeight: 40,
    maxHeight: 96,
    borderRadius: RADII.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(120,120,128,0.12)',
  },
  sendBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
});
