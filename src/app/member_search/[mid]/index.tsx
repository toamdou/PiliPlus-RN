import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Stack, Link, useLocalSearchParams } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { userApi } from '@/api/user';
import { usePagedList } from '@/hooks/use-paged-list';
import type { NativeRequestCancelToken } from '@/utils/request-cancel';
import { av2bv } from '@/utils/id-utils';
import { formatCount } from '@/utils/format';
import { showToast } from '@/utils/toast';
import { feedBackMedium } from '@/utils/feedback';
import { RADII, continuous, shadow } from '@/theme/tokens';
import { type FlashListItemLayout } from '@/utils/list-layout';
import { biliCover } from '@/utils/image-url';

type SearchTab = 'video' | 'dynamic';

interface VideoHit {
  kind: 'video';
  bvid: string;
  title: string;
  pic: string;
  play: number;
  created: number;
  length: string;
}

interface DynHit {
  kind: 'dynamic';
  id: string;
  text: string;
  time: string;
  pics: string[];
}

type SearchItem = VideoHit | DynHit;

function mapAppVideo(v: any): VideoHit {
  const param = String(v?.param ?? '');
  let bvid = String(v?.bvid ?? '');
  if (!bvid) {
    if (/^BV[0-9A-Za-z]+$/.test(param)) {
      bvid = param;
    } else {
      const aid = Number(param);
      if (Number.isFinite(aid) && aid > 0) bvid = av2bv(aid);
    }
  }
  return {
    kind: 'video',
    bvid,
    title: v?.title ?? '',
    pic: v?.cover ?? '',
    play: v?.stat?.play ?? v?.play ?? 0,
    created: v?.ctime ?? v?.pubdate ?? 0,
    length: v?.length ?? '',
  };
}

function mapWebVideo(v: any): VideoHit {
  return {
    kind: 'video',
    bvid: v?.bvid ?? '',
    title: v?.title ?? '',
    pic: v?.pic ?? '',
    play: v?.play ?? 0,
    created: v?.created ?? 0,
    length: v?.length ?? '',
  };
}

function mapDyn(d: any): DynHit {
  const modules = d?.modules ?? {};
  const author = modules.module_author ?? {};
  const dynamic = modules.module_dynamic ?? {};
  const major = dynamic.major ?? {};
  const opus = major.opus ?? {};
  const draw = major.draw ?? {};
  const pics = (opus.pics ?? draw.items ?? []).map((p: any) => p?.src || p?.url || '');
  return {
    kind: 'dynamic',
    id: d?.id_str ?? String(d?.id ?? ''),
    text: dynamic.desc?.text ?? opus.summary?.text ?? opus.title ?? '',
    time: author.pub_time ?? '',
    pics,
  };
}

const VideoRow = ({ item, index, colors, T }: {
  item: VideoHit;
  index: number;
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
}) => (
  <>
    <Link href={{ pathname: '/video/[id]', params: { id: item.bvid } } as any} asChild>
      <Press haptic scaleTo={0.98} style={[styles.card, { backgroundColor: colors.card, ...shadow('sm', colors.isDark) }]}>
        <View style={styles.coverWrap}>
          <ExpoImage
            source={{ uri: biliCover((item.pic || ''), 320, 200) }}
            recyclingKey={item.pic || ''}
            cachePolicy="memory-disk"
            style={[styles.cover, { backgroundColor: colors.fill2 }]}
            contentFit="cover"
          />
          {item.length ? (
            <View style={styles.lengthBadge}>
              <Text style={styles.lengthText}>{item.length}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.info}>
          <Text style={[T.subhead, styles.title, { color: colors.text }]} numberOfLines={2}>{item.title || '无标题'}</Text>
          <View style={styles.metaRow}>
            <Ionicons name="play-outline" size={12} color={colors.textTertiary} />
            <Text style={[T.caption1, { color: colors.textTertiary }]}>{formatCount(item.play)}播放</Text>
          </View>
        </View>
      </Press>
    </Link>
  </>
);

const DynRow = ({ item, index, colors, T }: {
  item: DynHit;
  index: number;
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
}) => (
  <>
    <Link href={{ pathname: '/dynamics/[id]', params: { id: item.id } } as any} asChild>
      <Press haptic scaleTo={0.98} style={[styles.dynCard, { backgroundColor: colors.card, ...shadow('sm', colors.isDark) }]}>
        {item.time ? <Text style={[T.caption1, { color: colors.textTertiary, marginBottom: 6 }]}>{item.time}</Text> : null}
        {item.text ? <Text style={[T.subhead, { color: colors.text, lineHeight: 21 }]} numberOfLines={4}>{item.text}</Text> : null}
        {item.pics.length > 0 ? (
          <View style={styles.picRow}>
            {item.pics.slice(0, 3).map((p, i) => (
              <ExpoImage
                key={`${i}_${p}`}
                source={{ uri: biliCover(p, 240, 240) }}
                recyclingKey={p}
                cachePolicy="memory-disk"
                style={[styles.pic, { backgroundColor: colors.fill2 }]}
                contentFit="cover"
              />
            ))}
          </View>
        ) : null}
      </Press>
    </Link>
  </>
);

export default function MemberSearchScreen() {
  const { mid } = useLocalSearchParams<{ mid: string }>();
  const colors = useThemeColors();
  const T = useType();
  const midNum = Number(mid);
  const [tab, setTab] = useState<SearchTab>('video');
  const [keyword, setKeyword] = useState('');
  const tabRef = useRef<SearchTab>('video');
  const queryRef = useRef('');
  const cursorRef = useRef('');
  const dynOffsetRef = useRef('');

  const fetchPage = useCallback(async (page: number, cancelToken?: NativeRequestCancelToken) => {
    const currentTab = tabRef.current;
    const kw = queryRef.current.trim();
    if (currentTab === 'dynamic') {
      if (!kw) return { items: [] as SearchItem[], hasMore: false };
      const res = await userApi.dynSearch({
        host_mid: midNum,
        pn: page,
        offset: page === 1 ? '' : dynOffsetRef.current,
        keyword: kw,
      }, cancelToken ? { cancelToken } : undefined);
      const data = res?.data;
      if (page === 1) dynOffsetRef.current = data?.offset ?? '';
      else if (data?.offset) dynOffsetRef.current = data.offset;
      const items = (data?.items ?? []).map(mapDyn);
      return { items, hasMore: data?.has_more !== false && items.length > 0 };
    }

    if (!kw) {
      const res = await userApi.spaceArchiveApp({
        vmid: midNum,
        ...(page === 1 ? {} : { cursor: cursorRef.current }),
      }, cancelToken ? { cancelToken } : undefined);
      const data = res?.data;
      if (data?.next) cursorRef.current = String(data.next);
      const items = (data?.item ?? []).map(mapAppVideo);
      return { items, hasMore: data?.has_next === true && items.length > 0 };
    }

    const res = await userApi.archive({ mid: midNum, pn: page, keyword: kw }, cancelToken ? { cancelToken } : undefined);
    const data = res?.data;
    const vlist: any[] = data?.list?.vlist ?? [];
    const count = data?.page?.count;
    return {
      items: vlist.map(mapWebVideo),
      hasMore: typeof count === 'number' ? page * 30 < count : vlist.length >= 30,
    };
  }, [midNum]);

  const list = usePagedList<SearchItem>({
    enabled: midNum > 0,
    fetchPage,
    onError: (e) => {
      console.error('member search error:', e);
      showToast('搜索失败');
    },
  });

  const submit = useCallback((value?: string) => {
    queryRef.current = value ?? keyword;
    setTimeout(() => list.refresh(), 0);
  }, [keyword, list]);

  const changeTab = useCallback((next: SearchTab) => {
    if (tabRef.current === next) return;
    tabRef.current = next;
    setTab(next);
    setTimeout(() => list.refresh(), 0);
  }, [list]);

  const renderItem = useCallback(
    ({ item, index }: { item: SearchItem; index: number }) =>
      item.kind === 'dynamic' ? (
        <DynRow item={item} index={index} colors={colors} T={T} />
      ) : (
        <VideoRow item={item} index={index} colors={colors} T={T} />
      ),
    [colors, T],
  );

  const getItemType = useCallback((item: SearchItem) => item.kind, []);

  const overrideItemLayout = useCallback(
    (layout: FlashListItemLayout, item: SearchItem) => {
      if (item.kind === 'video') layout.size = 102;
    },
    [],
  );

  const ItemSeparator = useCallback(() => <View style={{ height: 10 }} />, []);

  const emptyContent = useMemo(() => {
    if (list.loading) {
      return (
        <View style={styles.emptyWrap}>
          <ActivityIndicator size="small" color={colors.textTertiary} />
        </View>
      );
    }
    if (list.error) {
      return (
        <View style={styles.emptyWrap}>
          <Ionicons name="cloud-offline-outline" size={38} color={colors.textTertiary} />
          <Text style={[T.headline, styles.emptyTitle, { color: colors.text }]}>加载失败</Text>
          <Press haptic scaleTo={0.94} onPress={list.refresh} style={[styles.retryBtn, { backgroundColor: colors.card }]}>
            <Text style={[T.subhead, styles.retryText, { color: ACCENT }]}>重试</Text>
          </Press>
        </View>
      );
    }
    if (tab === 'dynamic' && !keyword.trim()) {
      return (
        <View style={styles.emptyWrap}>
          <Ionicons name="search-outline" size={38} color={colors.textTertiary} />
          <Text style={[T.headline, styles.emptyTitle, { color: colors.text }]}>输入关键词搜索动态</Text>
        </View>
      );
    }
    return (
      <View style={styles.emptyWrap}>
        <Ionicons name={tab === 'video' ? 'videocam-outline' : 'pulse-outline'} size={38} color={colors.textTertiary} />
        <Text style={[T.headline, styles.emptyTitle, { color: colors.text }]}>无搜索结果</Text>
      </View>
    );
  }, [list.loading, list.error, list.refresh, tab, keyword, colors.textTertiary, colors.text, colors.card, T]);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ title: '用户搜索', headerBackButtonDisplayMode: 'minimal' }} />
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <Stack.SearchBar
        placeholder={tab === 'video' ? '搜索 TA 的视频' : '搜索 TA 的动态'}
        autoCapitalize="none"
        onChangeText={(e: any) => setKeyword(typeof e === 'string' ? e : e?.nativeEvent?.text ?? '')}
        onSearchButtonPress={(e: any) => submit(typeof e === 'string' ? e : e?.nativeEvent?.text ?? keyword)}
        tintColor={ACCENT}
        textColor={colors.text}
        hintTextColor={colors.textTertiary}
        headerIconColor={colors.textSecondary}
      />

      <View style={styles.searchArea}>
        <View style={styles.tabRow}>
          {(['video', 'dynamic'] as const).map((t) => (
            <Press
              key={t}
              haptic
              scaleTo={0.94}
              onPress={() => changeTab(t)}
              style={[styles.chip, tab === t ? styles.chipActive : { backgroundColor: colors.fill2 }]}>
              <Text style={[T.caption1, {
                color: tab === t ? '#FFFFFF' : colors.textSecondary,
                fontWeight: tab === t ? '600' : '400',
              }]}>
                {t === 'video' ? '视频' : '动态'}
              </Text>
            </Press>
          ))}
        </View>
      </View>

      <FlashList
        key={tab}
        data={list.items}
        keyExtractor={(item, index) => (item.kind === 'video' ? item.bvid || `v_${index}` : item.id || `d_${index}`)}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        renderItem={renderItem}
        getItemType={getItemType}
        overrideItemLayout={overrideItemLayout}
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
        ListEmptyComponent={emptyContent}
        estimatedItemSize={112}
        windowSize={9}
        initialNumToRender={10}
        maxToRenderPerBatch={12}
        drawDistance={250}
        overrideProps={{ initialDrawBatchSize: 10 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  searchArea: { paddingHorizontal: 14, paddingTop: 10, gap: 10 },
  tabRow: { flexDirection: 'row', gap: 8 },
  chip: { borderRadius: RADII.circle, paddingHorizontal: 16, paddingVertical: 6, ...continuous },
  chipActive: { backgroundColor: ACCENT },
  listContent: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 40 },
  card: {
    flexDirection: 'row',
    gap: 10,
    borderRadius: RADII.card,
    padding: 10,
    overflow: 'hidden',
    ...continuous,
  },
  coverWrap: { position: 'relative' },
  cover: { width: 132, height: 82, borderRadius: RADII.sm, ...continuous },
  lengthBadge: { position: 'absolute', right: 5, bottom: 5, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1.5 },
  lengthText: { color: '#FFFFFF', fontSize: 10, fontWeight: '600' },
  info: { flex: 1, justifyContent: 'space-between', paddingVertical: 2 },
  title: { fontWeight: '600', lineHeight: 20 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  dynCard: { borderRadius: RADII.card, padding: 14, ...continuous },
  picRow: { flexDirection: 'row', gap: 6, marginTop: 10 },
  pic: { width: 96, height: 96, borderRadius: RADII.sm, ...continuous },
  emptyWrap: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyTitle: { fontWeight: '600' },
  retryBtn: { marginTop: 10, borderRadius: RADII.lg, paddingHorizontal: 28, paddingVertical: 9, ...continuous },
  retryText: { fontWeight: '600' },
});
