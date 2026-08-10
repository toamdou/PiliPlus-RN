import { useEffect, useState } from 'react';
import { View, TextInput, StyleSheet, Keyboard, type KeyboardEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Press } from '@/components/motion';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';
import Animated, { FadeInUp, FadeOutDown } from 'react-native-reanimated';
import { ACCENT, useThemeColors } from '@/components/SwiftUIHost';
import { GlassCircle } from './GlassCircle';
import { VideoProgressBar } from './VideoProgressBar';
import type { DanmakuDensityMarker } from '@/components/DanmakuOverlay';
import type { VideoShotData } from '@/api/video';

export function VideoOverlay({
  controlsShown,
  controlsAnimStyle,
  insets,
  colors,
  onBack,
  onHome,
  onListen,
  onSettings,
  onMore,
  videoStarted,
  isPlaying,
  onTogglePlay,
  info,
  onViewPoints,
  subtitleData,
  subtitleVisible,
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
  controlsShown: boolean;
  controlsAnimStyle: any;
  insets: { top: number };
  colors: ReturnType<typeof useThemeColors>;
  onBack: () => void;
  onHome: () => void;
  onListen: () => void;
  onSettings: () => void;
  onMore: () => void;
  videoStarted: boolean;
  isPlaying: boolean;
  onTogglePlay: () => void;
  info: any;
  onViewPoints: () => void;
  subtitleData: unknown[];
  subtitleVisible: boolean;
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
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const show = (e: KeyboardEvent) => setKeyboardHeight(e.endCoordinates.height);
    const hide = () => setKeyboardHeight(0);
    const subs = [
      Keyboard.addListener('keyboardWillShow', show),
      Keyboard.addListener('keyboardDidShow', show),
      Keyboard.addListener('keyboardWillHide', hide),
      Keyboard.addListener('keyboardDidHide', hide),
    ];
    return () => {
      subs.forEach((s) => s.remove());
    };
  }, []);

  return (
    <>
      <Animated.View
        style={[styles.topControlsLayer, controlsAnimStyle]}
        pointerEvents={controlsShown ? 'box-none' : 'none'}>
        <GlassCircle icon="chevron-back" onPress={onBack} colors={colors} style={{ position: 'absolute', top: insets.top + 8, left: 12 }} />
        <GlassCircle icon="home-outline" onPress={onHome} colors={colors} style={{ position: 'absolute', top: insets.top + 8, left: 58 }} />
        <GlassCircle icon="musical-notes" onPress={onListen} colors={colors} style={{ position: 'absolute', top: insets.top + 8, right: 104 }} />
        <GlassCircle icon="chatbox-ellipses-outline" onPress={onSettings} colors={colors} style={{ position: 'absolute', top: insets.top + 8, right: 58 }} />
        <GlassCircle icon="ellipsis-horizontal" onPress={onMore} colors={colors} style={{ position: 'absolute', top: insets.top + 8, right: 12 }} />
      </Animated.View>

      {videoStarted && (
        <Animated.View
          style={[styles.playerControlsWrap, controlsAnimStyle]}
          pointerEvents={controlsShown ? 'auto' : 'none'}>
          <View style={styles.playerControls}>
            {controlsShown && (
              <MaskedView
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
                maskElement={
                  <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.5)', 'black']}
                    locations={[0, 0.3, 1]}
                    style={StyleSheet.absoluteFill}
                  />
                }>
                <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
              </MaskedView>
            )}
            <VideoProgressBar
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
              onLayoutTrack={(e) => { trackWidthSV.set(e.nativeEvent.layout.width); }}
            />
            <View style={styles.controlsRow}>
              <Press haptic scaleTo={0.85} onPress={onTogglePlay} style={styles.controlBtn}>
                <Ionicons name={isPlaying ? 'pause' : 'play'} size={20} color="#FFFFFF" />
              </Press>
              <View style={{ flex: 1 }} />
              {info?.view_points && info.view_points.length > 0 ? (
                <Press haptic scaleTo={0.85} onPress={onViewPoints} style={styles.controlBtn}>
                  <Ionicons name="list-outline" size={19} color="#FFFFFF" />
                </Press>
              ) : null}
              <Press haptic scaleTo={0.85} onPress={onSubtitleToggle} style={styles.controlBtn}>
                <Ionicons name="document-text-outline" size={19} color={subtitleVisible ? ACCENT : '#FFFFFF'} />
              </Press>
              <Press haptic scaleTo={0.85} onPress={onSettings} style={styles.controlBtn}>
                <Ionicons name="speedometer-outline" size={19} color="#FFFFFF" />
              </Press>
              <Press haptic scaleTo={0.85} onPress={onFullscreen} style={styles.controlBtn}>
                <Ionicons name="expand" size={20} color="#FFFFFF" />
              </Press>
            </View>
          </View>
        </Animated.View>
      )}

      {dmInputVisible && (
        <Animated.View entering={FadeInUp.duration(200).springify()} exiting={FadeOutDown.duration(150)} style={[styles.dmInputBar, { bottom: keyboardHeight + 16 }]}>
          <TextInput
            value={dmText}
            onChangeText={onDmTextChange}
            placeholder="发个友善的弹幕~"
            placeholderTextColor="rgba(255,255,255,0.5)"
            style={styles.dmTextInput}
            autoFocus
            maxLength={100}
            onSubmitEditing={onSendDanmaku}
            returnKeyType="send"
          />
          <Press haptic scaleTo={0.9} onPress={onSendDanmaku} style={[styles.dmSendBtn, { backgroundColor: dmText.trim() ? ACCENT : 'rgba(255,255,255,0.15)' }]}>
            <Ionicons name="send" size={16} color={dmText.trim() ? '#FFF' : 'rgba(255,255,255,0.5)'} />
          </Press>
          <Press haptic scaleTo={0.9} onPress={onCloseDmInput} style={styles.dmCloseBtn}>
            <Ionicons name="close" size={18} color="rgba(255,255,255,0.7)" />
          </Press>
        </Animated.View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  playerControlsWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 20,
  },
  topControlsLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
  },
  playerControls: {
    paddingHorizontal: 12,
    paddingBottom: 6,
    paddingTop: 2,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  controlBtn: { padding: 10 },
  dmInputBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  dmTextInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    padding: 0,
  },
  dmSendBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dmCloseBtn: { padding: 4 },
});
