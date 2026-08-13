import { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Press } from '@/components/motion';
import { ACCENT, useThemeColors } from '@/components/SwiftUIHost';
import { PiliPlayerProgressBar } from 'pili-player';

/**
 * 收起态播放器工具条（暂停后滚动收起时显示）。
 *
 * 01-R4（P2）：进度显示改用原生 PiliPlayerProgressBar——原生视图内部通过
 * addPeriodicTimeObserver 订阅共享 AVPlayer，进度/时间文本都在原生侧渲染，
 * 不再经 timeUpdate 事件驱动 JS 端 2Hz setState 重渲染。
 */
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
      <View style={styles.row}>
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
      {/* 01-R4：原生进度条（含时间文本，文本色固定为白色）。
       * 用深色半透明底衬包裹，保证浅色主题下收起条也能看清时间/进度。 */}
      <View style={styles.nativeProgressWrap}>
        <PiliPlayerProgressBar
          style={styles.nativeProgress}
          progressTintColor={ACCENT}
          trackTintColor="rgba(255,255,255,0.25)"
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  collapsedBar: {
    flexDirection: 'column',
    paddingTop: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
  },
  collapsedBtn: { padding: 10 },
  collapsedPlayWrap: { flex: 1, alignItems: 'center' },
  collapsedPlayBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 14 },
  nativeProgressWrap: {
    marginHorizontal: 10,
    marginBottom: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    overflow: 'hidden',
  },
  nativeProgress: {
    width: '100%',
    minHeight: 30,
  },
});
