import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '@/components/SwiftUIHost';
import { useType } from '@/components/type-scale';
import { formatCount } from '@/utils/format';
import type { DynamicItem } from './feed-types';

export function DynamicActionBar({
  stat,
  colors,
}: {
  stat: DynamicItem['modules']['module_stat'];
  colors: ReturnType<typeof useThemeColors>;
}) {
  const T = useType();
  return (
    <View style={styles.statBar}>
      <View style={styles.statItem}>
        <Ionicons name="heart-outline" size={15} color={colors.textSecondary} />
        <Text style={[T.caption1, styles.statText, { color: colors.textSecondary }]}>
          {formatCount(stat?.like?.count || 0)}
        </Text>
      </View>
      <View style={styles.statItem}>
        <Ionicons name="chatbubble-outline" size={14} color={colors.textSecondary} />
        <Text style={[T.caption1, styles.statText, { color: colors.textSecondary }]}>
          {formatCount(stat?.comment?.count || 0)}
        </Text>
      </View>
      <View style={styles.statItem}>
        <Ionicons name="arrow-redo-outline" size={15} color={colors.textSecondary} />
        <Text style={[T.caption1, styles.statText, { color: colors.textSecondary }]}>
          {formatCount(stat?.forward?.count || 0)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  statBar: {
    flexDirection: 'row',
    gap: 24,
    marginTop: 12,
    paddingTop: 2,
  },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statText: {},
});
