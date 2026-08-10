import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, useWindowDimensions } from 'react-native';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { Stack, useScrollToTop } from 'expo-router';
import { Host, ProgressView } from '@expo/ui/swift-ui';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { videoApi } from '@/api/video';
import { createNativeRequestCancelToken, type NativeRequestCancelToken } from '@/utils/request-cancel';
import { Press, stagger } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { RADII, continuous } from '@/theme/tokens';
import { VideoCard, cellHeightFor, type VideoItem } from '@/components/video/VideoCard';
import { type FlashListItemLayout } from '@/utils/list-layout';
import { feedBackMedium } from '@/utils/feedback';

interface SeriesItem {
  number: number;
  name: string;
}

function mapItems(raw: any[]): VideoItem[] {
  return (raw || []).map((i: any) => {
    const aid = i.aid || 0;
    return {
      aid,
      bvid: i.bvid || '',
      title: i.title || '',
      pic: i.pic || '',
      duration: i.duration || 0,
      owner: { name: i.owner?.name || '', face: i.owner?.face || '', mid: i.owner?.mid || 0 },
      stat: { view: i.stat?.view || 0, danmaku: i.stat?.danmaku || 0 },
      goto: 'av' as const,
    };
  });
}

export default function PopularSeriesScreen() {
  const colors = useThemeColors();
  const T = useType();
  const { width: windowWidth } = useWindowDimensions();
  const [seriesList, setSeriesList] = useState<SeriesItem[]>([]);
  const [activeNumber, setActiveNumber] = useState<number | null>(null);
  const [activeName, setActiveName] = useState('');
  const [reminder, setReminder] = useState('');
  const [items, setItems] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const listRef = useRef<FlashListRef<VideoItem>>(null);
  useScrollToTop(listRef);
  const seriesCancelRef = useRef<NativeRequestCancelToken | null>(null);
  const listCancelRef = useRef<NativeRequestCancelToken | null>(null);

  const loadSeries = useCallback(async (number: number, isRefresh = false) => {
    const cancelToken = createNativeRequestCancelToken();
    seriesCancelRef.current?.abort();
    seriesCancelRef.current = cancelToken;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await videoApi.popularSeriesOne({ number }, { cancelToken });
      const d = res?.data;
      if (d?.config?.name) setActiveName(d.config.name);
      setReminder(d?.reminder || '');
      setItems(mapItems(d?.list));
    } catch (e) {
      if (cancelToken.aborted) return;
      console.error('popularSeriesOne error:', e);
      setItems([]);
    } finally {
      if (seriesCancelRef.current === cancelToken) seriesCancelRef.current = null;
      if (!cancelToken.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const cancelToken = createNativeRequestCancelToken();
    listCancelRef.current?.abort();
    listCancelRef.current = cancelToken;
    const timer = setTimeout(async () => {
      try {
        const res = await videoApi.popularSeriesList({ cancelToken });
        const list: SeriesItem[] = (res?.data?.list || []).map((i: any) => ({
          number: i.number || 0,
          name: i.name || '',
        })).filter((i: SeriesItem) => i.number > 0);
        if (cancelled) return;
        setSeriesList(list);
        if (list.length > 0) {
          setActiveNumber(list[0].number);
          setActiveName(list[0].name);
        } else {
          setLoading(false);
        }
      } catch (e) {
        if (cancelToken.aborted) return;
        console.error('popularSeriesList error:', e);
        if (!cancelled) setLoading(false);
      }
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      cancelToken.abort();
      if (listCancelRef.current === cancelToken) listCancelRef.current = null;
    };
  }, []);

  useEffect(() => () => {
    seriesCancelRef.current?.abort();
  }, []);

  useEffect(() => {
    if (activeNumber == null) return;
    const timer = setTimeout(() => loadSeries(activeNumber), 0);
    return () => clearTimeout(timer);
  }, [activeNumber, loadSeries]);

  const renderItem = useCallback(
    ({ item, index }: { item: VideoItem; index: number }) => (
      <View>
        <VideoCard item={item} mode="immersive" delay={stagger(index)} />
      </View>
    ),
    [],
  );

  const overrideItemLayout = useCallback(
    (layout: FlashListItemLayout) => {
      layout.size = cellHeightFor('immersive', T.subhead.lineHeight ?? 20, T.caption1.lineHeight ?? 16, windowWidth) + 16;
    },
    [T, windowWidth],
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Title large>{activeName || '每周必看'}</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />

      {seriesList.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipScroll}
          contentContainerStyle={styles.chipContent}>
          {seriesList.map((s) => (
            <Press
              key={s.number}
              haptic
              scaleTo={0.94}
              onPress={() => {
                if (s.number === activeNumber) return;
                feedBackMedium();
                setActiveNumber(s.number);
                setActiveName(s.name);
                listRef.current?.scrollToOffset({ offset: 0, animated: false });
              }}
              style={[styles.chip, continuous, s.number === activeNumber ? { backgroundColor: ACCENT } : { backgroundColor: colors.fill2 }]}>
              <Text style={[T.footnote, { color: s.number === activeNumber ? '#FFFFFF' : colors.textSecondary, fontWeight: s.number === activeNumber ? '600' : '400' }]}>
                {s.name}
              </Text>
            </Press>
          ))}
        </ScrollView>
      )}

      <FlashList
        ref={listRef}
        data={items}
        keyExtractor={(it, idx) => it.bvid || `series-${idx}`}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => activeNumber && loadSeries(activeNumber, true)} tintColor={colors.textSecondary} />}
        estimatedItemSize={220}
        overrideItemLayout={overrideItemLayout}
        windowSize={9}
        initialNumToRender={8}
        maxToRenderPerBatch={10}
        drawDistance={250}
        overrideProps={{ initialDrawBatchSize: 10 }}
        ListHeaderComponent={
          reminder ? (
            <View style={[styles.reminderBar, { backgroundColor: colors.fill2 }]}>
              <Text style={[T.footnote, { color: colors.textSecondary }]} numberOfLines={1}>{reminder}</Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.loadingWrap}>
              <Host matchContents><ProgressView /></Host>
            </View>
          ) : (
            <View style={styles.loadingWrap}>
              <Text style={[T.footnote, { color: colors.textTertiary }]}>暂无内容，下拉刷新试试</Text>
            </View>
          )
        }
        renderItem={renderItem}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  chipScroll: { maxHeight: 46 },
  chipContent: { paddingHorizontal: 14, gap: 8, alignItems: 'center', paddingVertical: 7 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: RADII.sm },
  listContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },
  reminderBar: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADII.md, marginBottom: 10 },
  loadingWrap: { height: 260, justifyContent: 'center', alignItems: 'center' },
});
