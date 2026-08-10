import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { type ThemeColors } from '@/components/SwiftUIHost';
import { Press, Reveal } from '@/components/motion';
import { type TypeScale } from '@/components/type-scale';
import { RADII, shadow, continuous } from '@/theme/tokens';

export function MineAnonymousCard({
  anonymousMode,
  onToggle,
  colors,
  T,
  delay = 310,
}: {
  anonymousMode: boolean;
  onToggle: () => void;
  colors: ThemeColors;
  T: TypeScale;
  delay?: number;
}) {
  return (
    <Reveal delay={delay}>
      <Press
        haptic="medium"
        scaleTo={0.97}
        onPress={onToggle}
        style={[
          styles.logoutCard,
          {
            backgroundColor: anonymousMode
              ? (colors.isDark ? 'rgba(255,159,10,0.15)' : 'rgba(255,159,10,0.1)')
              : colors.card,
            ...shadow('md', colors.isDark),
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: anonymousMode ? '#FF9F0A' : colors.cardBorder,
          },
        ]}>
        <View style={styles.row}>
          <Ionicons
            name={anonymousMode ? 'eye-off' : 'eye'}
            size={18}
            color={anonymousMode ? '#FF9F0A' : colors.textSecondary}
          />
          <Text style={[T.subhead, { color: anonymousMode ? '#FF9F0A' : colors.text }]}>
            {anonymousMode ? '无痕模式已开启' : '无痕模式'}
          </Text>
        </View>
        <Text style={[T.caption1, styles.desc, { color: colors.textSecondary }]}>
          搜索/评论/播放记录不携带身份信息，点赞等操作不受影响
        </Text>
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  desc: { marginTop: 4 },
});
