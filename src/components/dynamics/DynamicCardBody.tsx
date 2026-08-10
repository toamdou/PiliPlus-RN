import { Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useThemeColors } from '@/components/SwiftUIHost';
import { useType } from '@/components/type-scale';
import { Press } from '@/components/motion';
import type { DynamicItem } from './feed-types';
import { DynamicMediaBlock, ForwardPreview } from './DynamicMediaPreview';

export function DynamicCardBody({
  item,
  colors,
  compact = false,
}: {
  item: DynamicItem;
  colors: ReturnType<typeof useThemeColors>;
  compact?: boolean;
}) {
  const T = useType();
  const router = useRouter();
  const dynamic = item.modules?.module_dynamic;
  const major = dynamic?.major;
  const desc = dynamic?.desc?.text || major?.opus?.summary?.text || major?.opus?.title || '';
  const isForward = item.type === 'DYNAMIC_TYPE_FORWARD';
  const match = (dynamic?.additional as any)?.match;
  const matchInfo = match?.match_info;
  const jumpUrl = match?.jump_url || '';
  const matchCid = /cid=(\d+)/.exec(jumpUrl)?.[1] || /\/match\/(\d+)/.exec(jumpUrl)?.[1];
  return (
    <>
      {desc ? (
        <Text style={[T.subhead, styles.desc, { color: colors.text }]} numberOfLines={compact ? 3 : 5}>
          {desc}
        </Text>
      ) : null}
      {matchInfo?.title && matchCid ? (
        <Press
          haptic
          scaleTo={0.96}
          onPress={() => router.push(`/match/${matchCid}` as any)}
          style={[styles.matchCard, { backgroundColor: colors.fill2 }]}>
          <Text style={[T.caption1, { color: colors.text }]} numberOfLines={2}>{matchInfo.title}</Text>
          <Text style={[T.caption2, { color: colors.textTertiary }]}>查看赛事</Text>
        </Press>
      ) : null}
      {isForward && item.orig ? (
        <ForwardPreview orig={item.orig} colors={colors} />
      ) : (
        <DynamicMediaBlock item={item} colors={colors} compact={compact} />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  desc: { marginTop: 11 },
  matchCard: { marginTop: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, gap: 3 },
});
