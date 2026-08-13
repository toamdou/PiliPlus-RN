import { memo, useCallback, useEffect, useMemo, useState } from 'react';
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
import { useThemeColors } from '@/components/SwiftUIHost';
import { NativeBottomSheet } from '@/components/NativeBottomSheet';
import { BILI } from '@/theme/bili-colors';
import { RADII, continuous } from '@/theme/tokens';
import type { useType } from '@/components/type-scale';
import { formatCount, formatDuration, formatTime } from '@/utils/format';
import { VideoActionBar } from './VideoActionBar';
import { biliCover } from '@/utils/image-url';
import type { EpisodeSection, AiOutlineChapter } from '@/hooks/use-video-controller';
import {
  getMediaListBus,
  getMediaListHandlers,
} from '@/hooks/use-video-controller';
import { MediaListPanel } from './MediaListPanel';

const CARD_RADIUS = 18;

type IntroRow =
  | { kind: 'viewPointTitle' }
  | { kind: 'viewPoint'; vp: any; index: number; count: number }
  | { kind: 'relatedTitle' }
  | { kind: 'related'; v: any; index: number; count: number }
  | { kind: 'spacer' };

/* =====================================================================================
 * EpisodePanel —— 独立选集底部面板（02-2.3 episode_panel 完善）。
 * SwiftUI BottomSheet 弹层模式（detents medium/large + dragIndicator），视觉走 token。
 * 支持：
 *   - section 合集切换（ugc_season 多组时顶部 tab；单组或多 P 时不显示 tab）
 *   - 倒序播放开关（仅翻转当前分组展示顺序，不影响已加载播放源）
 *   - 当前播放集高亮（cid === currentCid）
 * 选集切换统一走 onEpisodeSelect（复用 use-video-controller 既有 switchEpisode）：
 *   - 同视频分 P → switchToCid（按 cid 定位 info.pages 索引）
 *   - 跨视频合集 → push 新视频页（N1/N2 恢复已由既有修复覆盖）
 * ===================================================================================== */
export function EpisodePanel({
  visible,
  onClose,
  sections,
  currentCid,
  onEpisodeSelect,
  colors,
  T,
}: {
  visible: boolean;
  onClose: () => void;
  sections: EpisodeSection[];
  currentCid: number;
  onEpisodeSelect: (ep: { bvid?: string; cid?: number }) => void;
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
}) {
  const [activeSection, setActiveSection] = useState(0);
  const [reversed, setReversed] = useState(false);
  // 每次打开面板重置到首分组 + 正序（对齐 Flutter didUpdateWidget 回到 initialTabIndex）
  useEffect(() => {
    if (visible) {
      queueMicrotask(() => {
        setActiveSection(0);
        setReversed(false);
      });
    }
  }, [visible]);

  const section = sections[activeSection] ?? sections[0];
  const episodes = section?.episodes ?? [];
  const displayed = reversed ? [...episodes].reverse() : episodes;
  const total = sections.reduce((n, s) => n + s.episodes.length, 0);

  const renderEpisode = useCallback(
    ({ item, index }: { item: EpisodeSection['episodes'][number]; index: number }) => {
      const isCurrent = item.cid === currentCid;
      return (
        <Press
          haptic
          scaleTo={0.97}
          onPress={() => onEpisodeSelect(item)}
          style={[styles.epRow, { borderBottomColor: colors.separator }]}>
          {/* 序号/播放指示：当前集高亮为主题色胶囊 */}
          <View
            style={[
              styles.epIndex,
              { backgroundColor: isCurrent ? colors.accent : colors.fill2 },
            ]}>
            {isCurrent ? (
              <Ionicons name="play" size={11} color="#FFFFFF" />
            ) : (
              <Text style={[T.caption2, { color: colors.textSecondary, fontWeight: '600' }]}>{index + 1}</Text>
            )}
          </View>
          <View style={styles.epInfo}>
            <Text
              style={[
                T.footnote,
                styles.epTitle,
                { color: isCurrent ? colors.accent : colors.text, fontWeight: isCurrent ? '600' : '400' },
              ]}
              numberOfLines={2}>
              {item.title}
            </Text>
            {item.duration ? (
              <Text style={[T.caption2, styles.epMeta, { color: colors.textTertiary }]}>
                {formatDuration(item.duration)}
              </Text>
            ) : null}
          </View>
          {item.play ? (
            <View style={styles.epStats}>
              <Ionicons name="play" size={10} color={colors.textTertiary} />
              <Text style={[T.caption2, { color: colors.textTertiary }]}>{formatCount(item.play)}</Text>
            </View>
          ) : null}
        </Press>
      );
    },
    [colors, T, currentCid, onEpisodeSelect],
  );

  return (
    <NativeBottomSheet
      visible={visible}
      onClose={onClose}
      detents={['medium', 'large']}
      background={colors.bg}>
      <View style={styles.epSheet}>
        {/* 顶部工具条：标题 + 倒序开关 */}
        <View style={[styles.epToolbar, { borderBottomColor: colors.separator }]}>
          <Text style={[T.subhead, styles.epToolbarTitle, { color: colors.text }]}>{`选集 (${total})`}</Text>
          <Press
            haptic
            scaleTo={0.92}
            onPress={() => setReversed(!reversed)}
            style={[styles.epReverseBtn, { backgroundColor: reversed ? colors.accent : colors.fill2 }]}>
            <Ionicons name={reversed ? 'arrow-down' : 'arrow-up'} size={12} color={reversed ? '#FFFFFF' : colors.textSecondary} />
            <Text style={[T.caption2, styles.epReverseText, { color: reversed ? '#FFFFFF' : colors.textSecondary }]}>
              {reversed ? '倒序' : '正序'}
            </Text>
          </Press>
        </View>
        {/* section 合集切换：多组时显示横向 tab（对齐 Flutter TabBar） */}
        {sections.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.epSectionTabs}>
            {sections.map((sec, i) => {
              const active = i === activeSection;
              return (
                <Press
                  key={sec.id}
                  haptic
                  scaleTo={0.92}
                  onPress={() => setActiveSection(i)}
                  style={[styles.epSectionTab, { backgroundColor: active ? colors.accent : colors.fill2 }, continuous]}>
                  <Text
                    style={[T.caption1, { color: active ? '#FFFFFF' : colors.textSecondary, fontWeight: active ? '600' : '400' }]}
                    numberOfLines={1}>
                    {sec.title}
                  </Text>
                </Press>
              );
            })}
          </ScrollView>
        ) : null}
        <FlashList
          data={displayed}
          keyExtractor={(item) => `ep-${item.cid}-${item.bvid || ''}`}
          renderItem={renderEpisode}
          contentContainerStyle={styles.epList}
          showsVerticalScrollIndicator={false}
          estimatedItemSize={56}
          windowSize={7}
          initialNumToRender={16}
          maxToRenderPerBatch={16}
          drawDistance={250}
        />
      </View>
    </NativeBottomSheet>
  );
}

const IntroHeader = memo(function IntroHeader({
  colors,
  T,
  s,
  info,
  expanded,
  onToggleExpanded,
  episodeSections,
  playableCount,
  currentCid,
  onlineCount,
  aiSummary,
  aiOutline,
  onSeekToOutline,
  onOpenEpisodePanel,
  onOpenMediaList,
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
  onOpenMember,
}: {
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
  s: any;
  info: any;
  expanded: boolean;
  onToggleExpanded: () => void;
  episodeSections: EpisodeSection[];
  playableCount: number;
  currentCid: number;
  onlineCount: string;
  aiSummary: string;
  aiOutline: AiOutlineChapter[] | null;
  onSeekToOutline: (t: number) => void;
  onOpenEpisodePanel: () => void;
  onOpenMediaList: () => void;
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
  onOpenMember: (mid: number) => void;
}) {
  return (
    <>
      <Reveal delay={0}>
        <View style={[styles.card, styles.headerCard, { backgroundColor: colors.card, shadowColor: colors.shadowColor }]}>
          <View style={styles.upRow}>
            <Press haptic scaleTo={0.96} onPress={() => onOpenMember(info?.owner.mid)} style={styles.upLeft}>
              <ExpoImage source={{ uri: biliCover(info?.owner.face || '', 96, 96) }} style={[styles.upAvatar, { backgroundColor: colors.fill2, borderColor: colors.accent }]} contentFit="cover" />
              <Text style={[T.subhead, styles.upName, { color: colors.text }]} numberOfLines={1}>{info?.owner.name}</Text>
            </Press>
            <Press
              haptic
              scaleTo={0.94}
              onPress={onFollow}
              style={[styles.followBtn, followed ? { backgroundColor: colors.fill2 } : { backgroundColor: colors.accent }]}>
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

      {s.enableAi && (aiSummary || (aiOutline && aiOutline.length > 0)) ? (
        <Reveal delay={160}>
          <View style={[styles.card, styles.headerCard, { backgroundColor: colors.card, shadowColor: colors.shadowColor }]}>
            <View style={styles.sectionHead}>
              <View style={[styles.sectionIconBox, { backgroundColor: colors.accent }]}>
                <Ionicons name="sparkles" size={15} color="#FFFFFF" />
              </View>
              <Text style={[T.subhead, styles.sectionTitle, { color: colors.text }]}>AI 总结</Text>
            </View>
            {aiSummary ? (
              <Text style={[T.subhead, styles.aiText, { color: colors.text }]}>{aiSummary}</Text>
            ) : null}
            {/* 章节大纲（02-2.3 ai_conclusion）：outline[].title + part_outline[].timestamp/content，
                点击分段跳转 seek（对齐 Flutter AiConclusionPanel.buildContent 可点击时间戳） */}
            {aiOutline && aiOutline.length > 0 ? (
              <View style={styles.aiOutline}>
                {aiOutline.map((chapter, ci) => (
                  <View key={`ai-ch-${ci}`} style={styles.aiChapter}>
                    {chapter.title ? (
                      <Text style={[T.subhead, styles.aiChapterTitle, { color: colors.text }]}>{chapter.title}</Text>
                    ) : null}
                    {chapter.parts.map((part, pi) => (
                      <Press
                        key={`ai-part-${ci}-${pi}`}
                        haptic
                        scaleTo={0.98}
                        onPress={() => onSeekToOutline(part.timestamp)}
                        style={[styles.aiPartRow, { borderBottomColor: colors.separator }]}>
                        <Text style={[T.caption1, styles.aiPartTime, { color: colors.accent, fontWeight: '600' }]}>
                          {formatDuration(part.timestamp)}
                        </Text>
                        <Text style={[T.footnote, styles.aiPartContent, { color: colors.textSecondary }]} numberOfLines={2}>
                          {part.content}
                        </Text>
                        <Ionicons name="chevron-forward" size={12} color={colors.textTertiary} />
                      </Press>
                    ))}
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        </Reveal>
      ) : null}

      {/* 选集入口（02-2.3 episode_panel）：不再内联扁平列表，点击打开独立底部面板。
          多 P / 合集 均收敛进 episodeSections（分P 组 + season 各 section 组）。 */}
      {info && episodeSections.length > 0 ? (
        <Reveal delay={220}>
          <View style={styles.cardGroup}>
            <Press
              haptic
              scaleTo={0.98}
              onPress={onOpenEpisodePanel}
              style={[styles.card, styles.episodeEntry, styles.episodeEntryTop, { backgroundColor: colors.card, shadowColor: colors.shadowColor }]}>
              <View style={styles.episodeEntryLeft}>
                <View style={[styles.sectionIconBox, { backgroundColor: colors.accent }]}>
                  <Ionicons name="albums-outline" size={15} color="#FFFFFF" />
                </View>
                <View>
                  <Text style={[T.subhead, styles.sectionTitle, { color: colors.text }]}>{`选集 (${playableCount})`}</Text>
                  <Text style={[T.caption2, styles.episodeEntrySub, { color: colors.textTertiary }]}>
                    {episodeSections.length > 1 ? `${episodeSections.length} 个合集` : '多分P'}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={15} color={colors.textTertiary} />
            </Press>
            {/* 播放列表入口（02-2.2 medialist）：合集连播队列（稍后再看由控制器 queue=1 接管） */}
            <Press
              haptic
              scaleTo={0.98}
              onPress={onOpenMediaList}
              style={[styles.card, styles.episodeEntry, styles.episodeEntryBottom, { backgroundColor: colors.card, shadowColor: colors.shadowColor }]}>
              <View style={styles.episodeEntryLeft}>
                <View style={[styles.sectionIconBox, { backgroundColor: colors.accent }]}>
                  <Ionicons name="play" size={15} color="#FFFFFF" />
                </View>
                <View>
                  <Text style={[T.subhead, styles.sectionTitle, { color: colors.text }]}>{`播放列表 (${playableCount})`}</Text>
                  <Text style={[T.caption2, styles.episodeEntrySub, { color: colors.textTertiary }]}>合集连播队列 · 当前集高亮</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={15} color={colors.textTertiary} />
            </Press>
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
  episodeSections,
  playableCount,
  currentCid,
  onlineCount,
  aiSummary,
  aiOutline,
  onSeekToOutline,
  episodePanelVisible,
  onOpenEpisodePanel,
  onCloseEpisodePanel,
  onEpisodeSelect,
  onOpenMediaList,
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
  episodeSections: EpisodeSection[];
  playableCount: number;
  currentCid: number;
  onlineCount: string;
  aiSummary: string;
  aiOutline: AiOutlineChapter[] | null;
  onSeekToOutline: (t: number) => void;
  episodePanelVisible: boolean;
  onOpenEpisodePanel: () => void;
  onCloseEpisodePanel: () => void;
  onEpisodeSelect: (ep: { bvid?: string; cid?: number }) => void;
  /** 播放列表 medialist 入口（未传时回退到模块级句柄 open，兼容 VideoScreenView 旧契约） */
  onOpenMediaList?: () => void;
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
        episodeSections={episodeSections}
        playableCount={playableCount}
        currentCid={currentCid}
        onlineCount={onlineCount}
        aiSummary={aiSummary}
        aiOutline={aiOutline}
        onSeekToOutline={onSeekToOutline}
        onOpenEpisodePanel={onOpenEpisodePanel}
        onOpenMediaList={onOpenMediaList ?? (() => getMediaListHandlers()?.open())}
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
        onOpenMember={onOpenMember}
      />
    ),
    [
      colors, T, s, info, expanded, onToggleExpanded, episodeSections, playableCount, currentCid,
      onlineCount, aiSummary, aiOutline, onSeekToOutline, onOpenEpisodePanel, onOpenMediaList, followed, onFollow,
      liked, coined, faved, onLike, onCoin, onFav, onShare, onMore, onOpenMember,
    ],
  );

  return (
    <>
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
      {/* 独立选集底部面板（SwiftUI BottomSheet，覆盖详情页底部） */}
      <EpisodePanel
        visible={episodePanelVisible}
        onClose={onCloseEpisodePanel}
        sections={episodeSections}
        currentCid={currentCid}
        onEpisodeSelect={onEpisodeSelect}
        colors={colors}
        T={T}
      />
      {/* 播放列表 medialist 队列面板（02-2.2）：总线快照 + 模块级句柄，渲染期读取保证新鲜 */}
      <MediaListPanel
        visible={getMediaListBus().visible}
        onClose={() => getMediaListHandlers()?.close()}
        queue={getMediaListBus().queue}
        title={getMediaListBus().title}
        currentBvid={getMediaListBus().currentBvid}
        currentCid={getMediaListBus().currentCid}
        currentTime={getMediaListBus().currentTime}
        duration={getMediaListBus().duration}
        onSelect={(ep) => {
          getMediaListHandlers()?.close();
          onEpisodeSelect(ep);
        }}
        onPlayNext={() => getMediaListHandlers()?.playNext()}
        onPlayPrev={() => getMediaListHandlers()?.playPrev()}
        colors={colors}
        T={T}
      />
    </>
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
  onlinePill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADII.sm },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: BILI.star },
  onlineText: { color: BILI.star, fontWeight: '600' },
  argueText: { marginTop: 10, lineHeight: 18 },
  desc: { lineHeight: 24, marginTop: 12 },
  expandRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 4 },
  expandHint: {},
  upRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  upLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  /* UP 头像品牌色描边：跟随主题色（05-B3，原 rgba(251,114,153,0.3) 硬编码） */
  upAvatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5 },
  upName: { fontWeight: '600', flex: 1 },
  /* 关注按钮：胶囊形（RADII.circle，对齐 member 空间头部关注按钮） */
  followBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 16, paddingVertical: 8, borderRadius: RADII.circle },
  followText: { fontWeight: '600' },
  blockTitle: { fontWeight: '700', marginBottom: 0, letterSpacing: -0.1 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sectionIconBox: { width: 26, height: 26, borderRadius: RADII.thumb, justifyContent: 'center', alignItems: 'center' },
  sectionTitle: { fontWeight: '700' },
  aiText: { lineHeight: 21 },
  /* AI 大纲 */
  aiOutline: { marginTop: 12 },
  aiChapter: { marginTop: 10 },
  aiChapterTitle: { fontWeight: '700', marginBottom: 4 },
  aiPartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  aiPartTime: { width: 44 },
  aiPartContent: { flex: 1, lineHeight: 18 },
  /* 选集入口（点击打开独立面板） */
  episodeEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  /* 选集 + 播放列表 双入口卡片组（02-2.3 + 02-2.2，同屏并列两行） */
  cardGroup: { gap: 10 },
  episodeEntryTop: {},
  episodeEntryBottom: {},
  episodeEntryLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  episodeEntrySub: { marginTop: 1 },
  /* EpisodePanel 弹层内容 */
  epSheet: { flex: 1 },
  epToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  epToolbarTitle: { fontWeight: '700' },
  epReverseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADII.sm,
  },
  epReverseText: { fontWeight: '600' },
  epSectionTabs: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  epSectionTab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: RADII.sm,
    maxWidth: 160,
  },
  epList: { paddingHorizontal: 20, paddingBottom: 32 },
  epRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  epIndex: {
    width: 26,
    height: 26,
    borderRadius: RADII.thumb,
    alignItems: 'center',
    justifyContent: 'center',
  },
  epInfo: { flex: 1 },
  epTitle: { lineHeight: 17 },
  epMeta: { marginTop: 2 },
  epStats: { flexDirection: 'row', alignItems: 'center', gap: 3 },
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
  /* 相关推荐封面：媒体缩略图统一 RADII.thumb（05-C1 登记 DynamicMedia 事实标准） */
  relatedCover: { width: 140, height: 88, borderRadius: RADII.thumb },
  relatedInfo: { flex: 1, justifyContent: 'center', gap: 8 },
  relatedTitle: { fontWeight: '500', lineHeight: 19 },
  relatedMeta: {},
});
