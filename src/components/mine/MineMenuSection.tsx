import { StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { type ThemeColors } from '@/components/SwiftUIHost';
import { Press, Reveal } from '@/components/motion';
import { type TypeScale } from '@/components/type-scale';
import { RADII, shadow, continuous } from '@/theme/tokens';

type GlyphName = keyof typeof Ionicons.glyphMap;

export interface MineMenuRow {
  icon: GlyphName;
  color: string;
  label: string;
  href: { pathname: string; params?: Record<string, string> };
}

function MenuRow({
  icon,
  color,
  label,
  isLast,
  href,
  colors,
  T,
}: {
  icon: GlyphName;
  color: string;
  label: string;
  isLast: boolean;
  href: { pathname: string; params?: Record<string, string> };
  colors: ThemeColors;
  T: TypeScale;
}) {
  return (
    <Link href={href as any} asChild>
      <Press
        haptic
        scaleTo={0.98}
        style={StyleSheet.flatten([styles.menuRow, !isLast && { borderBottomColor: colors.separator, borderBottomWidth: StyleSheet.hairlineWidth }])}>
        <View style={[styles.iconBox, { backgroundColor: color }]}>
          <Ionicons name={icon} size={18} color="#FFFFFF" />
        </View>
        <Text style={[T.subhead, styles.menuLabel, { color: colors.text }]}>{label}</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.quaternaryLabel} />
      </Press>
    </Link>
  );
}

export function MineMenuSection({
  rows,
  delay = 0,
  colors,
  T,
}: {
  rows: MineMenuRow[];
  delay?: number;
  colors: ThemeColors;
  T: TypeScale;
}) {
  return (
    <Reveal delay={delay}>
      <View
        style={[
          styles.sectionCard,
          {
            backgroundColor: colors.isDark ? 'rgba(28,28,30,0.7)' : 'rgba(255,255,255,0.7)',
            ...shadow('md', colors.isDark),
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.cardBorder,
          },
        ]}>
        {rows.map((r, i) => (
          <MenuRow
            key={r.label}
            icon={r.icon}
            color={r.color}
            label={r.label}
            isLast={i === rows.length - 1}
            href={r.href}
            colors={colors}
            T={T}
          />
        ))}
      </View>
    </Reveal>
  );
}

const styles = StyleSheet.create({
  sectionCard: {
    borderRadius: RADII.card,
    paddingHorizontal: 16,
    overflow: 'hidden',
    ...continuous,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 13,
    minHeight: 50,
  },
  iconBox: {
    width: 30,
    height: 30,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuLabel: { flex: 1, fontWeight: '500' },
});
