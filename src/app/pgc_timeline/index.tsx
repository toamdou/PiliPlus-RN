/**
 * 追番时间表（pgc_timeline）——按星期分组展示追番更新时间表。
 *
 * 对齐 Flutter lib/pages/pgc/view.dart 的「时间表」入口与 02-feature-parity pgc(view)：
 *  - 数据接口复用 src/api/pgc.ts 的 pgcApi.timeline（/pgc/web/timeline），
 *    返回 result 数组：{ date, date_ts, day_of_week, is_today, episodes:[{episode_id,season_id,pub_index,pub_time,title,cover,...}] }；
 *  - 顶部 SwiftUI 分段控件切换 番剧(1) / 国创(4) / 影视(2,3,5,7)；
 *  - PgcTimelineStrip 组件（src/components/pgc/PgcTimelineStrip.tsx）已完整且已接入
 *    番剧详情页选集头（按单季筛选，见 PgcEpisodeGrid），本页展示全量周更，不重复内部实现；
 *  - 点击某一集 → 进入该季详情 /pgc/[id]。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, RefreshControl } from 'react-native';
import { Host, Picker, Text as SwiftText } from '@expo/ui/swift-ui';
import { pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { Stack, Link, useRouter } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { useType } from '@/components/type-scale';
import { pgcApi } from '@/api/pgc';
import { Press } from '@/components/motion';
import { feedBackMedium } from '@/utils/feedback';
import { RADII, continuous } from '@/theme/tokens';
import { biliCover } from '@/utils/image-url';
import {
  createNativeRequestCancelToken,
  type NativeRequestCancelToken,
} from '@/utils/request-cancel';

/* 周更时间表分区：番剧 / 国创 / 影视（含电影、纪录片、电视剧、综艺） */
const TIMELINE_TABS: { label: string; types: string }[] = [
  { label: '番剧', types: '1' },
  { label: '国创', types: '4' },
  { label: '影视', types: '2,3,5,7' },
];

interface TimelineEp {
  episode_id: number;
  season_id: number;
  pub_index?: string;
  pub_time?: string;
  title?: string;
  long_title?: string;
  season_title?: string;
  cover?: string;
}

interface TimelineDay {
  date: string;
  date_ts: number;
  day_of_week: number;
  is_today?: number;
  episodes: TimelineEp[];
}

const WEEK_NAMES = ['一', '二', '三', '四', '五', '六', '日'];

function dayTitle(day: TimelineDay): string {
  const w = WEEK_NAMES[Math.max(0, day.day_of_week - 1)] || '';
  return `${day.date} ${day.is_today === 1 ? '今天' : `周${w}`}`;
}

export default function PgcTimelineScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const T = useType();
  const [tabIdx, setTabIdx] = useState(0);
  const [days, setDays] = useState<TimelineDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const cancelRef = useRef<NativeRequestCancelToken | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    cancelRef.current?.abort();
    const token = createNativeRequestCancelToken();
    cancelRef.current = token;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await pgcApi.timeline({ types: TIMELINE_TABS[tabIdx].types, before: 6, after: 6 }, { cancelToken: token });
      const raw = res?.result || res?.data?.result || res?.data || [];
      const list: TimelineDay[] = Array.isArray(raw)
        ? raw.map((d: any) => ({
          date: d.date || '',
          date_ts: Number(d.date_ts) || 0,
          day_of_week: Number(d.day_of_week) || 1,
          is_today: d.is_today,
          episodes: Array.isArray(d.episodes)
            ? d.episodes.map((ep: any) => ({
              episode_id: Number(ep.episode_id || ep.id || 0),
              season_id: Number(ep.season_id || 0),
              pub_index: ep.pub_index || '',
              pub_time: ep.pub_time || '',
              title: ep.title || '',
              long_title: ep.long_title || '',
              season_title: ep.season_title || ep.title || '',
              cover: ep.cover || '',
            }))
            : [],
        }))
        : [];
      setDays(list);
    } catch {
      /* 网络异常保持上次数据，不做额外处理 */
    } finally {
      if (cancelRef.current === token) cancelRef.current = null;
      setLoading(false);
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabIdx]);

  useEffect(() => {
    const timer = setTimeout(() => load(), 0);
    return () => clearTimeout(timer);
  }, [tabIdx, load]);

  useEffect(() => () => {
    cancelRef.current?.abort();
  }, []);

  /* 同一季在同一天多次更新时去重（同一 episode_id 只留一行） */
  const sections = useMemo(
    () => days.map((d) => {
      const seen = new Set<number>();
      const eps = d.episodes.filter((e) => {
        if (!e.season_id) return true;
        if (seen.has(e.season_id)) return false;
        seen.add(e.season_id);
        return true;
      });
      return { ...d, episodes: eps };
    }),
    [days],
  );

  const totalEpisodes = useMemo(() => sections.reduce((sum, d) => sum + d.episodes.length, 0), [sections]);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Title large>追番时间表</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />

      {/* 分区切换：SwiftUI 分段控件 */}
      <View style={styles.segmentWrap}>
        <Host matchContents>
          <Picker
            label=""
            selection={tabIdx}
            onSelectionChange={(v) => setTabIdx(Number(v))}
            modifiers={[pickerStyle('segmented')]}>
            {TIMELINE_TABS.map((t, i) => <SwiftText key={t.types} modifiers={[tag(i)]}>{t.label}</SwiftText>)}
          </Picker>
        </Host>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { feedBackMedium(); load(true); }} tintColor={colors.textSecondary} />
        }>
        {loading && days.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="hourglass-outline" size={34} color={colors.textTertiary} />
            <Text style={[T.footnote, { color: colors.textSecondary }]}>加载中…</Text>
          </View>
        ) : sections.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="calendar-outline" size={34} color={colors.textTertiary} />
            <Text style={[T.footnote, { color: colors.textSecondary }]}>本周暂无更新</Text>
          </View>
        ) : (
          <>
            <Text style={[T.caption1, styles.summary, { color: colors.textTertiary }]}>
              本周共 {totalEpisodes} 部更新
            </Text>
            {sections.map((day) => {
              if (day.episodes.length === 0) return null;
              const isToday = day.is_today === 1;
              return (
                <View key={day.date_ts} style={styles.daySection}>
                  <View style={styles.dayHeader}>
                    <Text style={[T.subhead, styles.dayTitle, { color: colors.text }]}>{dayTitle(day)}</Text>
                    {isToday ? <View style={[styles.todayDot, { backgroundColor: ACCENT }]} /> : null}
                  </View>
                  <View style={[styles.epCard, { backgroundColor: colors.card }, continuous]}>
                    {day.episodes.map((ep, i) => (
                      <View key={`${ep.season_id}-${i}`}>
                        {i > 0 ? <View style={[styles.divider, { backgroundColor: colors.separator }]} /> : null}
                        <Link href={{ pathname: '/pgc/[id]', params: { id: String(ep.season_id) } } as any} asChild>
                          <Press haptic scaleTo={0.97} style={styles.epRow}>
                            <ExpoImage
                              source={{ uri: ep.cover ? biliCover(ep.cover, 120, 120) : '' }}
                              recyclingKey={ep.cover}
                              cachePolicy="memory-disk"
                              style={[styles.epCover, { backgroundColor: colors.fill2 }]}
                              contentFit="cover"
                            />
                            <View style={styles.epInfo}>
                              <Text style={[T.subhead, styles.epTitle, { color: colors.text }]} numberOfLines={1}>
                                {ep.season_title || ep.title || '未知剧集'}
                              </Text>
                              <Text style={[T.caption1, { color: colors.textSecondary }]} numberOfLines={1}>
                                {ep.pub_index || ep.long_title || '更新'}
                              </Text>
                            </View>
                            <Text style={[T.caption2, styles.epTime, { color: isToday ? ACCENT : colors.textTertiary }]}>
                              {ep.pub_time || ''}
                            </Text>
                          </Press>
                        </Link>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  segmentWrap: { paddingHorizontal: 14, paddingTop: 12 },
  scrollContent: { paddingHorizontal: 14, paddingBottom: 40, paddingTop: 12 },
  summary: { textAlign: 'center', marginBottom: 12 },
  daySection: { marginBottom: 18 },
  dayHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  dayTitle: { fontWeight: '700' },
  todayDot: { width: 6, height: 6, borderRadius: 3 },
  epCard: { borderRadius: RADII.md, paddingHorizontal: 12, overflow: 'hidden', ...continuous },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 60 },
  epRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, minHeight: 58 },
  epCover: { width: 40, height: 40, borderRadius: 8, ...continuous },
  epInfo: { flex: 1, gap: 2 },
  epTitle: { fontWeight: '600' },
  epTime: { fontWeight: '600' },
  emptyWrap: { alignItems: 'center', paddingTop: 90, gap: 8 },
});
