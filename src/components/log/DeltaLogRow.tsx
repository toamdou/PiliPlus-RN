import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '@/components/SwiftUIHost';
import { useType } from '@/components/type-scale';
import { RADII, continuous } from '@/theme/tokens';

interface DeltaLogItem {
  time: string;
  delta: number;
  reason: string;
}

export const DeltaLogRow = memo(function DeltaLogRow({
  item,
  index,
  icon,
  colors,
  T,
}: {
  item: DeltaLogItem;
  index: number;
  icon?: keyof typeof Ionicons.glyphMap;
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
}) {
  const positive = item.delta > 0;
  const text = positive ? `+${item.delta}` : String(item.delta);
  return (
    <View style={[styles.row, index > 0 && { borderTopColor: colors.separator, borderTopWidth: StyleSheet.hairlineWidth }]}>
      {icon ? (
        <View style={[styles.rowIcon, { backgroundColor: colors.fill2 }]}>
          <Ionicons name={icon} size={17} color={colors.textSecondary} />
        </View>
      ) : null}
      <View style={styles.rowInfo}>
        <Text style={[T.subhead, styles.rowTitle, { color: colors.text }]} numberOfLines={2}>{item.reason}</Text>
        <Text style={[T.caption2, { color: colors.textTertiary }]}>{item.time}</Text>
      </View>
      <Text style={[T.headline, styles.delta, { color: positive ? colors.success : colors.textTertiary }]}>
        {text}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 16 },
  rowIcon: { width: 34, height: 34, borderRadius: RADII.sm, justifyContent: 'center', alignItems: 'center', ...continuous },
  rowInfo: { flex: 1, gap: 3 },
  rowTitle: { fontWeight: '600' },
  delta: { fontWeight: '600' },
});
