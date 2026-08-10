import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { withTiming, Easing } from 'react-native-reanimated';
import { ACCENT } from '@/components/SwiftUIHost';
import type { VideoShotData } from '@/api/video';
import { formatPlayerTime } from '@/utils/player-utils';
import type { DanmakuDensityMarker } from '@/components/DanmakuOverlay';
import {
  PiliPlayer,
  PiliSeekThumbnailView,
  type PiliSeekThumbnailImage,
} from 'pili-player';
import { usePlayerTime } from './PlayerTimeProvider';

export function ProgressTrack({
  style,
  animStyle,
  duration,
  density,
  fillStyle,
  thumbStyle,
  onLayout,
}: {
  style: any;
  animStyle: any;
  duration: number;
  density: DanmakuDensityMarker[];
  fillStyle: any;
  thumbStyle: any;
  onLayout: (e: any) => void;
}) {
  return (
    <Animated.View style={style} onLayout={onLayout}>
      <Animated.View style={[styles.progressBg, animStyle]}>
        {density.map((m, i) => (
          <View
            key={i}
            style={[styles.densityMark, {
              left: `${(m.start / Math.max(duration, 1)) * 100}%`,
              width: `${Math.max(((m.end - m.start) / Math.max(duration, 1)) * 100, 0.4)}%`,
              opacity: 0.3 + m.level * 0.6,
            }]}
          />
        ))}
        <Animated.View style={[styles.progressFill, fillStyle]} />
      </Animated.View>
      <Animated.View style={[styles.progressThumb, thumbStyle]} />
    </Animated.View>
  );
}

export function VideoProgressBar({
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
  onLayoutTrack,
}: {
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
  densityMarkers?: DanmakuDensityMarker[];
  onLayoutTrack: (e: any) => void;
}) {
  const { currentTime, duration } = usePlayerTime();
  const [thumb, setThumb] = useState<{
    key: string;
    image: PiliSeekThumbnailImage | null;
  } | null>(null);
  const pendingCropsRef = useRef(new Map<string, Promise<PiliSeekThumbnailImage | null>>());

  const videoShotFrame = useMemo(() => {
    if (!showSeekThumb || !seekThumbnails || !seekThumbnails.image?.length || duration <= 0) return null;
    const xLen = Math.max(1, Math.floor(seekThumbnails.img_x_len) || 1);
    const yLen = Math.max(1, Math.floor(seekThumbnails.img_y_len) || 1);
    const totalPerImage = xLen * yLen;
    const totalFrames = Math.max(seekThumbnails.image.length * totalPerImage, seekThumbnails.index?.length || 0);
    let frameIndex = 0;
    const indexes = seekThumbnails.index;
    if (indexes && indexes.length > 0) {
      let low = 0;
      let high = indexes.length - 1;
      let pos = -1;
      while (low <= high) {
        const mid = (low + high) >> 1;
        if (indexes[mid] <= currentTime) {
          pos = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
      frameIndex = Math.max(0, pos - 1);
    } else {
      frameIndex = Math.min(Math.floor((currentTime / duration) * totalFrames), totalFrames - 1);
    }
    const pageIndex = Math.min(Math.floor(frameIndex / totalPerImage), Math.max(seekThumbnails.image.length - 1, 0));
    const align = frameIndex % totalPerImage;
    return {
      uri: seekThumbnails.image[pageIndex],
      col: align % xLen,
      row: Math.floor(align / xLen),
      xLen,
      yLen,
      frameW: Number(seekThumbnails.img_x_size) > 0 ? Number(seekThumbnails.img_x_size) : 160,
      frameH: Number(seekThumbnails.img_y_size) > 0 ? Number(seekThumbnails.img_y_size) : 90,
    };
  }, [currentTime, duration, seekThumbnails, showSeekThumb]);

  useEffect(() => {
    durationSV.set(duration);
    if (isScrubbingRef.current || duration <= 0) return;
    progressRatio.set(withTiming(Math.min(currentTime / duration, 1), {
      duration: 480,
      easing: Easing.linear,
    }));
  }, [currentTime, duration, durationSV, progressRatio, isScrubbingRef]);

  useEffect(() => {
    if (!showSeekThumb || !videoShotFrame) return;
    const key = `${videoShotFrame.uri}:${videoShotFrame.col}:${videoShotFrame.row}`;
    let cancelled = false;
    const pending = pendingCropsRef.current;
    let promise = pending.get(key);
    if (!promise) {
      promise = PiliPlayer.shared
        .cropSeekThumbnailAsync(
          videoShotFrame.uri,
          videoShotFrame.col,
          videoShotFrame.row,
          videoShotFrame.frameW,
          videoShotFrame.frameH,
          160,
          90,
        )
        .catch(() => null)
        .then((image) => {
          pending.delete(key);
          return image;
        });
      pending.set(key, promise);
    }
    promise.then((image) => {
      if (!cancelled && image) setThumb({ key, image });
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [videoShotFrame, showSeekThumb]);

  const thumbKey = videoShotFrame
    ? `${videoShotFrame.uri}:${videoShotFrame.col}:${videoShotFrame.row}`
    : '';
  const thumbImage = videoShotFrame && thumb?.key === thumbKey ? thumb.image : null;

  return (
    <>
      {showSeekThumb && videoShotFrame && thumbImage && duration > 0 && (
        <View style={styles.seekThumbWrap}>
          <View style={styles.seekThumbClip}>
            <PiliSeekThumbnailView
              image={thumbImage}
              style={styles.seekThumbImage}
            />
          </View>
          <Text style={styles.seekThumbTime}>{formatPlayerTime(currentTime)}</Text>
        </View>
      )}
      <View style={styles.progressRow}>
        <Text style={styles.timeText}>{formatPlayerTime(currentTime)}</Text>
        <GestureDetector gesture={scrubGesture}>
          <ProgressTrack
            style={styles.progressTrackArea}
            animStyle={progressTrackAnimStyle}
            duration={duration}
            density={densityMarkers ?? []}
            fillStyle={progressFillStyle}
            thumbStyle={progressThumbStyle}
            onLayout={onLayoutTrack}
          />
        </GestureDetector>
        <Text style={styles.timeText}>{formatPlayerTime(duration)}</Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  seekThumbWrap: {
    alignItems: 'center',
    marginBottom: 6,
  },
  seekThumbClip: {
    width: 160,
    height: 90,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.4)',
    overflow: 'hidden',
  },
  seekThumbImage: {
    width: 160,
    height: 90,
  },
  seekThumbTime: {
    color: '#FFF',
    fontSize: 11,
    marginTop: 3,
    fontVariant: ['tabular-nums'],
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
    height: 32,
    justifyContent: 'center',
  },
  progressBg: {
    borderRadius: 2.5,
    backgroundColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
  },
  densityMark: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: '#FFD60A',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2.5,
    backgroundColor: ACCENT,
  },
  progressThumb: {
    position: 'absolute',
    left: 0,
    top: '50%',
    marginTop: -6,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: ACCENT,
    shadowColor: 'rgba(0,0,0,0.4)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 2,
  },
});
