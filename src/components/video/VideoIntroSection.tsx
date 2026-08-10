import { memo, useCallback, useMemo } from 'react';
import type { RefObject } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Press, Reveal } from '@/components/motion';
import { ACCENT, useThemeColors } from '@/components/SwiftUIHost';
import type { useType } from '@/components/type-scale';
import { formatCount, formatDuration, formatTime } from '@/utils/format';
import { VideoActionBar } from './VideoActionBar';
import { biliCover } from '@/utils/image-url';

const CARD_RADIUS = 18;

type IntroRow =
  | { kind: 'viewPointTitle' }
  | { kind: 'viewPoint'; vp: any; index: number; count: number }
  | { kind: 'relatedTitle' }
  | { kind: 'related'; v: any; index: number; count: number }
  | { kind: 'spacer' };

const IntroHeader = memo(function IntroHeader({
  colors,
  T,
  s,
  info,
  expanded,
  onToggleExpanded,
  seasonEpisodes,
  playableCount,
  currentCid,
  onlineCount,
  aiSummary,
  followed,
  onFollow,
  liked,
  coined,
  faved,
  onLike,
  onCoin,
  onFav,
  onShare,
  onMore,
  onPageSelect,
  onEpisodeSelect,
  onOpenMember,
}: {
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
  s: any;
  info: any;
  expanded: boolean;
  onToggleExpanded: () => void;
  seasonEpisodes: { aid: number; bvid: string; cid: number; title: string }[];
  playableCount: number;
  currentCid: number;
  onlineCount: string;
  aiSummary: string;
  followed: boolean;
  onFollow: () => void;
  liked: boolean;
  coined: boolean;
  faved: boolean;
  onLike: () => void;
  onCoin: () => void;
  onFav: () => void;
  onShare: () => void;
  onMore: () => void;
  onPageSelect: (index: number) => void;
  onEpisodeSelect: (ep: { bvid?: string; cid?: number }) => void;
  onOpenMember: (mid: number) => void;
}) {
  return (
    <>
      <Reveal delay={0}>
        <View style={[styles.card, styles.headerCard, { backgroundColor: colors.card, shadowColor: colors.shadowColor }]}>
          <View style={styles.upRow}>
            <Press haptic scaleTo={0.96} onPress={() => onOpenMember(info?.owner.mid)} style={styles.upLeft}>
              <ExpoImage source={{ uri: biliCover(info?.owner.face || '', 96, 96) }} style={[styles.upAvatar, { backgroundColor: colors.fill2 }]} contentFit="cover" />
              <Text style={[T.subhead, styles.upName, { color: colors.text }]} numberOfLines={1}>{info?.owner.name}</Text>
            </Press>
            <Press
              haptic
              scaleTo={0.94}
              onPress={onFollow}
              style={[styles.followBtn, followed ? { backgroundColor: colors.fill2 } : { backgroundColor: ACCENT }]}>
              <Ionicons name={followed ? 'checkmark' : 'add'} size={15} color={followed ? colors.textSecondary : '#FFFFFF'} />
              <Text style={[T.footnote, styles.followText, { color: followed ? colors.textSecondary : '#FFFFFF' }]}>
                {followed ? '已关注' : '关注'}
              </Text>
            </Press>
          </View>
          <Text style={[T.headline, styles.title, { color: colors.text }]}>{info?.title}</Text>
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Ionicons name="play" size={13} color={colors.textTertiary} />
              <Text style={[T.caption1, styles.metaText, { color: colors.textTertiary }]}>{formatCount(info?.stat.view || 0)}</Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="chatbox-ellipses-outline" size={12} color={colors.textTertiary} />
              <Text style={[T.caption1, styles.metaText, { color: colors.textTertiary }]}>{formatCount(info?.stat.danmaku || 0)}</Text>
            </View>
            <Text style={[T.caption1, styles.metaText, { color: colors.textTertiary }]}>{formatTime(info?.pubdate || 0)}</Text>
            {onlineCount ? (
              <View style={[styles.onlinePill, { backgroundColor: colors.fill3 }]}>
                <View style={styles.onlineDot} />
                <Text style={[T.caption2, styles.onlineText]}>{`${onlineCount}人在看`}</Text>
              </View>
            ) : null}
          </View>
          {s.showArgueMsg && info?.argue_msg ? (
            <Text style={[T.caption1, styles.argueText, { color: colors.badge }]}>{info.argue_msg}</Text>
          ) : null}
          {info?.desc ? (
            <Press haptic scaleTo={0.98} onPress={onToggleExpanded}>
              <Text style={[T.subhead, styles.desc, { color: colors.textSecondary }]} numberOfLines={expanded ? undefined : 2}>
                {info.desc}
              </Text>
              <View style={styles.expandRow}>
                <Text style={[T.caption1, styles.expandHint, { color: colors.textTertiary }]}>
                  {expanded ? '收起' : '展开简介'}
                </Text>
                <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={13} color={colors.textTertiary} />
              </View>
            </Press>
          ) : null}
        </View>
      </Reveal>

      <Reveal delay={80}>
        <VideoActionBar
          colors={colors}
          T={T}
          info={info}
          liked={liked}
          coined={coined}
          faved={faved}
          onLike={onLike}
          onCoin={onCoin}
          onFav={onFav}
          onShare={onShare}
          onMore={onMore}
        />
      </Reveal>

      {s.enableAi && aiSummary ? (
        <Reveal delay={160}>
          <View style={[styles.card, styles.headerCard, { backgroundColor: colors.card, shadowColor: colors.shadowColor }]}>
            <View style={styles.sectionHead}>
              <View style={[styles.sectionIconBox, { backgroundColor: '#5E5CE6' }]}>
                <Ionicons name="sparkles" size={15} color="#FFFFFF" />
              </View>
              <Text style={[T.subhead, styles.sectionTitle, { color: colors.text }]}>AI 总结</Text>
            </View>
            <Text style={[T.subhead, styles.aiText, { color: colors.text }]}>{aiSummary}</Text>
          </View>
        </Reveal>
      ) : null}

      {info && (info.pages.length > 1 || seasonEpisodes.length > 0) ? (
        <Reveal delay={220}>
          <View style={[styles.card, styles.headerCard, { backgroundColor: colors.card, shadowColor: colors.shadowColor }]}>
            <Text style={[T.subhead, styles.blockTitle, { color: colors.text }]}>{`选集 (${playableCount})`}</Text>
            {info.pages.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pagesRow}>
                {info.pages.slice(0, 30).map((p: any, i: number) => (
                  <Press
                    key={p.cid}
                    haptic
                    scaleTo={0.92}
                    onPress={() => onPageSelect(i)}
                    style={[styles.pageChip, p.cid === currentCid ? { backgroundColor: ACCENT } : { backgroundColor: colors.fill2 }]}>
                    <Text style={[T.subhead, styles.pageChipText, { color: p.cid === currentCid ? '#FFFFFF' : colors.textSecondary }]}>{p.page}</Text>
                  </Press>
                ))}
              </ScrollView>
            ) : null}
            {seasonEpisodes.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pagesRow}>
                {seasonEpisodes.slice(0, 30).map((ep) => (
                  <Press
                    key={ep.cid}
                    haptic
                    scaleTo={0.92}
                    onPress={() => onEpisodeSelect(ep)}
                    style={[styles.pageChip, styles.seasonChip, ep.cid === currentCid ? { backgroundColor: ACCENT } : { backgroundColor: colors.fill2 }]}>
                    <Text style={[T.subhead, styles.pageChipText, { color: ep.cid === currentCid ? '#FFFFFF' : colors.textSecondary }]} numberOfLines={1}>{ep.title}</Text>
                  </Press>
                ))}
              </ScrollView>
            ) : null}
          </View>
        </Reveal>
      ) : null}
    </>
  );
});

export function VideoIntroSection({
  colors,
  T,
  s,
  info,
  expanded,
  onToggleExpanded,
  related,
  onOpenMember,
  onOpenRelated,
  seasonEpisodes,
  playableCount,
  currentCid,
  onlineCount,
  aiSummary,
  followed,
  onFollow,
  liked,
  coined,
  faved,
  onLike,
  onCoin,
  onFav,
  onShare,
  onMore,
  onPageSelect,
  onEpisodeSelect,
  scrollRef,
  onScroll,
}: {
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
  s: any;
  info: any;
  expanded: boolean;
  onToggleExpanded: () => void;
  related: any[];
  onOpenMember: (mid: number) => void;
  onOpenRelated: (bvid: string) => void;
  seasonEpisodes: { aid: number; bvid: string; cid: number; title: string }[];
  playableCount: number;
  currentCid: number;
  onlineCount: string;
  aiSummary: string;
  followed: boolean;
  onFollow: () => void;
  liked: boolean;
  coined: boolean;
  faved: boolean;
  onLike: () => void;
  onCoin: () => void;
  onFav: () => void;
  onShare: () => void;
  onMore: () => void;
  onPageSelect: (index: number) => void;
  onEpisodeSelect: (ep: { bvid?: string; cid?: number }) => void;
  scrollRef?: RefObject<FlashListRef<any> | null>;
  onScroll?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
}) {
  const rows = useMemo<IntroRow[]>(() => {
    const out: IntroRow[] = [];
    if (s.showViewPoints && info?.view_points?.length > 0) {
      const list = info.view_points as any[];
      out.push({ kind: 'viewPointTitle' });
      list.forEach((vp, i) => out.push({ kind: 'viewPoint', vp, index: i, count: list.length }));
      out.push({ kind: 'spacer' });
    }
    if (s.showRelatedVideo && related.length > 0) {
      out.push({ kind: 'relatedTitle' });
      related.forEach((v, i) => out.push({ kind: 'related', v, index: i, count: related.length }));
    }
    return out;
  }, [info, related, s]);

  const renderItem = useCallback(
    ({ item }: { item: IntroRow }) => {
      if (item.kind === 'spacer') return <View style={styles.blockSpacer} />;
      if (item.kind === 'viewPointTitle' || item.kind === 'relatedTitle') {
        return (
          <View style={[styles.blockCard, styles.blockTop, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Text style={[T.subhead, styles.blockTitle, { color: colors.text }]}>
              {item.kind === 'viewPointTitle' ? '视频分段' : '相关推荐'}
            </Text>
          </View>
        );
      }
      if (item.kind === 'viewPoint') {
        const last = item.index === item.count - 1;
        return (
          <View
            style={[
              styles.blockCard,
              styles.blockRow,
              !last && styles.blockSeparator,
              last && styles.blockBottom,
              { backgroundColor: colors.card, borderColor: colors.cardBorder },
            ]}>
            <Ionicons name="time-outline" size={15} color={colors.textSecondary} />
            <Text style={[T.footnote, styles.viewPointTitle, { color: colors.text }]} numberOfLines={1}>{item.vp.title}</Text>
            <Text style={[T.caption1, styles.viewPointTime, { color: colors.textTertiary }]}>
              {formatDuration(item.vp.from)}
            </Text>
          </View>
        );
      }
      const last = item.index === item.count - 1;
      return (
        <Press
          haptic
          scaleTo={0.98}
          onPress={() => onOpenRelated(item.v.bvid)}
          style={[
            styles.blockCard,
            styles.blockRow,
            !last && styles.blockSeparator,
            last && styles.blockBottom,
            { backgroundColor: colors.card, borderColor: colors.cardBorder },
          ]}>
          <ExpoImage source={{ uri: biliCover(item.v.pic, 320, 200) }} recyclingKey={item.v.pic} style={[styles.relatedCover, { backgroundColor: colors.fill2 }]} contentFit="cover" />
          <View style={styles.relatedInfo}>
            <Text style={[T.subhead, styles.relatedTitle, { color: colors.text }]} numberOfLines={2}>{item.v.title}</Text>
            <Text style={[T.caption1, styles.relatedMeta, { color: colors.textTertiary }]} numberOfLines={1}>
              {`${item.v.owner?.name} · ${formatCount(item.v.stat?.view || 0)}播放`}
            </Text>
          </View>
        </Press>
      );
    },
    [colors, T, onOpenRelated],
  );

  const keyExtractor = useCallback((item: IntroRow, index: number) => {
    if (item.kind === 'spacer') return `spacer-${index}`;
    if (item.kind === 'viewPointTitle') return 'view-point-title';
    if (item.kind === 'relatedTitle') return 'related-title';
    if (item.kind === 'viewPoint') return `vp-${index}`;
    return `rel-${item.v.bvid || index}`;
  }, []);

  const header = useMemo(
    () => (
      <IntroHeader
        colors={colors}
        T={T}
        s={s}
        info={info}
        expanded={expanded}
        onToggleExpanded={onToggleExpanded}
        seasonEpisodes={seasonEpisodes}
        playableCount={playableCount}
        currentCid={currentCid}
        onlineCount={onlineCount}
        aiSummary={aiSummary}
        followed={followed}
        onFollow={onFollow}
        liked={liked}
        coined={coined}
        faved={faved}
        onLike={onLike}
        onCoin={onCoin}
        onFav={onFav}
        onShare={onShare}
        onMore={onMore}
        onPageSelect={onPageSelect}
        onEpisodeSelect={onEpisodeSelect}
        onOpenMember={onOpenMember}
      />
    ),
    [
      colors, T, s, info, expanded, onToggleExpanded, seasonEpisodes, playableCount, currentCid,
      onlineCount, aiSummary, followed, onFollow, liked, coined, faved, onLike, onCoin, onFav,
      onShare, onMore, onPageSelect, onEpisodeSelect, onOpenMember,
    ],
  );

  return (
    <FlashList
      ref={scrollRef}
      data={rows}
      keyExtractor={keyExtractor}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      onScroll={onScroll}
      scrollEventThrottle={32}
      estimatedItemSize={44}
      windowSize={9}
      initialNumToRender={12}
      maxToRenderPerBatch={16}
      drawDistance={250}
      overrideProps={{ initialDrawBatchSize: 12 }}
      ListHeaderComponent={header}
      renderItem={renderItem}
    />
  );
}

const styles = StyleSheet.create({
  scrollContent: { padding: 16, paddingBottom: 80 },
  card: {
    borderRadius: CARD_RADIUS,
    padding: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(120,120,128,0.12)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
    elevation: 2,
  },
  headerCard: { marginBottom: 16 },
  title: { fontWeight: '700', lineHeight: 25, letterSpacing: -0.2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 12, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: {},
  onlinePill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FF9500' },
  onlineText: { color: '#FF9500', fontWeight: '600' },
  argueText: { marginTop: 10, lineHeight: 18 },
  desc: { lineHeight: 24, marginTop: 12 },
  expandRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 4 },
  expandHint: {},
  upRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  upLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  upAvatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: 'rgba(251,114,153,0.3)' },
  upName: { fontWeight: '600', flex: 1 },
  followBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 18 },
  followText: { fontWeight: '600' },
  blockTitle: { fontWeight: '700', marginBottom: 0, letterSpacing: -0.1 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sectionIconBox: { width: 26, height: 26, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  sectionTitle: { fontWeight: '700' },
  aiText: { lineHeight: 21 },
  pagesRow: { gap: 8 },
  pageChip: { minWidth: 44, height: 38, borderRadius: 10, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12 },
  seasonChip: { maxWidth: 150 },
  pageChipText: { fontWeight: '600' },
  blockCard: {
    paddingHorizontal: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  blockTop: {
    paddingTop: 18,
    paddingBottom: 12,
    borderTopLeftRadius: CARD_RADIUS,
    borderTopRightRadius: CARD_RADIUS,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  blockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    borderTopWidth: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 9,
  },
  blockSeparator: {},
  blockBottom: {
    borderBottomLeftRadius: CARD_RADIUS,
    borderBottomRightRadius: CARD_RADIUS,
  },
  blockSpacer: { height: 16 },
  viewPointTitle: { flex: 1 },
  viewPointTime: {},
  relatedCover: { width: 140, height: 88, borderRadius: 12 },
  relatedInfo: { flex: 1, justifyContent: 'center', gap: 8 },
  relatedTitle: { fontWeight: '500', lineHeight: 19 },
  relatedMeta: {},
});
