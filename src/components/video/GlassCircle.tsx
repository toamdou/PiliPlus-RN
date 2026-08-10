import { StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Press } from '@/components/motion';
import { Glass } from '@/components/Glass';
import { useThemeColors } from '@/components/SwiftUIHost';

export type GlyphName = keyof typeof Ionicons.glyphMap;

export function GlassCircle({
  icon,
  onPress,
  colors,
  style,
}: {
  icon: GlyphName;
  onPress: () => void;
  colors: ReturnType<typeof useThemeColors>;
  style?: any;
}) {
  return (
    <Press haptic scaleTo={0.86} onPress={onPress} style={[styles.glassCircle, style]}>
      <Glass variant="prominent" style={StyleSheet.absoluteFill} />
      <Ionicons name={icon} size={19} color={colors.isDark ? '#FFFFFF' : '#111111'} />
    </Press>
  );
}

const styles = StyleSheet.create({
  glassCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
});
