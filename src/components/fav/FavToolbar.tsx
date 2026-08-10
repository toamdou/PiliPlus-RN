import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ACCENT, type ThemeColors } from '@/components/SwiftUIHost';
import { Press } from '@/components/motion';
import { type TypeScale } from '@/components/type-scale';
import { RADII, continuous } from '@/theme/tokens';

export function FavToolbar({
  colors,
  T,
  onSearch,
  onCreate,
  onSort,
}: {
  colors: ThemeColors;
  T: TypeScale;
  onSearch: () => void;
  onCreate: () => void;
  onSort: () => void;
}) {
  return (
    <View style={styles.toolbar}>
      <Press haptic scaleTo={0.94} onPress={onSearch} style={[styles.toolBtn, { backgroundColor: colors.fill2 }]}>
        <Ionicons name="search" size={15} color={colors.textSecondary} />
        <Text style={[T.subhead, styles.toolBtnText, { color: colors.textSecondary, fontWeight: '600' }]}>搜索</Text>
      </Press>
      <Press haptic scaleTo={0.94} onPress={onCreate} style={[styles.toolBtn, { backgroundColor: ACCENT }]}>
        <Ionicons name="add" size={16} color="#FFFFFF" />
        <Text style={[T.subhead, styles.toolBtnText, { color: '#FFFFFF', fontWeight: '600' }]}>新建收藏夹</Text>
      </Press>
      <Press haptic scaleTo={0.94} onPress={onSort} style={[styles.toolBtn, { backgroundColor: colors.fill2 }]}>
        <Ionicons name="swap-vertical" size={15} color={colors.textSecondary} />
        <Text style={[T.subhead, styles.toolBtnText, { color: colors.textSecondary, fontWeight: '600' }]}>排序</Text>
      </Press>
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  toolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: RADII.circle,
    ...continuous,
  },
  toolBtnText: {},
});
