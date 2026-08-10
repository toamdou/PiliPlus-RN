import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '@/components/SwiftUIHost';
import { useType } from '@/components/type-scale';
import { DynamicMedia } from './DynamicMedia';
import { dynArchiveFromMajor, dynLiveFromMajor, dynSummary, type DynMajor } from './dynamic-types';
import type { DynamicItem } from './feed-types';

export function getArchiveLike(major?: DynMajor) {
  return dynArchiveFromMajor(major);
}

export function getLiveInfo(major?: DynMajor) {
  return dynLiveFromMajor(major);
}

/* ===== 媒体分发（forward 引用与普通卡片共用单一 DynamicMedia） ===== */
export const DynamicMediaBlock = memo(function DynamicMediaBlock({
  item,
  compact,
  colors,
}: {
  item: DynamicItem;
  compact?: boolean;
  colors: ReturnType<typeof useThemeColors>;
}) {
  return <DynamicMedia item={item} variant="feed" compact={compact} colors={colors} />;
});

/* ===== 转发引用卡片 ===== */
export const ForwardPreview = memo(function ForwardPreview({
  orig,
  colors,
}: {
  orig: DynamicItem;
  colors: ReturnType<typeof useThemeColors>;
}) {
  const T = useType();
  const author = orig.modules?.module_author;
  const desc = dynSummary(orig);
  return (
    <View style={[styles.forwardBox, { backgroundColor: colors.fill2 }]}>
      <View style={styles.forwardHead}>
        <Ionicons name="repeat" size={13} color={colors.textSecondary} />
        <Text style={[T.caption1, styles.forwardAuthor, { color: colors.textSecondary }]} numberOfLines={1}>
          {author?.name ? `@${author.name}` : '转发内容'}
        </Text>
      </View>
      {desc ? (
        <Text style={[T.footnote, styles.forwardDesc, { color: colors.text }]} numberOfLines={4}>
          {desc}
        </Text>
      ) : null}
      <DynamicMedia item={orig} variant="feed" compact colors={colors} />
    </View>
  );
});

const styles = StyleSheet.create({
  forwardBox: {
    borderRadius: 14,
    padding: 10,
    marginTop: 11,
    gap: 6,
  },
  forwardHead: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  forwardAuthor: { flex: 1, fontWeight: '500' },
  forwardDesc: { lineHeight: 18 },
});
