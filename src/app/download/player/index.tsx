import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { PiliPlayer, PiliPlayerProgressBar, PiliPlayerView } from 'pili-player';
import { Press } from '@/components/motion';
import { useThemeColors } from '@/components/SwiftUIHost';

export default function DownloadPlayerScreen() {
  const params = useLocalSearchParams<{ uri: string; title?: string }>();
  const colors = useThemeColors();
  const [playing, setPlaying] = useState(false);
  const player = PiliPlayer.shared;

  useEffect(() => {
    let cancelled = false;
    const uri = String(params.uri || '');
    if (!uri) return;
    (async () => {
      try {
        await player.replaceAsync({ uri });
        if (cancelled) return;
        player.setLoop(false);
        player.play();
      } catch (e) {
        console.error('local player load error:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.uri, player]);

  useEffect(() => {
    return () => {
      try {
        player.pause();
      } catch {}
    };
  }, [player]);

  useEffect(() => {
    const playingSub = player.addListener('playingChange', (e: any) => {
      setPlaying(!!e.isPlaying);
    });
    return () => {
      playingSub.remove();
    };
  }, [player]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (typeof (player as any).playing === 'boolean') {
        setPlaying(!!(player as any).playing);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [player]);

  const togglePlay = () => {
    if (playing) player.pause();
    else player.play();
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Title large>{String(params.title || '本地播放')}</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <View style={styles.videoWrap}>
        <PiliPlayerView player={player} style={styles.video} videoGravity="contain" />
        <View style={styles.overlay}>
          <Press haptic scaleTo={0.9} onPress={togglePlay} style={styles.playBtn}>
            <Ionicons name={playing ? 'pause' : 'play'} size={30} color="#FFFFFF" />
          </Press>
          <PiliPlayerProgressBar style={styles.nativeProgress} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  videoWrap: { flex: 1, justifyContent: 'center', backgroundColor: '#000' },
  video: { width: '100%', height: 260 },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  playBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nativeProgress: {
    width: '100%',
    minHeight: 30,
  },
});
