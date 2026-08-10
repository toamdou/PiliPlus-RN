import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ACCENT, type ThemeColors } from '@/components/SwiftUIHost';
import { Press } from '@/components/motion';
import { type TypeScale } from '@/components/type-scale';
import { RADII, continuous } from '@/theme/tokens';

const ORDER_OPTIONS = [
  { key: 'mtime', label: '最近收藏' },
  { key: 'view', label: '播放最多' },
  { key: 'pubtime', label: '最新发布' },
] as const;

export function FavDetailControls({
  keyword,
  onKeywordChange,
  onSubmit,
  onClear,
  order,
  onChangeOrder,
  colors,
  T,
}: {
  keyword: string;
  onKeywordChange: (text: string) => void;
  onSubmit: () => void;
  onClear: () => void;
  order: string;
  onChangeOrder: (key: string) => void;
  colors: ThemeColors;
  T: TypeScale;
}) {
  return (
    <View style={styles.controls}>
      <View style={[styles.searchRow, { backgroundColor: colors.fill2 }]}>
        <Ionicons name="search" size={15} color={colors.textTertiary} />
        <TextInput
          value={keyword}
          onChangeText={onKeywordChange}
          onSubmitEditing={onSubmit}
          placeholder="搜索收藏内容"
          placeholderTextColor={colors.textTertiary}
          style={[T.footnote, styles.searchInput, { color: colors.text }]}
          returnKeyType="search"
        />
        {keyword ? (
          <Press haptic scaleTo={0.9} onPress={onClear}>
            <Ionicons name="close-circle" size={16} color={colors.textTertiary} />
          </Press>
        ) : (
          <Press haptic scaleTo={0.9} onPress={onSubmit}>
            <Ionicons name="arrow-forward-circle" size={20} color={ACCENT} />
          </Press>
        )}
      </View>
      <View style={styles.orderRow}>
        {ORDER_OPTIONS.map((o) => (
          <Press
            key={o.key}
            haptic
            scaleTo={0.94}
            onPress={() => onChangeOrder(o.key)}
            style={[styles.orderChip, { backgroundColor: order === o.key ? ACCENT : colors.fill2 }]}>
            <Text style={[T.caption1, { color: order === o.key ? '#FFFFFF' : colors.textSecondary, fontWeight: order === o.key ? '700' : '500' }]}>
              {o.label}
            </Text>
          </Press>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  controls: { gap: 8, paddingHorizontal: 14, paddingTop: 10 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 2 },
  searchInput: { flex: 1, paddingVertical: 7 },
  orderRow: { flexDirection: 'row', gap: 8 },
  orderChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADII.circle, ...continuous },
});
