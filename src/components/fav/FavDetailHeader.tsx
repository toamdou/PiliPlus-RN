import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ACCENT, type ThemeColors } from '@/components/SwiftUIHost';
import { Press } from '@/components/motion';
import { type TypeScale } from '@/components/type-scale';
import { RADII, continuous } from '@/theme/tokens';

export function FavDetailHeader({
  title,
  subtitle,
  selectMode,
  colors,
  T,
  onPlayAll,
  onEdit,
  onClean,
  onToggleSelect,
}: {
  title: string;
  subtitle: string;
  selectMode: boolean;
  colors: ThemeColors;
  T: TypeScale;
  onPlayAll: () => void;
  onEdit: () => void;
  onClean: () => void;
  onToggleSelect: () => void;
}) {
  return (
    <View style={styles.infoHeader}>
      <View style={styles.infoText}>
        <Text style={[T.subhead, styles.title, { color: colors.text }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[T.caption1, { color: colors.textSecondary }]}>
          {subtitle}
        </Text>
      </View>
      {!selectMode && (
        <View style={styles.headerOps}>
          <Press haptic scaleTo={0.9} onPress={onToggleSelect} style={[styles.opBtn, { backgroundColor: colors.fill2 }]}>
            <Ionicons name="checkmark-circle-outline" size={14} color={colors.textSecondary} />
          </Press>
          <Press haptic scaleTo={0.9} onPress={onPlayAll} style={[styles.opBtn, { backgroundColor: ACCENT }]}>
            <Ionicons name="play" size={13} color="#FFFFFF" />
            <Text style={[T.caption1, { color: '#FFFFFF', fontWeight: '600' }]}>播放全部</Text>
          </Press>
          <Press haptic scaleTo={0.9} onPress={onEdit} style={[styles.opBtn, { backgroundColor: colors.fill2 }]}>
            <Ionicons name="create-outline" size={14} color={colors.textSecondary} />
          </Press>
          <Press haptic scaleTo={0.9} onPress={onClean} style={[styles.opBtn, { backgroundColor: colors.fill2 }]}>
            <Ionicons name="sparkles-outline" size={14} color={colors.textSecondary} />
          </Press>
        </View>
      )}
      {selectMode && (
        <Press haptic scaleTo={0.9} onPress={onToggleSelect} style={[styles.opBtn, { backgroundColor: colors.fill2 }]}>
          <Text style={[T.caption1, { color: colors.textSecondary, fontWeight: '600' }]}>取消</Text>
        </Press>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  infoHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 8 },
  infoText: { flex: 1, gap: 3 },
  title: { fontWeight: '700' },
  headerOps: { flexDirection: 'row', gap: 6 },
  opBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADII.circle, ...continuous },
});
