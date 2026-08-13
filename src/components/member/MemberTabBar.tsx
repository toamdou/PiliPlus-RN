import { ScrollView, StyleSheet, Text } from 'react-native';
import { Press, Reveal } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import type { MemberTab } from './types';

export const TABS: { key: MemberTab; label: string }[] = [
  { key: 'videos', label: '投稿' },
  { key: 'dynamics', label: '动态' },
  { key: 'coins', label: '投币' },
  { key: 'like', label: '喜欢' },
  { key: 'opus', label: '作品' },
  { key: 'article', label: '文章' },
  { key: 'audio', label: '音频' },
  { key: 'favorite', label: '收藏' },
  { key: 'bangumi', label: '追番' },
  { key: 'collection', label: '合集' },
  { key: 'cheese', label: '课堂' },
  { key: 'shop', label: '商店' },
  { key: 'guard', label: '舰长' },
];

interface MemberTabBarProps {
  tabs: { key: MemberTab; label: string }[];
  activeTab: MemberTab;
  onTabChange: (tab: MemberTab) => void;
}

export function MemberTabBar({ tabs, activeTab, onTabChange }: MemberTabBarProps) {
  const colors = useThemeColors();
  const T = useType();
  return (
    <Reveal delay={80}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabScroll}
        contentContainerStyle={styles.tabRow}>
        {tabs.map((t) => (
          <Press
            key={t.key}
            haptic
            scaleTo={0.92}
            onPress={() => onTabChange(t.key)}
            style={[styles.tabItem, activeTab === t.key && styles.tabItemActive]}>
            <Text
              style={[T.subhead, {
                color: activeTab === t.key ? colors.text : colors.textTertiary,
                fontWeight: activeTab === t.key ? '700' : '400',
              }]}>
              {t.label}
            </Text>
          </Press>
        ))}
      </ScrollView>
    </Reveal>
  );
}

const styles = StyleSheet.create({
  tabScroll: { marginTop: 18, marginHorizontal: -4 },
  tabRow: { flexDirection: 'row', gap: 28, paddingHorizontal: 4 },
  tabItem: { paddingBottom: 8 },
  tabItemActive: { borderBottomColor: ACCENT, borderBottomWidth: 2.5 },
});
