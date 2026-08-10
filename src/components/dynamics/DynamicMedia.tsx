import { memo, useMemo } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Link } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { formatCount } from '@/utils/format';
import { openInAppBrowser } from '@/utils/feedback';
import { RADII, continuous } from '@/theme/tokens';
import {
  dynArchive,
  dynArticleImages,
  dynArticleTitle,
  dynCommon,
  dynImages,
  dynLive,
  dynMedialist,
  dynMusic,
  dynNoneTips,
  dynParagraphText,
  dynSummary,
  dynType,
  dynVote,
  dynMajor,
  type DynMediaLike,
} from './dynamic-types';
import { biliCover } from '@/utils/image-url';

export type DynamicMediaVariant = 'feed' | 'topic' | 'detail';

const NoneRow = memo(function NoneRow({
  tips,
  colors,
}: {
  tips?: string;
  colors: ReturnType<typeof useThemeColors>;
}) {
  const T = useType();
  return (
    <View style={[styles.noneRow, { backgroundColor: colors.fill3 }]}>
      <Ionicons name="eye-off-outline" size={15} color={colors.textTertiary} />
      <Text style={[T.footnote, { color: colors.textTertiary }]}>{tips || '动态已失效'}</Text>
    </View>
  );
});

const ArchiveView = memo(function ArchiveView({
  item,
  variant,
  compact,
  colors,
}: {
  item: DynMediaLike;
  variant: DynamicMediaVariant;
  compact?: boolean;
  colors: ReturnType<typeof useThemeColors>;
}) {
  const T = useType();
  const archive = dynArchive(item);
  if (!archive) return null;

  if (variant === 'detail') {
    const href = archive.bvid
      ? { pathname: '/video/[id]', params: { id: archive.bvid } }
      : archive.season_id
        ? { pathname: '/pgc/[id]', params: { id: String(archive.season_id) } }
        : null;
    const box = (
      <View style={[styles.detailArchiveBox, { backgroundColor: colors.fill3 }]}>
        <View style={styles.detailArchiveCoverWrap}>
          <ExpoImage
            source={{ uri: biliCover((archive.cover || ''), 640, 400) }}
            recyclingKey={archive.cover || ''}
            cachePolicy="memory-disk"
            style={[styles.detailArchiveCover, { backgroundColor: colors.fill2 }]}
            contentFit="cover"
          />
          <View style={styles.playIcon}>
            <Ionicons name="play" size={16} color="#FFFFFF" />
          </View>
        </View>
        <View style={styles.detailArchiveInfo}>
          <Text style={[T.subhead, styles.detailArchiveTitle, { color: colors.text }]} numberOfLines={2}>{archive.title}</Text>
          <Text style={[T.caption2, styles.detailArchiveMeta, { color: colors.textTertiary }]} numberOfLines={1}>
            {`${archive.stat?.play || ''}播放 · ${archive.duration_text || ''}`}
          </Text>
        </View>
      </View>
    );
    return href ? (
      <Link href={href as any} asChild>
        <Press haptic scaleTo={0.97}>{box}</Press>
      </Link>
    ) : box;
  }

  if (variant === 'topic') {
    return (
      <View style={[styles.topicArchiveBox, { backgroundColor: colors.fill3 }]}>
        <ExpoImage
          source={{ uri: biliCover((archive.cover || ''), 320, 200) }}
          recyclingKey={archive.cover || ''}
          cachePolicy="memory-disk"
          style={[styles.topicArchiveCover, { backgroundColor: colors.fill2 }]}
          contentFit="cover"
        />
        <View style={styles.topicArchiveInfo}>
          <Text style={[T.footnote, styles.topicArchiveTitle, { color: colors.text }]} numberOfLines={2}>{archive.title}</Text>
          <Text style={[T.caption2, { color: colors.textTertiary }]} numberOfLines={1}>
            {`${archive.stat?.play || ''}播放 · ${archive.duration_text || ''}`}
          </Text>
        </View>
      </View>
    );
  }

  if (compact) {
    return (
      <View style={[styles.feedArchiveMini, { backgroundColor: colors.fill3 }]}>
        <ExpoImage
          source={{ uri: biliCover((archive.cover || ''), 200, 120) }}
          recyclingKey={archive.cover || ''}
          cachePolicy="memory-disk"
          style={[styles.feedArchiveMiniCover, { backgroundColor: colors.fill2 }]}
          contentFit="cover"
        />
        <View style={styles.feedArchiveMiniInfo}>
          <Text style={[T.footnote, styles.feedArchiveMiniTitle, { color: colors.text }]} numberOfLines={2}>
            {archive.title}
          </Text>
          <Text style={[T.caption2, { color: colors.textTertiary }]} numberOfLines={1}>
            {`${archive.stat?.play || ''}播放 · ${archive.duration_text || ''}`}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.feedArchiveBox}>
      <ExpoImage
        source={{ uri: biliCover((archive.cover || ''), 320, 200) }}
        recyclingKey={archive.cover || ''}
        cachePolicy="memory-disk"
        style={styles.feedArchiveCoverFull}
        contentFit="cover"
      />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.55)']}
        locations={[0, 0.5, 1]}
        style={styles.feedArchiveGradient}
      />
      <View style={styles.feedArchiveInfo}>
        <Text style={[T.footnote, styles.feedArchiveTitle, { color: '#FFFFFF' }]} numberOfLines={2}>
          {archive.title}
        </Text>
        <Text style={[T.caption2, styles.feedArchiveMeta, { color: 'rgba(255,255,255,0.8)' }]} numberOfLines={1}>
          {`${archive.stat?.play || ''}播放 · ${archive.duration_text || ''}`}
        </Text>
      </View>
    </View>
  );
});

const DrawView = memo(function DrawView({
  item,
  variant,
  compact,
  colors,
}: {
  item: DynMediaLike;
  variant: DynamicMediaVariant;
  compact?: boolean;
  colors: ReturnType<typeof useThemeColors>;
}) {
  const T = useType();
  const { width: windowWidth } = useWindowDimensions();
  const images = dynImages(item);
  if (images.length === 0) return null;

  if (variant === 'topic') {
    return (
      <View style={styles.topicDraw}>
        {images.slice(0, 3).map((uri, i) => (
          <ExpoImage
            key={`${uri}-${i}`}
            source={{ uri: biliCover(uri, 240, 240) }}
            recyclingKey={uri}
            cachePolicy="memory-disk"
            style={[styles.topicDrawImg, { backgroundColor: colors.fill3 }]}
            contentFit="cover"
          />
        ))}
      </View>
    );
  }

  if (variant === 'detail') {
    const contentW = windowWidth - 32;
    const imgCell = (contentW - 12) / 3;
    if (compact) {
      return (
        <View style={styles.detailDrawMini}>
          {images.slice(0, 3).map((uri, i) => (
            <ExpoImage
              key={`${uri}-${i}`}
              source={{ uri: biliCover(uri, 240, 240) }}
              recyclingKey={uri}
              cachePolicy="memory-disk"
              style={[styles.detailDrawMiniImg, { backgroundColor: colors.fill3 }]}
              contentFit="cover"
            />
          ))}
        </View>
      );
    }
    const single = images.length === 1;
    return (
      <View style={single ? styles.detailSingleWrap : styles.detailImgGrid}>
        {images.slice(0, 9).map((uri, i) => (
          <ExpoImage
            key={`${uri}-${i}`}
            source={{ uri: biliCover(uri, 400, 400) }}
            style={single ? [styles.detailSingleImg, { backgroundColor: colors.fill2 }] : [styles.detailGridImg, { width: imgCell, height: imgCell, backgroundColor: colors.fill2 }]}
            contentFit="cover"
          />
        ))}
      </View>
    );
  }

  const feedImgSize = (windowWidth - 28 - 32 - 12) / 3;
  if (compact) {
    return (
      <View style={styles.feedDrawGridCompact}>
        {images.slice(0, 3).map((uri, i) => (
          <ExpoImage
            key={`${uri}-${i}`}
            source={{ uri: biliCover(uri, 240, 240) }}
            recyclingKey={uri}
            cachePolicy="memory-disk"
            style={[styles.feedDrawImgCompact, { backgroundColor: colors.fill3 }]}
            contentFit="cover"
          />
        ))}
      </View>
    );
  }
  const single = images.length === 1;
  return (
    <View style={single ? styles.feedDrawSingleWrap : styles.feedDrawGrid}>
      {images.slice(0, 9).map((uri, i) => (
        <ExpoImage
          key={`${uri}-${i}`}
          source={{ uri: biliCover(uri, 400, 400) }}
          recyclingKey={uri}
          cachePolicy="memory-disk"
          style={single ? styles.feedDrawSingle : [styles.feedDrawImg, { width: feedImgSize, height: feedImgSize, backgroundColor: colors.fill3 }]}
          contentFit="cover"
        />
      ))}
    </View>
  );
});

const ArticleView = memo(function ArticleView({
  item,
  variant,
  compact,
  colors,
}: {
  item: DynMediaLike;
  variant: DynamicMediaVariant;
  compact?: boolean;
  colors: ReturnType<typeof useThemeColors>;
}) {
  const T = useType();
  const title = dynArticleTitle(item) || '专栏文章';
  const images = dynArticleImages(item);
  const cover = images[0] || '';
  const summary = dynParagraphText(item) || dynSummary(item);

  if (variant === 'detail') {
    if (compact) {
      return (
        <View style={[styles.detailArticleCompact, { backgroundColor: colors.fill3 }]}>
          {cover ? (
            <ExpoImage
              source={{ uri: biliCover(cover, 240, 150) }}
              recyclingKey={cover}
              cachePolicy="memory-disk"
              style={[styles.detailArticleCompactCover, { backgroundColor: colors.fill2 }]}
              contentFit="cover"
            />
          ) : null}
          <View style={styles.detailArticleCompactBody}>
            <Text style={[T.footnote, styles.detailArticleCompactTitle, { color: colors.text }]} numberOfLines={2}>{title}</Text>
            <Text style={[T.caption2, { color: colors.textSecondary }]} numberOfLines={2}>{summary}</Text>
          </View>
        </View>
      );
    }
    return (
      <View style={[styles.detailArticleCard, { backgroundColor: colors.fill3 }]}>
        {cover ? (
          <ExpoImage
            source={{ uri: biliCover(cover, 640, 360) }}
            recyclingKey={cover}
            cachePolicy="memory-disk"
            style={[styles.detailArticleCoverFull, { backgroundColor: colors.fill2 }]}
            contentFit="cover"
          />
        ) : null}
        <View style={styles.detailArticleBody}>
          <Text style={[T.headline, styles.detailArticleTitle, { color: colors.text }]} numberOfLines={2}>{title}</Text>
          <Text style={[T.footnote, styles.detailArticleText, { color: colors.textSecondary }]} numberOfLines={5}>{summary}</Text>
        </View>
      </View>
    );
  }

  if (variant === 'topic') {
    return (
      <View style={[styles.topicArticle, { backgroundColor: colors.fill3 }]}>
        {cover ? (
          <ExpoImage
            source={{ uri: biliCover(cover, 240, 150) }}
            recyclingKey={cover}
            cachePolicy="memory-disk"
            style={[styles.topicArticleCover, { backgroundColor: colors.fill2 }]}
            contentFit="cover"
          />
        ) : null}
        <View style={styles.topicArticleInfo}>
          <Text style={[T.footnote, styles.topicArticleTitle, { color: colors.text }]} numberOfLines={2}>{title}</Text>
          <Text style={[T.caption2, { color: colors.textSecondary }]} numberOfLines={2}>{summary}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.feedArticleBox, { backgroundColor: colors.fill3 }]}>
      {cover ? (
        <ExpoImage
          source={{ uri: biliCover(cover, 240, 150) }}
          recyclingKey={cover}
          cachePolicy="memory-disk"
          style={[styles.feedArticleCover, { backgroundColor: colors.fill2 }]}
          contentFit="cover"
        />
      ) : null}
      <View style={styles.feedArticleInfo}>
        <View style={styles.tagRow}>
          <Ionicons name="document-text-outline" size={12} color={ACCENT} />
          <Text style={[T.caption2, { color: ACCENT, fontWeight: '600' }]}>专栏</Text>
        </View>
        <Text style={[T.subhead, styles.feedArticleTitle, { color: colors.text }]} numberOfLines={2}>{title}</Text>
        {summary ? (
          <Text style={[T.footnote, { color: colors.textSecondary }]} numberOfLines={compact ? 2 : 3}>{summary}</Text>
        ) : null}
      </View>
    </View>
  );
});

const LiveView = memo(function LiveView({
  item,
  variant,
  compact,
  colors,
}: {
  item: DynMediaLike;
  variant: DynamicMediaVariant;
  compact?: boolean;
  colors: ReturnType<typeof useThemeColors>;
}) {
  const T = useType();
  const live = dynLive(item);
  if (!live) return null;
  const isLive = live.liveStatus === 1;
  const box = (
    <View style={[styles.liveCard, { backgroundColor: colors.fill3 }]}>
      <ExpoImage
        source={{ uri: biliCover(live.cover, variant === 'topic' ? 240 : compact ? 160 : 320, variant === 'topic' ? 150 : compact ? 100 : 200) }}
        recyclingKey={live.cover}
        cachePolicy="memory-disk"
        style={[
          variant === 'topic' ? styles.topicLiveCover : compact ? styles.feedLiveCoverMini : styles.feedLiveCover,
          { backgroundColor: colors.fill2 },
        ]}
        contentFit="cover"
      />
      <View style={styles.liveInfo}>
        <View style={styles.liveBadgeRow}>
          <View style={[styles.liveDot, isLive ? styles.liveDotOn : null]} />
          <Text style={[T.caption2, { color: isLive ? '#FF4D6A' : colors.textTertiary, fontWeight: '600' }]}>
            {live.badge || (isLive ? '直播中' : '直播结束')}
          </Text>
        </View>
        <Text style={[variant === 'topic' ? T.footnote : T.subhead, styles.liveTitle, { color: colors.text }]} numberOfLines={2}>{live.title}</Text>
        {live.area ? <Text style={[T.caption2, { color: colors.textTertiary }]} numberOfLines={1}>{live.area}</Text> : null}
      </View>
    </View>
  );
  return variant === 'detail' ? (
    <Link href={{ pathname: '/live/[roomId]', params: { roomId: String(live.id) } }} asChild>
      <Press haptic scaleTo={0.97}>{box}</Press>
    </Link>
  ) : box;
});

const MusicView = memo(function MusicView({
  item,
  variant,
  colors,
}: {
  item: DynMediaLike;
  variant: DynamicMediaVariant;
  colors: ReturnType<typeof useThemeColors>;
}) {
  const T = useType();
  const music = dynMusic(item);
  if (!music) return null;
  const box = (
    <View style={[styles.rowCard, { backgroundColor: colors.fill3 }]}>
      <ExpoImage
        source={{ uri: biliCover((music.cover || ''), 120, 120) }}
        recyclingKey={music.cover || ''}
        cachePolicy="memory-disk"
        style={[styles.rowCover, { backgroundColor: colors.fill2 }]}
        contentFit="cover"
      />
      <View style={styles.rowInfo}>
        <View style={styles.tagRow}>
          <Ionicons name="musical-notes" size={12} color={ACCENT} />
          <Text style={[T.caption2, { color: ACCENT, fontWeight: '600' }]}>音乐</Text>
        </View>
        <Text style={[variant === 'topic' ? T.footnote : T.subhead, styles.rowTitle, { color: colors.text }]} numberOfLines={2}>{music.title || '音乐'}</Text>
        {music.label ? <Text style={[T.caption2, { color: colors.textTertiary }]} numberOfLines={1}>{music.label}</Text> : null}
      </View>
    </View>
  );
  return variant === 'detail' && music.id ? (
    <Link href={{ pathname: '/music/[id]', params: { id: String(music.id), title: music.title || '' } } as any} asChild>
      <Press haptic scaleTo={0.97}>{box}</Press>
    </Link>
  ) : box;
});

const CommonView = memo(function CommonView({
  item,
  variant,
  colors,
}: {
  item: DynMediaLike;
  variant: DynamicMediaVariant;
  colors: ReturnType<typeof useThemeColors>;
}) {
  const T = useType();
  const common = dynCommon(item);
  if (!common) return null;
  const box = (
    <View style={[styles.rowCard, { backgroundColor: colors.fill3 }]}>
      {common.cover ? (
        <ExpoImage
          source={{ uri: biliCover(common.cover, 160, 160) }}
          recyclingKey={common.cover}
          cachePolicy="memory-disk"
          style={[styles.rowCover, { backgroundColor: colors.fill2 }]}
          contentFit="cover"
        />
      ) : null}
      <View style={styles.rowInfo}>
        <Text style={[variant === 'topic' ? T.footnote : T.subhead, styles.rowTitle, { color: colors.text }]} numberOfLines={1}>
          {`${common.title_prefix || ''}${common.title || '活动卡片'}`}
        </Text>
        {common.desc ? <Text style={[T.footnote, { color: colors.textSecondary }]} numberOfLines={2}>{common.desc}</Text> : null}
      </View>
    </View>
  );
  return variant === 'detail' ? (
    <Press
      haptic
      scaleTo={0.97}
      disabled={!common.jump_url}
      onPress={() => common.jump_url ? openInAppBrowser(common.jump_url).catch(() => {}) : undefined}>
      {box}
    </Press>
  ) : box;
});

const MedialistView = memo(function MedialistView({
  item,
  variant,
  colors,
}: {
  item: DynMediaLike;
  variant: DynamicMediaVariant;
  colors: ReturnType<typeof useThemeColors>;
}) {
  const T = useType();
  const medialist = dynMedialist(item);
  if (!medialist) return null;
  const box = (
    <View style={[styles.rowCard, { backgroundColor: colors.fill3 }]}>
      <ExpoImage
        source={{ uri: biliCover((medialist.cover || ''), 160, 160) }}
        recyclingKey={medialist.cover || ''}
        cachePolicy="memory-disk"
        style={[styles.rowCover, { backgroundColor: colors.fill2 }]}
        contentFit="cover"
      />
      <View style={styles.rowInfo}>
        <Text style={[variant === 'topic' ? T.footnote : T.subhead, styles.rowTitle, { color: colors.text }]} numberOfLines={1}>
          {medialist.title || '收藏夹'}
        </Text>
        {medialist.sub_title ? <Text style={[T.footnote, { color: colors.textSecondary }]} numberOfLines={2}>{medialist.sub_title}</Text> : null}
        {medialist.badge?.text ? (
          <Text style={[T.caption2, { color: ACCENT, fontWeight: '600' }]}>{medialist.badge.text}</Text>
        ) : null}
      </View>
    </View>
  );
  return variant === 'detail' ? (
    <Press
      haptic
      scaleTo={0.97}
      disabled={!medialist.jump_url}
      onPress={() => medialist.jump_url ? openInAppBrowser(medialist.jump_url).catch(() => {}) : undefined}>
      {box}
    </Press>
  ) : box;
});

const VoteView = memo(function VoteView({
  item,
  colors,
}: {
  item: DynMediaLike;
  colors: ReturnType<typeof useThemeColors>;
}) {
  const T = useType();
  const vote = dynVote(item);
  if (!vote) return null;
  return (
    <View style={[styles.voteTeaser, { backgroundColor: colors.fill3 }]}>
      <Ionicons name="bar-chart" size={15} color={ACCENT} />
      <Text style={[T.footnote, styles.voteText, { color: colors.text }]} numberOfLines={1}>{vote.title || '投票'}</Text>
      {vote.join_num != null ? (
        <Text style={[T.caption2, { color: colors.textTertiary }]}>{formatCount(vote.join_num)}人参与</Text>
      ) : null}
    </View>
  );
});

/**
 * DynamicMedia —— 动态媒体单一分发组件。
 * feed/topic/detail 三个页面共用同一套解析，仅保留各自视觉/交互差异。
 */
export const DynamicMedia = memo(function DynamicMedia({
  item,
  variant,
  compact,
  colors,
}: {
  item: DynMediaLike;
  variant: DynamicMediaVariant;
  compact?: boolean;
  colors: ReturnType<typeof useThemeColors>;
}) {
  const major = dynMajor(item);
  const type = dynType(item);
  if (type === 'DYNAMIC_TYPE_NONE' || major?.type === 'MAJOR_TYPE_NONE') {
    return <NoneRow tips={dynNoneTips(item)} colors={colors} />;
  }
  if (type === 'DYNAMIC_TYPE_ARTICLE') {
    return <ArticleView item={item} variant={variant} compact={compact} colors={colors} />;
  }
  if (dynArchive(item)) {
    return <ArchiveView item={item} variant={variant} compact={compact} colors={colors} />;
  }
  if (dynImages(item).length > 0) {
    return <DrawView item={item} variant={variant} compact={compact} colors={colors} />;
  }
  if (dynLive(item)) {
    return <LiveView item={item} variant={variant} compact={compact} colors={colors} />;
  }
  if (dynMusic(item)) {
    return <MusicView item={item} variant={variant} colors={colors} />;
  }
  if (dynCommon(item)) {
    return <CommonView item={item} variant={variant} colors={colors} />;
  }
  if (dynMedialist(item)) {
    return <MedialistView item={item} variant={variant} colors={colors} />;
  }
  if (dynVote(item)) {
    return <VoteView item={item} colors={colors} />;
  }
  return null;
});

const styles = StyleSheet.create({
  /* 通用行卡片 */
  rowCard: { flexDirection: 'row', gap: 10, borderRadius: RADII.md, padding: 9, marginTop: 11, ...continuous },
  rowCover: { width: 54, height: 54, borderRadius: 8 },
  rowInfo: { flex: 1, justifyContent: 'center', gap: 3 },
  rowTitle: { fontWeight: '600', lineHeight: 18 },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  /* 已失效 */
  noneRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: RADII.md,
    paddingHorizontal: 11, paddingVertical: 10, marginTop: 11, ...continuous,
  },
  /* feed 归档 */
  feedArchiveBox: { borderRadius: RADII.md, overflow: 'hidden', height: 100, marginTop: 11 },
  feedArchiveCoverFull: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  feedArchiveGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 60 },
  feedArchiveInfo: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 10, gap: 3, zIndex: 2 },
  feedArchiveTitle: { fontWeight: '500' },
  feedArchiveMeta: {},
  feedArchiveMini: { flexDirection: 'row', gap: 10, borderRadius: RADII.md, padding: 8, marginTop: 8, ...continuous },
  feedArchiveMiniCover: { width: 96, height: 60, borderRadius: 8 },
  feedArchiveMiniInfo: { flex: 1, justifyContent: 'center', gap: 4 },
  feedArchiveMiniTitle: { fontWeight: '500', lineHeight: 17 },
  /* topic 归档 */
  topicArchiveBox: { flexDirection: 'row', borderRadius: RADII.md, padding: 8, gap: 10, marginTop: 10, ...continuous },
  topicArchiveCover: { width: 120, height: 72, borderRadius: 8 },
  topicArchiveInfo: { flex: 1, justifyContent: 'center', gap: 4 },
  topicArchiveTitle: { fontWeight: '500', lineHeight: 17 },
  /* detail 归档 */
  detailArchiveBox: { flexDirection: 'row', borderRadius: RADII.md, padding: 9, gap: 10, marginTop: 12, ...continuous },
  detailArchiveCoverWrap: { position: 'relative' },
  detailArchiveCover: { width: 132, height: 82, borderRadius: 8 },
  playIcon: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
  detailArchiveInfo: { flex: 1, justifyContent: 'center', gap: 7 },
  detailArchiveTitle: { fontWeight: '600', lineHeight: 19 },
  detailArchiveMeta: {},
  /* feed 图文 */
  feedDrawGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 11 },
  feedDrawImg: { borderRadius: 8 },
  feedDrawSingleWrap: { marginTop: 11 },
  feedDrawSingle: { width: 220, height: 160, borderRadius: RADII.md, ...continuous },
  feedDrawGridCompact: { flexDirection: 'row', gap: 6, marginTop: 8 },
  feedDrawImgCompact: { width: 72, height: 72, borderRadius: 8 },
  /* topic 图文 */
  topicDraw: { flexDirection: 'row', gap: 6, marginTop: 10 },
  topicDrawImg: { width: 84, height: 84, borderRadius: 8 },
  /* detail 图文 */
  detailSingleWrap: { marginTop: 12 },
  detailSingleImg: { width: 240, height: 180, borderRadius: RADII.md, ...continuous },
  detailImgGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  detailGridImg: { borderRadius: 8 },
  detailDrawMini: { flexDirection: 'row', gap: 6, marginTop: 8 },
  detailDrawMiniImg: { width: 84, height: 84, borderRadius: 8 },
  /* feed 专栏 */
  feedArticleBox: { flexDirection: 'row', gap: 10, borderRadius: RADII.md, padding: 9, marginTop: 11, ...continuous },
  feedArticleCover: { width: 110, height: 82, borderRadius: 8 },
  feedArticleInfo: { flex: 1, justifyContent: 'center', gap: 4 },
  feedArticleTitle: { fontWeight: '600', lineHeight: 19 },
  /* topic 专栏 */
  topicArticle: { flexDirection: 'row', gap: 10, borderRadius: RADII.md, padding: 8, marginTop: 10, ...continuous },
  topicArticleCover: { width: 96, height: 72, borderRadius: 8 },
  topicArticleInfo: { flex: 1, justifyContent: 'center', gap: 3 },
  topicArticleTitle: { fontWeight: '600', lineHeight: 17 },
  /* detail 专栏 */
  detailArticleCard: { borderRadius: RADII.md, marginTop: 12, overflow: 'hidden', ...continuous },
  detailArticleCoverFull: { width: '100%', height: 170 },
  detailArticleBody: { padding: 12, gap: 6 },
  detailArticleTitle: { fontWeight: '700' },
  detailArticleText: { lineHeight: 19 },
  detailArticleCompact: { flexDirection: 'row', gap: 10, borderRadius: RADII.md, padding: 9, marginTop: 8, ...continuous },
  detailArticleCompactCover: { width: 92, height: 70, borderRadius: 8 },
  detailArticleCompactBody: { flex: 1, justifyContent: 'center', gap: 3 },
  detailArticleCompactTitle: { fontWeight: '600', lineHeight: 17 },
  /* 直播 */
  liveCard: { flexDirection: 'row', gap: 10, borderRadius: RADII.md, padding: 9, marginTop: 11, ...continuous },
  feedLiveCover: { width: 116, height: 76, borderRadius: 8 },
  feedLiveCoverMini: { width: 88, height: 60, borderRadius: 8 },
  topicLiveCover: { width: 88, height: 66, borderRadius: 8 },
  liveInfo: { flex: 1, justifyContent: 'center', gap: 3 },
  liveBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  liveDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: 'rgba(120,120,128,0.4)' },
  liveDotOn: { backgroundColor: '#FF4D6A' },
  liveTitle: { fontWeight: '600', lineHeight: 18 },
  /* 投票 */
  voteTeaser: {
    flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: RADII.md,
    paddingHorizontal: 12, paddingVertical: 10, marginTop: 11, ...continuous,
  },
  voteText: { flex: 1, fontWeight: '500' },
});
