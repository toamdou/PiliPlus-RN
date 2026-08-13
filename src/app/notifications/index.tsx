import { useState, useCallback, useRef, memo, useEffect } from 'react';
import { View, Text, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { Stack, useRouter, useScrollToTop, useFocusEffect } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Host, Picker, Text as SwiftText } from '@expo/ui/swift-ui';
import { SwipeActions, Button as SwiftButton } from '@expo/ui/swift-ui';
import { pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { useThemeColors } from '@/components/SwiftUIHost';
import { msgApi } from '@/api/msg';
import { usePagedList } from '@/hooks/use-paged-list';
import { formatTime } from '@/utils/format';
import { av2bv } from '@/utils/id-utils';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { Press } from '@/components/motion';
import { LoginGate } from '@/components/LoginGate';
import { SkeletonRow } from '@/components/Skeleton';
import { useType } from '@/components/type-scale';
import { feedBackMedium, feedBackSuccess, openInAppBrowser } from '@/utils/feedback';
import { RADII, continuous, shadow } from '@/theme/tokens';
import { showToast } from '@/utils/toast';
import { biliCover } from '@/utils/image-url';
import EmptyState from '@/components/EmptyState';

interface NotifyItem {
  id: number;
  type: string;
  title: string;
  desc: string;
  face: string;
  time: number;
  business?: string;
  subjectId?: number;
  businessId?: number;
  nativeUri?: string;
  counts?: number;
  cursor?: number;
  read?: boolean;
}

interface CursorState {
  id?: number;
  time?: number;
  cursor?: number;
  hasMore: boolean;
}

const FEED_DEL_TYPE: Record<string, number> = { reply: 1, at: 2, like: 0 };
const PAGE_SIZE = 20;

function resolveNotifyHref(item: NotifyItem): string | null {
  const native = item.nativeUri || '';
  // 带评论定位的 video 链接必须先于普通 video 正则匹配（N5：原顺序先命中普通 video 先返回，
  // 导致 comment_root_id 分支永不可达，评论定位永远失效）
  const videoComment = /bilibili:\/\/video\/(\d+)\?.*comment_root_id=(\d+)/.exec(native);
  if (videoComment) return `/main_reply/${videoComment[1]}?type=1&rootId=${videoComment[2]}`;
  const video = /bilibili:\/\/video\/(\d+)/.exec(native);
  if (video) return `/video/${av2bv(Number(video[1]))}`;
  const season = /bilibili:\/\/bangumi\/season\/(\d+)/.exec(native);
  if (season) return `/pgc/${season[1]}`;
  // ep 链接走 ep_id 深链（N4：pgc/[id] 按 ep_ 前缀区分 ep/season，由并行代理 A 处理）
  const pgcEp = /bilibili:\/\/pgc\/season\/ep\/(\d+)/.exec(native);
  if (pgcEp) return `/pgc/ep_${pgcEp[1]}`;
  const article = /bilibili:\/\/article\/(\d+)/.exec(native);
  if (article) return `https://www.bilibili.com/read/cv${article[1]}`;
  const live = /bilibili:\/\/live\/(\d+)/.exec(native);
  if (live) return `live:${live[1]}`;
  const comment = /bilibili:\/\/comment\/(?:detail|msg_fold)\/(\d+)\/(\d+)\/(\d+)/.exec(native);
  if (comment) return `/main_reply/${comment[2]}?type=${comment[1]}&title=评论`;
  const following = /bilibili:\/\/following\/detail\/(\d+)/.exec(native);
  if (following) return `/dynamics/${following[1]}`;
  const opus = /bilibili:\/\/opus\/(\d+)/.exec(native);
  if (opus) return `/dynamics/${opus[1]}`;
  const space = /bilibili:\/\/space\/(\d+)/.exec(native);
  if (space) return `/member/${space[1]}`;
  const medialist = /bilibili:\/\/medialist\/(\d+)/.exec(native);
  if (medialist) return `/fav/${medialist[1]}`;
  const browser = /bilibili:\/\/browser\/?\?url=([^&]+)/.exec(native);
  if (browser) return decodeURIComponent(browser[1]);

  if (item.business === 'archive' && item.subjectId && Number.isFinite(Number(item.subjectId))) {
    return `/video/${av2bv(Number(item.subjectId))}`;
  }
  // N6：businessId/subjectId 双空时不再拼出裸 `/pgc/`（无 +not-found 兜底会抛路由异常）
  const pgcId = item.businessId || item.subjectId;
  if (item.business === 'pgc' && pgcId) return `/pgc/${pgcId}`;
  if (item.business === 'article' && item.subjectId) return `https://www.bilibili.com/read/cv${item.subjectId}`;
  if (item.business === 'dynamic' && item.subjectId) return `/dynamics/${item.subjectId}`;
  if (item.business === 'live' && item.subjectId) return `live:${item.subjectId}`;
  if ((item.business === 'reply' || item.business === 'comment') && item.subjectId) {
    return `/main_reply/${item.subjectId}?type=${item.businessId || 1}&title=评论`;
  }
  return null;
}

/* ===== 消息行（memo：回收复用时不重建闭包） ===== */
const NotifyRow = memo(function NotifyRow({
  item,
  index,
  itemsLength,
  colors,
  T,
  onOpen,
  onMarkRead,
  onDelete,
}: {
  item: NotifyItem;
  index: number;
  itemsLength: number;
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
  onOpen: (item: NotifyItem) => void;
  onMarkRead: (item: NotifyItem) => void;
  onDelete: (item: NotifyItem) => void;
}) {
  const href = resolveNotifyHref(item);
  return (
    <SwipeActions>
      <Press
        haptic
        scaleTo={0.98}
        disabled={!href}
        onPress={() => onOpen(item)}
        style={[styles.row, index < itemsLength - 1 && { borderBottomColor: colors.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}>
        {item.face ? (
          <ExpoImage
            source={{ uri: biliCover(item.face, 84, 84) }}
            recyclingKey={item.face}
            cachePolicy="memory-disk"
            style={[styles.avatar, { backgroundColor: colors.fill2 }]}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: colors.fill2 }]}>
            <Ionicons name="notifications-outline" size={18} color={colors.textTertiary} />
          </View>
        )}
        <View style={styles.rowBody}>
          <View style={styles.rowHead}>
            <View style={styles.titleWrap}>
              {!item.read ? <View style={[styles.unreadDot, { backgroundColor: colors.accent }]} /> : null}
              <Text style={[T.subhead, styles.title, { color: colors.text }]} numberOfLines={1}>{item.title}</Text>
            </View>
            <Text style={[T.caption2, styles.time, { color: colors.textTertiary }]}>{formatTime(item.time)}</Text>
          </View>
          {item.desc ? (
            <Text style={[T.footnote, styles.desc, { color: colors.textSecondary }]} numberOfLines={2}>{item.desc}</Text>
          ) : null}
        </View>
      </Press>
      <SwipeActions.Actions edge="trailing" allowsFullSwipe>
        {!item.read ? <SwiftButton label="已读" onPress={() => onMarkRead(item)} /> : null}
        <SwiftButton label="删除" role="destructive" onPress={() => onDelete(item)} />
      </SwipeActions.Actions>
    </SwipeActions>
  );
});

export default function NotificationsScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const T = useType();
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const disableLikeMsg = useSettingsStore((s) => s.disableLikeMsg);

  const TABS = [
    { key: 'reply', label: '回复' },
    { key: 'at', label: '@我' },
    ...(disableLikeMsg ? [] : [{ key: 'like', label: '赞' }]),
    { key: 'system', label: '系统' },
  ];

  const [tabIdx, setTabIdx] = useState(0);
  const tab = TABS[tabIdx]?.key || 'reply';
  const listRef = useRef<FlashListRef<NotifyItem>>(null);
  useScrollToTop(listRef);
  const cursors = useRef<Record<string, CursorState>>({});

  const mapItem = useCallback((raw: any, type: string): NotifyItem | null => {
    if (!raw) return null;
    const item = raw.item || {};
    const user = raw.user || {};
    const users = raw.users || [];
    const firstUser = users[0] || user;
    let time = raw.reply_time || raw.at_time || raw.like_time || 0;
    if (type === 'system' && raw.time_at) {
      const parsed = new Date(String(raw.time_at).replace(/-/g, '/')).getTime() / 1000;
      time = Number.isFinite(parsed) ? Math.floor(parsed) : 0;
    }
    return {
      id: raw.id || 0,
      type,
      title: type === 'system' ? (raw.title || '系统通知') : (firstUser?.nickname || '用户'),
      desc: item.source_content || item.title || item.root_reply_content || raw.content || '',
      face: firstUser?.avatar || item.image || raw.face || '',
      time,
      business: item.business,
      subjectId: item.subject_id,
      businessId: item.business_id,
      nativeUri: item.native_uri,
      counts: raw.counts || item.counts || 0,
      cursor: raw.cursor,
      read: raw.is_read === 1 || raw.read === true || raw.item?.is_read === 1 || raw.item?.read === true,
    };
  }, []);

  const { items, loading, refreshing, loadingMore, refresh, loadMore, setItems } = usePagedList<NotifyItem>({
    enabled: isLoggedIn,
    fetchPage: async (page, cancelToken) => {
      const cur = cursors.current[tab] || { hasMore: true };
      let arr: any[] = [];
      let nextCursor: CursorState = { ...cur };
      if (tab === 'system') {
        const res: any = await msgApi.sysNotify({ cursor: cur.cursor ? String(cur.cursor) : undefined, page_size: PAGE_SIZE }, { cancelToken });
        arr = res?.data || [];
        const last = arr[arr.length - 1];
        nextCursor = { cursor: last?.cursor, hasMore: arr.length >= PAGE_SIZE };
        if (page === 1 && !cur.cursor && arr[0]?.cursor != null) {
          msgApi.sysUpdateCursor({ cursor: String(arr[0].cursor) }).catch(() => {});
        }
      } else {
        let res: any;
        if (tab === 'reply') res = await msgApi.feedReply({ id: cur.id, reply_time: cur.time }, { cancelToken });
        else if (tab === 'at') res = await msgApi.feedAt({ id: cur.id, at_time: cur.time }, { cancelToken });
        else res = await msgApi.feedLike({ id: cur.id, like_time: cur.time }, { cancelToken });
        const data = res?.data || {};
        const list = data.total?.items || data.items || [];
        arr = list;
        const cursor = data.total?.cursor || data.cursor;
        nextCursor = {
          id: cursor?.id ?? cur.id,
          time: cursor?.time ?? cur.time,
          hasMore: cursor ? cursor.is_end !== true : arr.length >= PAGE_SIZE,
        };
      }
      const mapped = arr.map((raw) => mapItem(raw, tab)).filter((x): x is NotifyItem => !!x);
      cursors.current[tab] = nextCursor;
      return { items: mapped, hasMore: nextCursor.hasMore };
    },
    onError: (e) => {
      console.error('load notifications error:', e);
    },
  });

  const firstFocusRef = useRef(true);

  useFocusEffect(
    useCallback(() => {
      if (firstFocusRef.current) {
        firstFocusRef.current = false;
        return;
      }
      const t = setTimeout(() => {
        refresh();
        if (isLoggedIn) void msgApi.clearFeedUnread(['reply', 'at', 'like', 'sys']);
      }, 0);
      return () => clearTimeout(t);
    }, [refresh, isLoggedIn]),
  );

  const loadedTabRef = useRef(tab);
  useEffect(() => {
    if (loadedTabRef.current === tab) return;
    loadedTabRef.current = tab;
    const t = setTimeout(() => { if (isLoggedIn) refresh(); }, 0);
    return () => clearTimeout(t);
  }, [tab, isLoggedIn, refresh]);

  /* reply/at/like 没有独立的服务端已读接口（见 api/msg.ts 的本地已读游标说明），
     这里最多只能本地乐观已读；system 消息可调用现有 update_cursor 在服务端推进游标。 */
  const updateSystemCursor = useCallback((cursor?: number) => {
    if (cursor != null) {
      msgApi.sysUpdateCursor({ cursor: String(cursor) }).catch(() => {});
    }
  }, []);

  const markItemRead = useCallback((item: NotifyItem) => {
    setItems((prev) => prev.map((it) => (
      it.id === item.id && it.type === item.type ? { ...it, read: true } : it
    )));
    if (item.type === 'system') updateSystemCursor(item.cursor);
  }, [updateSystemCursor]);

  const markAllRead = useCallback(() => {
    const unread = items.filter((it) => !it.read);
    if (unread.length === 0) {
      showToast('暂无未读消息');
      return;
    }
    setItems((prev) => prev.map((it) => ({ ...it, read: true })));
    /* reply/at/like 无独立服务端已读接口，全部已读只能本地乐观；
       system 复用 update_cursor 推进服务端游标；clearFeedUnread 只更新本地角标游标。 */
    if (tab === 'system') updateSystemCursor(items[0]?.cursor);
    void msgApi.clearFeedUnread(['reply', 'at', 'like', 'sys']);
    feedBackSuccess();
    showToast('已全部标为已读');
  }, [items, tab, updateSystemCursor]);

  const openNotify = useCallback((item: NotifyItem) => {
    markItemRead(item);
    if (item.type === 'like' && (item.counts || 0) > 1) {
      router.push({
        pathname: '/msg_like_detail',
        params: {
          card_id: String(item.id),
          counts: String(item.counts),
          uri: item.nativeUri || '',
        },
      } as any);
      return;
    }
    const href = resolveNotifyHref(item);
    if (!href) return;
    if (href.startsWith('http')) {
      openInAppBrowser(href).catch(() => {});
      return;
    }
    if (href.startsWith('live:')) {
      router.push({ pathname: '/live/[roomId]', params: { roomId: href.slice(5) } } as any);
      return;
    }
    router.push(href as any);
  }, [router, markItemRead]);

  const deleteNotify = useCallback(async (item: NotifyItem) => {
    try {
      if (item.type === 'system') {
        await msgApi.delSysMsg({ id: item.id });
      } else {
        await msgApi.delMsgfeed({ id: item.id, type: FEED_DEL_TYPE[item.type] ?? 1 });
      }
      setItems((prev) => prev.filter((it) => it.id !== item.id));
      feedBackSuccess();
      showToast('已删除');
    } catch {
      showToast('删除失败');
    }
  }, []);

  const renderRow = useCallback(
    ({ item, index }: { item: NotifyItem; index: number }) => (
      <NotifyRow item={item} index={index} itemsLength={items.length} colors={colors} T={T} onOpen={openNotify} onMarkRead={markItemRead} onDelete={deleteNotify} />
    ),
    [colors, items.length, T, openNotify, markItemRead, deleteNotify],
  );

  if (!isLoggedIn) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <Stack.Title large>消息通知</Stack.Title>
        <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
        <LoginGate title="请先登录查看消息" />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Title large>消息通知</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button onPress={markAllRead}>全部已读</Stack.Toolbar.Button>
      </Stack.Toolbar>
      <View style={{ marginHorizontal: 14, marginVertical: 12 }}>
        <Host matchContents>
          <Picker label="" selection={tabIdx}
            onSelectionChange={(v) => { setTabIdx(Number(v)); }}
            modifiers={[pickerStyle('segmented')]}>
            {TABS.map((t, i) => <SwiftText key={t.key} modifiers={[tag(i)]}>{t.label}</SwiftText>)}
          </Picker>
        </Host>
      </View>

      <FlashList
        ref={listRef}
        data={items}
        keyExtractor={(it) => `${it.type}-${it.id}`}
        contentContainerStyle={[styles.listContent, items.length > 0 && { backgroundColor: colors.card, borderRadius: RADII.lg, marginHorizontal: 14, ...continuous, ...shadow('sm', colors.isDark) }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { feedBackMedium(); refresh(); }} tintColor={colors.textSecondary} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        estimatedItemSize={68}
        windowSize={9}
        initialNumToRender={10}
        maxToRenderPerBatch={12}
        drawDistance={250}
        overrideProps={{ initialDrawBatchSize: 10 }}
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator size="small" color={colors.textTertiary} style={{ marginVertical: 14 }} />
          ) : null
        }
        ListEmptyComponent={
          loading ? null : (
            <EmptyState icon="mail-open-outline" title="暂无消息" />
          )
        }
        renderItem={renderRow}
      />
      {loading && items.length === 0 && (
        <View style={[styles.skeletonCard, { backgroundColor: colors.card }]}>
          <SkeletonRow height={42} />
          <SkeletonRow height={42} />
          <SkeletonRow height={42} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingBottom: 40 },
  row: { flexDirection: 'row', gap: 12, paddingVertical: 13, alignItems: 'center' },
  avatar: { width: 42, height: 42, borderRadius: 21 },
  avatarPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  rowBody: { flex: 1, gap: 4 },
  rowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  titleWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  title: { fontWeight: '600', flexShrink: 1 },
  unreadDot: { width: 7, height: 7, borderRadius: 3.5 },
  time: {},
  desc: {},
  skeletonCard: { position: 'absolute', top: 70, left: 14, right: 14, borderRadius: RADII.lg, paddingHorizontal: 16, paddingTop: 4, ...continuous },
});
