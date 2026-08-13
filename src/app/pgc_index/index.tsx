/**
 * 番剧索引（pgc_index）——按 题材/年份/地区/排序 筛选的索引页。
 *
 * 对齐 Flutter lib/pages/pgc_index.dart：
 *  - 条件来自 pgcApi.indexCondition（/pgc/season/index/condition），key 为 order/style/year/area；
 *  - 结果来自 pgcApi.indexResult（/pgc/season/index/result），响应结构 res.data.data.list；
 *  - 结果请求参数与首页 use-rcmd-feed 一致：未选中的筛选项传 -1（服务端视为“全部”），
 *    题材→style_id、地区→area、年份→year、排序→order，sort 配合评分排序。
 *  - 筛选条件 UI 走 SwiftUI 模式：顶部 season_type 分段控件 + 排序菜单 Picker；
 *    题材/年份/地区为横向 Chip 行（“全部”= -1）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions, RefreshControl } from 'react-native';
import { Host, Picker, Text as SwiftText } from '@expo/ui/swift-ui';
import { pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { FlashList } from '@shopify/flash-list';
import { Stack, Link, useRouter } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { useType } from '@/components/type-scale';
import { pgcApi } from '@/api/pgc';
import { Press } from '@/components/motion';
import { feedBackSelection, feedBackMedium } from '@/utils/feedback';
import { RADII, continuous } from '@/theme/tokens';
import { biliCover } from '@/utils/image-url';
import {
  createNativeRequestCancelToken,
  type NativeRequestCancelToken,
} from '@/utils/request-cancel';

/* 分区（season_type）：番剧/国创/电影/电视剧/综艺/记录 */
const SEASON_TYPES: { value: number; label: string }[] = [
  { value: 1, label: '番剧' },
  { value: 4, label: '国创' },
  { value: 2, label: '电影' },
  { value: 5, label: '电视剧' },
  { value: 7, label: '综艺' },
  { value: 3, label: '记录' },
];

interface ConditionOption {
  value: number | string;
  label: string;
}

interface ConditionData {
  order: ConditionOption[];
  style: ConditionOption[];
  year: ConditionOption[];
  area: ConditionOption[];
}

interface IndexItem {
  season_id: number;
  title: string;
  cover: string;
  score?: string;
  index_show?: string;
}

const SIDE = 14;
const GAP = 10;
const PAGE_SIZE = 20;

/* ===== 筛选行（横向 Chip） ===== */
function FilterChipRow({
  label,
  options,
  selected,
  onSelect,
  colors,
  T,
}: {
  label: string;
  options: ConditionOption[];
  selected: number | string;
  onSelect: (value: number | string) => void;
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
}) {
  if (options.length === 0) return null;
  return (
    <View style={styles.filterRow}>
      <Text style={[T.caption1, styles.filterLabel, { color: colors.textSecondary }]}>{label}</Text>
      <View style={styles.chipFlow}>
        <Press
          haptic
          scaleTo={0.94}
          onPress={() => onSelect(-1)}
          style={[styles.chip, { backgroundColor: selected === -1 ? colors.accent : colors.fill2 }]}>
          <Text style={[T.caption1, { color: selected === -1 ? '#FFFFFF' : colors.text, fontWeight: selected === -1 ? '700' : '400' }]}>全部</Text>
        </Press>
        {options.map((opt) => {
          const isSel = selected === opt.value;
          return (
            <Press
              key={String(opt.value)}
              haptic
              scaleTo={0.94}
              onPress={() => onSelect(opt.value)}
              style={[styles.chip, { backgroundColor: isSel ? colors.accent : colors.fill2 }]}>
              <Text style={[T.caption1, { color: isSel ? '#FFFFFF' : colors.text, fontWeight: isSel ? '700' : '400' }]}>{opt.label}</Text>
            </Press>
          );
        })}
      </View>
    </View>
  );
}

export default function PgcIndexScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const T = useType();
  const { width: windowWidth } = useWindowDimensions();
  const cardW = (windowWidth - SIDE * 2 - GAP * 2) / 3;
  const coverH = cardW * 0.62;

  /* 当前筛选状态（默认全部：-1），filtersRef 供回调读取最新值 */
  const [seasonType, setSeasonType] = useState(1);
  const [sortIdx, setSortIdx] = useState(0); // order 下拉选中项
  const [styleId, setStyleId] = useState<number | string>(-1);
  const [year, setYear] = useState<number | string>(-1);
  const [area, setArea] = useState<number | string>(-1);
  const [cond, setCond] = useState<ConditionData>({ order: [], style: [], year: [], area: [] });
  const [items, setItems] = useState<IndexItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pageRef = useRef(1);
  const hasMoreRef = useRef(true);
  const busyRef = useRef(false);
  const cancelRef = useRef<NativeRequestCancelToken | null>(null);
  const condCancelRef = useRef<NativeRequestCancelToken | null>(null);

  /* ===== 筛选条件（题材/年份/地区/排序） ===== */
  const loadCondition = useCallback(async (st: number) => {
    condCancelRef.current?.abort();
    const token = createNativeRequestCancelToken();
    condCancelRef.current = token;
    try {
      const res = await pgcApi.indexCondition({ season_type: st }, { cancelToken: token });
      const d: any = res?.data?.data || res?.data || {};
      setCond({
        order: Array.isArray(d.order) ? d.order : [],
        style: Array.isArray(d.style) ? d.style : [],
        year: Array.isArray(d.year) ? d.year : [],
        area: Array.isArray(d.area) ? d.area : [],
      });
    } catch {
      /* 条件拉取失败不阻塞结果列表，保持当前筛选 */
    } finally {
      if (condCancelRef.current === token) condCancelRef.current = null;
    }
  }, []);

  /* 结果列表（对齐 use-rcmd-feed：order/sort/style_id/year/area，未选传 -1） */
  const loadResults = useCallback(async (mode: 'first' | 'refresh' | 'more') => {
    if (busyRef.current) return;
    if (mode === 'more' && !hasMoreRef.current) return;
    busyRef.current = true;
    cancelRef.current?.abort();
    const token = createNativeRequestCancelToken();
    cancelRef.current = token;
    const page = mode === 'more' ? pageRef.current + 1 : 1;
    pageRef.current = page;
    if (mode === 'first') setLoading(true);
    else if (mode === 'refresh') setRefreshing(true);
    else setLoadingMore(true);
    try {
      const res = await pgcApi.indexResult(
        {
          season_type: seasonType,
          order: cond.order[sortIdx]?.value ?? 2,
          sort: 0,
          style_id: styleId,
          year,
          area,
          page,
          pagesize: PAGE_SIZE,
        },
        { cancelToken: token },
      );
      const data: any = res?.data?.data || res?.data || {};
      const list: any[] = Array.isArray(data.list) ? data.list : [];
      const mapped: IndexItem[] = list.map((i: any) => ({
        season_id: Number(i.season_id || i.media_id || 0),
        title: i.title || '',
        cover: i.cover || '',
        score: i.score ? String(i.score) : '',
        index_show: i.index_show || i.badge || '',
      }));
      const next = !!data.has_next && list.length > 0;
      hasMoreRef.current = next;
      setHasMore(next);
      setItems((prev) => (mode === 'more' ? [...prev, ...mapped] : mapped));
      setError(null);
    } catch (e: any) {
      if (token.aborted) return;
      if (mode === 'more') pageRef.current -= 1;
      else if (mode === 'first') setError(e?.message || '加载失败，请重试');
    } finally {
      if (cancelRef.current === token) cancelRef.current = null;
      busyRef.current = false;
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonType, sortIdx, styleId, year, area, cond]);

  /* 筛选变化 → 重置并重拉（题材/年份/地区/排序变更时均触发） */
  const applyFilter = useCallback((updater: () => void) => {
    updater();
    feedBackSelection();
  }, []);

  useEffect(() => {
    if (styleId === -1 && year === -1 && area === -1 && sortIdx === 0) return;
    const timer = setTimeout(() => {
      setItems([]);
      pageRef.current = 1;
      hasMoreRef.current = true;
      setHasMore(true);
      loadResults('first');
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleId, year, area, sortIdx, seasonType]);

  useEffect(() => {
    if (seasonType === -1) return;
    const timer = setTimeout(() => {
      setItems([]);
      pageRef.current = 1;
      hasMoreRef.current = true;
      setHasMore(true);
      setStyleId(-1);
      setYear(-1);
      setArea(-1);
      setSortIdx(0);
      loadCondition(seasonType);
      loadResults('first');
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonType]);

  useEffect(() => () => {
    cancelRef.current?.abort();
    condCancelRef.current?.abort();
  }, []);

  const sortOptions = useMemo(
    () => (cond.order.length > 0 ? cond.order : [{ value: 2, label: '最新发布' }, { value: 1, label: '最多追番' }, { value: 0, label: '评分最高' }]),
    [cond.order],
  );

  /* 结果网格单元格（3 列，复用选集网格的卡片比例：封面 3:2 + 角标） */
  const renderCell = useCallback(
    ({ item, index }: { item: IndexItem; index: number }) => (
      <View style={[styles.cell, { width: cardW }, (index + 1) % 3 !== 0 && { marginRight: GAP }]}>
        <Link href={{ pathname: '/pgc/[id]', params: { id: String(item.season_id) } } as any} asChild>
          <Press haptic scaleTo={0.96}>
            <View>
              <ExpoImage
                source={{ uri: biliCover(item.cover, 320, 200) }}
                recyclingKey={item.cover}
                cachePolicy="memory-disk"
                style={[styles.cover, { width: cardW, height: coverH, backgroundColor: colors.fill2 }]}
                contentFit="cover"
              />
              {item.score ? (
                <View style={styles.scoreBadge}>
                  <Text style={styles.scoreText}>{item.score}</Text>
                </View>
              ) : null}
            </View>
            <Text style={[T.caption2, styles.cellTitle, { color: colors.text }]} numberOfLines={2}>{item.title}</Text>
          </Press>
        </Link>
      </View>
    ),
    [cardW, coverH, colors],
  );

  const listHeader = (
    <View style={styles.header}>
      {/* 分区切换：SwiftUI 分段控件 */}
      <Host matchContents>
        <Picker
          label=""
          selection={SEASON_TYPES.findIndex((s) => s.value === seasonType)}
          onSelectionChange={(v) => { const st = SEASON_TYPES[Number(v)]; if (st && st.value !== seasonType) setSeasonType(st.value); }}
          modifiers={[pickerStyle('segmented')]}>
          {SEASON_TYPES.map((s, i) => <SwiftText key={s.value} modifiers={[tag(i)]}>{s.label}</SwiftText>)}
        </Picker>
      </Host>

      {/* 排序：SwiftUI 菜单 Picker */}
      <View style={styles.sortRow}>
        <Text style={[T.caption1, { color: colors.textTertiary }]}>
          {cond.order.length > 0 ? '共筛选' : ''}
        </Text>
        <Host matchContents>
          <Picker
            label="排序"
            selection={sortIdx}
            onSelectionChange={(v) => setSortIdx(Number(v))}
            modifiers={[pickerStyle('menu')]}>
            {sortOptions.map((o, i) => <SwiftText key={String(o.value)} modifiers={[tag(i)]}>{o.label}</SwiftText>)}
          </Picker>
        </Host>
      </View>

      {/* 题材 / 年份 / 地区 筛选行 */}
      <FilterChipRow label="题材" options={cond.style} selected={styleId} colors={colors} T={T} onSelect={(v) => applyFilter(() => setStyleId(v))} />
      <FilterChipRow label="年份" options={cond.year} selected={year} colors={colors} T={T} onSelect={(v) => applyFilter(() => setYear(v))} />
      <FilterChipRow label="地区" options={cond.area} selected={area} colors={colors} T={T} onSelect={(v) => applyFilter(() => setArea(v))} />

      {error ? (
        <View style={styles.errorWrap}>
          <Text style={[T.footnote, { color: colors.textSecondary }]}>{error}</Text>
          <Press haptic scaleTo={0.94} onPress={() => loadResults('first')} style={[styles.retryBtn, { backgroundColor: colors.accent }]}>
            <Text style={[T.subhead, styles.retryText]}>重试</Text>
          </Press>
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Title large>番剧索引</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <FlashList
        data={items}
        numColumns={3}
        keyExtractor={(it) => String(it.season_id)}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        estimatedItemSize={180}
        windowSize={9}
        initialNumToRender={9}
        maxToRenderPerBatch={12}
        drawDistance={250}
        overrideProps={{ initialDrawBatchSize: 9 }}
        ListHeaderComponent={listHeader}
        onEndReached={() => loadResults('more')}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { feedBackMedium(); loadResults('refresh'); }} tintColor={colors.textSecondary} />
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.footerLoading}>
              <Ionicons name="hourglass-outline" size={16} color={colors.textTertiary} />
              <Text style={[T.caption1, { color: colors.textTertiary }]}>加载中…</Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.emptyWrap}>
              <Ionicons name="film-outline" size={34} color={colors.textTertiary} />
              <Text style={[T.footnote, { color: colors.textSecondary }]}>暂无结果</Text>
            </View>
          )
        }
        renderItem={renderCell}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  listContent: { paddingHorizontal: SIDE, paddingBottom: 40 },
  header: { paddingTop: 10, gap: 6 },
  sortRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8 },
  filterRow: { marginTop: 10, gap: 8 },
  filterLabel: { fontWeight: '600' },
  chipFlow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: RADII.circle, paddingHorizontal: 12, paddingVertical: 6, ...continuous },
  cell: { marginBottom: 14 },
  cover: { borderRadius: RADII.sm, ...continuous },
  scoreBadge: {
    position: 'absolute', bottom: 4, left: 4,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: RADII.xs,
    paddingHorizontal: 5, paddingVertical: 1.5,
  },
  scoreText: { color: '#FFFFFF', fontSize: 10.5, fontWeight: '700' },
  cellTitle: { marginTop: 5, fontWeight: '500' },
  errorWrap: { alignItems: 'center', paddingTop: 30, gap: 10 },
  retryBtn: { borderRadius: RADII.lg, paddingHorizontal: 24, paddingVertical: 8, ...continuous },
  retryText: { color: '#FFFFFF', fontWeight: '600' },
  footerLoading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14 },
  emptyWrap: { alignItems: 'center', paddingTop: 80, gap: 8 },
});
