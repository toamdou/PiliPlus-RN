import { memo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { type ReplyItem } from '@/components/CommentSection';
import { formatTime, formatCount } from '@/utils/format';
import { RADII, continuous, shadow } from '@/theme/tokens';
import { biliCover } from '@/utils/image-url';

export const DynamicCommentRow = memo(function DynamicCommentRow({
  item,
  last,
  colors,
  T,
}: {
  item: ReplyItem;
  last: boolean;
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
}) {
  return (
    <View style={[styles.commentRow, !last && { borderBottomColor: colors.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <ExpoImage
        source={{ uri: biliCover((item.member?.avatar || ''), 80, 80) }}
        recyclingKey={item.member?.avatar || ''}
        cachePolicy="memory-disk"
        style={[styles.commentAvatar, { backgroundColor: colors.fill2 }]}
        contentFit="cover"
      />
      <View style={styles.commentBody}>
        <View style={styles.commentMeta}>
          <Text style={[T.footnote, styles.commentName, { color: colors.text }]} numberOfLines={1}>
            {item.member?.uname || `用户${item.mid || ''}`}
          </Text>
          <Text style={[T.caption2, { color: colors.textTertiary }]}>{formatTime(item.ctime)}</Text>
        </View>
        <Text style={[T.footnote, styles.commentMsg, { color: colors.textSecondary }]}>{item.content?.message || ''}</Text>
        <View style={styles.commentLikeRow}>
          <Ionicons name="heart-outline" size={12} color={colors.textTertiary} />
          <Text style={[T.caption2, { color: colors.textTertiary }]}>{formatCount(item.like || 0)}</Text>
        </View>
      </View>
    </View>
  );
});

export function DynamicCommentCardHead({
  commentCount,
  colors,
  T,
}: {
  commentCount: number;
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
}) {
  return (
    <View style={[styles.commentsCardHead, { backgroundColor: colors.card, ...shadow('md', colors.isDark) }]}>
      <Ionicons name="chatbubbles-outline" size={16} color={ACCENT} />
      <Text style={[T.subhead, styles.commentsTitle, { color: colors.text }]}>评论</Text>
      <Text style={[T.caption2, { color: colors.textTertiary }]}>{formatCount(commentCount)}</Text>
    </View>
  );
}

export function DynamicCommentStates({
  loading,
  error,
  repliesLength,
  colors,
  T,
  onRetry,
}: {
  loading: boolean;
  error: string | null;
  repliesLength: number;
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
  onRetry: () => void;
}) {
  if (loading && repliesLength === 0) {
    return (
      <View style={[styles.commentsState, { backgroundColor: colors.card }]}>
        <ActivityIndicator size="small" color={colors.textTertiary} />
      </View>
    );
  }
  if (error && repliesLength === 0) {
    return (
      <View style={[styles.commentsState, { backgroundColor: colors.card }]}>
        <Ionicons name="cloud-offline-outline" size={24} color={colors.textTertiary} />
        <Text style={[T.footnote, { color: colors.textTertiary }]}>{error}</Text>
        <Press haptic scaleTo={0.95} onPress={onRetry} style={[styles.commentsRetry, { backgroundColor: colors.fill2 }]}>
          <Text style={[T.footnote, { color: ACCENT, fontWeight: '600' }]}>重试</Text>
        </Press>
      </View>
    );
  }
  return null;
}

export function DynamicCommentCardFooter({
  loading,
  hasMore,
  loaded,
  repliesLength,
  colors,
  T,
  onLoadMore,
}: {
  loading: boolean;
  hasMore: boolean;
  loaded: boolean;
  repliesLength: number;
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
  onLoadMore: () => void;
}) {
  return (
    <View style={[styles.commentsCardFoot, { backgroundColor: colors.card }]}>
      {hasMore ? (
        <Press
          haptic
          scaleTo={0.97}
          disabled={loading}
          onPress={onLoadMore}
          style={[styles.commentsMore, { backgroundColor: colors.fill2 }]}>
          <Text style={[T.footnote, { color: ACCENT, fontWeight: '600' }]}>
            {loading ? '加载中...' : '查看更多评论'}
          </Text>
        </Press>
      ) : loaded && repliesLength > 0 ? (
        <Text style={[T.caption2, styles.commentsEnd, { color: colors.textTertiary }]}>没有更多评论了</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  commentsCardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
    borderTopLeftRadius: RADII.lg,
    borderTopRightRadius: RADII.lg,
  },
  commentsTitle: { flex: 1, fontWeight: '700' },
  commentsState: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  commentsRetry: { borderRadius: RADII.md, paddingHorizontal: 20, paddingVertical: 8, ...continuous },
  commentRow: { flexDirection: 'row', gap: 10, paddingVertical: 12, paddingHorizontal: 16, backgroundColor: 'transparent' },
  commentAvatar: { width: 34, height: 34, borderRadius: 17 },
  commentBody: { flex: 1, gap: 4 },
  commentMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  commentName: { flexShrink: 1, fontWeight: '600' },
  commentMsg: { lineHeight: 19 },
  commentLikeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  commentsCardFoot: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 8,
    borderBottomLeftRadius: RADII.lg,
    borderBottomRightRadius: RADII.lg,
  },
  commentsMore: {
    alignItems: 'center',
    borderRadius: RADII.md,
    paddingVertical: 10,
    ...continuous,
  },
  commentsEnd: { textAlign: 'center', paddingTop: 12 },
});
