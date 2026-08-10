import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GestureHandlerRootView, ScrollView as RNGHScrollView } from 'react-native-gesture-handler';
import { Host, BottomSheet, Group, RNHostView } from '@expo/ui/swift-ui';
import { presentationDetents, presentationDragIndicator } from '@expo/ui/swift-ui/modifiers';
import Animated from 'react-native-reanimated';
import { ACCENT, useThemeColors } from '@/components/SwiftUIHost';
import { Press } from '@/components/motion';
import * as Clipboard from 'expo-clipboard';
import { showToast } from '@/utils/toast';
import { useType } from '@/components/type-scale';
import { formatCount, normalizeHttpUrl } from '@/utils/format';
import { useSettingsStore } from '@/stores/settings';
import { continuous, shadow } from '@/theme/tokens';
import { CommentSection } from '@/components/CommentSection';
import { usePlayerStore } from '@/stores/player';
import { releaseAudioPlayer } from '@/utils/audio-player';
import { PlayerSettingsSheet } from '@/components/PlayerSettingsSheet';
import { ImageViewer } from '@/components/ImageViewer';
import { ReplyDetailSheet } from '@/components/ReplyDetailSheet';
import { PlayerTimeProvider, TimeAwareCollapsedPlayerBar } from './PlayerTimeProvider';
import { VideoPlayerStage } from './VideoPlayerStage';
import { VideoIntroSection } from './VideoIntroSection';
import { fetchSubtitleJson, type VideoController } from '@/hooks/use-video-controller';

export function VideoScreenView({ controller }: { controller: VideoController }) {
  const {
  s,
  loading,
  info,
  player,
  videoViewRef,
  timeControlRef,
  insets,
  winW,
  router,
  playUrl,
  videoStarted,
  setVideoStarted,
  audioMode,
  activeTab,
  currentCid,
  seasonEpisodes,
  playableCount,
  playerBaseHeight,
  playerCollapseStyle,
  collapseBlurStyle,
  playerCollapsed,
  setPlayerCollapsed,
  playerCollapsedRef,
  progressRatio,
  trackWidthSV,
  durationSV,
  isScrubbingRef,
  progressFillStyle,
  progressThumbStyle,
  progressTrackAnimStyle,
  scrubGesture,
  showSeekThumb,
  seekThumbnails,
  controlsShown,
  controlsAnimStyle,
  pokeControls,
  boostBadgeStyle,
  playerGestures,
  playerWidthSV,
  seekHudAnimStyle,
  seekHudTarget,
  seekHudDelta,
  gestureHud,
  gestureHudAnimStyle,
  isPlaying,
  dmVisible,
  setDmVisible,
  dmDensity,
  dmInputVisible,
  setDmInputVisible,
  dmText,
  setDmText,
  settingsVisible,
  setSettingsVisible,
  playSpeed,
  subtitleData,
  setSubtitleData,
  subtitleVisible,
  setSubtitleVisible,
  qualityList,
  currentQn,
  expanded,
  setExpanded,
  related,
  liked,
  coined,
  faved,
  followed,
  onlineCount,
  aiSummary,
  handleLike,
  handleCoin,
  handleFav,
  handleFollow,
  handleShare,
  handleListenVideo,
  sendDanmaku,
  changeQuality,
  seekToTime,
  changePlaySpeed,
  changeVolume,
  loadVideo,
  enterFullscreen,
  showMoreMenu,
  showViewPointsMenu,
  switchPage,
  switchEpisode,
  switchTab,
  handleTabScroll,
  handleCommentScroll,
  tabIndicatorAnimStyle,
  tabPagerRef,
  handlePagerScrollEnd,
  tabScrollRef,
  commentScrollRef,
  handleDmDensityChange,
  replies,
  expandedReplies,
  hasMoreReplies,
  commentsLoaded,
  commentsError,
  commentsLoadingMore,
  commentSort,
  copyDialog,
  setCopyDialog,
  viewerImages,
  viewerIdx,
  viewerVisible,
  setViewerVisible,
  replyDetail,
  setReplyDetail,
  loadMoreReplies,
  preloadSubReplies,
  toggleSubReplies,
  fillSubReplies,
  changeCommentSort,
  openCommentViewer,
  openReplyDetail,
  handleReplyLongPress,
  retryComments,
  steinChoices,
  showStein,
  handleSteinChoice
  } = controller;
  const darkVideoPage = useSettingsStore((s) => s.darkVideoPage);
  const globalDanmakuEnabled = useSettingsStore((s) => s.danmakuEnabled);
  const colors = useThemeColors(darkVideoPage || undefined);
  const T = useType();

  if (loading) {
    return (
      <View style={[styles.loadingWrap, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.textTertiary} />
      </View>
    );
  }

  return (
    <PlayerTimeProvider player={player} controlRef={timeControlRef}>
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ headerShown: false, title: info?.title || '视频', gestureEnabled: activeTab === 'intro' }} />
      {/* 手势根：gesture-handler 需要 RootView 才能派发 Pan */}
            <GestureHandlerRootView style={styles.gestureRoot}>

      <VideoPlayerStage
        player={player}
        videoViewRef={videoViewRef}
        playUrl={playUrl}
        videoStarted={videoStarted}
        onStart={() => { setVideoStarted(true); if (playUrl) player.play(); }}
        info={info}
        playerCollapseStyle={playerCollapseStyle}
        playerGestures={playerGestures}
        playerWidthSV={playerWidthSV}
        dmVisible={dmVisible}
        currentCid={currentCid}
        danmakuEnabled={globalDanmakuEnabled}
        playerBaseHeight={playerBaseHeight}
        insets={insets}
        onDmSeek={seekToTime}
        onDmDensityChange={handleDmDensityChange}
        subtitleData={subtitleData}
        subtitleVisible={subtitleVisible}
        collapseBlurStyle={collapseBlurStyle}
        seekHudAnimStyle={seekHudAnimStyle}
        seekHudTarget={seekHudTarget}
        seekHudDelta={seekHudDelta}
        boostBadgeStyle={boostBadgeStyle}
        gestureHud={gestureHud}
        gestureHudAnimStyle={gestureHudAnimStyle}
        controlsShown={controlsShown}
        controlsAnimStyle={controlsAnimStyle}
        colors={colors}
        onBack={() => router.back()}
        onHome={() => router.replace('/' as any)}
        onListen={() => { pokeControls(); handleListenVideo(); }}
        onSettings={() => { pokeControls(); setSettingsVisible(true); }}
        onMore={() => { pokeControls(); showMoreMenu(); }}
        isPlaying={isPlaying}
        onTogglePlay={() => { pokeControls(); if (isPlaying) player.pause(); else player.play(); }}
        onViewPoints={() => { pokeControls(); showViewPointsMenu(); }}
        onSubtitleToggle={() => { pokeControls(); if (subtitleData.length > 0) setSubtitleVisible(!subtitleVisible); else setSettingsVisible(true); }}
        onFullscreen={() => { pokeControls(); enterFullscreen(); }}
        seekThumbnails={seekThumbnails}
        showSeekThumb={showSeekThumb}
        scrubGesture={scrubGesture}
        trackWidthSV={trackWidthSV}
        durationSV={durationSV}
        progressRatio={progressRatio}
        isScrubbingRef={isScrubbingRef}
        progressTrackAnimStyle={progressTrackAnimStyle}
        progressFillStyle={progressFillStyle}
        progressThumbStyle={progressThumbStyle}
        densityMarkers={dmDensity}
        dmInputVisible={dmInputVisible}
        dmText={dmText}
        onDmTextChange={setDmText}
        onSendDanmaku={sendDanmaku}
        onCloseDmInput={() => setDmInputVisible(false)}
      />

      {/* 交互视频选择边（对齐 Flutter showSteinEdgeInfo） */}
      {showStein && steinChoices.length > 0 && (
        <View style={styles.steinWrap} pointerEvents="box-none">
          {steinChoices.map((choice) => (
            <Press
              key={choice.id}
              haptic
              scaleTo={0.94}
              onPress={() => handleSteinChoice(choice)}
              style={[styles.steinBtn, { backgroundColor: 'rgba(44,44,46,0.85)' }]}>
              <Text style={[T.subhead, styles.steinText]} numberOfLines={2}>{choice.option}</Text>
            </Press>
          ))}
        </View>
      )}


      {/* 3.2 音频模式恢复视频入口 */}
      {audioMode && (
        <Press haptic scaleTo={0.92} onPress={async () => {
          await releaseAudioPlayer();
          usePlayerStore.getState().exitAudioMode();
          const restoreTime = usePlayerStore.getState().currentTime;
          if (restoreTime > 0) {
            try { player.seekTo(restoreTime); } catch {}
          }
          player.play();
          showToast('已恢复视频播放');
        }} style={[styles.audioModeBar, { backgroundColor: colors.card, ...continuous, ...shadow('md', colors.isDark) }]}>
          <Ionicons name="videocam" size={18} color={ACCENT} />
          <Text style={[T.footnote, { color: colors.text, fontWeight: '600' }]}>恢复视频播放</Text>
        </Press>
      )}

      {/* 收起态工具栏（暂停后滚动收起时显示，覆盖在播放器槽位，位于状态栏下方） */}
      {playerCollapsed && videoStarted && !isPlaying && (
        <View style={[styles.collapsedBarWrap, { top: insets.top }]}>
          <TimeAwareCollapsedPlayerBar
            isPlaying={isPlaying}
            colors={colors}
            onPlayPause={() => {
              player.play();
              // 恢复播放：播放器重新钉在 16:9，滚动位置回到顶部让视频完全展开
              setPlayerCollapsed(false);
              playerCollapsedRef.current = false;
            }}
            onBack={() => router.back()}
            onHome={() => router.replace('/' as any)}
          />
        </View>
      )}

      {/* ===== Tab 栏（对齐 Flutter view.dart buildTabBar：tabs 左对齐定宽 + 发弹幕/弹幕开关同行）===== */}
      <View style={[styles.tabBar, { borderBottomColor: colors.separator }]}>
        <Press haptic scaleTo={0.95} onPress={() => switchTab('intro')} style={styles.tabItem}>
          <Text style={[T.subhead, { color: activeTab === 'intro' ? colors.text : colors.textTertiary, fontWeight: activeTab === 'intro' ? '700' : '400' }]}>简介</Text>
        </Press>
        <Press haptic scaleTo={0.95} onPress={() => switchTab('comments')} style={styles.tabItem}>
          <Text style={[T.subhead, { color: activeTab === 'comments' ? colors.text : colors.textTertiary, fontWeight: activeTab === 'comments' ? '700' : '400' }]} numberOfLines={1}>
            {`评论 ${formatCount(info?.stat.reply || 0)}`}
          </Text>
        </Press>
        <View style={{ flex: 1 }} />
        <Press haptic scaleTo={0.9} onPress={() => setDmInputVisible(true)} style={styles.dmTextBtn}>
          <Text style={{ fontSize: 12, color: colors.textSecondary }}>发弹幕</Text>
        </Press>
        <Press haptic scaleTo={0.85} onPress={() => setDmVisible(!dmVisible)} style={styles.dmToggleBtn}>
          <Ionicons name={dmVisible ? 'chatbubbles' : 'chatbubbles-outline'} size={18} color={dmVisible ? ACCENT : colors.textTertiary} />
        </Press>
        {/* 单一指示器：弹簧滑动（临界阻尼），而非硬跳 */}
        <Animated.View style={[styles.tabIndicator, { backgroundColor: ACCENT }, tabIndicatorAnimStyle]} />
      </View>
      
      {/* ===== Tab 内容：横向 pager，仅挂载当前页，切换后懒挂载（对齐 Flutter PageView） ===== */}
      <View style={[styles.tabContent, { overflow: 'hidden' }]}>
        <RNGHScrollView
          ref={tabPagerRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          bounces={false}
          onMomentumScrollEnd={handlePagerScrollEnd}>
          <View style={{ width: winW, flex: 1 }}>
            {activeTab === 'intro' ? (
              <VideoIntroSection
                scrollRef={tabScrollRef}
                onScroll={handleTabScroll}
                colors={colors}
                T={T}
                s={s}
                info={info}
                expanded={expanded}
                onToggleExpanded={() => setExpanded(!expanded)}
                related={related}
                onOpenMember={(mid) => router.push(`/member/${mid}` as any)}
                onOpenRelated={(bvid) => router.push(`/video/${bvid}` as any)}
                seasonEpisodes={seasonEpisodes}
                playableCount={playableCount}
                currentCid={currentCid}
                onlineCount={onlineCount}
                aiSummary={aiSummary}
                followed={followed}
                onFollow={handleFollow}
                liked={liked}
                coined={coined}
                faved={faved}
                onLike={handleLike}
                onCoin={handleCoin}
                onFav={handleFav}
                onShare={handleShare}
                onMore={showMoreMenu}
                onPageSelect={switchPage}
                onEpisodeSelect={switchEpisode}
              />
            ) : (
              <View style={[styles.pagePlaceholder, { backgroundColor: colors.bg }]} />
            )}
          </View>
          <View style={{ width: winW, flex: 1 }}>
            {activeTab === 'comments' ? (
              <CommentSection
                replies={replies}
                expandedReplies={expandedReplies}
                hasMoreReplies={hasMoreReplies}
                loadingMore={commentsLoadingMore}
                commentsError={commentsError}
                commentsLoaded={commentsLoaded}
                colors={colors}
                T={T}
                replyLengthLimit={s.replyLengthLimit}
                upMid={info?.owner?.mid}
                sortType={commentSort}
                onSortChange={changeCommentSort}
                scrollRef={commentScrollRef}
                onToggleSub={toggleSubReplies}
                onLoadMoreSub={fillSubReplies}
                onPreloadSubReplies={preloadSubReplies}
                onLoadMore={loadMoreReplies}
                onScroll={handleCommentScroll}
                scrollEventThrottle={32}
                onOpenViewer={openCommentViewer}
                onOpenReplyDetail={openReplyDetail}
                onLongPress={handleReplyLongPress}
                onRetry={retryComments}
              />
            ) : (
              <View style={[styles.pagePlaceholder, { backgroundColor: colors.bg }]} />
            )}
          </View>
        </RNGHScrollView>
      </View>

      {/* 播放器设置面板 */}
      <PlayerSettingsSheet
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
        currentSpeed={playSpeed}
        onSpeedChange={changePlaySpeed}
        onReload={() => { if (info) loadVideo(); }}
        qualityList={qualityList}
        currentQn={currentQn}
        onQualityChange={changeQuality}
        onVolumeChange={changeVolume}
        playUrl={playUrl}
        videoInfo={info}
        cid={currentCid}
        onSubtitleSelect={async (url: string) => {
          try {
            const fullUrl = normalizeHttpUrl(url);
            const json = await fetchSubtitleJson(fullUrl);
            if (json?.body && Array.isArray(json.body)) {
              setSubtitleData(json.body);
              setSubtitleVisible(true);
              showToast('字幕已加载');
            }
          } catch {
            showToast('字幕加载失败');
          }
        }}
        onSubtitleClose={() => { setSubtitleVisible(false); setSubtitleData([]); }}
      />

      {/* 评论图片查看器 */}
      <ImageViewer
        visible={viewerVisible}
        images={viewerImages}
        initialIndex={viewerIdx}
        onClose={() => setViewerVisible(false)}
      />

      {/* 楼中楼全部回复（底部弹起 + 分页加载） */}
      {replyDetail && (
        <ReplyDetailSheet
          visible
          oid={info?.aid || 0}
          type={1}
          root={replyDetail.rpid}
          rcount={replyDetail.rcount}
          initialReplies={replyDetail.replies}
          onClose={() => setReplyDetail(null)}
        />
      )}

      {/* 自由复制对话框（对齐 Flutter showReplyCopyDialog：文本可自由选择复制） */}
      <Host>
        <BottomSheet
          isPresented={!!copyDialog}
          onIsPresentedChange={(v) => { if (!v) setCopyDialog(null); }}>
          <Group modifiers={[
            presentationDetents(['medium']),
            presentationDragIndicator('visible'),
          ]}>
            <RNHostView>
              <View style={{ padding: 18, gap: 12 }}>
                <Text style={[T.subhead, { color: colors.text, fontWeight: '700' }]} numberOfLines={1}>
                  {copyDialog?.title || '评论内容'}
                </Text>
                <View style={{ maxHeight: 320 }}>
                  <Text selectable style={{ fontSize: 15, lineHeight: 24, color: colors.text }}>{copyDialog?.text}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 20 }}>
                  <Press haptic scaleTo={0.95} onPress={() => setCopyDialog(null)}>
                    <Text style={[T.subhead, { color: colors.textSecondary, fontWeight: '600' }]}>关闭</Text>
                  </Press>
                  <Press haptic scaleTo={0.95} onPress={async () => {
                    if (!copyDialog) return;
                    try { await Clipboard.setStringAsync(copyDialog.text); showToast('已复制'); } catch { showToast('复制失败'); }
                  }}>
                    <Text style={[T.subhead, { color: ACCENT, fontWeight: '600' }]}>复制全部</Text>
                  </Press>
                </View>
              </View>
            </RNHostView>
          </Group>
        </BottomSheet>
      </Host>

      
      </GestureHandlerRootView>
    </View>
    </PlayerTimeProvider>
  );
}

const styles = StyleSheet.create({
  steinWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 90,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    zIndex: 20,
  },
  steinBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    maxWidth: '45%',
  },
  steinText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  container: { flex: 1 },
  gestureRoot: { flex: 1 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  audioModeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginVertical: 8,
    paddingVertical: 12,
    borderRadius: 14,
    borderCurve: 'continuous',
  },
  collapsedBarWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 30,
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabItem: {
    width: 96,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dmTextBtn: {
    paddingHorizontal: 6,
    paddingVertical: 10,
  },
  dmToggleBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 20,
    height: 3,
    borderRadius: 1.5,
  },
  tabContent: { flex: 1 },
  pagePlaceholder: { flex: 1 },
  tabPager: { flex: 1, flexDirection: 'row' },
});
