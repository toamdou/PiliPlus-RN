import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { useType } from '@/components/type-scale';
import { Press } from '@/components/motion';
import { matchApi } from '@/api/match';
import { formatTime } from '@/utils/format';
import { biliCover } from '@/utils/image-url';

interface Team {
  name?: string;
  logo?: string;
}

interface MatchInfo {
  gameStage?: string;
  stime?: number;
  homeScore?: number;
  awayScore?: number;
  liveRoom?: number;
  homeTeam?: Team;
  awayTeam?: Team;
  season?: { title?: string; subTitle?: string };
  contestStatus?: number;
}

export default function MatchInfoScreen() {
  const { cid } = useLocalSearchParams<{ cid: string }>();
  const router = useRouter();
  const colors = useThemeColors();
  const T = useType();
  const [info, setInfo] = useState<MatchInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await matchApi.info({ cid: String(cid || '') });
      const d = res?.data?.data?.contest || res?.data?.data;
      if (d) {
        setInfo({
          gameStage: d.game_stage,
          stime: d.stime,
          homeScore: d.home_score,
          awayScore: d.away_score,
          liveRoom: d.live_room,
          homeTeam: d.home_team,
          awayTeam: d.away_team,
          season: d.season,
          contestStatus: d.contest_status,
        });
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, [cid]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Title large>{info?.season?.title || '赛事信息'}</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <ScrollView contentContainerStyle={styles.content}>
        {loading ? null : !info ? (
          <Text style={[T.headline, { color: colors.text, textAlign: 'center', paddingTop: 120 }]}>暂无赛事信息</Text>
        ) : (
          <>
            {info.season?.subTitle ? <Text style={[T.subhead, { color: colors.textSecondary }]}>{info.season.subTitle}</Text> : null}
            {info.gameStage ? <Text style={[T.caption1, { color: colors.textTertiary }]}>{info.gameStage}</Text> : null}
            {info.stime ? <Text style={[T.caption1, { color: colors.textTertiary }]}>{formatTime(info.stime)}</Text> : null}
            <View style={styles.scoreRow}>
              <View style={styles.team}>
                {info.homeTeam?.logo ? <ExpoImage source={{ uri: biliCover(info.homeTeam.logo, 112, 112) }} style={[styles.logo, { backgroundColor: colors.fill2 }]} contentFit="contain" /> : null}
                <Text style={[T.subhead, { color: colors.text }]} numberOfLines={2}>{info.homeTeam?.name || '主队'}</Text>
              </View>
              <Text style={[T.headline, { color: colors.text }]}>{info.homeScore ?? 0} : {info.awayScore ?? 0}</Text>
              <View style={styles.team}>
                {info.awayTeam?.logo ? <ExpoImage source={{ uri: biliCover(info.awayTeam.logo, 112, 112) }} style={[styles.logo, { backgroundColor: colors.fill2 }]} contentFit="contain" /> : null}
                <Text style={[T.subhead, { color: colors.text }]} numberOfLines={2}>{info.awayTeam?.name || '客队'}</Text>
              </View>
            </View>
            {info.liveRoom ? (
              <Press haptic scaleTo={0.94} onPress={() => router.push({ pathname: '/live/[roomId]', params: { roomId: String(info.liveRoom) } } as any)} style={[styles.liveBtn, { backgroundColor: ACCENT }]}>
                <Text style={[T.subhead, styles.liveText]}>进入直播间</Text>
              </Press>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 20, gap: 14, alignItems: 'center' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', width: '100%', marginTop: 20, gap: 12 },
  team: { flex: 1, alignItems: 'center', gap: 8 },
  logo: { width: 56, height: 56, borderRadius: 14 },
  liveBtn: { marginTop: 24, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 18 },
  liveText: { color: '#FFFFFF', fontWeight: '600' },
});
