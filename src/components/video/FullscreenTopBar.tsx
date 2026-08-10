import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import type { EdgeInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ACCENT } from '@/components/SwiftUIHost';
import { Press } from '@/components/motion';
import { BatteryLabel } from '@/components/video/BatteryLabel';

interface FullscreenTopBarProps {
  controlsShown: boolean;
  controlsOpacity: SharedValue<number>;
  insets: EdgeInsets;
  title: string;
  onlineCount: string;
  liked: boolean;
  disliked: boolean;
  coined: boolean;
  faved: boolean;
  showActionBar: boolean;
  showLockButton: boolean;
  showBattery: boolean;
  locked: boolean;
  onExit: () => void;
  onToggleLock: () => void;
  onLike: () => void;
  onTriple: () => void;
  onDislike: () => void;
  onCoin: () => void;
  onFav: () => void;
  onShare: () => void;
}

export function FullscreenTopBar({
  controlsShown,
  controlsOpacity,
  insets,
  title,
  onlineCount,
  liked,
  disliked,
  coined,
  faved,
  showActionBar,
  showLockButton,
  showBattery,
  locked,
  onExit,
  onToggleLock,
  onLike,
  onTriple,
  onDislike,
  onCoin,
  onFav,
  onShare,
}: FullscreenTopBarProps) {
  const controlsAnimStyle = useAnimatedStyle(() => ({ opacity: controlsOpacity.value }));
  const showLock = showLockButton && (controlsShown || locked);
  const titleRight = showActionBar ? 196 : 60;

  return (
    <>
      <Animated.View
        style={[styles.topLayer, controlsAnimStyle]}
        pointerEvents={controlsShown ? 'box-none' : 'none'}>
        <Press haptic scaleTo={0.86} onPress={onExit} style={[styles.topBtn, { top: insets.top + 8, left: 12 }]}>
          <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
        </Press>
        {title ? (
          <View style={[styles.titleWrap, { top: insets.top + 12, left: 60, right: titleRight }]}>
            <Text style={styles.titleText} numberOfLines={1}>{title}</Text>
            {(onlineCount || showBattery) ? (
              <View style={styles.titleMeta}>
                {onlineCount ? <Text style={styles.metaText}>{onlineCount}人正在看</Text> : null}
                {showBattery ? <BatteryLabel /> : null}
              </View>
            ) : null}
          </View>
        ) : showBattery ? (
          <View style={[styles.batteryFloat, { top: insets.top + 14, right: titleRight }]}>
            <BatteryLabel />
          </View>
        ) : null}
        {showActionBar ? (
          <View style={{ position: 'absolute', top: insets.top + 8, right: 12, flexDirection: 'row', gap: 2 }}>
            <Press haptic scaleTo={0.85} onPress={onLike} onLongPress={onTriple} style={styles.actionBtn}>
              <Ionicons name={liked ? 'heart' : 'heart-outline'} size={19} color={liked ? ACCENT : '#FFFFFF'} />
            </Press>
            <Press haptic scaleTo={0.85} onPress={onDislike} style={styles.actionBtn}>
              <Ionicons name={disliked ? 'thumbs-down' : 'thumbs-down-outline'} size={19} color={disliked ? ACCENT : '#FFFFFF'} />
            </Press>
            <Press haptic scaleTo={0.85} onPress={onCoin} style={styles.actionBtn}>
              <Ionicons name="logo-bitcoin" size={19} color={coined ? ACCENT : '#FFFFFF'} />
            </Press>
            <Press haptic scaleTo={0.85} onPress={onFav} style={styles.actionBtn}>
              <Ionicons name={faved ? 'star' : 'star-outline'} size={19} color={faved ? '#FFD700' : '#FFFFFF'} />
            </Press>
            <Press haptic scaleTo={0.85} onPress={onShare} style={styles.actionBtn}>
              <Ionicons name="share-outline" size={19} color="#FFFFFF" />
            </Press>
          </View>
        ) : null}
      </Animated.View>

      {showLock ? (
        <Press haptic scaleTo={0.86} onPress={onToggleLock} style={styles.lockBtn}>
          <Ionicons name={locked ? 'lock-closed' : 'lock-open'} size={18} color="#FFFFFF" />
        </Press>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  topLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
  },
  titleWrap: {
    position: 'absolute',
  },
  titleText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  titleMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 3,
  },
  metaText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
  },
  batteryFloat: {
    position: 'absolute',
  },
  topBtn: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBtn: { padding: 10 },
  lockBtn: {
    position: 'absolute',
    top: '45%',
    left: 12,
    zIndex: 30,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
