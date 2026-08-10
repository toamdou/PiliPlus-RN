import { useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import {
  runOnJS,
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';
import { useTabBarStore } from '@/stores/tab-bar';

/** iOS 26+ 由原生 minimizeBehavior 处理底栏显隐，本 hook 不再写入 store */
const IS_IOS_26 =
  Platform.OS === 'ios' && parseInt(String(Platform.Version), 10) >= 26;

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
 */
export function useScrollHideTabBar(
  deadzone = 8,
  topInset = 0,
  enabled = true,
) {
  const setHidden = useTabBarStore((s) => s.setHidden);
  const lastY = useSharedValue(0);
  /* store 显隐镜像：只在翻转时跨桥，worklet 用它判断是否真的需要写 store */
  const hiddenMirror = useSharedValue(useTabBarStore.getState().hidden ? 1 : 0);

  useEffect(
    () =>
      useTabBarStore.subscribe((state) => {
        hiddenMirror.set(state.hidden ? 1 : 0);
      }),
    [hiddenMirror],
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
        setHidden(target === 1);
      }
    },
    [setHidden, deadzone, lastY, hiddenMirror],
  );

  /** 切换 tab / 返回页面时重置基准，避免用旧 offset 算出错误 delta */
  const reset = useCallback(() => {
    lastY.set(0);
    hiddenMirror.set(useTabBarStore.getState().hidden ? 1 : 0);
  }, [lastY, hiddenMirror]);

  return { feed, reset, onScroll };
}
