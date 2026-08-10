import { StyleSheet, Text, View } from 'react-native';
import { ACCENT, type ThemeColors } from '@/components/SwiftUIHost';
import { Press } from '@/components/motion';
import { type TypeScale } from '@/components/type-scale';
import { feedBackSelection } from '@/utils/feedback';
import { RADII, continuous } from '@/theme/tokens';

export const TABS = [
  { key: 'video', label: '视频' },
  { key: 'bangumi', label: '追番' },
  { key: 'cinema', label: '追剧' },
  { key: 'article', label: '专栏' },
  { key: 'note', label: '笔记' },
  { key: 'topic', label: '话题' },
  { key: 'cheese', label: '课堂' },
  { key: 'sub', label: '订阅' },
] as const;

export type FavTabKey = typeof TABS[number]['key'];

export const TAB_INDEX: Record<string, number> = Object.fromEntries(TABS.map((t, i) => [t.key, i]));

export function FavTabs({
  tabIdx,
  onChange,
  colors,
  T,
}: {
  tabIdx: number;
  onChange: (index: number) => void;
  colors: ThemeColors;
  T: TypeScale;
}) {
  return (
    <View style={styles.tabScroll}>
      {TABS.map((t, i) => (
        <Press
          key={t.key}
          haptic
          scaleTo={0.94}
          onPress={() => { feedBackSelection(); onChange(i); }}
          style={[styles.tabChip, { backgroundColor: tabIdx === i ? ACCENT : colors.fill2 }]}>
          <Text style={[T.footnote, { color: tabIdx === i ? '#FFFFFF' : colors.textSecondary, fontWeight: tabIdx === i ? '700' : '500' }]}>
            {t.label}
          </Text>
        </Press>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  tabScroll: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  tabChip: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: RADII.circle,
    ...continuous,
  },
});
