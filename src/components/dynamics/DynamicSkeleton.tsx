import { View, StyleSheet } from 'react-native';
import { SkeletonCard, SkeletonRow } from '@/components/Skeleton';
import { useThemeColors } from '@/components/SwiftUIHost';
import { RADII, continuous, shadow } from '@/theme/tokens';

function DynamicSkeletonCard({ colors }: { colors: ReturnType<typeof useThemeColors> }) {
  return (
    <View style={[styles.card, { backgroundColor: colors.isDark ? 'rgba(28,28,30,0.7)' : 'rgba(255,255,255,0.7)' }, continuous, shadow('md', colors.isDark)]}>
      <SkeletonRow height={42} round />
      <View style={styles.cardBody}>
        <SkeletonCard height={90} />
      </View>
    </View>
  );
}

export function DynamicSkeleton({
  colors,
  top,
  waterfall = false,
}: {
  colors: ReturnType<typeof useThemeColors>;
  top: number;
  waterfall?: boolean;
}) {
  if (waterfall) {
    return (
      <View style={[styles.overlay, styles.overlayWaterfall, { paddingTop: top }]}>
        <View style={styles.skeletonRow}>
          <View style={styles.skeletonCol}>
            <DynamicSkeletonCard colors={colors} />
          </View>
          <View style={styles.skeletonCol}>
            <DynamicSkeletonCard colors={colors} />
          </View>
        </View>
        <View style={styles.skeletonRow}>
          <View style={styles.skeletonCol}>
            <DynamicSkeletonCard colors={colors} />
          </View>
          <View style={styles.skeletonCol}>
            <DynamicSkeletonCard colors={colors} />
          </View>
        </View>
      </View>
    );
  }
  return (
    <View style={[styles.overlay, { paddingTop: top }]}>
      <DynamicSkeletonCard colors={colors} />
      <DynamicSkeletonCard colors={colors} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: RADII.card,
    padding: 16,
    overflow: 'hidden',
  },
  cardBody: {
    marginTop: 12,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 14,
    paddingTop: 12,
    gap: 16,
  },
  overlayWaterfall: {
    gap: 12,
  },
  skeletonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  skeletonCol: {
    flex: 1,
    minWidth: 0,
  },
});
