import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '@/components/SwiftUIHost';
import { IoSToggle } from '@/components/IoSToggle';
import { useType } from '@/components/type-scale';
import { Press } from '@/components/motion';
import { useSettingsStore } from '@/stores/settings';
import { RADII, continuous } from '@/theme/tokens';
import { feedBackSelection, feedBackSuccess } from '@/utils/feedback';

const COLOR_PRESETS = [
  { label: '品牌粉', value: '#FB7299' },
  { label: '默认绿', value: '#5CB67B' },
  { label: '红色', value: '#FF3B30' },
  { label: '橙色', value: '#FF9500' },
  { label: '琥珀色', value: '#FFCC00' },
  { label: '黄色', value: '#FFEB3B' },
  { label: '酸橙色', value: '#CDDC39' },
  { label: '浅绿色', value: '#8BC34A' },
  { label: '绿色', value: '#4CAF50' },
  { label: '青色', value: '#009688' },
  { label: '蓝绿色', value: '#00BCD4' },
  { label: '浅蓝色', value: '#03A9F4' },
  { label: '蓝色', value: '#2196F3' },
  { label: '靛蓝色', value: '#3F51B5' },
  { label: '紫色', value: '#9C27B0' },
  { label: '深紫色', value: '#673AB7' },
  { label: '蓝灰色', value: '#607D8B' },
  { label: '棕色', value: '#795548' },
  { label: '灰色', value: '#9E9E9E' },
] as const;

export default function ColorSelectScreen() {
  const s = useSettingsStore();
  const colors = useThemeColors();
  const T = useType();

  const selectColor = (value: string) => {
    feedBackSelection();
    s.set({ accentColor: value, enableDynamicColor: false });
    feedBackSuccess();
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Title>选择主题色</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={[styles.row, { borderBottomColor: colors.separator }]}>
            <Text style={[T.body, styles.rowLabel, { color: colors.text }]}>动态取色</Text>
            <IoSToggle
              value={s.enableDynamicColor}
              onValueChange={(v) => s.set({ enableDynamicColor: v })}
            />
          </View>
          <View style={styles.grid}>
            {COLOR_PRESETS.map((item) => {
              const selected = !s.enableDynamicColor && s.accentColor === item.value;
              return (
                <Press
                  key={item.value}
                  haptic="selection"
                  scaleTo={0.9}
                  disabled={s.enableDynamicColor}
                  onPress={() => selectColor(item.value)}
                  style={[
                    styles.swatchWrap,
                    s.enableDynamicColor && styles.swatchWrapDisabled,
                  ]}>
                  <View
                    style={[
                      styles.swatch,
                      { backgroundColor: item.value, borderColor: selected ? colors.text : colors.border },
                    ]}>
                    {selected && <Ionicons name="checkmark" size={20} color="#FFFFFF" />}
                  </View>
                  <Text
                    style={[
                      T.caption2,
                      { color: selected ? colors.text : colors.textSecondary },
                    ]}
                    numberOfLines={1}>
                    {item.label}
                  </Text>
                </Press>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  section: {
    borderRadius: RADII.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    ...continuous,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: { fontWeight: '500' },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 8,
    gap: 10,
  },
  swatchWrap: {
    width: 62,
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
  },
  swatchWrapDisabled: { opacity: 0.35 },
  swatch: {
    width: 46,
    height: 46,
    borderRadius: RADII.circle,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
