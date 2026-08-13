/**
 * share —— 站内分享（给指定用户发私信分享卡）最小接口补充。
 *
 * 对齐 Flutter lib/pages/share：选人后向每个接收者发送一条 msg_type=3 的分享卡私信。
 *
 * ⚠️ 接口契约标注（03-api §3.5）：站内分享无专用 HTTP 接口，Flutter 走
 * gRPC `bilibili.im.interface.v1.ImInterface.SendMsg`；RN 用现有 web_im HTTP
 * `msgApi.sendMsg`（msg_type=3 + share 卡片 JSON）等价实现。
 * 分享卡 JSON 结构为 B 站 web_im 通用 share 卡片（{ share: { type, id, title,
 * subtitle, picture, uri, ... } }），若线上接收端字段解析有差异需按实际协议微调。
 */
import { msgApi } from './msg';

export type ShareCardType =
  | 'video'
  | 'space'
  | 'dynamic'
  | 'article'
  | 'audio'
  | 'music'
  | 'live';

/** 站内分享卡（B 站 web_im msg_type=3 的 content JSON） */
export interface ShareCard {
  type: ShareCardType;
  /** 业务 id：视频 bvid / 空间 mid / 动态 id / 专栏 cvid / 音频 sid / 音乐 music_id */
  id: string;
  title: string;
  subtitle?: string;
  picture?: string;
  /** 点击卡片跳转的 bilibili:// uri（可选，缺省由接收端按 type+id 拼装） */
  uri?: string;
  /** UP 主 / 作者 mid */
  upper_mid?: number;
  upper_name?: string;
}

/** 构造分享卡 JSON 字符串（msg_type=3 的 content） */
export function buildShareCardContent(card: ShareCard): string {
  return JSON.stringify({ share: card });
}

export const shareApi = {
  /**
   * 给单个用户发送站内分享卡。
   * @param receiverId 接收者 mid
   * @param card 分享卡内容
   */
  async sendToUser(receiverId: number, card: ShareCard) {
    return msgApi.sendMsg({
      receiver_id: receiverId,
      content: buildShareCardContent(card),
      msg_type: 3,
    });
  },

  /**
   * 给一组用户发送站内分享卡（并行，单条失败不阻塞其余）。
   * @returns 成功条数与失败 uid 列表
   */
  async sendToUsers(receiverIds: number[], card: ShareCard): Promise<{ ok: number; failed: number[] }> {
    const results = await Promise.allSettled(
      receiverIds.map((uid) => shareApi.sendToUser(uid, card)),
    );
    let ok = 0;
    const failed: number[] = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled' && (r.value as any)?.code === 0) ok += 1;
      else failed.push(receiverIds[i]);
    });
    return { ok, failed };
  },
};
