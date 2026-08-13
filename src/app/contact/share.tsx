/**
 * SharePanel —— 站内分享选人面板（对齐 Flutter lib/pages/share）。
 *
 * 复用 contact 页的 share 模式：本路由只负责把 mode 固定为 share，
 * 由 contact/index.tsx 完成选人 + shareApi.sendToUsers 发送分享卡。
 *
 * 调用方式（以动态为例）：
 *   router.push({
 *     pathname: '/contact/share',
 *     params: {
 *       cardType: 'dynamic',
 *       cardId: dynamicId,
 *       cardTitle: '分享一条动态',
 *       cardCover: coverUrl,
 *       cardUri: `https://t.bilibili.com/${dynamicId}`,
 *     },
 *   } as any);
 *
 * 支持的卡片类型（ShareCardType）：video / space / dynamic / article / audio / music / live
 */
import ContactScreen from './index';

export default function SharePanel() {
  return <ContactScreen forcedMode="share" />;
}
