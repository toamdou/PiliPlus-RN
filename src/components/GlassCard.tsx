/**
 * GlassCard —— 双模式玻璃卡片（iOS 26 液态玻璃风格，HeroUI 玻璃卡参考）。
 *
 * 两种形态：
 *  - immersive（单列沉浸）：全宽全出血封面；底部静态磨砂层 + 渐变上直接叠
 *    文字（标题 + UP主·播放·时长，HeroUI 卡片风格，无独立面板），
 *    左上角分类玻璃胶囊；
 *  - compact（双列紧凑）：半宽 16:9 封面，图片底部 40px 渐变数据条
 *    （播放量 + 弹幕数 + 时长），从图片自然渐隐，下方是标题两行 + UP主行。
 *
 * 材质策略：
 *  - 底部磨砂层 = expo-blur 高斯模糊（systemChromeMaterialDark + intensity 100）
 *    + MaskedView 渐变消失无硬边，标题区模糊更实。不用 Liquid Glass：
 *    玻璃在深色/纯色封面上几乎不可见；模糊面积仅限文字区高度，滚动成本可控；
 *  - 分类胶囊 = iOS 26 原生 GlassView（Liquid Glass，小面积系统级优化）；
 *  - 底部磨砂层高度跟随文字区实测（刚好高过标题），不盖整卡；
 *  - 加载占位为静态填充色。
 *
 * 动效（全部 UI 线程 / 挂载一次，零逐帧 JS 开销，卡片本体静止不跟手）：
 *  - Press 按压缩放（scaleTo 0.98，纯 RN 链安全）；
 *  - 封面 1.05→1 弹簧缩放入场、分类胶囊 0.8→1 弹入、面板 10→0 上浮；
 *  - 玻璃元素只做 transform 动画，不用 opacity（GlassView 官方 Known issue：
 *    opacity=0 时玻璃不渲染）；
 *  - 均响应系统"减弱动态效果"。
 *
 * 颜色约定（5.10）：非图上文字/边框/填充一律走 useThemeColors / DYN.*，
 * 随明暗翻转；图上压字（面板标题、数据条白字）与其深色玻璃/渐变底衬
 * 保留恒定白色——封面叠层恒深底，不随主题翻转，属合理例外。
 *
 * 动效复用 ./motion：Press 触觉反馈 + Reveal 入场淡入上移（delay 交错）。
 */
import React, { createContext, memo, useContext, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassView } from 'expo-glass-effect';
import MaskedView from '@react-native-masked-view/masked-view';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
  useReducedMotion,
  interpolate,
} from 'react-native-reanimated';
import { Press } from './motion';
import { useThemeColors } from './SwiftUIHost';
import { useType } from './type-scale';
import { formatCount, formatDuration } from '@/utils/format';
import { RADII, shadow, continuous } from '@/theme/tokens';

/** 供 VideoCard 等外部行高消费者沿用的默认窗口宽度；组件内部使用 useWindowDimensions 实时计算 */
const DEFAULT_WINDOW_WIDTH = 390;
/** immersive 卡片高度：全宽 ≈16:9（总高固定，文字 absolute 覆盖图上，供 VideoCard 定行高） */
export function immersiveHeightFor(windowWidth: number): number {
  return windowWidth * 0.56;
}
/** compact 封面高度：双列半宽（扣除页边距 24 + 列间距 12）× 16:9（供 VideoCard 定行高） */
export function compactCoverHeightFor(windowWidth: number): number {
  return ((windowWidth - 36) / 2) * 9 / 16;
}
export const IMMERSIVE_HEIGHT = immersiveHeightFor(DEFAULT_WINDOW_WIDTH);
export const COMPACT_COVER_HEIGHT = compactCoverHeightFor(DEFAULT_WINDOW_WIDTH);
const EntryAnimationDisabledContext = createContext(false);

/** 列表宿主可将整段列表包进此 Provider，关闭列表行 GlassCard 的入场动画。 */
export function GlassCardEntryAnimationDisabledProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <EntryAnimationDisabledContext.Provider value={true}>
      {children}
    </EntryAnimationDisabledContext.Provider>
  );
}

/* ================= 卡片玻璃材质（HeroUI 玻璃卡核心） =================
 * iOS 26 原生 Liquid Glass：系统级渲染优化，信息流内多实例正常；
 * 关键：绝不用 expo-blur BlurView 兜底（滚动时每帧对移动内容重新采样）。
 */
function CardGlass({
  style,
  children,
}: {
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}) {
  return (
    <GlassView glassEffectStyle="regular" colorScheme="auto" style={style}>
      {children}
    </GlassView>
  );
}

/* 底部磨砂层（无 children 的模糊容器）：
 * expo-blur 高斯模糊 + MaskedView 让模糊从透明渐变到完全不透明（无硬边）。
 * tint 用系统材质（非纯黑 dark）：dark 在彩色封面上只呈现"深色块"、
 * 模糊纹理几乎不可见；systemChromeMaterialDark 带自适应着色，磨砂质感明显，
 * 暗封面上同样自适应。intensity 拉满 100，mask 让标题区模糊更实。 */
function CardFrost({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <MaskedView
      style={style}
      maskElement={
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.45)', 'rgba(0,0,0,0.8)', 'black']}
          locations={[0, 0.3, 0.65, 1]}
          style={StyleSheet.absoluteFill}
        />
      }>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(10,10,12,0.55)' }]} />
    </MaskedView>
  );
}

/* 卡片入场动效弹簧参数（Apple HIG：轻微欠阻尼，一次到位微过冲） */
const ZOOM_SPRING = { damping: 22, stiffness: 300, mass: 1 };
const POP_SPRING = { damping: 18, stiffness: 320, mass: 1 };
const RISE_SPRING = { damping: 24, stiffness: 280, mass: 1 };

export interface GlassCardData {
  /** 封面图 URL */
  cover: string;
  /** 标题 */
  title: string;
  /** 副标题/描述（immersive 模式显示在标题下方） */
  subtitle?: string;
  /** 分类标签（immersive 模式显示在标题上方，如 "ANIMATIC"） */
  category?: string;
  /** UP主名 */
  author?: string;
  /** 播放量 */
  playCount?: number;
  /** 弹幕数 */
  danmakuCount?: number;
  /** 时长（秒） */
  duration?: number;
}

export interface GlassCardProps {
  data: GlassCardData;
  mode: 'immersive' | 'compact';
  onPress: () => void;
  /** 长按菜单（可选） */
  onLongPress?: () => void;
  /** 入场动画延迟 */
  delay?: number;
  /** 关闭入场动画（列表行复用场景） */
  disableEntryAnimation?: boolean;
  /** 自定义 children 覆盖默认文字区域（可选，用于动态卡片等自定义内容） */
  children?: React.ReactNode;
}

function GlassCardBase({
  data,
  mode,
  onPress,
  onLongPress,
  delay = 0,
  disableEntryAnimation = false,
  children,
}: GlassCardProps) {
  const colors = useThemeColors();
  const T = useType();
  const reducedMotion = useReducedMotion();
  const { width: windowWidth } = useWindowDimensions();
  const entryAnimationDisabled =
    useContext(EntryAnimationDisabledContext) || disableEntryAnimation;
  const animateEntry = !reducedMotion && !entryAnimationDisabled;
  /* 文字区实测高度：磨砂/渐变层高度 = 实测 + 8pt（"刚好高过标题"）。
     标题 1~2 行 / 无 meta 行时高度变化 → onLayout 自动跟随，无需随 item 重置 */
  const [textLayerH, setTextLayerH] = useState(0);

  /* ---- 入场微动效（挂载一次，UI 线程弹簧）：
     封面 1.05→1 缩放、胶囊 0.8→1 弹入、面板 10→0 上浮，delay 交错跟随 Reveal。
     卡片本体不做滚动跟随/视差（保持完全静止，不跟手）；
     玻璃元素只做 transform 动画，不用 opacity（GlassView 官方 Known issue）。 ---- */
  const coverZoom = useSharedValue(animateEntry ? 0 : 1);
  const chipScale = useSharedValue(animateEntry ? 0 : 1);
  const panelY = useSharedValue(animateEntry ? 0 : 10);
  useEffect(() => {
    if (!animateEntry) return;
    coverZoom.set( withDelay(delay, withSpring(1, ZOOM_SPRING)));
    chipScale.set( withDelay(delay + 80, withSpring(1, POP_SPRING)));
    panelY.set( withDelay(delay + 40, withSpring(0, RISE_SPRING)));
  }, [animateEntry, delay, reducedMotion, coverZoom, chipScale, panelY]);

  const coverZoomStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(coverZoom.value, [0, 1], [1.05, 1]) }],
  }));
  const chipPopStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(chipScale.value, [0, 1], [0.8, 1]) }],
  }));
  const panelRiseStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: panelY.value }],
  }));

  /* ---------- immersive：单列沉浸 ---------- */
  if (mode === 'immersive') {
    // 标题下方的元信息行：优先 subtitle，否则 "UP主 · 1.2万播放"；有时长则追加
    const fallbackMeta = [
      data.author,
      data.playCount != null ? `${formatCount(data.playCount)}播放` : null,
    ]
      .filter((s): s is string => !!s)
      .join(' · ');
    const durationText =
      data.duration != null && data.duration > 0 ? formatDuration(data.duration) : null;
    const metaLine = [data.subtitle ?? fallbackMeta, durationText]
      .filter((s): s is string => !!s)
      .join(' · ');

    /* 磨砂层高度跟随文字区实测高度（"刚好高过标题"）：
       磨砂/渐变层 = 实测高 + 8pt 余量；首帧未测得时用 42% 兜底（原 60% 过长）。 */
    const immersiveHeight = windowWidth * 0.56;
    const frostH = textLayerH > 0 ? textLayerH + 8 : immersiveHeight * 0.42;

    return (
      <>
        <Press
          haptic
          scaleTo={0.98}
          pressDelay={80}
          onPress={onPress}
          onLongPress={onLongPress}
          accessibilityLabel={data.title}
          style={[
            styles.immersiveCard,
            { height: immersiveHeight },
            shadow('md', colors.isDark),
          ]}>
          {/* 封面（加载中由 expo-image 原生 background 显示占位；不用 transition 淡入——快速滚动时每张
              新卡/回收换图都会触发 GPU 淡入，加剧丢帧）。
              清晰度：封面 URL 已在数据层追加 B 站 CDN 缩放参数（@w_h_1c.webp）。
              缩放 1.05 溢出部分由卡片 overflow hidden 裁切，无需放大容器 */}
          <Animated.View style={[StyleSheet.absoluteFill, coverZoomStyle]}>
            <ExpoImage
              source={{ uri: data.cover }}
              /* recyclingKey：expo-image 官方要求（列表回收场景必设）——key 变化时
                 立即清空旧图内容（显示占位/底色），绝不允许"上一个视频的封面"残留
                 到新图加载完成，否则回收的卡片会短暂显示别的视频封面 */
              recyclingKey={data.cover}
              cachePolicy="memory-disk"
              style={[StyleSheet.absoluteFill, { backgroundColor: colors.fill2 }]}
              contentFit="cover"
            />
          </Animated.View>
          {/* 底部磨砂层（静态深色半透明 + 渐变，高度贴合文字区）——
              高度贴合文字区，滚动时无逐帧重采样开销 */}
          <CardFrost style={[styles.immersiveBlurMask, { height: frostH }]} />
          {/* 渐变色彩遮罩层：叠加在磨砂之上加深底部，确保白字可读（图上压字，恒黑色） */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.08)', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.6)']}
            locations={[0, 0.3, 0.65, 1.0]}
            style={[styles.immersiveGradient, { height: frostH }]}
          />
          {children ?? (
            <>
              {/* 分类玻璃胶囊（HeroUI 风格：LIVE / BANGUMI / 推荐理由）。
                  纯 transform 弹入，不用 opacity（GlassView Known issue） */}
              {!!data.category && (
                <CardGlass style={styles.immersiveChip}>
                  <Animated.Text
                    style={[T.caption2, styles.chipText, chipPopStyle]}
                    numberOfLines={1}>
                    {data.category}
                  </Animated.Text>
                </CardGlass>
              )}
              {/* 文字层直接叠在磨砂渐变上（HeroUI 卡片风格，无独立面板）：
                  标题 + UP主·播放·时长，上浮入场为纯 transform */}
              <View
                style={styles.immersiveTextLayer}
                onLayout={(e) => setTextLayerH(e.nativeEvent.layout.height)}>
                <Animated.View style={panelRiseStyle}>
                  <Text style={[T.headline, styles.immersiveTitle]} numberOfLines={2}>
                    {data.title}
                  </Text>
                  {!!metaLine && (
                    <View style={styles.immersiveMetaRow}>
                      <Ionicons name="person-outline" size={12} color="rgba(255,255,255,0.75)" />
                      <Text style={[T.footnote, styles.immersiveMeta]} numberOfLines={1}>
                        {metaLine}
                      </Text>
                    </View>
                  )}
                </Animated.View>
              </View>
            </>
          )}
        </Press>
      </>
    );
  }

  /* ---------- compact：双列紧凑 ---------- */
  const compactCoverHeight = ((windowWidth - 36) / 2) * 9 / 16;
  return (
    <>
      <Press
        haptic
        scaleTo={0.98}
        pressDelay={80}
        onPress={onPress}
        onLongPress={onLongPress}
        accessibilityLabel={data.title}
        style={[
          styles.compactCard,
          shadow('sm', colors.isDark),
          {
            backgroundColor: colors.card,
            borderColor: colors.cardBorder,
          },
        ]}>
        {/* 封面区（加载中由 expo-image 原生 background 显示占位；不用 transition，理由同上。
            清晰度：封面 URL 已在数据层追加 B 站 CDN 缩放参数） */}
        <View style={{ height: compactCoverHeight }}>
          <ExpoImage
            source={{ uri: data.cover }}
            /* recyclingKey：同上——列表回收时防止旧视频封面残留 */
            recyclingKey={data.cover}
            cachePolicy="memory-disk"
            style={[StyleSheet.absoluteFill, { backgroundColor: colors.fill2 }]}
            contentFit="cover"
          />
          {/* 底部渐变数据条：实时模糊（MaskedView>BlurView）改为静态半透明，
              与 immersive 实验A 同款降级——滚动时每张卡若带实时模糊会逐帧重新采样，
              是 compact 模式滑动卡顿的主因；视觉差异可接受，定稿为静态方案 */}
          <View style={[styles.compactBlurMask, { backgroundColor: 'rgba(0,0,0,0.32)' }]} />
          {/* 数据文字层（图上压字：黑色渐变 + 白字，恒深底不随主题翻转） */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.5)']}
            locations={[0, 1]}
            style={styles.compactGradient}
          >
            <Ionicons name="play" size={11} color="#FFFFFF" />
            <Text style={styles.stripText}>{formatCount(data.playCount ?? 0)}</Text>
            <Ionicons name="chatbubble-outline" size={10} color="#FFFFFF" style={styles.stripDanmakuIcon} />
            <Text style={styles.stripText}>{formatCount(data.danmakuCount ?? 0)}</Text>
            {data.duration != null && (
              <Text style={[styles.stripText, styles.stripDuration]}>
                {formatDuration(data.duration)}
              </Text>
            )}
          </LinearGradient>
        </View>
        {/* 文字区：标题两行 + UP主行（非图上文字，随主题翻转） */}
        {children ?? (
          <View style={styles.compactBody}>
            <Text
              style={[T.subhead, styles.compactTitle, { color: colors.text }]}
              numberOfLines={2}>
              {data.title}
            </Text>
            {!!data.author && (
              <View style={styles.compactAuthorRow}>
                <Ionicons name="person-outline" size={12} color={colors.textTertiary} />
                <Text
                  style={[T.caption1, styles.compactAuthor, { color: colors.textSecondary }]}
                  numberOfLines={1}>
                  {data.author}
                </Text>
              </View>
            )}
          </View>
        )}
      </Press>
    </>
  );
}

export const GlassCard = memo(GlassCardBase);

const styles = StyleSheet.create({
  /* ================= immersive ================= */
  immersiveCard: {
    borderRadius: RADII.lg,
    overflow: 'hidden',
    // 无背景色——图片就是背景；阴影走 tokens 'md' 档（深色模式自动降影增边）
    ...continuous,
  },
  /** 磨砂层容器：贴底，高度由文字区实测 + 8pt 内联给出（刚好高过标题） */
  immersiveBlurMask: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 1,
  },
  /** 渐变色彩遮罩层：与磨砂层同高，叠加其上加深底部 */
  immersiveGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 2,
  },
  /* 文字层：直接叠在磨砂渐变上（HeroUI 卡片风格，无独立面板），
     高度自适应内容（onLayout 供磨砂层定高） */
  immersiveTextLayer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 3,
    justifyContent: 'flex-end',
    paddingHorizontal: 14,
    paddingBottom: 12,
    gap: 3,
  },
  /* 分类玻璃胶囊 */
  immersiveChip: {
    position: 'absolute',
    top: 12,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    zIndex: 5,
  },
  /* —— 图上压字：封面恒深底（磨砂渐变），白色不随主题翻转，属 5.10 合理例外 —— */
  immersiveTitle: {
    color: '#FFFFFF',
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  immersiveMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  immersiveMeta: {
    color: 'rgba(255,255,255,0.9)',
    flexShrink: 1,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  chipText: {
    color: 'rgba(255,255,255,0.92)',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  /* ================= compact ================= */
  compactCard: {
    borderRadius: RADII.card,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    // 阴影走 tokens 'sm' 档（含深色模式微亮边框），不再手写 shadow*
    ...continuous,
  },
  /** 静态磨砂数据条容器：44px 高（半透明黑，模拟模糊渐变消失的观感） */
  compactBlurMask: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 44,
  },
  /** 数据文字层：40px 高 */
  compactGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 40,
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 8,
    paddingBottom: 6,
  },
  /* —— 图上压字：数据条白字恒白（黑色渐变底），属 5.10 合理例外 —— */
  stripText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.1,
    marginLeft: 3,
    // 投影兜底，确保任意材质档位下白字可读
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 3,
  },
  stripDanmakuIcon: {
    marginLeft: 9,
  },
  /** 时长右对齐 */
  stripDuration: {
    marginLeft: 'auto',
    fontVariant: ['tabular-nums'],
  },
  compactBody: {
    padding: 10,
    gap: 4,
  },
  compactTitle: {
    minHeight: 38,
  },
  compactAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  compactAuthor: {
    flexShrink: 1,
  },
});

