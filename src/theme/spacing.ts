/**
 * spacing —— 全站间距令牌（4 的倍数 + iOS 惯用值）。
 *
 * 页面水平留白 page=16、卡片间距 section=16、卡内 padding 12/16、
 * 行内元素 gap 4/8/12——现有代码 90% 已符合，登记后用于 lint 校验与后续收敛。
 *
 * 用法：
 *   import { SPACE } from '@/theme/spacing';
 *   gap: SPACE.sm, paddingHorizontal: SPACE.page
 */
export const SPACE = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, page: 16, section: 16 } as const;
