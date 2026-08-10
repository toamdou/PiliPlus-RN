import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Press } from '@/components/motion';
import { ACCENT, useThemeColors } from '@/components/SwiftUIHost';
import type { useType } from '@/components/type-scale';
import { formatCount } from '@/utils/format';

export function VideoActionBar({
  colors,
  T,
  info,
  liked,
  coined,
  faved,
  onLike,
  onCoin,
  onFav,
  onShare,
  onMore,
}: {
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
  info: any;
  liked: boolean;
  coined: boolean;
  faved: boolean;
  onLike: () => void;
  onCoin: () => void;
  onFav: () => void;
  onShare: () => void;
  onMore: () => void;
}) {
  return (
    <View style={[styles.actionBar, { backgroundColor: colors.card, shadowColor: colors.shadowColor }]}>
      <Press haptic scaleTo={0.92} onPress={onLike} style={styles.actionBtn}>
        <Ionicons name={liked ? 'thumbs-up' : 'thumbs-up-outline'} size={20} color={liked ? ACCENT : colors.textSecondary} />
        <Text style={[T.caption2, styles.actionCount, { color: liked ? ACCENT : colors.textTertiary }]}>
          {formatCount(info?.stat.like || 0)}
        </Text>
      </Press>
      <View style={[styles.actionDivider, { backgroundColor: colors.separator }]} />
      <Press haptic scaleTo={0.92} onPress={onCoin} style={styles.actionBtn}>
        <Ionicons name="logo-bitcoin" size={20} color={coined ? ACCENT : colors.textSecondary} />
        <Text style={[T.caption2, styles.actionCount, { color: coined ? ACCENT : colors.textTertiary }]}>
          {formatCount(info?.stat.coin || 0)}
        </Text>
      </Press>
      <View style={[styles.actionDivider, { backgroundColor: colors.separator }]} />
      <Press haptic scaleTo={0.92} onPress={onFav} style={styles.actionBtn}>
        <Ionicons name={faved ? 'star' : 'star-outline'} size={20} color={faved ? '#FF9500' : colors.textSecondary} />
        <Text style={[T.caption2, styles.actionCount, { color: faved ? '#FF9500' : colors.textTertiary }]}>
          {formatCount(info?.stat.favorite || 0)}
        </Text>
      </Press>
      <View style={[styles.actionDivider, { backgroundColor: colors.separator }]} />
      <Press haptic scaleTo={0.92} onPress={onShare} style={styles.actionBtn}>
        <Ionicons name="share-outline" size={20} color={colors.textSecondary} />
        <Text style={[T.caption2, styles.actionCount, { color: colors.textTertiary }]}>分享</Text>
      </Press>
      <View style={[styles.actionDivider, { backgroundColor: colors.separator }]} />
      <Press haptic scaleTo={0.92} onPress={onMore} style={styles.actionBtn}>
        <Ionicons name="ellipsis-horizontal-circle-outline" size={20} color={colors.textSecondary} />
        <Text style={[T.caption2, styles.actionCount, { color: colors.textTertiary }]}>更多</Text>
      </Press>
    </View>
  );
}

const styles = StyleSheet.create({
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 26,
    paddingVertical: 14,
    paddingHorizontal: 8,
    shadowColor: 'rgba(0,0,0,0.08)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
  actionItem: { flex: 1 },
  actionBtn: { alignItems: 'center', justifyContent: 'center', paddingVertical: 8, gap: 3 },
  actionCount: { fontWeight: '600' },
  actionDivider: { width: StyleSheet.hairlineWidth, height: 26 },
});
