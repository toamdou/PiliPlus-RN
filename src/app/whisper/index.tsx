import { useState, useEffect, useCallback, useRef, memo } from 'react';
import { View, Text, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { Stack, useRouter, Link, useScrollToTop } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Host, useThemeColors } from '@/components/SwiftUIHost';
import { msgApi } from '@/api/msg';
import { usePagedList } from '@/hooks/use-paged-list';
import { formatTime } from '@/utils/format';
import { useAuthStore } from '@/stores/auth';
import { Press } from '@/components/motion';
import { LoginGate } from '@/components/LoginGate';
import { SkeletonRow } from '@/components/Skeleton';
import { useType } from '@/components/type-scale';
import { SwipeActions, Button as SwiftButton } from '@expo/ui/swift-ui';
import { feedBackMedium, feedBackSuccess } from '@/utils/feedback';
import { RADII, continuous, shadow } from '@/theme/tokens';
import { type FlashListItemLayout } from '@/utils/list-layout';
import { showToast } from '@/utils/toast';
import { biliCover } from '@/utils/image-url';
import EmptyState from '@/components/EmptyState';

interface Session {
  talker_id: number;
  session_type: number;
  last_msg: { content: string; timestamp: number; msg_type: number; msg_seqno?: number };
  unread_count: number;
  isPinned?: boolean;
  account_info?: { name: string; face: string };
}

function parseContent(content: string, msgType: number): string {
  if (msgType === 2) return '图片';
  if (msgType === 5) return '[已撤回]';
  try {
    const parsed = JSON.parse(content);
    return parsed.content || content;
  } catch {
    return content;
  }
}

type GroupKey = 'pinned' | 'today' | 'yesterday' | 'earlier';

interface SessionSection {
  key: GroupKey;
  title: string;
  data: Session[];
}

type WhisperListItem =
  | { kind: 'header'; key: GroupKey; title: string }
  | { kind: 'session'; session: Session };

/* ===== 会话行（memo：SwipeActions 操作闭包只在行内重建） ===== */
const SessionRow = memo(function SessionRow({
  item,
  colors,
  T,
  onSettings,
  onMarkRead,
  onTogglePin,
  onRemove,
}: {
  item: Session;
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
  onSettings: (item: Session) => void;
  onMarkRead: (item: Session) => void;
  onTogglePin: (item: Session) => void;
  onRemove: (item: Session) => void;
}) {
  const row = (
    <Link href={{ pathname: '/whisper/[uid]', params: { uid: String(item.talker_id) } }} asChild>
      <Press
        haptic
        scaleTo={0.98}
        style={styles.row}>
        <ExpoImage
          source={{ uri: biliCover((item.account_info?.face || ''), 100, 100) }}
          recyclingKey={item.account_info?.face || ''}
          cachePolicy="memory-disk"
          style={[styles.avatar, { backgroundColor: colors.fill2 }]}
          contentFit="cover"
        />
        <View style={styles.rowBody}>
          <View style={styles.rowHead}>
            <Text style={[T.subhead, styles.name, { color: colors.text }]} numberOfLines={1}>
              {item.account_info?.name || `用户${item.talker_id}`}
            </Text>
            <Text style={[T.caption2, styles.time, { color: colors.textTertiary }]}>{formatTime(item.last_msg.timestamp)}</Text>
          </View>
          <View style={styles.rowMsg}>
            <Text style={[T.footnote, styles.lastMsg, { color: colors.textSecondary }]} numberOfLines={1}>{item.last_msg.content}</Text>
            {item.unread_count > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{item.unread_count > 99 ? '99+' : `${item.unread_count}`}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </Press>
    </Link>
  );

  return (
    <SwipeActions>
      {row}
      <SwipeActions.Actions edge="trailing" allowsFullSwipe>
        <SwiftButton label={item.isPinned ? '取消置顶' : '置顶'} onPress={() => onTogglePin(item)} />
        {item.unread_count > 0 ? <SwiftButton label="已读" onPress={() => onMarkRead(item)} /> : null}
        <SwiftButton label="设置" onPress={() => onSettings(item)} />
        <SwiftButton label="删除" role="destructive" onPress={() => onRemove(item)} />
      </SwipeActions.Actions>
    </SwipeActions>
  );
});

/* 3.12 会话按时间分组：今天 / 昨天 / 更早 */
function groupSessions(list: Session[]): SessionSection[] {
  const now = new Date();
  const startOfToday = Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000);
  const startOfYesterday = startOfToday - 86400;
  const groups: Record<GroupKey, Session[]> = { pinned: [], today: [], yesterday: [], earlier: [] };
  for (const s of list) {
    if (s.isPinned) {
      groups.pinned.push(s);
      continue;
    }
    const ts = s.last_msg?.timestamp || 0;
    if (ts >= startOfToday) groups.today.push(s);
    else if (ts >= startOfYesterday) groups.yesterday.push(s);
    else groups.earlier.push(s);
  }
  const out: SessionSection[] = [];
  if (groups.pinned.length) out.push({ key: 'pinned', title: '置顶', data: groups.pinned });
  if (groups.today.length) out.push({ key: 'today', title: '今天', data: groups.today });
  if (groups.yesterday.length) out.push({ key: 'yesterday', title: '昨天', data: groups.yesterday });
  if (groups.earlier.length) out.push({ key: 'earlier', title: '更早', data: groups.earlier });
  return out;
}

export default function WhisperScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const T = useType();
  const insets = useSafeAreaInsets();
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const [undoSession, setUndoSession] = useState<Session | null>(null);
  const listRef = useRef<any>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDeleteRef = useRef<Session | null>(null);
  useScrollToTop(listRef);
  const endTsRef = useRef<number | undefined>(undefined);

  const { items: sessions, loading, refreshing, loadingMore, refresh, loadMore, setItems } = usePagedList<Session>({
    enabled: isLoggedIn,
    fetchPage: async (page, cancelToken) => {
      if (page === 1) endTsRef.current = undefined;
      const res = await msgApi.sessions(
        page > 1 && endTsRef.current != null ? { end_ts: endTsRef.current } : {},
        { cancelToken },
      );
      const list = res?.data?.session_list || [];
      let mapped: Session[] = [];
      if (list.length > 0) {
        const uids = list.map((s: any) => s.talker_id).join(',');
        const accRes = await msgApi.accountList({ uids }, { cancelToken });
        const accMap: Record<number, any> = {};
        if (accRes?.data) {
          accRes.data.forEach((a: any) => { accMap[a.mid] = a; });
        }
        mapped = list.map((s: any) => ({
          talker_id: s.talker_id,
          session_type: s.session_type,
          last_msg: {
            content: parseContent(s.last_msg?.content, s.last_msg?.msg_type),
            timestamp: s.last_msg?.timestamp || 0,
            msg_type: s.last_msg?.msg_type || 1,
            msg_seqno: s.last_msg?.msg_seqno ?? s.last_msg?.seqno,
          },
          unread_count: s.unread_count || 0,
          isPinned: s.is_top === 1 || s.is_pinned === true || (s.top_time || 0) > 0,
          account_info: accMap[s.talker_id]
            ? { name: accMap[s.talker_id].name, face: accMap[s.talker_id].face }
            : undefined,
        }));
        const last = mapped[mapped.length - 1];
        endTsRef.current = res?.data?.end_ts ?? last?.last_msg?.timestamp ?? endTsRef.current;
      }
      void msgApi.clearPrivateUnread();
      return { items: mapped, hasMore: res?.data?.has_more !== false && mapped.length > 0 };
    },
    onError: (e) => {
      console.error('loadSessions error:', e);
    },
  });

  const markSessionRead = useCallback(async (item: Session) => {
    const seqno = item.last_msg.msg_seqno;
    if (typeof seqno === 'number') {
      try {
        await msgApi.ackSession({ talker_id: item.talker_id, ack_seqno: seqno });
        feedBackSuccess();
      } catch {
        showToast('操作失败');
        return;
      }
    }
    /* 会话列表未携带 msg_seqno 时本地乐观已读 */
    setItems((prev) => prev.map((s) => (
      s.talker_id === item.talker_id ? { ...s, unread_count: 0 } : s
    )));
    showToast('已标为已读');
  }, [setItems]);

  const togglePin = useCallback(async (item: Session) => {
    const next = !item.isPinned;
    /* 置顶使用现有 setTop API（op_type 1/0），与会话设置页一致 */
    try {
      const res = await msgApi.setTop({ talker_id: item.talker_id, op_type: next ? 1 : 0 });
      if (res?.code !== 0 && res?.code !== undefined) {
        showToast(res?.message || '操作失败');
        return;
      }
      setItems((prev) => {
        const updated = prev.map((s) => (
          s.talker_id === item.talker_id ? { ...s, isPinned: next } : s
        ));
        const target = updated.find((s) => s.talker_id === item.talker_id);
        if (!target) return prev;
        const rest = updated.filter((s) => s.talker_id !== item.talker_id);
        if (next) return [target, ...rest];
        const pinned = rest.filter((s) => s.isPinned);
        const normal = rest.filter((s) => !s.isPinned)
          .sort((a, b) => b.last_msg.timestamp - a.last_msg.timestamp);
        return [...pinned, ...normal];
      });
      feedBackSuccess();
      showToast(next ? '已置顶' : '已取消置顶');
    } catch {
      showToast('操作失败');
    }
  }, [setItems]);

  const markAllRead = useCallback(async () => {
    const unread = sessions.filter((s) => s.unread_count > 0);
    if (unread.length === 0) {
      showToast('暂无未读消息');
      return;
    }
    const ackable = unread.filter((s) => typeof s.last_msg.msg_seqno === 'number');
    await Promise.all(ackable.map((s) => (
      msgApi.ackSession({ talker_id: s.talker_id, ack_seqno: s.last_msg.msg_seqno as number }).catch(() => {})
    )));
    /* 缺失 msg_seqno 的会话走本地乐观已读；Flutter 的 gRPC ClearUnread 未在 RN 暴露 */
    setItems((prev) => prev.map((s) => s.unread_count > 0 ? { ...s, unread_count: 0 } : s));
    feedBackSuccess();
    showToast(ackable.length === unread.length ? '已全部标为已读' : '已全部标为已读（部分本地）');
  }, [sessions, setItems]);

  /* B 站私信删除接口没有对应的恢复/撤销 API（服务端可能不支持 undelete），
     因此先本地隐藏会话并展示短暂撤销；只有撤销窗口过期或用户未恢复时才调用 removeSession 永久删除。 */
  const finalizePendingDelete = useCallback((item: Session) => {
    void msgApi.removeSession({ talker_id: item.talker_id }).catch(() => {});
  }, []);

  const removeSession = useCallback((item: Session) => {
    const previous = pendingDeleteRef.current;
    if (previous && previous.talker_id !== item.talker_id) {
      finalizePendingDelete(previous);
    }
    if (undoTimerRef.current != null) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    pendingDeleteRef.current = item;
    setUndoSession(item);
    setItems((prev) => prev.filter((s) => s.talker_id !== item.talker_id));
    undoTimerRef.current = setTimeout(() => {
      undoTimerRef.current = null;
      const target = pendingDeleteRef.current;
      pendingDeleteRef.current = null;
      setUndoSession(null);
      if (target) finalizePendingDelete(target);
    }, 5000);
  }, [finalizePendingDelete, setItems]);

  const undoDelete = useCallback(() => {
    const target = pendingDeleteRef.current;
    if (!target) return;
    if (undoTimerRef.current != null) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    pendingDeleteRef.current = null;
    setUndoSession(null);
    setItems((prev) => {
      if (prev.some((s) => s.talker_id === target.talker_id)) return prev;
      return [target, ...prev];
    });
    feedBackSuccess();
    showToast('已恢复会话');
  }, [setItems]);

  /* 离开列表页时若撤销窗口仍未结束，视为确认删除，避免本地隐藏的会话残留。 */
  useEffect(() => {
    return () => {
      if (undoTimerRef.current != null) {
        clearTimeout(undoTimerRef.current);
        undoTimerRef.current = null;
      }
      const pending = pendingDeleteRef.current;
      pendingDeleteRef.current = null;
      if (pending) finalizePendingDelete(pending);
    };
  }, [finalizePendingDelete]);

  const openSettings = useCallback((item: Session) => {
    router.push({ pathname: '/whisper_settings/[uid]', params: { uid: String(item.talker_id) } } as any);
  }, [router]);

  const renderItem = useCallback(
    ({ item }: { item: WhisperListItem }) => {
      if (item.kind === 'header') {
        return (
          <View style={styles.sectionHeader}>
            <Text style={[T.caption1, styles.sectionHeaderText, { color: colors.secondaryLabel }]}>{item.title}</Text>
          </View>
        );
      }
      return (
        <SessionRow
          item={item.session}
          colors={colors}
          T={T}
          onSettings={openSettings}
          onMarkRead={markSessionRead}
          onTogglePin={togglePin}
          onRemove={removeSession}
        />
      );
    },
    [colors, T, openSettings, markSessionRead, togglePin, removeSession],
  );

  const getItemType = useCallback((item: WhisperListItem) => item.kind, []);

  const overrideItemLayout = useCallback(
    (layout: FlashListItemLayout, item: WhisperListItem) => {
      if (item.kind === 'session') layout.size = 76;
    },
    [],
  );

  const ItemSeparator = useCallback(
    ({ leadingItem, trailingItem }: { leadingItem?: WhisperListItem; trailingItem?: WhisperListItem }) => {
      if (leadingItem?.kind !== 'session' || trailingItem?.kind !== 'session') return null;
      return <View style={[styles.separator, { backgroundColor: colors.separator }]} />;
    },
    [colors.separator],
  );

  if (!isLoggedIn) {
    return (
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <View style={[styles.root, { backgroundColor: colors.bg }]}>
          <Stack.Screen options={{ title: '消息', headerShown: true, headerLargeTitle: true }} />
          <Stack.Title large>消息</Stack.Title>
          <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
          <Stack.Toolbar placement="right">
            <Stack.Toolbar.Button onPress={() => router.push('/whisper_block' as any)}>屏蔽词</Stack.Toolbar.Button>
          </Stack.Toolbar>
          <LoginGate title="请先登录" subtitle="登录后查看私信消息" />
        </View>
      </Host>
    );
  }

  const sections = groupSessions(sessions);
  const listItems: WhisperListItem[] = sections.flatMap((section) => [
    { kind: 'header', key: section.key, title: section.title },
    ...section.data.map((session) => ({ kind: 'session' as const, session })),
  ]);

  return (
    <Host style={{ flex: 1 }} useViewportSizeMeasurement>
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <Stack.Screen options={{ title: '消息', headerShown: true, headerLargeTitle: true }} />
        <Stack.Title large>消息</Stack.Title>
        <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button onPress={markAllRead}>全部已读</Stack.Toolbar.Button>
          <Stack.Toolbar.Button onPress={() => router.push('/whisper_block' as any)}>屏蔽词</Stack.Toolbar.Button>
        </Stack.Toolbar>
        <FlashList
          ref={listRef}
          data={listItems}
          keyExtractor={(it) => (it.kind === 'header' ? `header-${it.key}` : String(it.session.talker_id))}
          getItemType={getItemType}
          estimatedItemSize={76}
          overrideItemLayout={overrideItemLayout}
          drawDistance={250}
          overrideProps={{ initialDrawBatchSize: 10 }}
          contentContainerStyle={[styles.listContent, sessions.length > 0 && { backgroundColor: colors.card, borderRadius: RADII.lg, marginHorizontal: 14, marginTop: 12, ...continuous }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { feedBackMedium(); refresh(); }} tintColor={colors.textSecondary} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ItemSeparatorComponent={ItemSeparator}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator size="small" color={colors.textTertiary} style={{ marginVertical: 14 }} />
            ) : null
          }
          ListEmptyComponent={
            loading ? null : (
              <EmptyState
                icon="chatbubbles-outline"
                title="暂无私信"
                subtitle="快去和 UP 主互动吧"
              />
            )
          }
          renderItem={renderItem}
        />
        {loading && sessions.length === 0 && (
          <View style={[styles.skeletonCard, { backgroundColor: colors.card }]}>
            <SkeletonRow height={50} />
            <SkeletonRow height={50} />
            <SkeletonRow height={50} />
          </View>
        )}
        {undoSession ? (
          <View pointerEvents="box-none" style={[styles.undoOverlay, { paddingBottom: insets.bottom + 12 }]}>
            <View style={[styles.undoBar, { backgroundColor: colors.card, ...shadow('md', colors.isDark) }]}>
              <Text style={[T.footnote, styles.undoText, { color: colors.textSecondary }]}>已删除会话</Text>
              <Press
                haptic
                scaleTo={0.94}
                onPress={undoDelete}
                style={styles.undoBtn}
                accessibilityRole="button"
                accessibilityLabel="撤销删除">
                <Text style={[T.subhead, styles.undoBtnText, { color: colors.accent }]}>撤销</Text>
              </Press>
            </View>
          </View>
        ) : null}
      </View>
    </Host>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingBottom: 40 },
  /* 行 */
  row: { flexDirection: 'row', gap: 12, paddingVertical: 12 },
  /* 3.12 分组标题 */
  sectionHeader: { paddingTop: 14, paddingBottom: 4, paddingHorizontal: 2 },
  sectionHeaderText: { fontWeight: '500' },
  separator: { height: StyleSheet.hairlineWidth },
  avatar: { width: 50, height: 50, borderRadius: 25 },
  rowBody: { flex: 1, gap: 5, justifyContent: 'center' },
  rowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  name: { fontWeight: '600', flexShrink: 1 },
  time: {},
  rowMsg: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  lastMsg: { flexShrink: 1 },
  badge: { backgroundColor: '#FF3B30', borderRadius: RADII.sm, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6, ...continuous },
  badgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  /* 骨架 */
  skeletonCard: { position: 'absolute', top: 12, left: 14, right: 14, borderRadius: RADII.lg, paddingHorizontal: 16, paddingTop: 4, ...continuous },
  /* 删除撤销 */
  undoOverlay: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', paddingHorizontal: 14 },
  undoBar: { flexDirection: 'row', alignItems: 'center', gap: 12, width: '100%', maxWidth: 420, paddingLeft: 16, paddingRight: 6, paddingVertical: 7, borderRadius: RADII.md, ...continuous },
  undoText: { flex: 1 },
  undoBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: RADII.sm },
  undoBtnText: { fontWeight: '600' },
});
