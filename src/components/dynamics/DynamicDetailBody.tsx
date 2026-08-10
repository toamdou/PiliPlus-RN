import { memo, useCallback, useMemo } from 'react';
import type { RefObject } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { Link } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { Press, Reveal } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { type ReplyItem } from '@/components/CommentSection';
import { formatTime, formatCount } from '@/utils/format';
import { RADII, continuous, shadow } from '@/theme/tokens';
import { DynamicDetailMedia } from './DynamicDetailMedia';
import { DynamicVoteCard, DynamicReserveCard } from './DynamicVoteCard';
import {
  DynamicCommentRow,
  DynamicCommentCardHead,
  DynamicCommentStates,
  DynamicCommentCardFooter,
} from './DynamicComments';
import type { DynDetail, VoteInfoData, ReserveCard } from './dynamic-types';
import { biliCover } from '@/utils/image-url';

const CommentHeader = memo(function CommentHeader({
  showComments,
  commentCount,
  colors,
  T,
}: {
  showComments: boolean;
  commentCount: number;
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
}) {
  if (!showComments) return null;
  return <DynamicCommentCardHead commentCount={commentCount} colors={colors} T={T} />;
});

export function DynamicDetailBody({
  scrollRef,
  detail,
  author,
  stat,
  desc,
  orig,
  topic,
  liked,
  onLike,
  onOpenComments,
  onForward,
  onShare,
  voteInfo,
  voteLoading,
  voted,
  voteEnded,
  showVotePct,
  totalCnt,
  maxChoice,
  selections,
  voting,
  onToggleOption,
  onSubmitVote,
  reserve,
  reserveBtnText,
  reserveBtnDisabled,
  onReserve,
  showActionBar,
  showInteraction,
  showDispute,
  showComments,
  commentLoading,
  commentError,
  replies,
  commentHasMore,
  commentLoaded,
  commentCount,
  onLoadMoreComments,
  onRetryComments,
}: {
  scrollRef: RefObject<FlashListRef<any> | null>;
  detail: DynDetail;
  author: DynDetail['modules']['module_author'];
  stat: DynDetail['modules']['module_stat'];
  desc: string;
  orig: DynDetail | undefined;
  topic: { id?: number; name?: string } | undefined;
  liked: boolean;
  onLike: () => void;
  onOpenComments: () => void;
  onForward: () => void;
  onShare?: () => void;
  voteInfo: VoteInfoData | null;
  voteLoading: boolean;
  voted: boolean;
  voteEnded: boolean;
  showVotePct: boolean;
  totalCnt: number;
  maxChoice: number;
  selections: number[];
  voting: boolean;
  onToggleOption: (optIdx: number) => void;
  onSubmitVote: () => void;
  reserve: ReserveCard | null;
  reserveBtnText: string;
  reserveBtnDisabled: boolean;
  onReserve: () => void;
  showActionBar: boolean;
  showInteraction: boolean;
  showDispute: boolean;
  showComments: boolean;
  commentLoading: boolean;
  commentError: string | null;
  replies: ReplyItem[];
  commentHasMore: boolean;
  commentLoaded: boolean;
  commentCount: number;
  onLoadMoreComments: () => void;
  onRetryComments: () => void;
}) {
  const colors = useThemeColors();
  const T = useType();

  const header = useMemo(
    () => (
      <>
        {/* 作者头部 */}
        <Reveal delay={0}>
          {author ? (
            <Link href={{ pathname: '/member/[mid]', params: { mid: String(author.mid) } }} asChild>
              <Press haptic scaleTo={0.98} style={styles.authorRow}>
                <ExpoImage source={{ uri: biliCover(author.face || '', 96, 96) }} style={[styles.avatar, { backgroundColor: colors.fill2 }]} contentFit="cover" />
                <View style={styles.authorInfo}>
                  <Text style={[T.subhead, styles.authorName, { color: colors.text }]} numberOfLines={1}>{author.name}</Text>
                  <Text style={[T.caption1, styles.pubTime, { color: colors.textTertiary }]}>{formatTime(author.pub_ts || 0)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={17} color={colors.quaternaryLabel} />
              </Press>
            </Link>
          ) : null}
        </Reveal>

        {/* 内容卡片 */}
        <View style={[styles.card, { backgroundColor: colors.card, ...shadow('md', colors.isDark) }]}>
          {desc ? <Text style={[T.subhead, styles.desc, { color: colors.text }]}>{desc}</Text> : null}
          {topic?.id ? (
            <Link href={{ pathname: '/dynamics_topic/[id]', params: { id: String(topic.id) } }} asChild>
              <Press haptic scaleTo={0.96} style={[styles.topicTag, { backgroundColor: colors.fill2 }]}>
                <Ionicons name="pricetag-outline" size={13} color={colors.textSecondary} />
                <Text style={[T.caption1, styles.topicTagText, { color: colors.textSecondary }]} numberOfLines={1}>{topic.name}</Text>
                <Ionicons name="chevron-forward" size={12} color={colors.quaternaryLabel} />
              </Press>
            </Link>
          ) : null}
          {orig && detail.type === 'DYNAMIC_TYPE_FORWARD' ? (
            <View style={[styles.forwardQuote, { backgroundColor: colors.fill2 }]}>
              <View style={styles.forwardHead}>
                <Ionicons name="repeat" size={13} color={colors.textSecondary} />
                <Text style={[T.caption1, styles.forwardAuthor, { color: colors.textSecondary }]} numberOfLines={1}>
                  {orig.modules?.module_author?.name ? `@${orig.modules.module_author.name}` : '转发内容'}
                </Text>
              </View>
              {orig.modules?.module_dynamic?.desc?.text || orig.modules?.module_dynamic?.major?.opus?.summary?.text ? (
                <Text style={[T.footnote, styles.forwardDesc, { color: colors.text }]} numberOfLines={5}>
                  {orig.modules.module_dynamic?.desc?.text || orig.modules.module_dynamic?.major?.opus?.summary?.text}
                </Text>
              ) : null}
              <DynamicDetailMedia item={orig} compact />
            </View>
          ) : (
            <DynamicDetailMedia item={detail} />
          )}
        </View>

        {/* 投票卡片 */}
        {voteLoading ? null : (
          <DynamicVoteCard
            voteInfo={voteInfo}
            voted={voted}
            voteEnded={voteEnded}
            showVotePct={showVotePct}
            totalCnt={totalCnt}
            maxChoice={maxChoice}
            selections={selections}
            voting={voting}
            onToggleOption={onToggleOption}
            onSubmit={onSubmitVote}
          />
        )}

        {/* 预约卡片 */}
        <DynamicReserveCard
          reserve={reserve}
          reserveBtnText={reserveBtnText}
          reserveBtnDisabled={reserveBtnDisabled}
          onReserve={onReserve}
        />

        {/* 互动栏 */}
        {showActionBar ? (
          <View style={[styles.actionBar, { backgroundColor: colors.card, ...shadow('md', colors.isDark) }]}>
            <Press haptic scaleTo={0.9} onPress={onLike} style={styles.actionItem}>
              <Ionicons name={liked ? 'heart' : 'heart-outline'} size={20} color={liked ? ACCENT : colors.textSecondary} />
              <Text style={[T.footnote, styles.actionText, { color: liked ? ACCENT : colors.textSecondary }]}>
                {formatCount(stat?.like?.count || 0)}
              </Text>
            </Press>
            {showInteraction ? (
              <>
                <Press haptic scaleTo={0.9} onPress={onOpenComments} style={styles.actionItem}>
                  <Ionicons name="chatbubble-outline" size={18} color={colors.textSecondary} />
                  <Text style={[T.footnote, styles.actionText, { color: colors.textSecondary }]}>{formatCount(stat?.comment?.count || 0)}</Text>
                </Press>
                <Press haptic scaleTo={0.9} onPress={onForward} style={styles.actionItem}>
                  <Ionicons name="arrow-redo-outline" size={19} color={colors.textSecondary} />
                  <Text style={[T.footnote, styles.actionText, { color: colors.textSecondary }]}>{formatCount(stat?.forward?.count || 0)}</Text>
                </Press>
                {onShare ? (
                  <Press haptic scaleTo={0.9} onPress={onShare} style={styles.actionItem}>
                    <Ionicons name="share-outline" size={18} color={colors.textSecondary} />
                    <Text style={[T.footnote, styles.actionText, { color: colors.textSecondary }]}>分享</Text>
                  </Press>
                ) : null}
              </>
            ) : null}
          </View>
        ) : null}

        {/* 转发争议提示 */}
        {showDispute && detail?.type === 'DYNAMIC_TYPE_FORWARD' ? (
          <View style={[styles.disputeBox, { backgroundColor: colors.card }]}>
            <Ionicons name="alert-circle-outline" size={15} color="#FF9500" />
            <Text style={[T.caption1, styles.disputeText]}>该动态为转发内容，请注意甄别信息真实性</Text>
          </View>
        ) : null}

        <CommentHeader showComments={showComments} commentCount={commentCount} colors={colors} T={T} />
      </>
    ),
    [
      author, colors, desc, detail, liked, maxChoice, onForward, onLike, onOpenComments, onReserve,
      onShare, onToggleOption, onSubmitVote, orig, reserve, reserveBtnDisabled, reserveBtnText,
      selections, showActionBar, showComments, showDispute, showInteraction, showVotePct, stat,
      topic, totalCnt, commentCount, T, voteEnded, voteInfo, voteLoading, voted, voting,
    ],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: ReplyItem; index: number }) => (
      <DynamicCommentRow item={item} last={index < replies.length - 1} colors={colors} T={T} />
    ),
    [colors, replies.length, T],
  );

  return (
    <FlashList
      ref={scrollRef}
      data={showComments ? replies : []}
      keyExtractor={(r) => String(r.rpid)}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      estimatedItemSize={92}
      windowSize={9}
      initialNumToRender={10}
      maxToRenderPerBatch={12}
      drawDistance={250}
      overrideProps={{ initialDrawBatchSize: 10 }}
      ListHeaderComponent={header}
      ListEmptyComponent={
        showComments ? (
          <DynamicCommentStates
            loading={commentLoading}
            error={commentError}
            repliesLength={replies.length}
            colors={colors}
            T={T}
            onRetry={onRetryComments}
          />
        ) : null
      }
      ListFooterComponent={
        showComments ? (
          <DynamicCommentCardFooter
            loading={commentLoading}
            hasMore={commentHasMore}
            loaded={commentLoaded}
            repliesLength={replies.length}
            colors={colors}
            T={T}
            onLoadMore={onLoadMoreComments}
          />
        ) : null
      }
      renderItem={renderItem}
    />
  );
}

const styles = StyleSheet.create({
  scrollContent: { padding: 16, paddingBottom: 48, gap: 14 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 46, height: 46, borderRadius: 23 },
  authorInfo: { flex: 1, gap: 2 },
  authorName: { fontWeight: '600' },
  pubTime: {},
  card: { borderRadius: RADII.lg, padding: 16, ...continuous },
  desc: { lineHeight: 24 },
  topicTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: RADII.circle,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 12,
    alignSelf: 'flex-start',
    ...continuous,
  },
  topicTagText: { fontWeight: '500' },
  actionBar: { flexDirection: 'row', alignItems: 'center', gap: 30, borderRadius: RADII.lg, paddingHorizontal: 20, paddingVertical: 14, ...continuous },
  actionItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionText: { fontWeight: '600' },
  disputeBox: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: RADII.md, paddingHorizontal: 14, paddingVertical: 11, ...continuous },
  disputeText: { color: '#FF9500', flex: 1, lineHeight: 17 },
  forwardQuote: { borderRadius: RADII.md, padding: 11, marginTop: 12, gap: 6, ...continuous },
  forwardHead: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  forwardAuthor: { flex: 1, fontWeight: '500' },
  forwardDesc: { lineHeight: 18 },
});
