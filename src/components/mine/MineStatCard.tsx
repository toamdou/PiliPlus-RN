import { StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { type ThemeColors } from '@/components/SwiftUIHost';
import { Press, Reveal } from '@/components/motion';
import { type TypeScale } from '@/components/type-scale';
import { formatCount } from '@/utils/format';
import { RADII, shadow, continuous } from '@/theme/tokens';

export interface UserStat {
  following: number;
  follower: number;
  dynamic_count: number;
}

export function MineStatCard({
  stat,
  colors,
  T,
}: {
  stat: UserStat | null;
  colors: ThemeColors;
  T: TypeScale;
}) {
  const statItems = [
    { label: '关注', value: stat?.following || 0, href: { pathname: '/follow', params: { type: 'following' } } },
    { label: '粉丝', value: stat?.follower || 0, href: { pathname: '/follow', params: { type: 'fans' } } },
    { label: '动态', value: stat?.dynamic_count || 0, href: { pathname: '/dynamics/mine' } },
  ];
  return (
    <Reveal delay={70}>
      <View
        style={[
          styles.statCard,
          {
            backgroundColor: colors.card,
            ...shadow('md', colors.isDark),
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.cardBorder,
          },
        ]}>
        {statItems.map((s, i) => (
          <View key={s.label} style={styles.statCellWrap}>
            {i > 0 && <View style={[styles.statDivider, { backgroundColor: colors.separator }]} />}
            <Link href={s.href as any} asChild>
              <Press
                haptic
                scaleTo={0.9}
                style={styles.statCell}>
                <Text style={[T.title3, styles.statValue, { color: colors.text }]}>
                  {formatCount(s.value)}
                </Text>
                <Text style={[T.caption1, styles.statLabel, { color: colors.textSecondary }]}>{s.label}</Text>
              </Press>
            </Link>
          </View>
        ))}
      </View>
    </Reveal>
  );
}

const styles = StyleSheet.create({
  statCard: {
    flexDirection: 'row',
    borderRadius: RADII.card,
    paddingVertical: 16,
    ...continuous,
  },
  statCellWrap: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  statDivider: { width: StyleSheet.hairlineWidth, height: 30 },
  statCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 4,
  },
  statValue: { fontWeight: '700', fontVariant: ['tabular-nums'] },
  statLabel: {},
});
