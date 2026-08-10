import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { PiliPlayerView } from 'pili-player';
import { EnhancedVideoView } from 'pili-video-enhance';
import { ACCENT } from '@/components/SwiftUIHost';
import { Press } from '@/components/motion';
import { formatPlayerTime } from '@/utils/player-utils';
import { useSettingsStore } from '@/stores/settings';
import { useVideoEnhance } from '@/hooks/use-video-enhance';
import type { Episode } from './pgc-types';
import { biliCover } from '@/utils/image-url';

interface PgcClip {
  start: number;
  end: number;
  clipType: string;
}

export function PgcPlayer({
  activeEp,
  playUrl,
  pgcLoading,
  pgcPlaying,
  playRepeat,
  player,
  pgcClips,
  onTap,
}: {
  activeEp: Episode | null;
  playUrl: string;
  pgcLoading: boolean;
  pgcPlaying: boolean;
  playRepeat: number;
  player: any;
  pgcClips: PgcClip[];
  onTap: () => void;
}) {
  const pgcSkipType = useSettingsStore((s) => s.pgcSkipType);
  const enhance = useVideoEnhance();
  const nativePlayerId = (player as any).getSharedPlayerId?.() ?? null;
  const [pgcTime, setPgcTime] = useState(0);
  const [pgcDuration, setPgcDuration] = useState(0);
  const [prevPlayUrl, setPrevPlayUrl] = useState(playUrl);

  /* 切集时在渲染期复位，避免 effect 内同步 setState */
  if (prevPlayUrl !== playUrl) {
    setPrevPlayUrl(playUrl);
    setPgcTime(0);
    setPgcDuration(0);
  }

  /* 进度只驱动播放器浮层，本地订阅避免整页 2Hz 重渲染 */
  useEffect(() => {
    if (!player) return;
    const sub = player.addListener('timeUpdate', (e: any) => {
      const duration = typeof e.duration === 'number' && e.duration > 0 ? e.duration : 0;
      if (duration > 0) setPgcDuration(duration);
      setPgcTime(typeof e.currentTime === 'number' ? e.currentTime : 0);
    });
    return () => sub.remove();
  }, [player]);

  useEffect(() => {
    if (!player || typeof player.setSkipSegments !== 'function') return;
    const skipIntro = (pgcSkipType & 1) !== 0;
    const skipOutro = (pgcSkipType & 2) !== 0;
    player.setSkipSegments(
      pgcClips
        .filter((clip) => (
          (clip.clipType === 'CLIP_TYPE_OP' && skipIntro) ||
          (clip.clipType === 'CLIP_TYPE_ED' && skipOutro)
        ))
        .map((clip) => [clip.start, clip.end]),
    );
  }, [player, pgcSkipType, pgcClips]);

  if (!activeEp) return null;

  return (
    <View style={styles.playerWrap}>
      {playUrl ? (
        enhance.enabled && nativePlayerId ? (
          <EnhancedVideoView
            playerId={nativePlayerId}
            options={enhance.options ?? undefined}
            contentFit="contain"
            onError={enhance.onError}
            onStateChange={enhance.onStateChange}
            style={StyleSheet.absoluteFill}
          />
        ) : (
          <PiliPlayerView
            player={player}
            style={StyleSheet.absoluteFill}
            videoGravity="contain"
          />
        )
      ) : (
        <>
          <ExpoImage source={{ uri: biliCover(activeEp.cover, 320, 200) }} style={StyleSheet.absoluteFill} contentFit="cover" />
          <View style={styles.playerCoverMask} />
        </>
      )}
      {pgcLoading && !playUrl ? (
        <ActivityIndicator size="large" color="#FFFFFF" style={StyleSheet.absoluteFill} />
      ) : null}
      <Press style={styles.playerTap} onPress={onTap}>
        <View style={styles.playerPlayBtn}>
          <Ionicons name={pgcPlaying ? 'pause' : 'play'} size={28} color="#FFFFFF" />
        </View>
      </Press>
      <View style={styles.playerInfoBar}>
        <Text style={styles.playerTitle} numberOfLines={1}>
          {`${activeEp.title}${activeEp.long_title ? ` ${activeEp.long_title}` : ''}`}
        </Text>
        <Text style={styles.playerTime}>{`${formatPlayerTime(pgcTime)} / ${formatPlayerTime(pgcDuration)}`}</Text>
      </View>
      <View style={styles.playerProgressTrack}>
        <View style={[styles.playerProgressFill, { width: `${pgcDuration > 0 ? Math.min(pgcTime / pgcDuration, 1) * 100 : 0}%` }]} />
      </View>
      {playRepeat === 2 ? (
        <View style={styles.autoNextBadge}>
          <Ionicons name="play-skip-forward" size={10} color="#FFFFFF" />
          <Text style={styles.autoNextText}>自动连播</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  /* 顶部播放器 */
  playerWrap: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' },
  playerCoverMask: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' },
  playerTap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  playerPlayBtn: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  playerInfoBar: {
    position: 'absolute', left: 0, right: 0, bottom: 8, zIndex: 3,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 5,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  playerTitle: { flex: 1, color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
  playerTime: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontVariant: ['tabular-nums'] },
  playerProgressTrack: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, backgroundColor: 'rgba(255,255,255,0.25)', zIndex: 3 },
  playerProgressFill: { height: 3, backgroundColor: ACCENT },
  autoNextBadge: {
    position: 'absolute', top: 8, right: 8, zIndex: 3,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 3,
  },
  autoNextText: { color: '#FFFFFF', fontSize: 10, fontWeight: '600' },
});
