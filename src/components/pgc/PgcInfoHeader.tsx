import { View, Text, StyleSheet } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '@/components/SwiftUIHost';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { BILI } from '@/theme/bili-colors';
import { formatCount } from '@/utils/format';
import { RADII, continuous, shadow } from '@/theme/tokens';
import type { SeasonDetail } from './pgc-types';
import { biliCover } from '@/utils/image-url';

export function PgcInfoHeader({
  detail,
  followStatus,
  liked,
  coined,
  faved,
  onToggleFollow,
  onLike,
  onCoin,
  onFav,
  onShare,
}: {
  detail: SeasonDetail;
  followStatus: number;
  liked: boolean;
  coined: boolean;
  faved: boolean;
  onToggleFollow: () => void;
  onLike: () => void;
  onCoin: () => void;
  onFav: () => void;
  onShare: () => void;
}) {
  const colors = useThemeColors();
  const T = useType();

  return (
    <View>
      {/* 资料卡（实心抬升表面）*/}
      <View style={[styles.infoCard, { backgroundColor: colors.card }, shadow('md', colors.isDark)]}>
        <ExpoImage source={{ uri: biliCover(detail.cover, 320, 420) }} style={[styles.cover, { backgroundColor: colors.fill2 }]} contentFit="cover" />
        <View style={styles.infoBody}>
          <Text style={[T.headline, styles.title, { color: colors.text }]} numberOfLines={2}>{detail.title}</Text>
          {detail.rating.score > 0 ? (
            <View style={styles.ratingRow}>
              {/* 评分星星：运营星级 token（05-B13，原 #FF9500 硬编码 → BILI.star） */}
              <Ionicons name="star" size={14} color={BILI.star} />
              <Text style={[T.subhead, styles.ratingScore]}>{detail.rating.score.toFixed(1)}</Text>
              <Text style={[T.caption2, styles.ratingCount, { color: colors.textTertiary }]}>{`(${formatCount(detail.rating.count)}人评)`}</Text>
            </View>
          ) : null}
          <Text style={[T.caption1, styles.stat, { color: colors.textSecondary }]}>
            {`${formatCount(detail.stat.follow)}人追番 · ${formatCount(detail.stat.view)}播放`}
          </Text>
          {detail.new_ep?.index_show ? (
            <View style={styles.newEpRow}>
              <View style={[styles.newEpTag, { backgroundColor: colors.accent }]}>
                <Ionicons name="sparkles" size={11} color="#FFFFFF" />
                <Text style={styles.newEpTagText}>更新</Text>
              </View>
              <Text style={[T.caption1, styles.newEpText, { color: colors.textSecondary }]} numberOfLines={1}>
                {detail.new_ep.index_show}
              </Text>
            </View>
          ) : null}
          {detail.styles.length > 0 ? (
            <View style={styles.tagRow}>
              {detail.styles.slice(0, 3).map((s) => (
                <View key={s} style={[styles.tag, { backgroundColor: colors.fill2 }]}>
                  <Text style={[styles.tagText, { color: colors.textSecondary }]}>{s}</Text>
                </View>
              ))}
            </View>
          ) : null}
          <Press
            haptic
            scaleTo={0.94}
            onPress={onToggleFollow}
            style={[styles.followBtn, followStatus > 0 ? { backgroundColor: colors.fill2 } : { backgroundColor: colors.accent }]}>
            <Ionicons name={followStatus > 0 ? 'checkmark' : 'add'} size={15} color={followStatus > 0 ? colors.textSecondary : '#FFFFFF'} />
            <Text style={[T.footnote, styles.followText, { color: followStatus > 0 ? colors.textSecondary : '#FFFFFF' }]}>
              {followStatus === 1 ? '想看' : followStatus === 2 ? '已追' : followStatus === 3 ? '已看完' : '追番'}
            </Text>
          </Press>
        </View>
      </View>

      {/* 简介卡 */}
      {detail.evaluate ? (
        <View style={[styles.sectionCard, { backgroundColor: colors.card }, shadow('md', colors.isDark)]}>
          <Text style={[T.subhead, styles.sectionTitle, { color: colors.text }]}>简介</Text>
          <Text style={[T.footnote, styles.evaluate, { color: colors.textSecondary }]}>{detail.evaluate}</Text>
        </View>
      ) : null}

      {/* 互动栏 */}
      <View style={[styles.actionBar, { backgroundColor: colors.card }, shadow('md', colors.isDark)]}>
        <Press haptic scaleTo={0.9} onPress={onLike}>
          <Ionicons name={liked ? 'heart' : 'heart-outline'} size={20} color={liked ? colors.accent : colors.textSecondary} />
        </Press>
        <Press haptic scaleTo={0.9} onPress={onCoin}>
          <Ionicons name="logo-bitcoin" size={20} color={coined ? colors.accent : colors.textSecondary} />
        </Press>
        <Press haptic scaleTo={0.9} onPress={onFav}>
          <Ionicons name={faved ? 'star' : 'star-outline'} size={20} color={faved ? BILI.star : colors.textSecondary} />
        </Press>
        <Press haptic scaleTo={0.9} onPress={onShare}>
          <Ionicons name="share-outline" size={20} color={colors.textSecondary} />
        </Press>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /* 资料卡 */
  infoCard: {
    flexDirection: 'row', gap: 14, padding: 14, borderRadius: RADII.lg, marginTop: 12,
    ...continuous,
  },
  cover: { width: 100, height: 133, borderRadius: RADII.thumb, ...continuous },
  infoBody: { flex: 1, gap: 7 },
  title: { fontWeight: '800', lineHeight: 22 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ratingScore: { fontWeight: '700', color: BILI.star },
  ratingCount: { marginLeft: 2 },
  stat: {},
  newEpRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  newEpTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: RADII.xs,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  newEpTagText: { color: '#FFFFFF', fontSize: 9.5, fontWeight: '700' },
  newEpText: { flexShrink: 1 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  /* 标签圆角收敛到 RADII.xs（05-B13，原 6 硬编码） */
  tag: { paddingHorizontal: 7, paddingVertical: 2.5, borderRadius: RADII.xs },
  tagText: { fontSize: 10.5 },
  followBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 18, paddingVertical: 8, borderRadius: RADII.card, marginTop: 2, ...continuous },
  followText: { fontWeight: '700' },
  /* 区块卡 */
  sectionCard: {
    padding: 14, borderRadius: RADII.lg, marginTop: 12, gap: 8,
    ...continuous,
  },
  sectionTitle: { fontWeight: '700' },
  evaluate: { lineHeight: 20 },
  /* 互动栏 */
  actionBar: {
    flexDirection: 'row', alignItems: 'center', gap: 24, paddingHorizontal: 18, paddingVertical: 13,
    borderRadius: RADII.lg, marginTop: 12, ...continuous,
  },
});
