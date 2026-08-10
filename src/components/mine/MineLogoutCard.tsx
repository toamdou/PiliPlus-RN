import { StyleSheet, Text } from 'react-native';
import { type ThemeColors } from '@/components/SwiftUIHost';
import { Press, Reveal } from '@/components/motion';
import { type TypeScale } from '@/components/type-scale';
import { RADII, shadow, continuous } from '@/theme/tokens';

export function MineLogoutCard({
  onPress,
  colors,
  T,
}: {
  onPress: () => void;
  colors: ThemeColors;
  T: TypeScale;
}) {
  return (
    <Reveal delay={350}>
      <Press
        haptic
        scaleTo={0.97}
        onPress={onPress}
        style={[
          styles.logoutCard,
          {
            backgroundColor: colors.card,
            ...shadow('md', colors.isDark),
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.cardBorder,
          },
        ]}>
        <Text style={[T.subhead, styles.logoutText]}>退出登录</Text>
      </Press>
    </Reveal>
  );
}

const styles = StyleSheet.create({
  logoutCard: {
    borderRadius: RADII.card,
    paddingVertical: 15,
    alignItems: 'center',
    ...continuous,
  },
  logoutText: { color: '#FF3B30', fontWeight: '600' },
});
