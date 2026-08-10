import { StyleSheet, View } from 'react-native';
import { type ThemeColors } from '@/components/SwiftUIHost';
import { RADII, continuous } from '@/theme/tokens';
import { SkeletonMediaRow } from '@/components/Skeleton';

export function FavDetailSkeleton({ colors }: { colors: ThemeColors }) {
  return (
    <View style={[styles.card, { backgroundColor: colors.card }]}>
      <SkeletonMediaRow mediaWidth={140} mediaHeight={88} lines={3} />
      <SkeletonMediaRow mediaWidth={140} mediaHeight={88} lines={3} />
      <SkeletonMediaRow mediaWidth={140} mediaHeight={88} lines={3} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { position: 'absolute', top: 12, left: 14, right: 14, borderRadius: RADII.lg, paddingHorizontal: 16, paddingTop: 4, gap: 12, ...continuous },
});
