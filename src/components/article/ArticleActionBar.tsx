/**
 * ArticleActionBar —— 专栏底部动作条（批次5 专栏阅读器 P3/L）。
 *
 * 点赞 / 收藏 / 评论 / 分享（保存分享）四个入口：
 *  - 点赞：走动态点赞体系（dyn_id_str，父层调 dynamicsApi.thumb，up=1/2 切换）；
 *  - 收藏：走 /x/article/favorites/add|del（父层调 articleApi）；
 *  - 评论：跳 main_reply（type=12 专栏，oid=cvid，父层路由）；
 *  - 分享：跳 save_panel 保留"保存分享"既有能力。
 *
 * 交互对齐批次4 C3 动效规范：激活瞬间 spring 爆发 1→1.25→1 + 颜色交叉淡入 150ms + haptic。
 */
import { memo, useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  useReducedMotion,
  interpolateColor,
} from 'react-native-reanimated';
import { Press } from '@/components/motion';
import { useThemeColors } from '@/components/SwiftUIHost';
import { useType } from '@/components/type-scale';
import { RADII, shadow } from '@/theme/tokens';
import { BILI } from '@/theme/bili-colors';
import { feedBack } from '@/utils/feedback';
import { formatCount } from '@/utils/format';

const AnimatedIonicons = Animated.createAnimatedComponent(Ionicons);

interface ActionItemProps {
  iconActive?: keyof typeof Ionicons.glyphMap;
  iconInactive: keyof typeof Ionicons.glyphMap;
  active?: boolean;
  activeColor?: string;
  label: string;
  onPress: () => void;
}

const ActionItem = memo(function ActionItem({
  iconActive,
  iconInactive,
  active = false,
  activeColor,
  label,
  onPress,
}: ActionItemProps) {
  const colors = useThemeColors();
  const T = useType();
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const progress = useSharedValue(active ? 1 : 0);
  const prevActive = useRef(active);

  useEffect(() => {
    if (reducedMotion) {
      progress.set(active ? 1 : 0);
      return;
    }
    progress.set(withTiming(active ? 1 : 0, { duration: 150 }));
    if (active && !prevActive.current) {
      scale.set(
        withSequence(
          withSpring(1.25, { damping: 16, stiffness: 260 }),
          withSpring(1, { damping: 16, stiffness: 260 }),
        ),
      );
      feedBack();
    }
    prevActive.current = active;
  }, [active, reducedMotion, progress, scale]);

  const inactiveColor = colors.textSecondary;
  const accent = activeColor ?? colors.accent;
  const iconStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [inactiveColor, accent]),
  }));
  const countStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [colors.textTertiary, accent]),
  }));
  const burstStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Press haptic scaleTo={0.92} onPress={onPress} style={styles.actionBtn}>
      <Animated.View style={burstStyle}>
        <AnimatedIonicons
          name={active && iconActive ? iconActive : iconInactive}
          size={21}
          style={iconStyle}
        />
      </Animated.View>
      <Animated.Text style={[T.caption2, styles.actionCount, countStyle]}>{label}</Animated.Text>
    </Press>
  );
});

export interface ArticleStats {
  like: number;
  favorite: number;
  reply: number;
}

export const ArticleActionBar = memo(function ArticleActionBar({
  stats,
  liked,
  faved,
  onLike,
  onFav,
  onComment,
  onShare,
}: {
  stats: ArticleStats;
  liked: boolean;
  faved: boolean;
  onLike: () => void;
  onFav: () => void;
  onComment: () => void;
  onShare: () => void;
}) {
  const colors = useThemeColors();
  const T = useType();

  return (
    <View style={[styles.bar, { backgroundColor: colors.card }, shadow('md', colors.isDark)]}>
      <ActionItem
        iconActive="thumbs-up"
        iconInactive="thumbs-up-outline"
        active={liked}
        label={formatCount(stats.like || 0)}
        onPress={onLike}
      />
      <View style={[styles.divider, { backgroundColor: colors.separator }]} />
      <ActionItem
        iconActive="star"
        iconInactive="star-outline"
        active={faved}
        activeColor={BILI.star}
        label={formatCount(stats.favorite || 0)}
        onPress={onFav}
      />
      <View style={[styles.divider, { backgroundColor: colors.separator }]} />
      <ActionItem
        iconActive="chatbubble-ellipses"
        iconInactive="chatbubble-ellipses-outline"
        label={formatCount(stats.reply || 0)}
        onPress={onComment}
      />
      <View style={[styles.divider, { backgroundColor: colors.separator }]} />
      <Press haptic scaleTo={0.92} onPress={onShare} style={styles.actionBtn}>
        <Ionicons name="share-outline" size={21} color={colors.textSecondary} />
        <Text style={[T.caption2, styles.actionCount, { color: colors.textTertiary }]}>
          保存分享
        </Text>
      </Press>
    </View>
  );
});

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADII.sheet,
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginHorizontal: 14,
    marginBottom: 8,
  },
  actionBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, gap: 3 },
  actionCount: { fontWeight: '600' },
  divider: { width: StyleSheet.hairlineWidth, height: 26 },
});
