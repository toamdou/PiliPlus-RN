import { StyleSheet, Text, View } from 'react-native';
import { type ThemeColors } from '@/components/SwiftUIHost';
import { Press } from '@/components/motion';
import { type TypeScale } from '@/components/type-scale';
import { RADII, continuous } from '@/theme/tokens';

export function FavMultiBar({
  selectedCount,
  totalCount,
  colors,
  T,
  onSelectAll,
  onCopy,
  onMove,
  onDelete,
  onCancel,
}: {
  selectedCount: number;
  totalCount: number;
  colors: ThemeColors;
  T: TypeScale;
  onSelectAll: () => void;
  onCopy: () => void;
  onMove: () => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const hasSelection = selectedCount > 0;
  return (
    <View style={[styles.multiBar, { backgroundColor: colors.card, borderTopColor: colors.separator }]}>
      <Text style={[T.footnote, { color: colors.text, fontWeight: '600' }]}>{`已选 ${selectedCount} 项`}</Text>
      <Press
        haptic
        scaleTo={0.92}
        onPress={onSelectAll}
        style={[styles.multiBtn, { backgroundColor: colors.fill2 }]}>
        <Text style={[T.caption1, { color: colors.textSecondary }]}>全选</Text>
      </Press>
      <Press haptic scaleTo={0.92} onPress={onCopy} disabled={!hasSelection} style={[styles.multiBtn, { backgroundColor: hasSelection ? colors.fill2 : colors.fill3 }]}>
        <Text style={[T.caption1, { color: hasSelection ? colors.textSecondary : colors.textTertiary }]}>复制</Text>
      </Press>
      <Press haptic scaleTo={0.92} onPress={onMove} disabled={!hasSelection} style={[styles.multiBtn, { backgroundColor: hasSelection ? colors.fill2 : colors.fill3 }]}>
        <Text style={[T.caption1, { color: hasSelection ? colors.textSecondary : colors.textTertiary }]}>移动</Text>
      </Press>
      <Press haptic scaleTo={0.92} onPress={onDelete} disabled={!hasSelection} style={[styles.multiBtn, { backgroundColor: hasSelection ? '#FF3B30' : colors.fill3 }]}>
        <Text style={[T.caption1, { color: hasSelection ? '#FFFFFF' : colors.textTertiary }]}>删除</Text>
      </Press>
      <Press haptic scaleTo={0.92} onPress={onCancel} style={[styles.multiBtn, { backgroundColor: colors.fill2 }]}>
        <Text style={[T.caption1, { color: colors.textSecondary }]}>取消</Text>
      </Press>
    </View>
  );
}

const styles = StyleSheet.create({
  multiBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  multiBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: RADII.circle, ...continuous },
});
