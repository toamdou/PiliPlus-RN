import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { GestureDetector } from 'react-native-gesture-handler';
import type { EdgeInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ACCENT } from '@/components/SwiftUIHost';
import { Press } from '@/components/motion';
import { formatPlayerTime } from '@/utils/player-utils';
import type { DanmakuDensityMarker } from '@/components/DanmakuOverlay';
import { PlayerSettingsSheet } from '@/components/PlayerSettingsSheet';
import { useScrubBar } from '@/hooks/use-scrub-bar';
import { ProgressTrack } from './VideoProgressBar';

interface FullscreenControlsProps {
  controlsShown: boolean;
  controlsOpacity: SharedValue<number>;
  insets: EdgeInsets;
  currentTime: number;
  duration: number;
  playing: boolean;
  locked: boolean;
  showProgress: boolean;
  showScreenshot: boolean;
  dmVisible: boolean;
  dmDensity: DanmakuDensityMarker[];
  settingsVisible: boolean;
  playSpeed: number;
  qualityList: { quality: number; new_description: string }[];
  currentQn: number;
  playUrl: string;
  videoInfo: { aid: number; bvid: string; title: string; owner: { name: string } };
  cid: number;
  onPreviewTime: (t: number) => void;
  onSeek: (t: number) => void;
  onTogglePlay: () => void;
  onToggleDanmaku: () => void;
  onOpenSettings: () => void;
  onCloseSettings: () => void;
  onExit: () => void;
  onScreenshot: () => void;
  onSpeedChange: (speed: number) => void;
  onReload: () => void;
  onQualityChange: (qn: number) => void;
  onVolumeChange: (v: number) => void;
  onSubtitleSelect: (url: string) => Promise<void> | void;
  onSubtitleClose: () => void;
}

export function FullscreenControls({
  controlsShown,
  controlsOpacity,
  insets,
  currentTime,
  duration,
  playing,
  locked,
  showProgress,
  showScreenshot,
  dmVisible,
  dmDensity,
  settingsVisible,
  playSpeed,
  qualityList,
  currentQn,
  playUrl,
  videoInfo,
  cid,
  onPreviewTime,
  onSeek,
  onTogglePlay,
  onToggleDanmaku,
  onOpenSettings,
  onCloseSettings,
  onExit,
  onScreenshot,
  onSpeedChange,
  onReload,
  onQualityChange,
  onVolumeChange,
  onSubtitleSelect,
  onSubtitleClose,
}: FullscreenControlsProps) {
  const controlsAnimStyle = useAnimatedStyle(() => ({ opacity: controlsOpacity.value }));
  const progressRatio = useSharedValue(0);
  const scrubbing = useSharedValue(0);
  const trackWidthSV = useSharedValue(0);
  const durationSV = useSharedValue(duration);

  useEffect(() => {
    durationSV.set(duration);
  }, [duration, durationSV]);

  useEffect(() => {
    if (duration > 0) {
      progressRatio.set(withTiming(Math.min(currentTime / duration, 1), {
        duration: 300,
        easing: Easing.linear,
      }));
    }
  }, [currentTime, duration, progressRatio]);

  const commitPreview = (t: number) => {
    onPreviewTime(t);
  };

  const {
    gesture: scrubGesture,
    fillStyle: progressFillStyle,
    thumbStyle: progressThumbStyle,
    trackStyle: progressTrackAnimStyle,
  } = useScrubBar({
    durationSV,
    trackWidthSV,
    progressRatio,
    scrubbing,
    enabled: !locked,
    velocitySpring: false,
    onPreview: commitPreview,
    onSeek,
  });

  return (
    <>
      <View
        style={[
          styles.bottomLayer,
          { paddingBottom: Math.max(insets.bottom, 10) },
          controlsShown ? styles.bottomLayerActive : styles.bottomLayerSlim,
        ]}
        pointerEvents={locked ? 'none' : 'auto'}>
        <Animated.View
          style={[styles.controlsPanel, controlsAnimStyle]}
          pointerEvents={controlsShown ? 'auto' : 'none'}>
          {showProgress && controlsShown ? (
            <View style={styles.progressRow}>
              <Text style={styles.timeText}>{formatPlayerTime(currentTime)}</Text>
              <View style={styles.progressTrackFlex}>
                <GestureDetector gesture={scrubGesture}>
                  <ProgressTrack
                    style={styles.progressTrackArea}
                    animStyle={progressTrackAnimStyle}
                    duration={duration}
                    density={dmDensity}
                    fillStyle={progressFillStyle}
                    thumbStyle={progressThumbStyle}
                    onLayout={(e) => { trackWidthSV.set(e.nativeEvent.layout.width); }}
                  />
                </GestureDetector>
              </View>
              <Text style={styles.timeText}>{formatPlayerTime(duration)}</Text>
            </View>
          ) : null}
          <View style={styles.controlsRow}>
            <Press haptic scaleTo={0.85} onPress={onTogglePlay} style={styles.ctrlBtn}>
              <Ionicons name={playing ? 'pause' : 'play'} size={22} color="#FFFFFF" />
            </Press>
            <View style={{ flex: 1 }} />
            <Press haptic scaleTo={0.85} onPress={onToggleDanmaku} style={styles.ctrlBtn}>
              <Ionicons name={dmVisible ? 'chatbubbles' : 'chatbubbles-outline'} size={19} color={dmVisible ? ACCENT : '#FFFFFF'} />
            </Press>
            {showScreenshot ? (
              <Press haptic scaleTo={0.85} onPress={onScreenshot} style={styles.ctrlBtn}>
                <Ionicons name="camera-outline" size={19} color="#FFFFFF" />
              </Press>
            ) : null}
            <Press haptic scaleTo={0.85} onPress={onOpenSettings} style={styles.ctrlBtn}>
              <Ionicons name="settings-outline" size={20} color="#FFFFFF" />
            </Press>
            <Press haptic scaleTo={0.85} onPress={onExit} style={styles.ctrlBtn}>
              <Ionicons name="contract" size={21} color="#FFFFFF" />
            </Press>
          </View>
        </Animated.View>

        {showProgress && !controlsShown ? (
          <GestureDetector gesture={scrubGesture}>
            <ProgressTrack
              style={styles.slimProgressTrackArea}
              animStyle={progressTrackAnimStyle}
              duration={duration}
              density={dmDensity}
              fillStyle={progressFillStyle}
              thumbStyle={progressThumbStyle}
              onLayout={(e) => { trackWidthSV.set(e.nativeEvent.layout.width); }}
            />
          </GestureDetector>
        ) : null}
      </View>

      <PlayerSettingsSheet
        visible={settingsVisible}
        onClose={onCloseSettings}
        currentSpeed={playSpeed}
        onSpeedChange={onSpeedChange}
        onReload={onReload}
        qualityList={qualityList}
        currentQn={currentQn}
        onQualityChange={onQualityChange}
        onVolumeChange={onVolumeChange}
        playUrl={playUrl}
        videoInfo={videoInfo}
        cid={cid}
        onSubtitleSelect={onSubtitleSelect}
        onSubtitleClose={onSubtitleClose}
      />
    </>
  );
}

const styles = StyleSheet.create({
  bottomLayer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    zIndex: 20,
  },
  bottomLayerActive: {
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  bottomLayerSlim: {
    backgroundColor: 'transparent',
  },
  controlsPanel: {
    paddingTop: 8,
  },
  progressTrackFlex: {
    flex: 1,
  },
  slimProgressTrackArea: {
    height: 28,
    justifyContent: 'center',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 0,
  },
  timeText: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontVariant: ['tabular-nums'] },
  progressTrackArea: {
    flex: 1,
    height: 44,
    justifyContent: 'center',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ctrlBtn: { padding: 10 },
});
