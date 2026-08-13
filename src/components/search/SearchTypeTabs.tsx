import { ScrollView, StyleSheet, Text as RNText, View } from 'react-native';
import { Press } from '@/components/motion';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { useType } from '@/components/type-scale';
import { RADII, continuous } from '@/theme/tokens';

export const CATEGORIES = ['综合', '视频', '番剧', '影视', '直播间', '用户', '专栏'];
export const SEARCH_TYPES = ['all', 'video', 'media_bangumi', 'media_ft', 'live_room', 'bili_user', 'article'];
export const ORDERS = ['默认排序', '播放多', '新发布', '弹幕多', '收藏多'];
export const ORDER_VALUES = ['totalrank', 'click', 'pubdate', 'dm', 'stow'];

interface SearchTypeTabsProps {
  categoryIdx: number;
  orderIdx: number;
  onCategoryChange: (idx: number) => void;
  onOrderChange: (idx: number) => void;
}

export function SearchTypeTabs({
  categoryIdx,
  orderIdx,
  onCategoryChange,
  onOrderChange,
}: SearchTypeTabsProps) {
  const colors = useThemeColors();
  const T = useType();

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoryScroll}
        contentContainerStyle={styles.categoryContent}>
        {CATEGORIES.map((c, i) => (
          <Press
            key={c}
            haptic
            scaleTo={0.94}
            onPress={() => onCategoryChange(i)}
            style={[styles.categoryTab, continuous, categoryIdx === i ? { backgroundColor: ACCENT } : { backgroundColor: colors.fill2 }]}>
            <RNText style={[T.footnote, {
              color: categoryIdx === i ? '#FFFFFF' : colors.textSecondary,
              fontWeight: categoryIdx === i ? '600' : '400',
            }]}>
              {c}
            </RNText>
          </Press>
        ))}
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.orderScroll}
        contentContainerStyle={styles.orderContent}>
        {ORDERS.map((o, i) => (
          <Press key={o} haptic scaleTo={0.94} onPress={() => onOrderChange(i)} style={styles.orderItem}>
            <RNText style={[T.footnote, {
              color: orderIdx === i ? ACCENT : colors.textSecondary,
              fontWeight: orderIdx === i ? '600' : '400',
            }]}>
              {o}
            </RNText>
            {orderIdx === i && <View style={[styles.orderDot, { backgroundColor: ACCENT }]} />}
          </Press>
        ))}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  categoryScroll: { maxHeight: 44 },
  categoryContent: { paddingHorizontal: 14, gap: 8, alignItems: 'center' },
  categoryTab: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: RADII.sm },
  orderScroll: { maxHeight: 38 },
  orderContent: { paddingHorizontal: 16, gap: 18, alignItems: 'center' },
  orderItem: { paddingVertical: 8, alignItems: 'center' },
  orderDot: { width: 4, height: 4, borderRadius: 2, marginTop: 3 },
});
