/**
 * bili-colors —— B 站品牌色板（对齐 Flutter 原版 lib/utils/bili_colors.dart）。
 *
 * 语义：
 *  - pink / pinkDim：品牌粉（大会员 / VIP 徽章、品牌激活态），深色模式提亮（#FB7299）；
 *  - blue：品牌蓝（关注按钮等）；
 *  - yellow / hot / new / star：运营徽章专用（P 系列、热度、新品、推荐星级）；
 *  - level：用户等级 0-6 的 7 档渐变色（Lv1 灰、Lv3 绿、Lv4 蓝、Lv5 橙……）。
 *
 * 用 DynamicColorIOS 实现明暗自动翻转；纯色徽章无需翻转。
 *
 * 用法：
 *   import { BILI } from '@/theme/bili-colors';
 *   <View style={{ backgroundColor: BILI.pinkDim }} />
 */
import { DynamicColorIOS } from 'react-native';

export const BILI = {
  /** 品牌粉（大会员 / VIP） */
  pink: DynamicColorIOS({ light: '#FF6699', dark: '#FB7299' }),
  /** 品牌粉半透明底（粉底徽章 / 激活态底色） */
  pinkDim: DynamicColorIOS({ light: 'rgba(251,114,153,0.15)', dark: 'rgba(251,114,153,0.22)' }),
  /** 品牌蓝（关注按钮等） */
  blue: DynamicColorIOS({ light: '#008AC5', dark: '#2C9CC8' }),
  /** 运营黄（会员标签） */
  yellow: '#FFCC00',
  /** 热度红（热门徽章） */
  hot: '#FF3B30',
  /** 新品橙（新作徽章） */
  new: '#FF9500',
  /** 星级橙（推荐星级） */
  star: '#FF9500',
  /** 用户等级 7 档色（Lv0~Lv6） */
  level: ['#BFBFBF', '#BFBFBF', '#95DDC7', '#7EC5FF', '#FFB37A', '#FF8C4D', '#FF5C5C'],
} as const;
