import { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, RefreshControl, ActivityIndicator, useWindowDimensions } from 'react-native';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { Stack, useRouter, useScrollToTop } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { liveApi } from '@/api/live';
import { usePagedList } from '@/hooks/use-paged-list';
import { SkeletonCard, SkeletonRow } from '@/components/Skeleton';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { RADII, continuous, shadow } from '@/theme/tokens';
import { feedBackMedium } from '@/utils/feedback';
import { formatCount } from '@/utils/format';
import { showToast } from '@/utils/toast';
import { biliCover } from '@/utils/image-url';

const SIDE = 14;
const GAP = 12;
const PAGE_SIZE = 30;

interface LiveRoomItem {
  roomid: number;
  cover: string;
  title: string;
  name: string;
  onlineText: string;
}

interface LiveUserItem {
  roomid: number;
  face: string;
  name: string;
  areaName: string;
  fansNum: number;
  liveStatus: number;
}

export default function LiveSearchScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const T = useType();
  const [keyword, setKeyword] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [tabIdx, setTabIdx] = useState(0);
  const [total, setTotal] = useState(0);
  const listRef = useRef<FlashListRef<any>>(null);
  useScrollToTop(listRef);
  const { width: windowWidth } = useWindowDimensions();
  const cardW = (windowWidth - SIDE * 2 - GAP) / 2;
  const coverH = (cardW * 9) / 16;
  const queryRef = useRef('');
  const tabRef = useRef(0);

  const isRoom = tabIdx === 0;

  const mapRoom = useCallback((raw: any): LiveRoomItem | null => {
    if (!raw?.roomid) return null;
    return {
      roomid: raw.roomid,
      cover: raw.cover || '',
      title: raw.title || '',
      name: raw.name || '',
      onlineText: raw.watched_show?.text_large || '',
    };
  }, []);

  const mapUser = useCallback((raw: any): LiveUserItem | null => {
    if (!raw?.name && !raw?.roomid) return null;
    return {
      roomid: raw.roomid || 0,
      face: raw.face || '',
      name: raw.name || '',
      areaName: raw.areaName || '',
      fansNum: raw.fansNum || 0,
      liveStatus: raw.live_status || 0,
    };
  }, []);

  const { items, loading, refreshing, loadingMore, error, refresh, loadMore } = usePagedList<any>({
    enabled: true,
    fetchPage: async (page, cancelToken) => {
      const q = queryRef.current.trim();
      if (!q) return { items: [] as any[], hasMore: false };
      const tab = tabRef.current;
      const res = await liveApi.liveSearch({ page, keyword: q, type: tab === 0 ? 'room' : 'user' }, { cancelToken });
      const data = res?.data || {};
      const rawList = tab === 0 ? (data.room?.list || []) : (data.user?.list || []);
      const mapped = tab === 0
        ? rawList.map(mapRoom).filter((x: LiveRoomItem | null): x is LiveRoomItem => !!x)
        : rawList.map(mapUser).filter((x: LiveUserItem | null): x is LiveUserItem => !!x);
      const totalCount = tab === 0 ? (data.room?.total_room || 0) : (data.user?.total_user || 0);
      setTotal(totalCount);
      return {
        items: mapped,
        hasMore: mapped.length >= PAGE_SIZE && (totalCount === 0 || page * PAGE_SIZE < totalCount),
      };
    },
    onError: (e) => {
      console.error('live search error:', e);
      showToast('搜索失败，请重试');
    },
  });

  const submit = useCallback((value?: string) => {
    const q = (value ?? keyword).trim();
    if (!q) return;
    setSubmitted(q);
    queryRef.current = q;
    tabRef.current = tabIdx;
    setTimeout(() => refresh(), 0);
  }, [keyword, refresh, tabIdx]);

  const switchTab = useCallback((idx: number) => {
    if (idx === tabIdx) return;
    tabRef.current = idx;
    setTabIdx(idx);
    setTotal(0);
    if (submitted.trim()) setTimeout(() => refresh(), 0);
  }, [tabIdx, submitted, refresh]);

  const openRoom = useCallback((roomid: number) => {
    if (roomid > 0) router.push({ pathname: '/live/[roomId]', params: { roomId: roomid } });
  }, [router]);

  const openUser = useCallback((item: LiveUserItem) => {
    if (item.roomid > 0) openRoom(item.roomid);
  }, [openRoom]);

  const renderItem = useCallback(
    ({ item, index }: { item: any; index: number }) => {
      if (isRoom) {
        const room = item as LiveRoomItem;
        return (
          <View style={[styles.cell, { width: cardW }, index % 2 === 1 && styles.colPad]}>
            <>
              <Press haptic scaleTo={0.97} onPress={() => openRoom(room.roomid)} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }, continuous, shadow('sm', colors.isDark)]}>
                <View style={[styles.coverWrap, { height: coverH }]}>
                  <ExpoImage
                    source={{ uri: biliCover((room.cover || ''), 320, 200) }}
                    recyclingKey={room.cover}
                    cachePolicy="memory-disk"
                    style={[StyleSheet.absoluteFill, { backgroundColor: colors.fill2 }]}
                    contentFit="cover"
                  />
                  <LinearGradient colors={['transparent', 'rgba(0,0,0,0.55)']} style={styles.coverGradient}>
                    <Text style={styles.coverText} numberOfLines={1}>{room.name}</Text>
                    {room.onlineText ? <Text style={styles.coverText} numberOfLines={1}>{room.onlineText}</Text> : null}
                  </LinearGradient>
                </View>
                <View style={styles.cardBody}>
                  <Text style={[T.subhead, styles.cardTitle, { color: colors.text }]} numberOfLines={2}>{room.title}</Text>
                </View>
              </Press>
            </>
          </View>
        );
      }
      const user = item as LiveUserItem;
      return (
        <>
          <Press
            haptic
            scaleTo={0.98}
            onPress={() => openUser(user)}
            style={[styles.userRow, index < items.length - 1 && { borderBottomColor: colors.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}>
            <ExpoImage source={{ uri: biliCover((user.face || ''), 96, 96) }} recyclingKey={user.face} cachePolicy="memory-disk" style={[styles.avatar, { backgroundColor: colors.fill2 }]} contentFit="cover" />
            <View style={styles.userInfo}>
              <View style={styles.userNameRow}>
                <Text style={[T.subhead, styles.userName, { color: colors.text }]} numberOfLines={1}>{user.name}</Text>
                {user.liveStatus === 1 ? (
                  <View style={[styles.livePill, { backgroundColor: '#FF3B30' }]}>
                    <Text style={styles.livePillText}>直播中</Text>
                  </View>
                ) : null}
              </View>
              <Text style={[T.caption1, { color: colors.textSecondary }]} numberOfLines={1}>
                {[user.areaName ? `分区: ${user.areaName}` : '', user.fansNum ? `关注数: ${formatCount(user.fansNum)}` : ''].filter(Boolean).join('    ')}
              </Text>
            </View>
          </Press>
        </>
      );
    },
    [cardW, colors, coverH, isRoom, items.length, openRoom, openUser, T],
  );

  const emptyView = useMemo(() => {
    if (loading) return null;
    if (error) {
      return (
        <View style={styles.emptyWrap}>
          <View style={[styles.emptyIconBox, { backgroundColor: colors.fill2 }]}>
            <Ionicons name="cloud-offline-outline" size={38} color={colors.textTertiary} />
          </View>
          <Text style={[T.headline, styles.emptyTitle, { color: colors.text }]}>{error}</Text>
          <Press haptic scaleTo={0.94} onPress={refresh} style={[styles.retryBtn, { backgroundColor: ACCENT }]}>
            <Text style={[T.subhead, styles.retryText]}>重试</Text>
          </Press>
        </View>
      );
    }
    return (
      <View style={styles.emptyWrap}>
        <View style={[styles.emptyIconBox, { backgroundColor: colors.fill2 }]}>
          <Ionicons name="radio-outline" size={38} color={colors.textTertiary} />
        </View>
        <Text style={[T.headline, styles.emptyTitle, { color: colors.text }]}>
          {submitted ? '没有找到相关内容' : '搜索房间或主播'}
        </Text>
        {!submitted ? (
          <Text style={[T.footnote, styles.emptySub, { color: colors.textSecondary }]}>输入关键词后按搜索</Text>
        ) : null}
      </View>
    );
  }, [loading, error, submitted, colors, T, refresh]);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Title large>直播搜索</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <View style={styles.toolbar}>
        <View style={styles.tabRow}>
          {['正在直播', '主播'].map((label, idx) => (
            <Press
              key={label}
              haptic
              scaleTo={0.94}
              onPress={() => switchTab(idx)}
              style={[styles.tabChip, { backgroundColor: tabIdx === idx ? ACCENT : colors.fill2 }]}>
              <Text style={[T.caption1, { color: tabIdx === idx ? '#FFFFFF' : colors.textSecondary, fontWeight: tabIdx === idx ? '700' : '500' }]}>
                {label}{total > 0 && tabIdx === idx ? ` ${total}` : ''}
              </Text>
            </Press>
          ))}
        </View>
      </View>
      <Stack.SearchBar
        placeholder="搜索房间或主播"
        autoCapitalize="none"
        autoFocus
        onChangeText={(e: any) => setKeyword(typeof e === 'string' ? e : e?.nativeEvent?.text ?? '')}
        onSearchButtonPress={(e: any) => submit(typeof e === 'string' ? e : e?.nativeEvent?.text ?? keyword)}
        tintColor={ACCENT}
        textColor={colors.text}
        hintTextColor={colors.textTertiary}
        headerIconColor={colors.textSecondary}
      />
      <FlashList
        ref={listRef}
        data={items}
        numColumns={isRoom ? 2 : 1}
        key={isRoom ? 'room' : 'user'}
        keyExtractor={(it: any, idx: number) => (it.roomid ? `room-${it.roomid}` : `user-${it.name}-${idx}`)}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { feedBackMedium(); refresh(); }}
            tintColor={colors.textSecondary}
          />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        estimatedItemSize={isRoom ? 210 : 64}
        windowSize={9}
        initialNumToRender={10}
        maxToRenderPerBatch={12}
        drawDistance={250}
        overrideProps={{ initialDrawBatchSize: 10 }}
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator size="small" color={colors.textTertiary} style={{ marginVertical: 16 }} />
          ) : null
        }
        ListEmptyComponent={emptyView}
        renderItem={renderItem}
      />
      {loading && items.length === 0 && (
        <View style={styles.skeletonWrap}>
          {isRoom ? (
            <View style={styles.skeletonRow}>
              <View style={styles.skeletonCol}><SkeletonCard height={coverH} /></View>
              <View style={styles.skeletonCol}><SkeletonCard height={coverH} /></View>
            </View>
          ) : (
            <>
              <SkeletonRow round />
              <SkeletonRow round />
              <SkeletonRow round />
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  toolbar: { gap: 10, paddingHorizontal: SIDE, paddingTop: 10 },
  tabRow: { flexDirection: 'row', gap: 8 },
  tabChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: RADII.circle, ...continuous },
  listContent: { paddingHorizontal: SIDE, paddingTop: 12, paddingBottom: 40 },
  cell: { marginBottom: GAP },
  colPad: { paddingLeft: GAP / 2 },
  card: { borderRadius: RADII.card, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, ...continuous },
  coverWrap: {},
  coverGradient: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingHorizontal: 8, paddingVertical: 5 },
  coverText: { color: '#FFFFFF', fontSize: 10.5, fontWeight: '600', flexShrink: 1, textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 3 },
  cardBody: { padding: 10 },
  cardTitle: { minHeight: 38, fontWeight: '600' },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  userInfo: { flex: 1, gap: 4 },
  userNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  userName: { flexShrink: 1, fontWeight: '600' },
  livePill: { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1.5 },
  livePillText: { color: '#FFFFFF', fontSize: 9, fontWeight: '700' },
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingTop: 110, paddingHorizontal: 40, gap: 8 },
  emptyIconBox: { width: 84, height: 84, borderRadius: 42, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  emptyTitle: { fontWeight: '600' },
  emptySub: { textAlign: 'center' },
  retryBtn: { marginTop: 14, borderRadius: RADII.lg, paddingHorizontal: 30, paddingVertical: 10, ...continuous },
  retryText: { color: '#FFFFFF', fontWeight: '600' },
  skeletonWrap: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: SIDE, paddingTop: 12, gap: 12 },
  skeletonRow: { flexDirection: 'row', gap: GAP },
  skeletonCol: { flex: 1 },
});
