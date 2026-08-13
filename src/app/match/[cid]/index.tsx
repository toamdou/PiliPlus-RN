/**
 * 赛事详情页（批次5 match 详情补全：事件时间线 / 阵容 / 统计）。
 *
 * 数据源仍为 /x/esports/match/info（src/api/match.ts，platform=2，无需 WBI）。
 * 该接口的 data.contest 原生字段只有：game_stage / stime / home_id / away_id /
 * home_score / away_score / live_room / season{title,logo} / home_team / away_team / contest_status。
 * ——事件时间线、阵容、统计在接口中无对应字段（03-§2.13 标注接口本身不含详情），
 * 因此本页按"防御式展示"落地：字段存在则展示对应分区，缺失时显示"该场比赛暂无更详细数据"，
 * 并在代码注释中标注接口缺口（等待 /x/esports/match/info 升级或补充详情接口）。
 */
import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { useType } from '@/components/type-scale';
import { Press } from '@/components/motion';
import { matchApi } from '@/api/match';
import { formatDate } from '@/utils/format';
import { biliCover } from '@/utils/image-url';
import { RADII, continuous, shadow } from '@/theme/tokens';
import ErrorState from '@/components/ErrorState';
import { SkeletonCard } from '@/components/Skeleton';

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
  season?: { title?: string; subTitle?: string; logo?: string };
  contestStatus?: number;
}

/** 事件时间线条目（接口暂未提供，防御式模型） */
interface TimelineEvent {
  time: number;
  text: string;
  side?: 'home' | 'away';
}

/** 阵容条目（接口暂未提供，防御式模型） */
interface RosterPlayer {
  id?: number;
  name?: string;
  role?: string;
  avatar?: string;
}

/** 统计条目（接口暂未提供，防御式模型） */
interface StatItem {
  label: string;
  home: string | number;
  away: string | number;
}

/** 接口缺口标注：/x/esports/match/info 响应字段（03-§2.13）不含以下字段，
 *  当服务端后续补充 events / lineups / stats 时可直接映射到这三个防御式分区。 */
interface ExtendedMatchInfo {
  timeline?: TimelineEvent[];
  rosters?: { home?: RosterPlayer[]; away?: RosterPlayer[] };
  stats?: StatItem[];
}

export default function MatchInfoScreen() {
  const { cid } = useLocalSearchParams<{ cid: string }>();
  const router = useRouter();
  const colors = useThemeColors();
  const T = useType();
  const [info, setInfo] = useState<MatchInfo | null>(null);
  const [ext, setExt] = useState<ExtendedMatchInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

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
        /* 接口缺口：以下字段若未来在接口中出现则自动展示（防御式映射） */
        setExt({
          timeline: Array.isArray(d.timeline) ? d.timeline : undefined,
          rosters: d.rosters || d.lineups ? { home: d.rosters?.home ?? d.lineups?.home, away: d.rosters?.away ?? d.lineups?.away } : undefined,
          stats: Array.isArray(d.stats) ? d.stats : undefined,
        });
        setError(false);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [cid]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const renderTeam = (team?: Team, name = '待定') => (
    <View style={styles.team}>
      {team?.logo ? (
        <ExpoImage
          source={{ uri: biliCover(team.logo, 112, 112) }}
          recyclingKey={team.logo}
          cachePolicy="memory-disk"
          style={[styles.logo, { backgroundColor: colors.fill2 }]}
          contentFit="contain"
        />
      ) : (
        <View style={[styles.logo, styles.logoPlaceholder, { backgroundColor: colors.fill2 }]} />
      )}
      <Text style={[T.subhead, styles.teamName, { color: colors.text }]} numberOfLines={2}>
        {team?.name || name}
      </Text>
    </View>
  );

  const hasRosters = Boolean(ext?.rosters?.home?.length || ext?.rosters?.away?.length);
  const hasStats = Boolean(ext?.stats?.length);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Title large>{info?.season?.title || '赛事信息'}</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.skeletonWrap}>
            <SkeletonCard height={140} />
            <SkeletonCard height={120} />
            <SkeletonCard height={120} />
          </View>
        ) : error || !info ? (
          <ErrorState title="暂无赛事信息" message="加载失败或该场比赛暂不可用" onRetry={load} />
        ) : (
          <>
            {/* ===== 比分头部（既有能力保留） ===== */}
            <View style={[styles.headerCard, { backgroundColor: colors.card }, continuous, shadow('sm', colors.isDark)]}>
              {info.season?.subTitle ? (
                <Text style={[T.subhead, { color: colors.textSecondary }]}>{info.season.subTitle}</Text>
              ) : null}
              {info.gameStage ? (
                <Text style={[T.caption1, { color: colors.textTertiary, marginTop: 4 }]}>{info.gameStage}</Text>
              ) : null}
              {info.stime ? (
                <Text style={[T.caption1, { color: colors.textTertiary, marginTop: 2 }]}>{formatDate(info.stime)}</Text>
              ) : null}

              <View style={styles.scoreRow}>
                {renderTeam(info.homeTeam)}
                <View style={styles.scoreBox}>
                  <Text style={[T.title1, styles.scoreText, { color: colors.text }]}>
                    {info.homeScore ?? 0} : {info.awayScore ?? 0}
                  </Text>
                  <Text style={[T.caption2, { color: colors.textTertiary }]}>
                    {info.contestStatus === 1 ? '未开始' : info.contestStatus === 3 ? '已结束' : '进行中'}
                  </Text>
                </View>
                {renderTeam(info.awayTeam)}
              </View>

              {info.liveRoom ? (
                <Press
                  haptic
                  scaleTo={0.94}
                  onPress={() => router.push({ pathname: '/live/[roomId]', params: { roomId: String(info.liveRoom) } } as any)}
                  style={[styles.liveBtn, { backgroundColor: ACCENT }]}>
                  <Text style={[T.subhead, styles.liveText]}>进入直播间</Text>
                </Press>
              ) : null}
            </View>

            {/* ===== 事件时间线（接口缺口，防御式展示） ===== */}
            <View style={[styles.sectionCard, { backgroundColor: colors.card }, continuous, shadow('sm', colors.isDark)]}>
              <Text style={[T.headline, styles.sectionTitle, { color: colors.text, fontWeight: '700' }]}>事件时间线</Text>
              {ext?.timeline?.length ? (
                <View style={styles.timeline}>
                  {ext.timeline.map((ev, i) => (
                    <View key={i} style={[styles.timelineRow, i < ext.timeline!.length - 1 && { borderBottomColor: colors.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}>
                      <Text style={[T.caption1, styles.timelineTime, { color: colors.textTertiary }]}>
                        {formatClock(ev.time)}
                      </Text>
                      <View style={[styles.timelineDot, { backgroundColor: ev.side === 'away' ? colors.textTertiary : ACCENT }]} />
                      <Text style={[T.footnote, styles.timelineText, { color: colors.text }]} numberOfLines={2}>
                        {ev.text}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={[T.footnote, styles.gapText, { color: colors.textTertiary }]}>
                  接口暂未提供事件时间线（/x/esports/match/info 无 events 字段）
                </Text>
              )}
            </View>

            {/* ===== 阵容（接口缺口，防御式展示） ===== */}
            <View style={[styles.sectionCard, { backgroundColor: colors.card }, continuous, shadow('sm', colors.isDark)]}>
              <Text style={[T.headline, styles.sectionTitle, { color: colors.text, fontWeight: '700' }]}>阵容</Text>
              {hasRosters ? (
                <View style={styles.rosterWrap}>
                  <View style={styles.rosterColumn}>
                    <Text style={[T.subhead, { color: colors.textSecondary, fontWeight: '600', marginBottom: 8 }]}>
                      {info.homeTeam?.name || '主队'}
                    </Text>
                    {(ext?.rosters?.home ?? []).map((p, i) => (
                      <View key={i} style={styles.rosterRow}>
                        {p.avatar ? (
                          <ExpoImage
                            source={{ uri: biliCover(p.avatar, 64, 64) }}
                            cachePolicy="memory-disk"
                            style={[styles.rosterAvatar, { backgroundColor: colors.fill2 }]}
                            contentFit="cover"
                          />
                        ) : (
                          <View style={[styles.rosterAvatar, styles.rosterAvatarPlaceholder, { backgroundColor: colors.fill2 }]} />
                        )}
                        <View style={{ flex: 1 }}>
                          <Text style={[T.footnote, { color: colors.text, fontWeight: '600' }]} numberOfLines={1}>{p.name || `选手${p.id ?? i + 1}`}</Text>
                          {p.role ? <Text style={[T.caption2, { color: colors.textTertiary }]} numberOfLines={1}>{p.role}</Text> : null}
                        </View>
                      </View>
                    ))}
                  </View>
                  <View style={styles.rosterColumn}>
                    <Text style={[T.subhead, { color: colors.textSecondary, fontWeight: '600', marginBottom: 8 }]}>
                      {info.awayTeam?.name || '客队'}
                    </Text>
                    {(ext?.rosters?.away ?? []).map((p, i) => (
                      <View key={i} style={styles.rosterRow}>
                        {p.avatar ? (
                          <ExpoImage
                            source={{ uri: biliCover(p.avatar, 64, 64) }}
                            cachePolicy="memory-disk"
                            style={[styles.rosterAvatar, { backgroundColor: colors.fill2 }]}
                            contentFit="cover"
                          />
                        ) : (
                          <View style={[styles.rosterAvatar, styles.rosterAvatarPlaceholder, { backgroundColor: colors.fill2 }]} />
                        )}
                        <View style={{ flex: 1 }}>
                          <Text style={[T.footnote, { color: colors.text, fontWeight: '600' }]} numberOfLines={1}>{p.name || `选手${p.id ?? i + 1}`}</Text>
                          {p.role ? <Text style={[T.caption2, { color: colors.textTertiary }]} numberOfLines={1}>{p.role}</Text> : null}
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              ) : (
                <Text style={[T.footnote, styles.gapText, { color: colors.textTertiary }]}>
                  接口暂未提供阵容数据（无 rosters/lineups 字段）
                </Text>
              )}
            </View>

            {/* ===== 数据统计（接口缺口，防御式展示） ===== */}
            <View style={[styles.sectionCard, { backgroundColor: colors.card }, continuous, shadow('sm', colors.isDark)]}>
              <Text style={[T.headline, styles.sectionTitle, { color: colors.text, fontWeight: '700' }]}>数据统计</Text>
              {hasStats ? (
                <View style={styles.statsTable}>
                  <View style={[styles.statsHead, { borderBottomColor: colors.separator }]}>
                    <Text style={[T.caption1, styles.statsCol, { color: colors.textSecondary, textAlign: 'left' }]}>
                      {info.homeTeam?.name || '主队'}
                    </Text>
                    <Text style={[T.caption1, styles.statsCol, { color: colors.textTertiary, textAlign: 'center' }]}>项目</Text>
                    <Text style={[T.caption1, styles.statsCol, { color: colors.textSecondary, textAlign: 'right' }]}>
                      {info.awayTeam?.name || '客队'}
                    </Text>
                  </View>
                  {ext?.stats?.map((s, i) => (
                    <View key={i} style={[styles.statsRow, { borderBottomColor: colors.separator }]}>
                      <Text style={[T.footnote, styles.statsCol, { color: colors.text, textAlign: 'left', fontWeight: '600' }]}>
                        {s.home}
                      </Text>
                      <Text style={[T.caption2, styles.statsCol, { color: colors.textTertiary, textAlign: 'center' }]}>
                        {s.label}
                      </Text>
                      <Text style={[T.footnote, styles.statsCol, { color: colors.text, textAlign: 'right', fontWeight: '600' }]}>
                        {s.away}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={[T.footnote, styles.gapText, { color: colors.textTertiary }]}>
                  接口暂未提供数据统计（无 stats 字段）
                </Text>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function formatClock(ts: number): string {
  if (!Number.isFinite(ts)) return '--';
  const d = new Date(ts * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 14, paddingBottom: 60, gap: 14 },
  skeletonWrap: { paddingTop: 24 },
  headerCard: { padding: 16, gap: 6 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginTop: 12, gap: 12 },
  team: { flex: 1, alignItems: 'center', gap: 8 },
  logo: { width: 56, height: 56, borderRadius: 14 },
  logoPlaceholder: { borderRadius: 14 },
  teamName: { textAlign: 'center', fontWeight: '600' },
  scoreBox: { alignItems: 'center', gap: 4 },
  scoreText: { fontWeight: '800', letterSpacing: -0.3 },
  liveBtn: { marginTop: 16, alignSelf: 'center', paddingHorizontal: 28, paddingVertical: 12, borderRadius: RADII.lg },
  liveText: { color: '#FFFFFF', fontWeight: '600' },
  sectionCard: { padding: 16 },
  sectionTitle: { marginBottom: 12, letterSpacing: -0.2 },
  gapText: { lineHeight: 20 },
  /* 时间线 */
  timeline: {},
  timelineRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  timelineTime: { width: 52, fontVariant: ['tabular-nums'] },
  timelineDot: { width: 8, height: 8, borderRadius: 4 },
  timelineText: { flex: 1 },
  /* 阵容 */
  rosterWrap: { flexDirection: 'row', gap: 20 },
  rosterColumn: { flex: 1, gap: 8 },
  rosterRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rosterAvatar: { width: 32, height: 32, borderRadius: 16 },
  rosterAvatarPlaceholder: { borderRadius: 16 },
  /* 统计 */
  statsTable: {},
  statsHead: { flexDirection: 'row', paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  statsRow: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  statsCol: { flex: 1, fontVariant: ['tabular-nums'] },
});
