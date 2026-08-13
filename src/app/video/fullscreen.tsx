/**
 * fullscreen —— 独立全屏播放页（expo-router 路由 /video/fullscreen）。
 * 由 video/[id].tsx 的 expand 按钮推入：URL/进度/倍速/音量/弹幕/字幕等状态经
 * usePlayerStore.fullscreenState 传递，退出时写回并桥接回主页面（对齐 Flutter 独立全屏页）。
 */
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { PiliPlayer, PiliPlayerView } from 'pili-player';
import { EnhancedVideoView } from 'pili-video-enhance';
import { GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { Press } from '@/components/motion';
import { DanmakuOverlay } from '@/components/DanmakuOverlay';
import { SubtitleOverlay } from '@/components/SubtitleOverlay';
import { useSettingsStore } from '@/stores/settings';
import { showToast } from '@/utils/toast';
import {
  useNativeFullscreenPlayer,
  type FullscreenPlayerController,
} from '@/hooks/use-fullscreen-player';
import { FullscreenTopBar } from '@/components/video/FullscreenTopBar';
import { FullscreenControls } from '@/components/video/FullscreenControls';
import { biliCover } from '@/utils/image-url';

function FullscreenVideoBody({ controller }: { controller: FullscreenPlayerController }) {
  const {
    id,
    playUrl,
    pic,
    cid,
    title,
    onlineCount,
    winH,
    safePadding,
    insets,
    player,
    enhanceEnabled,
    enhanceOptions,
    onEnhancementError,
    onEnhancementStateChange,
    currentTime,
    duration,
    buffering,
    playError,
    onPreviewTime,
    commitSeek,
    coverShown,
    setCoverShown,
    controlsShown,
    controlsOpacity,
    playing,
    locked,
    dmVisible,
    dmDensity,
    subtitleVisible,
    subtitleData,
    liked,
    disliked,
    coined,
    faved,
    settingsVisible,
    playSpeed,
    qualityList,
    currentQn,
    videoInfo,
    playerWidthSV,
    tapGesture,
    videoGravity,
    gestureHud,
    handleDmDensityChange,
    togglePlay,
    toggleLock,
    toggleDanmaku,
    openSettings,
    closeSettings,
    exitFullscreen,
    handleLike,
    handleDislike,
    handleTriple,
    handleCoin,
    handleFav,
    handleShare,
    handleScreenshot,
    showFSActionItem,
    showFSLockBtn,
    showFsScreenshotBtn,
    showBatteryLevel,
    btmProgressBehavior,
    changeQuality,
    reloadSource,
    handleSpeedChange,
    handleVolumeChange,
    handleSubtitleSelect,
    handleSubtitleClose,
  } = controller;
  const danmakuEnabled = useSettingsStore((s) => s.danmakuEnabled);
  const nativePlayerId = (player as any).getSharedPlayerId?.() ?? null;

  useEffect(() => {
    const sub = player.addListener('firstFrameRender', () => setCoverShown(false));
    return () => sub.remove();
  }, [player, setCoverShown]);

  if (!playUrl || !id) {
    return (
      <GestureHandlerRootView style={styles.root}>
        <View style={[styles.root, { alignItems: 'center', justifyContent: 'center', gap: 14 }]}>
          <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
          <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '600' }}>无法进入全屏播放</Text>
          <Press haptic scaleTo={0.9} onPress={exitFullscreen} style={{ paddingHorizontal: 18, paddingVertical: 9, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.18)' }}>
            <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600' }}>返回</Text>
          </Press>
        </View>
      </GestureHandlerRootView>
    );
  }

  return (
    // GestureDetector（点击/双击/进度条拖动）必须在 GestureHandlerRootView 之下，否则手势无法识别
    <GestureHandlerRootView style={styles.root}>
      <View style={styles.root}>
        <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              paddingTop: safePadding.top,
              paddingRight: safePadding.right,
              paddingBottom: safePadding.bottom,
              paddingLeft: safePadding.left,
            },
          ]}>
          <GestureDetector gesture={tapGesture}>
            <View
              style={styles.root}
              onLayout={(e) => { playerWidthSV.set(e.nativeEvent.layout.width); }}>
              {enhanceEnabled && nativePlayerId ? (
                <EnhancedVideoView
                  playerId={nativePlayerId}
                  options={enhanceOptions ?? undefined}
                  contentFit={videoGravity}
                  safeAreaInsets={safePadding}
                  onFirstFrameRender={() => setCoverShown(false)}
                  onError={onEnhancementError}
                  onStateChange={onEnhancementStateChange}
                  style={StyleSheet.absoluteFill}
                />
              ) : (
                <PiliPlayerView
                  player={player}
                  videoGravity={videoGravity}
                  style={StyleSheet.absoluteFill}
                />
              )}
              {coverShown && pic ? (
                <ExpoImage source={{ uri: biliCover(pic, 1280, 720) }} style={StyleSheet.absoluteFill} contentFit="cover" />
              ) : null}
              {dmVisible && (
                <DanmakuOverlay
                  cid={cid}
                  visible={danmakuEnabled}
                  height={winH * 0.6}
                  duration={duration}
                  onSeek={commitSeek}
                  onDensityChange={handleDmDensityChange}
                />
              )}
              <SubtitleOverlay subtitles={subtitleData} visible={subtitleVisible} isFullscreen />
              {/* 手势 HUD（04-B2：原生 HUD 已移除，亮度/音量反馈统一走 RN 侧） */}
              {gestureHud && (
                <View pointerEvents="none" style={styles.gestureHudWrap}>
                  <View style={styles.gestureHudCard}>
                    <Ionicons
                      name={gestureHud.type === 'brightness' ? 'sunny' : 'volume-high'}
                      size={20}
                      color="#FFFFFF"
                    />
                    <View style={styles.gestureHudBar}>
                      <View style={[styles.gestureHudFill, { height: `${gestureHud.value * 100}%` }]} />
                    </View>
                    <Text style={styles.gestureHudText}>{Math.round(gestureHud.value * 100)}%</Text>
                  </View>
                </View>
              )}
            </View>
          </GestureDetector>
        </View>

        <FullscreenTopBar
          controlsShown={controlsShown}
          controlsOpacity={controlsOpacity}
          insets={insets}
          title={title}
          onlineCount={onlineCount}
          liked={liked}
          disliked={disliked}
          coined={coined}
          faved={faved}
          showActionBar={showFSActionItem}
          showLockButton={showFSLockBtn}
          showBattery={showBatteryLevel}
          locked={locked}
          onExit={exitFullscreen}
          onToggleLock={toggleLock}
          onLike={handleLike}
          onTriple={handleTriple}
          onDislike={handleDislike}
          onCoin={handleCoin}
          onFav={handleFav}
          onShare={handleShare}
        />

        <FullscreenControls
          controlsShown={controlsShown}
          controlsOpacity={controlsOpacity}
          insets={insets}
          currentTime={currentTime}
          duration={duration}
          playing={playing}
          locked={locked}
          showProgress={btmProgressBehavior === 0 || btmProgressBehavior === 1}
          showScreenshot={showFsScreenshotBtn}
          dmVisible={dmVisible}
          dmDensity={dmDensity}
          settingsVisible={settingsVisible}
          playSpeed={playSpeed}
          qualityList={qualityList}
          currentQn={currentQn}
          playUrl={playUrl}
          videoInfo={videoInfo}
          cid={cid}
          onPreviewTime={onPreviewTime}
          onSeek={commitSeek}
          onTogglePlay={togglePlay}
          onToggleDanmaku={toggleDanmaku}
          onOpenSettings={openSettings}
          onCloseSettings={closeSettings}
          onExit={exitFullscreen}
          onScreenshot={handleScreenshot}
          onSpeedChange={handleSpeedChange}
          onReload={reloadSource}
          onQualityChange={changeQuality}
          onVolumeChange={handleVolumeChange}
          onSubtitleSelect={handleSubtitleSelect}
          onSubtitleClose={handleSubtitleClose}
        />

        {/* 缓冲中指示器（04-P0/3.4）：原生 buffering 事件驱动，居中 spinner，不阻塞交互 */}
        {buffering ? (
          <View pointerEvents="none" style={styles.bufferingWrap}>
            <View style={styles.bufferingChip}>
              <ActivityIndicator size="small" color="#FFFFFF" />
              <Text style={styles.bufferingText}>缓冲中</Text>
            </View>
          </View>
        ) : null}

        {/* 播放错误浮层（04-P0/3.4）：error 事件驱动，提供一键重载 + 退出 */}
        {playError ? (
          <View style={styles.errorWrap}>
            <View style={styles.errorCard}>
              <Text style={styles.errorTitle}>播放出错了</Text>
              <Text style={styles.errorMsg} numberOfLines={3}>{playError}</Text>
              <View style={styles.errorRow}>
                <Press
                  haptic
                  scaleTo={0.9}
                  onPress={reloadSource}
                  style={[styles.errorBtn, { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
                  <Text style={styles.errorBtnText}>重新加载</Text>
                </Press>
                <Press
                  haptic
                  scaleTo={0.9}
                  onPress={exitFullscreen}
                  style={[styles.errorBtn, { backgroundColor: 'rgba(255,255,255,0.12)' }]}>
                  <Text style={styles.errorBtnText}>退出全屏</Text>
                </Press>
              </View>
            </View>
          </View>
        ) : null}
      </View>
    </GestureHandlerRootView>
  );
}

export default function FullscreenVideoScreen() {
  const controller = useNativeFullscreenPlayer();
  const fullScreenMode = useSettingsStore((s) => s.fullScreenMode);
  const autoRotate = useSettingsStore((s) => s.autoRotate);
  const enableSlideVolumeBrightness = useSettingsStore((s) => s.enableSlideVolumeBrightness);
  const { playUrl, id } = controller;

  // 原生 presented VC 负责状态栏/手势/电量时间标签；方向由 expo-screen-orientation 统一接管。
  useEffect(() => {
    if (!playUrl || !id) return;
    let cancelled = false;
    PiliPlayer.shared.presentFullscreenAsync({
      fullScreenMode,
      autoRotate,
      enableSlideVolumeBrightness,
    }).catch((error) => {
      // F2：不再在 catch 内 re-throw（否则产生 unhandled rejection 红屏），
      // 降级为 toast 提示，功能不受影响。
      if (!cancelled) showToast(error instanceof Error ? error.message : '全屏打开失败');
    });
    return () => {
      cancelled = true;
      PiliPlayer.shared.dismissFullscreen();
    };
  }, [autoRotate, enableSlideVolumeBrightness, fullScreenMode, id, playUrl]);

  return <FullscreenVideoBody controller={controller} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  gestureHudWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  gestureHudCard: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.72)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  gestureHudBar: {
    width: 4,
    height: 60,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
  },
  gestureHudFill: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FB7299',
    borderRadius: 2,
  },
  gestureHudText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
  bufferingWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 30,
  },
  bufferingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  bufferingText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  errorWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    zIndex: 40,
  },
  errorCard: {
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderRadius: 20,
    backgroundColor: 'rgba(20,20,20,0.85)',
    maxWidth: 300,
  },
  errorTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  errorMsg: { color: 'rgba(255,255,255,0.75)', fontSize: 13, textAlign: 'center' },
  errorRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
  errorBtn: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 999 },
  errorBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
});
