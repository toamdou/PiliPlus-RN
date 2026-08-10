import { useThemeColors } from '@/components/SwiftUIHost';
import type { DynDetail } from './dynamic-types';
import { DynamicMedia } from './DynamicMedia';

export function DynamicDetailMedia({ item, compact }: { item: DynDetail; compact?: boolean }) {
  const colors = useThemeColors();
  return <DynamicMedia item={item} variant="detail" compact={compact} colors={colors} />;
}
