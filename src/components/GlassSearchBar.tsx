/**
 * GlassSearchBar —— 液态玻璃浮动搜索栏（iOS 26 Liquid Glass 风格）。
 *
 * 设计还原：
 *  - 完全透明的浮动层——无实心底色、无整块模糊背景，行内元素自身即玻璃材质；
 *  - 行内三件套（头像玻璃圈 + pill 搜索框 + 铃铛/扩展圆钮）外包
 *    GlassContainer spacing={12}——相邻玻璃在阈值内自动融合为连续材质
 *    （iOS 26 标志性效果，GlassEffect.md GlassContainer）；
 *    头像也包一层 Glass clear 圆形参与融合；
 *  - 触摸目标：右侧玻璃按钮视觉 36pt，外包 44pt 命中区（Apple HIG 最小可触尺寸）。
 *
 * 滚动折叠（hideProgress 0→1）：
 *  - 整行只做 height 44→0 + translateY -10 的裁切退场——
 *    ⚠️ 绝不对玻璃祖先做 opacity 动画：GlassEffect.md Known issues 明确
 *    GlassView 或其任意父级 opacity=0 会导致玻璃完全不渲染；
 *  - 淡出观感由内部非玻璃元素（搜索文字/图标、按钮图标）单独 opacity 承担，
 *    玻璃本体靠高度裁切退场。
 *
 * 性能：组件用 memo 包裹，父级滚动不会触发重渲染；折叠动画全程走 reanimated worklet。
 */
import { memo, type ReactNode } from 'react';
import { View, Text as RNText, StyleSheet } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { GlassContainer } from 'expo-glass-effect';
import { Glass, canUseLiquidGlass } from './Glass';
import { biliCover } from '@/utils/image-url';
import { Press } from './motion';
import { useThemeColors } from './SwiftUIHost';
import { useType } from './type-scale';
import { shadow, continuous, RADII } from '@/theme/tokens';

/** Ionicons 图标名类型（extraButton.icon 为宽 string，需收窄） */
type GlyphName = keyof typeof Ionicons.glyphMap;

export interface GlassSearchBarProps {
  /** 搜索行隐藏进度：0 = 完全展开，1 = 搜索行收起（分类栏常驻时由父级传入） */
  hideProgress?: SharedValue<number>;
  /** 头像 URI（空则显示占位） */
  avatarUri?: string;
  /** 头像上的通知红点 */
  showBadge?: boolean;
  /** 未读消息数（显示在铃铛按钮上） */
  unreadCount?: number;
  /** 消息未读角标模式：0=隐藏 1=数字 2=红点 */
  badgeMode?: number;
  /** 点击搜索 pill */
  onSearchPress: () => void;
  /** 点击头像 */
  onAvatarPress: () => void;
  /** 点击铃铛/通知按钮 */
  onBellPress: () => void;
  /** 额外右侧按钮（可选，如设置按钮） */
  extraButton?: { icon: string; onPress: () => void };
  /** 安全区域顶部 insets */
  topInset: number;
  /** 搜索行下方的附加内容（如分类栏），独立于搜索行渲染 */
  children?: ReactNode;
}

export const GlassSearchBar = memo(function GlassSearchBar({
  hideProgress,
  avatarUri,
  showBadge = false,
  unreadCount = 0,
  badgeMode = 1,
  onSearchPress,
  onAvatarPress,
  onBellPress,
  extraButton,
  topInset,
  children,
}: GlassSearchBarProps) {
  const colors = useThemeColors();
  const T = useType();
  /* Liquid Glass 可用 → GlassContainer 融合；否则普通 View 降级（布局一致） */
  const liquid = canUseLiquidGlass();

  /* 搜索行折叠动画：height 44→0 + 上移，由 hideProgress 弹簧驱动。
     注意：这里刻意没有 opacity——玻璃祖先 opacity=0 会导致 GlassView 不渲染
     （GlassEffect.md Known issues），退场靠高度裁切完成。 */
  const searchRowAnim = useAnimatedStyle(() => {
    const p = hideProgress ? hideProgress.value : 0;
    return {
      height: 44 * (1 - p),
      transform: [{ translateY: -10 * p }],
      pointerEvents: (p > 0.5 ? 'none' : 'auto') as any,
    };
  });

  /* 非玻璃元素（文字/图标）的单独淡出：折叠时提供"淡出观感"，
     作用域仅限玻璃内部子元素，不触碰玻璃本体。 */
  const contentFade = useAnimatedStyle(() => ({
    opacity: 1 - (hideProgress ? hideProgress.value : 0),
  }));

  /* 行内三件套：头像玻璃圈 + 搜索 pill + 铃铛/扩展圆钮 */
  const rowContent = (
    <>
      {/* 头像：Glass clear 圆形（参与 GlassContainer 融合），可带通知红点 */}
      <Press
        onPress={onAvatarPress}
        haptic
        accessibilityRole="button"
        accessibilityLabel="个人中心">
        <Glass variant="clear" style={styles.avatarGlass}>
          <ExpoImage
            source={
              avatarUri ? { uri: biliCover(avatarUri, 96, 96) } : require('../../assets/noface.jpeg')
            }
            style={[styles.avatarImg, { backgroundColor: colors.fill2 }]}
            contentFit="cover"
          />
        </Glass>
        {showBadge && (
          <View style={[styles.avatarDot, { backgroundColor: colors.badge }]} />
        )}
      </Press>

      {/* 搜索 pill：Glass regular 材质，flex: 1 撑满中段 */}
      <Press
        onPress={onSearchPress}
        style={styles.searchPress}
        accessibilityRole="search"
        accessibilityLabel="搜索">
        <Glass
          variant="regular"
          isInteractive
          style={[styles.searchPill, shadow('glass', colors.isDark)]}>
          {/* 非玻璃内容单独淡出（图标 + 文字） */}
          <Animated.View style={[styles.pillInner, contentFade]}>
            <Ionicons name="search" size={16} color={colors.textTertiary} />
            <RNText style={[T.subhead, { color: colors.textTertiary }]}>搜索</RNText>
          </Animated.View>
        </Glass>
      </Press>

      {/* 铃铛按钮：Glass clear 圆形，未读数 > 0 时右上角红底白字 badge */}
      <Press
        onPress={onBellPress}
        haptic
        style={styles.btnHit}
        accessibilityRole="button"
        accessibilityLabel={
          unreadCount > 0 ? `通知，${unreadCount} 条未读` : '通知'
        }>
        <Glass
          variant="clear"
          isInteractive
          style={[styles.circleBtn, shadow('glass', colors.isDark)]}>
          <Animated.View style={[styles.iconFill, contentFade]}>
            <Ionicons
              name="notifications-outline"
              size={20}
              color={colors.text}
            />
          </Animated.View>
        </Glass>
        {unreadCount > 0 && badgeMode !== 0 && (
          <View
            style={[
              badgeMode === 2 ? styles.unreadDot : styles.unreadBadge,
              { backgroundColor: colors.badge },
            ]}>
            {badgeMode !== 2 && (
              <RNText style={styles.unreadText}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </RNText>
            )}
          </View>
        )}
      </Press>

      {/* 额外按钮（可选）：同款圆形玻璃按钮 */}
      {extraButton && (
        <Press
          onPress={extraButton.onPress}
          haptic
          style={styles.btnHit}
          accessibilityRole="button">
          <Glass
            variant="clear"
            isInteractive
            style={[styles.circleBtn, shadow('glass', colors.isDark)]}>
            <Animated.View style={[styles.iconFill, contentFade]}>
              <Ionicons
                name={extraButton.icon as GlyphName}
                size={20}
                color={colors.text}
              />
            </Animated.View>
          </Glass>
        </Press>
      )}
    </>
  );

  return (
    <View
      style={[styles.container, { paddingTop: topInset }]}
      pointerEvents="box-none">
      {/* ── 搜索行内容层（滚动时按高度裁切折叠，分类栏常驻） ── */}
      <Animated.View style={[styles.row, searchRowAnim]}>
        {liquid ? (
          /* GlassContainer spacing={12}：相邻玻璃靠近时边缘融合、分离时各自成形 */
          <GlassContainer spacing={12} style={styles.rowInner}>
            {rowContent}
          </GlassContainer>
        ) : (
          /* 降级分支：普通 View，布局参数一致 */
          <View style={styles.rowInner}>{rowContent}</View>
        )}
      </Animated.View>

      {/* 分类栏等附加内容：独立于搜索行，不随其折叠 */}
      {children}
    </View>
  );
});

const styles = StyleSheet.create({
  /** 浮动外层：绝对定位悬浮于内容之上，无实心底色 */
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  /** 搜索行动画外壳：height/translateY 由 worklet 驱动；
      overflow hidden 保证折叠时玻璃被裁切退场 */
  row: {
    overflow: 'hidden',
  },
  /** 行内布局（GlassContainer 与降级 View 共用）：间距 12 与 spacing 一致 */
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 44,
    gap: 12,
  },
  /** 头像玻璃圈：32pt 圆形（GlassView 自身圆角由系统处理，不加 borderCurve） */
  avatarGlass: {
    width: 32,
    height: 32,
    borderRadius: RADII.card,
    overflow: 'hidden',
  },
  /** 头像图片：贴满玻璃圈，连续曲率裁切 */
  avatarImg: {
    width: '100%',
    height: '100%',
    borderRadius: RADII.card,
    ...continuous,
  },
  /** 头像通知红点：6pt 红点 + 1.5px 白描边 */
  avatarDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  /** 搜索 pill 的 Press 外壳：撑满中段宽度 */
  searchPress: {
    flex: 1,
  },
  /** 搜索 pill：液态玻璃胶囊（阴影走 tokens 'glass' 接触阴影档） */
  searchPill: {
    flex: 1,
    height: 36,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    ...continuous,
  },
  /** pill 内非玻璃内容行（图标 + 文字），折叠时单独淡出 */
  pillInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  /** 玻璃圆钮内图标容器：撑满并居中，折叠时单独淡出 */
  iconFill: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  /** 44pt 触摸命中区（Apple HIG），内部玻璃按钮视觉 36pt */
  btnHit: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  /** 圆形玻璃按钮（阴影走 tokens 'glass' 档） */
  circleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    ...continuous,
  },
  /** 未读数 badge：红底白字，白描边与玻璃边缘区隔 */
  unreadBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    paddingHorizontal: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unreadText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.1,
    textAlign: 'center',
  },
  /* 红点模式（msgBadgeMode=2）小圆点 */
  unreadDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
});
