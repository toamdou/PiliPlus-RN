/**
 * fullscreen —— 独立全屏播放页（expo-router 路由 /video/fullscreen）。
 * 由 video/[id].tsx 的 expand 按钮推入：URL/进度/倍速/音量/弹幕/字幕等状态经
 * usePlayerStore.fullscreenState 传递，退出时写回并桥接回主页面（对齐 Flutter 独立全屏页）。
 */
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { PiliPlayer, PiliPlayerView } from 'pili-player';
import { EnhancedVideoView } from 'pili-video-enhance';
import { GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { Press } from '@/components/motion';
import { DanmakuOverlay } from '@/components/DanmakuOverlay';
import { SubtitleOverlay } from '@/components/SubtitleOverlay';
import { useSettingsStore } from '@/stores/settings';
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
                  contentFit="contain"
                  safeAreaInsets={safePadding}
                  onFirstFrameRender={() => setCoverShown(false)}
                  onError={onEnhancementError}
                  onStateChange={onEnhancementStateChange}
                  style={StyleSheet.absoluteFill}
                />
              ) : (
                <PiliPlayerView
                  player={player}
                  videoGravity="contain"
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

  // 原生 presented VC 负责方向/状态栏/手势/电量时间标签；RN 全屏叠加层继续覆盖在其上。
  useEffect(() => {
    if (!playUrl || !id) return;
    let cancelled = false;
    PiliPlayer.shared.presentFullscreenAsync({
      fullScreenMode,
      autoRotate,
      enableSlideVolumeBrightness,
    }).catch((error) => {
      if (!cancelled) throw error;
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
});
