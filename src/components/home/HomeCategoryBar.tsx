import { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  DynamicColorIOS,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
  Extrapolation,
  type SharedValue,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';
import { useThemeColors } from '@/components/SwiftUIHost';
import { Press } from '@/components/motion';
import { feedBackSelection } from '@/utils/feedback';
import { useType } from '@/components/type-scale';
import { continuous, RADII } from '@/theme/tokens';
import type { EdgeInsets } from 'react-native-safe-area-context';
import {
  SEARCH_BAR_H,
  CATEGORY_BAR_H,
  PARTITION_BAR_H,
  CATEGORIES,
  PARTITIONS,
  type Category,
} from './home-feed-constants';

/* ===== 分类 Tab 单项——激活文字与玻璃胶囊同步弹簧缩放（0.96→1） ===== */
function CategoryTab({
  cat,
  index,
  isActive,
  scale,
  colors,
  T,
  onPress,
  onLayout,
}: {
  cat: Category;
  index: number;
  isActive: boolean;
  scale: SharedValue<number>;
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
  onPress: (cat: Category, index: number) => void;
  onLayout: (e: LayoutChangeEvent) => void;
}) {
  const textAnim = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  return (
    <Press
      haptic
      scaleTo={0.9}
      onPress={() => onPress(cat, index)}
      onLayout={onLayout}
      style={styles.categoryItem}>
      <Animated.Text
        style={[
          /* 字号走全局字阶（05-B1，原 17/15 硬编码）：激活 T.body / 未激活 T.subhead */
          isActive ? T.body : T.subhead,
          styles.categoryText,
          {
            color: isActive ? colors.text : colors.textTertiary,
            fontWeight: isActive ? '700' : '400',
          },
          textAnim,
        ]}>
        {cat}
      </Animated.Text>
    </Press>
  );
}

export function HomeCategoryBar({
  activeCategory,
  activePartitionIdx,
  hideProgress,
  insets,
  onSelectCategory,
  onSelectPartition,
}: {
  activeCategory: Category;
  activePartitionIdx: number;
  hideProgress: SharedValue<number>;
  insets: EdgeInsets;
  onSelectCategory: (cat: Category) => void;
  onSelectPartition: (index: number) => void;
}) {
  const colors = useThemeColors();
  const T = useType();
  const router = useRouter();
  const tabLayouts = useRef<{ x: number; width: number }[]>([]);
  const indicatorX = useSharedValue(0);
  const indicatorW = useSharedValue(0);
  /* 分类文字弹簧缩放——激活 1，未激活 0.96；首帧按 activeCategory 落位，之后由 withSpring 驱动 */
  const textScale: SharedValue<number>[] = [
    useSharedValue(activeCategory === CATEGORIES[0] ? 1 : 0.96),
    useSharedValue(activeCategory === CATEGORIES[1] ? 1 : 0.96),
    useSharedValue(activeCategory === CATEGORIES[2] ? 1 : 0.96),
    useSharedValue(activeCategory === CATEGORIES[3] ? 1 : 0.96),
    useSharedValue(activeCategory === CATEGORIES[4] ? 1 : 0.96),
    useSharedValue(activeCategory === CATEGORIES[5] ? 1 : 0.96),
  ];
  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
    width: indicatorW.value,
  }));
  /* 分类栏 Y 位置动画：静止时在搜索栏下方留 4pt 间距，滚动时贴到状态栏正下方 */
  const catBarTopAnim = useAnimatedStyle(() => {
    const staticTop = insets.top + SEARCH_BAR_H + 4;
    const scrolledTop = insets.top;
    return {
      top: staticTop + (scrolledTop - staticTop) * hideProgress.value,
    };
  });
  /* 分类栏模糊背景：透明度由 hideProgress（滚动方向）驱动，与搜索行收起/展开同步 */
  const catBlurAnim = useAnimatedStyle(() => {
    const p = hideProgress.value;
    const blurTop = -6 + (-(insets.top + 6) - (-6)) * p;
    return {
      opacity: interpolate(p, [0, 0.25], [0, 1], Extrapolation.CLAMP),
      top: blurTop,
    };
  });
  /* 分区 chips 行：跟随分类栏折叠动画，滚动时贴到状态栏下方 */
  const partitionTopAnim = useAnimatedStyle(() => {
    const staticTop = insets.top + SEARCH_BAR_H + 4 + CATEGORY_BAR_H;
    const scrolledTop = insets.top + CATEGORY_BAR_H;
    return {
      top: staticTop + (scrolledTop - staticTop) * hideProgress.value,
    };
  });

  const handleSelect = (cat: Category, index: number) => {
    if (cat === activeCategory) return;
    const layout = tabLayouts.current[index];
    if (layout) {
      indicatorX.set(withSpring(layout.x - 8, { damping: 32, stiffness: 260 }));
      indicatorW.set(withSpring(Math.max(layout.width + 16, 44), { damping: 35, stiffness: 300 }));
    }
    textScale[index].set(withSpring(1, { damping: 32, stiffness: 260 }));
    textScale[CATEGORIES.indexOf(activeCategory)].set(
      withSpring(0.96, { damping: 32, stiffness: 260 }),
    );
    onSelectCategory(cat);
  };

  return (
    <>
      {/* 分类标签栏（常驻+动画定位） */}
      <Animated.View style={[styles.categoryLayer, catBarTopAnim]}>
        <Animated.View style={[styles.catBlurWrap, catBlurAnim]} pointerEvents="none">
          <MaskedView
            style={StyleSheet.absoluteFill}
            maskElement={
              <LinearGradient
                colors={['black', 'black', 'rgba(0,0,0,0.5)', 'transparent']}
                locations={[0, 0.7, 0.92, 1]}
                style={StyleSheet.absoluteFill}
              />
            }>
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor: colors.isDark
                    ? 'rgba(24,24,26,0.84)'
                    : 'rgba(250,250,252,0.84)',
                },
              ]}
            />
            <View style={styles.catTintOverlay} />
          </MaskedView>
        </Animated.View>
        <View style={styles.categoryBar}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.categoryIndicator,
              { backgroundColor: colors.accent, borderColor: colors.accent },
              indicatorStyle,
            ]}
          />
          {CATEGORIES.map((cat, index) => {
            const isActive = activeCategory === cat;
            return (
              <CategoryTab
                key={cat}
                cat={cat}
                index={index}
                isActive={isActive}
                scale={textScale[index]}
                colors={colors}
                T={T}
                onPress={handleSelect}
                onLayout={(e) => {
                  const { x, width } = e.nativeEvent.layout;
                  tabLayouts.current[index] = { x, width };
                  if (isActive) {
                    indicatorX.set(x - 8);
                    indicatorW.set(Math.max(width + 16, 44));
                  }
                }}
              />
            );
          })}
        </View>
      </Animated.View>

      {/* 分区 chips（仅"分区"分类显示，跟随顶栏折叠） */}
      {activeCategory === '分区' && (
        <Animated.View style={[styles.partitionLayer, partitionTopAnim]} pointerEvents="box-none">
          <View style={[styles.partitionBar, { backgroundColor: colors.bg, borderBottomColor: colors.separator }]}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.partitionContent}>
              {PARTITIONS.map((p, i) => (
                <Press
                  key={p.label}
                  haptic
                  scaleTo={0.94}
                  onPress={() => {
                    if (i === activePartitionIdx) return;
                    feedBackSelection();
                    onSelectPartition(i);
                  }}
                  style={[styles.partitionChip, continuous, i === activePartitionIdx ? { backgroundColor: colors.accent } : { backgroundColor: colors.fill2 }]}>
                  <Text style={[T.footnote, { color: i === activePartitionIdx ? '#FFFFFF' : colors.textSecondary, fontWeight: i === activePartitionIdx ? '600' : '400' }]}>
                    {p.label}
                  </Text>
                </Press>
              ))}
              <Press
                haptic
                scaleTo={0.94}
                onPress={() => router.push('/rank' as any)}
                style={[styles.partitionChip, continuous, { backgroundColor: colors.fill2 }]}>
                <Ionicons name="podium-outline" size={13} color={colors.accent} />
                <Text style={[T.footnote, { color: colors.accent, fontWeight: '600' }]}>完整排行</Text>
              </Press>
              {/* 批次5 P2：番剧/影视入口（路由已建好）——追番时间表与番剧索引 */}
              <Press
                haptic
                scaleTo={0.94}
                onPress={() => router.push('/pgc_timeline' as any)}
                style={[styles.partitionChip, continuous, { backgroundColor: colors.fill2 }]}>
                <Ionicons name="calendar-outline" size={13} color={colors.accent} />
                <Text style={[T.footnote, { color: colors.accent, fontWeight: '600' }]}>追番时间表</Text>
              </Press>
              <Press
                haptic
                scaleTo={0.94}
                onPress={() => router.push('/pgc_index' as any)}
                style={[styles.partitionChip, continuous, { backgroundColor: colors.fill2 }]}>
                <Ionicons name="filter-outline" size={13} color={colors.accent} />
                <Text style={[T.footnote, { color: colors.accent, fontWeight: '600' }]}>番剧索引</Text>
              </Press>
            </ScrollView>
          </View>
        </Animated.View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  categoryLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 10,
  },
  catBlurWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -8,
  },
  catTintOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: DynamicColorIOS({ light: 'rgba(255,255,255,0.10)', dark: 'rgba(0,0,0,0.12)' }),
  },
  partitionLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 9,
  },
  partitionBar: {
    height: PARTITION_BAR_H,
    borderBottomWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
  },
  partitionContent: {
    paddingHorizontal: 14,
    gap: 8,
    alignItems: 'center',
  },
  partitionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADII.sm,
  },
  categoryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: CATEGORY_BAR_H,
    gap: 22,
    position: 'relative',
  },
  categoryItem: {
    paddingBottom: 6,
  },
  categoryText: {
    textAlign: 'center',
  },
  categoryIndicator: {
    position: 'absolute',
    left: 0,
    top: 6,
    height: 26,
    /* 玻璃胶囊指示器（05-B1，原圆角 13 游离于阶梯外 → RADII.circle 胶囊） */
    borderRadius: RADII.circle,
    ...continuous,
    borderWidth: StyleSheet.hairlineWidth,
    opacity: 0.18,
  },
});
