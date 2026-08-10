import { memo } from 'react';
import { Text, StyleSheet } from 'react-native';
import { useThemeColors } from '@/components/SwiftUIHost';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { RADII, continuous, shadow } from '@/theme/tokens';

export const MARKER_HEIGHT = 72;

export const HomeRefreshMarker = memo(function HomeRefreshMarker({
  onPress,
}: {
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const T = useType();
  return (
    <Press
      haptic
      scaleTo={0.97}
      onPress={onPress}
      style={[
        styles.refreshMarker,
        { backgroundColor: colors.card, borderColor: colors.cardBorder },
        shadow('sm', colors.isDark),
      ]}>
      <Text style={[T.subhead, { color: colors.text }]}>上次看到这里</Text>
      <Text style={[T.caption1, { color: colors.textSecondary }]}>点击刷新，换一批推荐</Text>
    </Press>
  );
});

const styles = StyleSheet.create({
  refreshMarker: {
    height: MARKER_HEIGHT,
    borderRadius: RADII.lg,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    ...continuous,
  },
});
