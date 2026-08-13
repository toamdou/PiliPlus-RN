import { useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import {
  runOnJS,
  useAnimatedScrollHandler,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useTabBarStore } from '@/stores/tab-bar';

/** iOS 26+ 由原生 minimizeBehavior 处理底栏显隐，本 hook 不再写入 store */
const IS_IOS_26 =
  Platform.OS === 'ios' && parseInt(String(Platform.Version), 10) >= 26;

/**
 * 底栏"收帘"弹簧：与 motion.tsx useScrollHide 顶栏同源（dampingRatio 1 / stiffness 300）。
 * iOS<26 原生 hidden 切换是瞬时的（RNS 硬编码 animated:NO），因此把显隐意图镜像成
 * 一个 0/1 的 retract 共享值，由消费页面的玻璃帘/FAB 做 translate/opacity 过渡，
 * 让"闪没闪回"变成平滑收放（详见 05-ios-design.md C3：顶/底栏显隐 spring(ratio 1, k=300)）。
 */
const TAB_BAR_SPRING = {
  damping: +(1 * 2 * Math.sqrt(300)).toFixed(2), // spring(ratio 1, k=300)
  mass: 1,
  stiffness: 300,
};

/**
 * 滚动方向驱动的底栏显隐检测器（UI 线程 worklet）。
 *
 * 用法：页面把返回的 onScroll 直接挂到 Reanimated 可滚动组件上；
 * 如需同时处理顶栏，用 useComposedEventHandler 合并多个 handler。
 * 归一化 y：iOS 手动 contentInset 场景下 contentOffset.y 静止时为 -headerH，
 * 传入 topInset 后由 handler 补正，使"顶部 == 0"语义一致。
 *
 * 仅 iOS<26 生效（_layout 在该版本才把 store 接到 NativeTabs 官方 hidden prop）；
 * iOS 26+ 由原生 minimizeBehavior 处理，本 hook 的写入不会被消费。
 *
 * worklet 内维护 lastY 与 store 显隐镜像，只有方向/阈值结果发生翻转时才
 * runOnJS 写 store，滚动事件本身不再每帧跨 JS 桥。
 *
 * 额外返回 retract（0/1 收帘进度共享值）：iOS<26 原生 hidden 瞬时切换无动画，
 * 消费页据此驱动底部玻璃帘 / FAB 的 translate/opacity 弹簧过渡（#42a）；
 * 减弱动态效果时 retract 直接落位，不做弹簧。
 */
export function useScrollHideTabBar(
  deadzone = 8,
  topInset = 0,
  enabled = true,
) {
  const setHidden = useTabBarStore((s) => s.setHidden);
  const reducedMotion = useReducedMotion();
  const lastY = useSharedValue(0);
  /* store 显隐镜像：只在翻转时跨桥，worklet 用它判断是否真的需要写 store */
  const hiddenMirror = useSharedValue(useTabBarStore.getState().hidden ? 1 : 0);
  /* 底栏"收帘"进度：0=展开（可见） / 1=收起（隐藏）。与 store 同源驱动，
     消费方（如动态页玻璃帘 / FAB）据此做 translate/opacity 弹簧过渡。 */
  const retract = useSharedValue(
    IS_IOS_26 ? 0 : useTabBarStore.getState().hidden ? 1 : 0,
  );

  useEffect(
    () =>
      useTabBarStore.subscribe((state) => {
        hiddenMirror.set(state.hidden ? 1 : 0);
        /* 外部复位（如 _layout 的 tabPress/focus 把 hidden 归 false）时同步收帘，
           避免帘幕/FAB 停在收起位造成"浮空"错位。 */
        retract.set(state.hidden ? 1 : 0);
      }),
    [hiddenMirror, retract],
  );

  const onScroll = useAnimatedScrollHandler((event) => {
    if (IS_IOS_26) return; // iOS 26+ 由原生 minimizeBehavior 处理，跳过 JS 层写入
    const y = event.contentOffset.y + topInset;
    const delta = y - lastY.value;
    let target: -1 | 0 | 1 = -1;

    if (y <= 0) {
      target = 0;
    } else if (!enabled) {
      target = 0;
    } else if (delta > deadzone) {
      target = 1;
    } else if (delta < -deadzone) {
      target = 0;
    }

    lastY.set(y);
    if (target === -1 || target === hiddenMirror.value) return;

    hiddenMirror.set(target);
    /* 减弱动态效果：直接落位（帘幕与原生 hidden 同为瞬时），不启动弹簧 */
    retract.set(reducedMotion ? target : withSpring(target, TAB_BAR_SPRING));
    runOnJS(setHidden)(target === 1);
  });

  /** 旧式 JS 入参接口，保留兼容；新页面请直接使用 onScroll */
  const feed = useCallback(
    (y: number) => {
      if (IS_IOS_26) return; // iOS 26+ 由原生 minimizeBehavior 处理，跳过 JS 层写入
      const delta = y - lastY.value;
      let target: -1 | 0 | 1 = -1;
      if (y <= 0) {
        target = 0;
      } else if (delta > deadzone) {
        target = 1;
      } else if (delta < -deadzone) {
        target = 0;
      }
      lastY.set(y);
      if (target !== -1 && target !== hiddenMirror.value) {
        hiddenMirror.set(target);
        retract.set(reducedMotion ? target : withSpring(target, TAB_BAR_SPRING));
        setHidden(target === 1);
      }
    },
    [setHidden, deadzone, lastY, hiddenMirror, retract, reducedMotion],
  );

  /** 切换 tab / 返回页面时重置基准，避免用旧 offset 算出错误 delta */
  const reset = useCallback(() => {
    lastY.set(0);
    hiddenMirror.set(useTabBarStore.getState().hidden ? 1 : 0);
    retract.set(hiddenMirror.value);
  }, [lastY, hiddenMirror, retract]);

  return { feed, reset, onScroll, retract };
}
