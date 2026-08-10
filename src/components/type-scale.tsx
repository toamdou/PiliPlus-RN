/**
 * type-scale —— iOS Dynamic Type 排版阶梯。
 *
 * 两个目标：
 *  1. 强层级对比——iOS 原生应用的字号/字重落差很大（大标题 34/800 vs 说明 11/500），
 *     正是这种对比让界面"像系统原生"，而不是千篇一律的 14px。
 *  2. 响应设置——设置里的 fontSize（12-20，基准 14）此前从未被 RN 页面使用，
 *     这里统一按 k = fontSize / 14 缩放整条字阶，用户调字体大小立即全局生效。
 *
 * 排版细节（对齐 iOS 系统行为）：
 *  - letterSpacing 随字号分级：大字负 tracking（-0.5）、小字微正（+0.2），
 *    且为绝对值、不随 k 缩放——这正是 iOS 系统字体的做法；
 *  - lineHeight 随 k 缩放，且行高比例随字号反向收紧（大字 38/34 ≈ 1.12，小字 14/11 ≈ 1.27），
 *    即 leading tracks size inversely。
 *
 * 用法：const T = useType();  <Text style={T.headline}>…</Text>
 * 需要覆盖颜色时：style={[T.headline, { color: colors.text }]}
 */
import { useMemo } from 'react';
import type { TextStyle } from 'react-native';
import { useSettingsStore } from '@/stores/settings';

type Weight = TextStyle['fontWeight'];

export function useType() {
  const fontSize = useSettingsStore((s) => s.fontSize);
  return useMemo(() => {
    const k = fontSize / 14;
    const mk = (size: number, fontWeight: Weight, lineHeight?: number, letterSpacing?: number): TextStyle => ({
      fontSize: +(size * k).toFixed(1),
      fontWeight,
      // lineHeight 随 k 缩放；letterSpacing 保持绝对值（iOS 系统行为，tracking 不随动态字号缩放）
      ...(lineHeight ? { lineHeight: +(lineHeight * k).toFixed(1) } : {}),
      ...(letterSpacing !== undefined ? { letterSpacing } : {}),
    });
    return {
      largeTitle: mk(34, '800', 38, -0.5),
      title1: mk(28, '700', 32, -0.4),
      title2: mk(22, '700', 26, -0.3),
      title3: mk(20, '600', 25, -0.2),
      headline: mk(17, '600', 22, -0.2),
      body: mk(17, '400', 24, 0),
      callout: mk(16, '400', 21, 0),
      subhead: mk(15, '400', 20, 0),
      footnote: mk(13, '400', 18, 0.1),
      caption1: mk(12, '400', 16, 0.1),
      caption2: mk(11, '500', 14, 0.2),
    };
  }, [fontSize]);
}

export type TypeScale = ReturnType<typeof useType>;
