import { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Press } from '@/components/motion';
import { ACCENT, useThemeColors } from '@/components/SwiftUIHost';

export const CollapsedPlayerBar = memo(function CollapsedPlayerBar({
  isPlaying,
  playedTime,
  colors,
  onPlayPause,
  onBack,
  onHome,
}: {
  isPlaying: boolean;
  playedTime: number;
  colors: ReturnType<typeof useThemeColors>;
  onPlayPause: () => void;
  onBack: () => void;
  onHome: () => void;
}) {
  return (
    <View style={[styles.collapsedBar, { backgroundColor: colors.bg }]}>
      <Press haptic scaleTo={0.9} onPress={onBack} style={styles.collapsedBtn}>
        <Ionicons name="chevron-back" size={17} color={colors.text} />
      </Press>
      <Press haptic scaleTo={0.9} onPress={onHome} style={styles.collapsedBtn}>
        <Ionicons name="home-outline" size={17} color={colors.text} />
      </Press>
      <View style={styles.collapsedPlayWrap}>
        <Press haptic scaleTo={0.92} onPress={onPlayPause} style={styles.collapsedPlayBtn}>
          <Ionicons name={isPlaying ? 'pause' : 'play'} size={15} color={ACCENT} />
          <Text style={{ color: ACCENT, fontSize: 13, fontWeight: '600' }}>
            {isPlaying ? '暂停' : playedTime > 0 ? '继续播放' : '立即播放'}
          </Text>
        </Press>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  collapsedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
  },
  collapsedBtn: { padding: 10 },
  collapsedPlayWrap: { flex: 1, alignItems: 'center' },
  collapsedPlayBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 14 },
});
