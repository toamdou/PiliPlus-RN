import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, useWindowDimensions } from 'react-native';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { Stack, useRouter, useScrollToTop } from 'expo-router';
import { Host, ProgressView } from '@expo/ui/swift-ui';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { liveApi } from '@/api/live';
import { showToast } from '@/utils/toast';
import { gridItemLayout } from '@/utils/list-layout';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { RADII, continuous } from '@/theme/tokens';
import { biliCover } from '@/utils/image-url';

const SIDE = 14;
const GAP = 12;
const cellLayout = gridItemLayout(84);

interface AreaItem {
  id: number;
  name: string;
  pic: string;
  parent_id: number;
  parent_name: string;
}
interface AreaGroup {
  name: string;
  area_list: AreaItem[];
}

/* ===== 分区宫格项（memo：回收复用时不重建闭包） ===== */
const AreaCell = memo(function AreaCell({
  item,
  index,
  colors,
  T,
  onPress,
}: {
  item: AreaItem;
  index: number;
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
  onPress: (item: AreaItem) => void;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const cardW = (windowWidth - SIDE * 2 - GAP * 3) / 4;
  return (
    <View style={[styles.cell, { width: cardW }]}>
      <Press haptic scaleTo={0.94} onPress={() => onPress(item)} style={styles.cellInner}>
        {item.pic ? (
          <ExpoImage
            source={{ uri: biliCover(item.pic, 96, 96) }}
            recyclingKey={item.pic}
            cachePolicy="memory-disk"
            style={[styles.cellIcon, { backgroundColor: colors.fill2 }]}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.cellIcon, { backgroundColor: colors.fill2, justifyContent: 'center', alignItems: 'center' }]}>
            <Ionicons name="tv-outline" size={20} color={colors.textTertiary} />
          </View>
        )}
        <Text style={[T.caption2, styles.cellName, { maxWidth: cardW, color: colors.textSecondary }]} numberOfLines={1}>{item.name}</Text>
      </Press>
    </View>
  );
});

export default function LiveAreaScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const T = useType();
  const [groups, setGroups] = useState<AreaGroup[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const listRef = useRef<FlashListRef<AreaItem>>(null);
  useScrollToTop(listRef);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await liveApi.areaList();
      if (res?.code !== 0) {
        /* 风控等业务错误以 HTTP 200 + code!=0 返回：抛错走错误态，避免渲染成假空态 */
        throw new Error(res?.message || `分区加载失败（${res?.code}）`);
      }
      const list = res?.data?.list ?? [];
      setGroups(list);
      setActiveIdx(0);
      setFailed(false);
      if (list.length === 0) showToast('暂无分区数据');
    } catch (e) {
      console.error('liveAreaList error:', e);
      setFailed(true);
      showToast('分区加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const openArea = useCallback((item: AreaItem) => {
    router.push({
      pathname: '/live_area_detail/[areaId]',
      params: {
        areaId: String(item.id),
        parentAreaId: String(item.parent_id ?? ''),
        parentName: item.parent_name || groups[activeIdx]?.name || '',
      },
    });
  }, [router, groups, activeIdx]);

  const activeGroup = groups[activeIdx];

  const renderItem = useCallback(
    ({ item, index }: { item: AreaItem; index: number }) => (
      <AreaCell item={item} index={index} colors={colors} T={T} onPress={openArea} />
    ),
    [colors, T, openArea],
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Title large>直播分区</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />

      {/* 父分区切换 */}
      {groups.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipScroll}
          contentContainerStyle={styles.chipContent}>
          {groups.map((g, i) => (
            <Press
              key={g.name}
              haptic
              scaleTo={0.94}
              onPress={() => setActiveIdx(i)}
              style={[styles.chip, continuous, i === activeIdx ? { backgroundColor: ACCENT } : { backgroundColor: colors.fill2 }]}>
              <Text style={[T.footnote, { color: i === activeIdx ? '#FFFFFF' : colors.textSecondary, fontWeight: i === activeIdx ? '600' : '400' }]}>
                {g.name}
              </Text>
            </Press>
          ))}
        </ScrollView>
      )}

      {loading ? (
        <View style={styles.loadingWrap}>
          <Host matchContents><ProgressView /></Host>
        </View>
      ) : failed ? (
        <View style={styles.emptyWrap}>
          <View style={[styles.emptyIconBox, { backgroundColor: colors.fill2 }]}>
            <Ionicons name="cloud-offline-outline" size={38} color={colors.textTertiary} />
          </View>
          <Text style={[T.headline, styles.emptyTitle, { color: colors.text }]}>加载失败</Text>
          <Text style={[T.footnote, styles.emptySub, { color: colors.textSecondary }]}>网络开小差了，试试重新加载</Text>
          <Press haptic scaleTo={0.94} onPress={load} style={styles.retryBtn}>
            <Text style={[T.subhead, styles.retryBtnText]}>重新加载</Text>
          </Press>
        </View>
      ) : activeGroup ? (
        <FlashList
          key={activeIdx}
          ref={listRef}
          data={activeGroup.area_list}
          numColumns={4}
          keyExtractor={(it) => String(it.id)}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          estimatedItemSize={84}
          overrideItemLayout={cellLayout}
          windowSize={9}
          initialNumToRender={10}
          maxToRenderPerBatch={12}
          drawDistance={250}
          overrideProps={{ initialDrawBatchSize: 10 }}
          ListEmptyComponent={
            <Text style={[T.footnote, styles.emptyText, { color: colors.textTertiary }]}>暂无子分区</Text>
          }
          renderItem={renderItem}
        />
      ) : (
        <View style={styles.emptyWrap}>
          <Text style={[T.footnote, styles.emptyText, { color: colors.textTertiary }]}>暂无分区数据</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  /* 父分区 chips */
  chipScroll: { maxHeight: 46 },
  chipContent: { paddingHorizontal: 14, gap: 8, alignItems: 'center', paddingVertical: 7 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: RADII.sm },
  /* 宫格 */
  listContent: { paddingHorizontal: SIDE, paddingTop: 8, paddingBottom: 40 },
  cell: { marginBottom: 14 },
  cellInner: { alignItems: 'center', gap: 5 },
  cellIcon: { width: 48, height: 48, borderRadius: RADII.md, ...continuous },
  cellName: {},
  /* 空态 */
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingTop: 120, paddingHorizontal: 40, gap: 8 },
  emptyIconBox: { width: 84, height: 84, borderRadius: 42, justifyContent: 'center', alignItems: 'center', marginBottom: 8, ...continuous },
  emptyTitle: { fontWeight: '600' },
  emptySub: { textAlign: 'center' },
  emptyText: { textAlign: 'center', marginTop: 30 },
  retryBtn: { marginTop: 14, backgroundColor: ACCENT, borderRadius: RADII.lg, paddingHorizontal: 30, paddingVertical: 10 },
  retryBtnText: { color: '#FFFFFF', fontWeight: '600' },
});
