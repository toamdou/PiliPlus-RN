import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Host, ProgressView } from '@expo/ui/swift-ui';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { pgcApi } from '@/api/pgc';
import { createNativeRequestCancelToken, type NativeRequestCancelToken } from '@/utils/request-cancel';
import { RADII, continuous } from '@/theme/tokens';

interface TimelineEp {
  episode_id: number;
  season_id: number;
  pub_index?: string;
  pub_time?: string;
  title?: string;
}

interface TimelineDay {
  date: string;
  date_ts: number;
  day_of_week: number;
  is_today?: number;
  episodes: TimelineEp[];
}

export const PgcTimelineStrip = memo(function PgcTimelineStrip({
  seasonId,
  seasonType,
  onSelectEpId,
}: {
  seasonId: number;
  seasonType?: number;
  onSelectEpId?: (epId: number) => void;
}) {
  const colors = useThemeColors();
  const T = useType();
  const [days, setDays] = useState<TimelineDay[]>([]);
  const [loading, setLoading] = useState(true);
  const cancelTokenRef = useRef<NativeRequestCancelToken | null>(null);

  useEffect(() => {
    let cancelled = false;
    const cancelToken = createNativeRequestCancelToken();
    cancelTokenRef.current?.abort();
    cancelTokenRef.current = cancelToken;
    const timer = setTimeout(async () => {
      try {
        const types = seasonType === 4 ? '4' : '1';
        const res = await pgcApi.timeline({ types, before: 6, after: 6 }, { cancelToken });
        const raw = res?.result || res?.data?.result || res?.data || [];
        const list: TimelineDay[] = Array.isArray(raw) ? raw : [];
        if (cancelled) return;
        const filtered = list
          .map((day) => ({
            ...day,
            episodes: (day.episodes || []).filter(
              (ep) => Number(ep.season_id) === seasonId,
            ),
          }))
          .filter((day) => day.episodes.length > 0);
        setDays(filtered);
      } catch (e) {
        if (cancelToken.aborted) return;
        console.error('pgc timeline error:', e);
      } finally {
        if (!cancelled && !cancelToken.aborted) setLoading(false);
      }
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      cancelToken.abort();
      if (cancelTokenRef.current === cancelToken) cancelTokenRef.current = null;
    };
  }, [seasonId, seasonType]);

  const weekText = useCallback((dayOfWeek: number) => {
    const names = ['一', '二', '三', '四', '五', '六', '日'];
    return names[Math.max(0, dayOfWeek - 1)] || '';
  }, []);

  const content = useMemo(() => {
    if (loading) {
      return (
        <View style={styles.loading}>
          <Host matchContents><ProgressView /></Host>
        </View>
      );
    }
    if (days.length === 0) return null;
    return (
      <View style={[styles.stripCard, { backgroundColor: colors.fill2 }]}>
        <Text style={[T.subhead, styles.title, { color: colors.text }]}>播出时间表</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.daysContent}>
          {days.map((day) => (
            <View key={day.date_ts} style={[styles.dayBlock, { backgroundColor: colors.card }]}>
              <View style={styles.dayHeader}>
                <Text style={[T.caption1, styles.dayText, { color: colors.text }]}>
                  {`${day.date} ${day.is_today === 1 ? '今天' : `周${weekText(day.day_of_week)}`}`}
                </Text>
                {day.is_today === 1 ? <View style={styles.todayDot} /> : null}
              </View>
              {day.episodes.map((ep) => (
                <Press
                  key={ep.episode_id}
                  haptic
                  scaleTo={0.96}
                  onPress={() => onSelectEpId?.(ep.episode_id)}
                  style={styles.epRow}>
                  <Text style={[T.caption1, styles.epIndex, { color: ACCENT, fontWeight: '700' }]}>
                    {ep.pub_index || ep.title || '更新'}
                  </Text>
                  <Text style={[T.caption2, styles.epTime, { color: colors.textSecondary }]}>
                    {ep.pub_time || ''}
                  </Text>
                </Press>
              ))}
            </View>
          ))}
        </ScrollView>
      </View>
    );
  }, [colors, days, loading, onSelectEpId, T, weekText]);

  return <>{content}</>;
});

const styles = StyleSheet.create({
  loading: { height: 54, alignItems: 'center', justifyContent: 'center' },
  stripCard: {
    borderRadius: RADII.md,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    marginBottom: 12,
    gap: 8,
    ...continuous,
  },
  title: { fontWeight: '700' },
  daysContent: { gap: 8, paddingRight: 4 },
  dayBlock: {
    minWidth: 132,
    borderRadius: RADII.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
    ...continuous,
  },
  dayHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dayText: { fontWeight: '600' },
  todayDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: ACCENT },
  epRow: { gap: 2 },
  epIndex: {},
  epTime: {},
});
