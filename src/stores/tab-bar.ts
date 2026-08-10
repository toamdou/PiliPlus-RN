import { create } from 'zustand';

/**
 * 底栏（NativeTabs tab bar）显隐状态——仅服务于 iOS<26。
 *
 * iOS 26+ 走原生 minimizeBehavior="onScrollDown"（液态玻璃 pill 收缩动画），
 * 不经过本 store；iOS<26 没有原生滚动隐藏能力，用 NativeTabs 官方 `hidden` prop
 * 按滚动方向显隐（RNS 对该 prop 硬编码 animated:NO，故为瞬时切换）。
 *
 * setHidden 内置相等性守卫：worklet 只在方向/阈值结果翻转时经 runOnJS 调用，
 * 值不变时不会触发 setState → _layout 重渲染，避免滚动期间的渲染风暴。
 */
interface TabBarState {
  /** true = 底栏隐藏 */
  hidden: boolean;
  /** 设置显隐（值不变时为 no-op，不触发重渲染） */
  setHidden: (hidden: boolean) => void;
}

export const useTabBarStore = create<TabBarState>((set, get) => ({
  hidden: false,
  setHidden: (hidden) => {
    if (get().hidden === hidden) return; // 相等性守卫：避免滚动期间重复 setState
    set({ hidden });
  },
}));
