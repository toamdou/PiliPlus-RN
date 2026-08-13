import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { PiliPlayerView } from 'pili-player';
import { EnhancedVideoView } from 'pili-video-enhance';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Press } from '@/components/motion';
import { Link } from 'expo-router';
import { useSettingsStore } from '@/stores/settings';
import { useVideoEnhance } from '@/hooks/use-video-enhance';
import { ACCENT, useThemeColors } from '@/components/SwiftUIHost';
import { formatPlayerTime } from '@/utils/player-utils';
import { biliCover } from '@/utils/image-url';
import { TimeAwareDanmakuOverlay, TimeAwareSubtitleOverlay } from './PlayerTimeProvider';
import { VideoOverlay } from './VideoOverlay';
import type { DanmakuDensityMarker } from '@/components/DanmakuOverlay';
import type { VideoShotData } from '@/api/video';

export function VideoPlayerStage({
  player,
  playUrl,
  videoStarted,
  onStart,
  info,
  playerCollapseStyle,
  playerGestures,
  playerWidthSV,
  dmVisible,
  currentCid,
  danmakuEnabled,
  playerBaseHeight,
  insets,
  onDmSeek,
  onDmDensityChange,
  subtitleData,
  subtitleVisible,
  collapseBlurStyle,
  seekHudAnimStyle,
  seekHudTarget,
  seekHudDelta,
  boostBadgeStyle,
  gestureHud,
  gestureHudAnimStyle,
  controlsShown,
  controlsAnimStyle,
  colors,
  onBack,
  onHome,
  onListen,
  onSettings,
  onMore,
  isPlaying,
  onTogglePlay,
  onViewPoints,
  onSubtitleToggle,
  onFullscreen,
  seekThumbnails,
  showSeekThumb,
  scrubGesture,
  trackWidthSV,
  durationSV,
  progressRatio,
  isScrubbingRef,
  progressTrackAnimStyle,
  progressFillStyle,
  progressThumbStyle,
  densityMarkers,
  dmInputVisible,
  dmText,
  onDmTextChange,
  onSendDanmaku,
  onCloseDmInput,
}: {
  player: any;
  videoViewRef: any;
  playUrl: string;
  videoStarted: boolean;
  onStart: () => void;
  info: any;
  playerCollapseStyle: any;
  playerGestures: any;
  playerWidthSV: any;
  dmVisible: boolean;
  currentCid: number;
  danmakuEnabled: boolean;
  playerBaseHeight: number;
  insets: { top: number };
  onDmSeek: (t: number) => void;
  onDmDensityChange: (markers: DanmakuDensityMarker[]) => void;
  subtitleData: { from: number; to: number; content: string }[];
  subtitleVisible: boolean;
  collapseBlurStyle: any;
  seekHudAnimStyle: any;
  seekHudTarget: number;
  seekHudDelta: number;
  boostBadgeStyle: any;
  gestureHud: { type: 'brightness' | 'volume'; value: number } | null;
  gestureHudAnimStyle: any;
  controlsShown: boolean;
  controlsAnimStyle: any;
  colors: ReturnType<typeof useThemeColors>;
  onBack: () => void;
  onHome: () => void;
  onListen: () => void;
  onSettings: () => void;
  onMore: () => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onViewPoints: () => void;
  onSubtitleToggle: () => void;
  onFullscreen: () => void;
  seekThumbnails: VideoShotData | null;
  showSeekThumb: boolean;
  scrubGesture: any;
  trackWidthSV: any;
  durationSV: any;
  progressRatio: any;
  isScrubbingRef: { current: boolean };
  progressTrackAnimStyle: any;
  progressFillStyle: any;
  progressThumbStyle: any;
  densityMarkers: DanmakuDensityMarker[];
  dmInputVisible: boolean;
  dmText: string;
  onDmTextChange: (text: string) => void;
  onSendDanmaku: () => void;
  onCloseDmInput: () => void;
}) {
  const enableShrinkVideoSize = useSettingsStore((s) => s.enableShrinkVideoSize);
  // 04-B3/B4（P1）：画面比例受控 prop（F3 并行在 settings.ts 新增 videoGravity，防御式读取）
  const videoGravity = (useSettingsStore((s) => (s as any).videoGravity) as 'contain' | 'cover' | 'fill') ?? 'contain';
  // #31b（01-A4）：展开态 blur 靠 opacity=0 常驻挂载 → 条件卸载（仅暂停收起需要蒙层，播放中恒为 opacity 0）
  const blurMounted = !isPlaying;
  const enhance = useVideoEnhance();
  const nativePlayerId = (player as any).getSharedPlayerId?.() ?? null;
  const pinchScaleSV = useSharedValue(1);
  const pinchStartSV = useSharedValue(1);
  useEffect(() => {
    if (!enableShrinkVideoSize) pinchScaleSV.set(1);
  }, [enableShrinkVideoSize, pinchScaleSV]);
  useEffect(() => {
    pinchScaleSV.set(1);
  }, [playUrl, pinchScaleSV]);
  const videoScaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pinchScaleSV.value }],
  }));
  const pinchGesture = Gesture.Pinch()
    .enabled(enableShrinkVideoSize)
    .onStart(() => {
      pinchStartSV.set(pinchScaleSV.value);
    })
    .onUpdate((e) => {
      pinchScaleSV.set(Math.min(Math.max(pinchStartSV.value * e.scale, 0.75), 2));
    })
    .onEnd(() => {
      pinchScaleSV.set(withSpring(pinchScaleSV.value, { damping: 20, stiffness: 260 }));
    });

  return (
    <View>
      <Link.AppleZoomTarget>
        <Animated.View style={[styles.playerWrap, playerCollapseStyle]}>
          <View style={styles.playerStage}>
            {playUrl && videoStarted ? (
              <GestureDetector gesture={Gesture.Race(pinchGesture, playerGestures)}>
                <View
                  style={styles.player}
                  onLayout={(e) => { playerWidthSV.set(e.nativeEvent.layout.width); }}>
                  {enhance.enabled && nativePlayerId ? (
                    <Animated.View style={[styles.player, videoScaleStyle]}>
                      <EnhancedVideoView
                        playerId={nativePlayerId}
                        options={enhance.options ?? undefined}
                        contentFit={videoGravity}
                        onError={enhance.onError}
                        onStateChange={enhance.onStateChange}
                        style={styles.player}
                      />
                    </Animated.View>
                  ) : (
                    <Animated.View style={[styles.player, videoScaleStyle]}>
                      <PiliPlayerView
                        player={player}
                        style={styles.player}
                        videoGravity={videoGravity}
                      />
                    </Animated.View>
                  )}
                  {dmVisible && (
                    <TimeAwareDanmakuOverlay
                      key={`dm-${currentCid}`}
                      cid={currentCid}
                      visible={danmakuEnabled}
                      height={(playerBaseHeight - insets.top) * 0.6}
                      topInset={insets.top}
                      onSeek={onDmSeek}
                      onDensityChange={onDmDensityChange}
                    />
                  )}
                  <TimeAwareSubtitleOverlay subtitles={subtitleData} visible={subtitleVisible} />
                </View>
              </GestureDetector>
            ) : (
              <View style={styles.player}>
                {info?.pic ? (
                  <ExpoImage source={{ uri: biliCover(info.pic, 1280, 720) }} style={StyleSheet.absoluteFill} contentFit="cover" />
                ) : (
                  <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]} />
                )}
                <View style={styles.coverOverlay} />
                <Press haptic scaleTo={0.88} onPress={onStart} style={styles.playBtn}>
                  <Ionicons name="play" size={32} color="#FFFFFF" />
                </Press>
              </View>
            )}
            {/* #31b：展开态（播放中）不挂载 BlurView，仅暂停收起需要模糊蒙层 */}
            {blurMounted && (
              <Animated.View style={[styles.collapseBlur, collapseBlurStyle]} pointerEvents="none">
                <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill} />
              </Animated.View>
            )}
            <Animated.View style={[styles.seekHud, seekHudAnimStyle]} pointerEvents="none">
              <Ionicons name={seekHudDelta >= 0 ? 'play-forward' : 'play-back'} size={16} color="#FFFFFF" />
              <Text style={styles.seekHudTime}>{formatPlayerTime(seekHudTarget)}</Text>
              <Text style={styles.seekHudDelta}>{(seekHudDelta >= 0 ? '+' : '') + seekHudDelta + 's'}</Text>
            </Animated.View>
            <Animated.View style={[styles.speedBoostBadge, boostBadgeStyle]} pointerEvents="none">
              <Ionicons name="play-forward" size={14} color="#FFFFFF" />
              <Text style={styles.speedBoostText}>{useSettingsStore.getState().longPressSpeedDefault + 'x 加速中'}</Text>
            </Animated.View>
            {gestureHud && (
              <Animated.View style={[styles.gestureHud, gestureHudAnimStyle]} pointerEvents="none">
                <Ionicons
                  name={gestureHud.type === 'brightness' ? 'sunny' : 'volume-high'}
                  size={20} color="#FFFFFF"
                />
                <View style={styles.gestureHudBar}>
                  <View style={[styles.gestureHudFill, { height: `${gestureHud.value * 100}%` }]} />
                </View>
                <Text style={styles.gestureHudText}>{Math.round(gestureHud.value * 100)}%</Text>
              </Animated.View>
            )}
            <VideoOverlay
              controlsShown={controlsShown}
              controlsAnimStyle={controlsAnimStyle}
              insets={insets}
              colors={colors}
              onBack={onBack}
              onHome={onHome}
              onListen={onListen}
              onSettings={onSettings}
              onMore={onMore}
              videoStarted={videoStarted}
              isPlaying={isPlaying}
              onTogglePlay={onTogglePlay}
              info={info}
              onViewPoints={onViewPoints}
              subtitleData={subtitleData}
              subtitleVisible={subtitleVisible}
              onSubtitleToggle={onSubtitleToggle}
              onFullscreen={onFullscreen}
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
              densityMarkers={densityMarkers}
              dmInputVisible={dmInputVisible}
              dmText={dmText}
              onDmTextChange={onDmTextChange}
              onSendDanmaku={onSendDanmaku}
              onCloseDmInput={onCloseDmInput}
            />
          </View>
        </Animated.View>
      </Link.AppleZoomTarget>
    </View>
  );
}

const styles = StyleSheet.create({
  /* #15：播放器脱离文档流 absolute 置顶覆盖（高度由 playerCollapseStyle 动画驱动），
     内容列表由 paddingTop 让位，滚动不再逐帧改播放器高度 */
  playerWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    width: '100%',
    backgroundColor: '#000',
    overflow: 'hidden',
    zIndex: 10,
  },
  playerStage: { flex: 1, overflow: 'hidden' },
  player: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  coverOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' },
  playBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -32,
    marginLeft: -32,
  },
  collapseBlur: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 5 },
  seekHud: {
    position: 'absolute',
    top: '50%',
    alignSelf: 'center',
    marginTop: -22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.72)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    zIndex: 15,
  },
  seekHudTime: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  seekHudDelta: { color: 'rgba(255,255,255,0.72)', fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  speedBoostBadge: {
    position: 'absolute',
    top: '50%',
    alignSelf: 'center',
    marginTop: -16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 7,
    zIndex: 10,
  },
  speedBoostText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  gestureHud: {
    position: 'absolute',
    top: '50%',
    alignSelf: 'center',
    marginTop: -50,
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.72)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    zIndex: 15,
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
    backgroundColor: ACCENT,
    borderRadius: 2,
  },
  gestureHudText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
});
