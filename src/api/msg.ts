import { apiClient, appClient, tClient, msgClient, get, post, getWbi, type RequestConfig } from './client';
import { Api } from './endpoints';
import { getCSRF } from '@/utils/cookie';
import { FORM_HEADERS, formBody } from '@/utils/form';
import { uploadBfsFile } from '@/utils/upload-bfs';
import { toUint8Array } from '@/utils/bytes';
import type { NativeRequestCancelToken } from '@/utils/request-cancel';

export type FeedUnreadKey = 'reply' | 'at' | 'like' | 'sys';

/** 本地已读游标：B 站 web 端没有 reply/at/like 的独立已读接口，进入页面后记录已见数量。 */
const feedUnreadCleared: Record<FeedUnreadKey, number> = { reply: 0, at: 0, like: 0, sys: 0 };
let privateUnreadCleared = 0;

/* ===== 消息屏蔽词（gRPC over HTTP，对齐 Flutter ImGrpc.keywordBlocking*） ===== */
interface KeywordBlockingReply {
  items: string[];
  listLimit?: number;
  charLimit?: number;
  listLimitText?: string;
  toast?: string;
  keyword?: string;
}

function writeVarint(value: number): number[] {
  const out: number[] = [];
  let v = value >>> 0;
  while (v >= 0x80) {
    out.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  out.push(v);
  return out;
}

function encodeStringField(field: number, value: string): Uint8Array {
  const raw = new TextEncoder().encode(value);
  const head = [(field << 3) | 2, ...writeVarint(raw.length)];
  const out = new Uint8Array(head.length + raw.length);
  out.set(head, 0);
  out.set(raw, head.length);
  return out;
}

function frameGrpc(payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(5 + payload.length);
  new DataView(out.buffer).setUint32(1, payload.length, false);
  out.set(payload, 5);
  return out;
}

function readVarint(bytes: Uint8Array, offset: number): { value: number; next: number } {
  let result = 0;
  let shift = 0;
  let i = offset;
  while (i < bytes.length && shift < 32) {
    const b = bytes[i++];
    result |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) break;
    shift += 7;
  }
  return { value: result >>> 0, next: i };
}

function decodeGrpcFrame(data: any): Uint8Array {
  const bytes = toUint8Array(data) ?? new Uint8Array(0);
  if (bytes.length < 5) return bytes;
  const len = new DataView(bytes.buffer, bytes.byteOffset, 5).getUint32(1, false);
  return bytes.slice(5, 5 + len);
}

function parseKeywordItem(bytes: Uint8Array): string {
  let offset = 0;
  while (offset < bytes.length) {
    const tag = readVarint(bytes, offset);
    offset = tag.next;
    const field = tag.value >>> 3;
    const wire = tag.value & 7;
    if (field === 1 && wire === 2) {
      const len = readVarint(bytes, offset);
      offset = len.next;
      const text = new TextDecoder().decode(bytes.subarray(offset, offset + len.value));
      if (text) return text;
      offset += len.value;
    } else if (wire === 2) {
      const len = readVarint(bytes, offset);
      offset = len.next + len.value;
    } else {
      offset += 1;
    }
  }
  return '';
}

function decodeKeywordReply(payload: Uint8Array): KeywordBlockingReply {
  const reply: KeywordBlockingReply = { items: [] };
  let offset = 0;
  while (offset < payload.length) {
    const tag = readVarint(payload, offset);
    offset = tag.next;
    const field = tag.value >>> 3;
    const wire = tag.value & 7;
    if (wire === 2) {
      const len = readVarint(payload, offset);
      offset = len.next;
      const chunk = payload.subarray(offset, offset + len.value);
      offset += len.value;
      const keyword = parseKeywordItem(chunk);
      if (keyword) {
        if (field === 1) reply.items.push(keyword);
        else if (field === 2) reply.keyword = keyword;
      } else {
        const text = new TextDecoder().decode(chunk);
        if (field === 1) reply.toast = text;
        else if (field === 4) reply.listLimitText = text;
      }
    } else if (wire === 0) {
      const val = readVarint(payload, offset);
      offset = val.next;
      if (field === 2) reply.listLimit = val.value;
      else if (field === 3) reply.charLimit = val.value;
    } else if (wire === 1) {
      offset += 8;
    } else if (wire === 5) {
      offset += 4;
    } else {
      offset += 1;
    }
  }
  return reply;
}

async function grpcUnary<T>(method: string, payload: Uint8Array): Promise<T> {
  const res = await post<{ data: ArrayBuffer; headers: Record<string, string> }>(
    appClient,
    `/bilibili.app.im.v1.im/${method}`,
    frameGrpc(payload),
    undefined,
    {
      headers: { 'Content-Type': 'application/grpc' },
      responseType: 'arraybuffer',
      rawResponse: true,
    },
  );
  const headers = res.headers;
  const status = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === 'grpc-status',
  )?.[1];
  if (status && status !== '0') {
    const message = Object.entries(headers).find(
      ([key]) => key.toLowerCase() === 'grpc-message',
    )?.[1];
    throw new Error(message || `grpc status ${status}`);
  }
  return decodeKeywordReply(decodeGrpcFrame(res.data)) as unknown as T;
}

export const msgApi = {
  // 未读私信数
  async unread() {
    const res: any = await get(tClient, Api.msgUnread, { build: 0, mobi_app: 'web' });
    const d: Record<string, unknown> = res?.data || {};
    const total = Object.values(d).reduce((sum: number, v) => sum + (Number(v) > 0 ? Number(v) : 0), 0);
    if (privateUnreadCleared > 0 && total <= privateUnreadCleared) {
      for (const key of Object.keys(d)) d[key] = 0;
    }
    return res;
  },

  // 消息中心未读
  async feedUnread() {
    const res: any = await get(apiClient, Api.msgFeedUnread);
    const d: Record<string, unknown> = res?.data || {};
    for (const key of Object.keys(feedUnreadCleared)) {
      const cleared = feedUnreadCleared[key as FeedUnreadKey] || 0;
      const apiKey = key === 'sys' ? 'sys_msg' : key;
      const current = Number(d[apiKey] ?? d['sysMsg'] ?? 0);
      if (cleared > 0) {
        const next = Math.max(0, current - cleared);
        d[apiKey] = next;
        if (key === 'sys') d['sysMsg'] = next;
      }
    }
    return res;
  },

  /** 进入消息页后按类型记录本地已读游标；服务端未提供 reply/at/like 的独立已读接口。 */
  async clearFeedUnread(keys: FeedUnreadKey[]) {
    const res: any = await get(apiClient, Api.msgFeedUnread).catch(() => null);
    const d: Record<string, unknown> = res?.data || {};
    for (const key of keys) {
      const apiKey = key === 'sys' ? 'sys_msg' : key;
      feedUnreadCleared[key] = Number(d[apiKey] ?? d['sysMsg'] ?? 0) || 0;
    }
  },

  /** 进入私信列表后记录本地未读总量，避免返回首页时旧角标残留。 */
  async clearPrivateUnread() {
    const res: any = await get(tClient, Api.msgUnread, { build: 0, mobi_app: 'web' }).catch(() => null);
    const d: Record<string, unknown> = res?.data || {};
    privateUnreadCleared = Object.values(d).reduce((sum: number, v) => sum + (Number(v) > 0 ? Number(v) : 0), 0);
  },

  // 回复我的
  async feedReply(params: { cursor_id?: number; cursor_time?: number; id?: number; reply_time?: number }, config?: RequestConfig) {
    const { cursor_id, cursor_time, id, reply_time, ...rest } = params;
    return get(apiClient, Api.msgFeedReply, {
      platform: 'web', build: 0, mobi_app: 'web', web_location: 333.40164,
      id: id ?? cursor_id, reply_time: reply_time ?? cursor_time, ...rest,
    }, config);
  },

  // @我的
  async feedAt(params: { cursor_id?: number; cursor_time?: number; id?: number; at_time?: number }, config?: RequestConfig) {
    const { cursor_id, cursor_time, id, at_time, ...rest } = params;
    return get(apiClient, Api.msgFeedAt, {
      platform: 'web', build: 0, mobi_app: 'web', web_location: 333.40164,
      id: id ?? cursor_id, at_time: at_time ?? cursor_time, ...rest,
    }, config);
  },

  // 收到的赞
  async feedLike(params: { cursor_id?: number; cursor_time?: number; id?: number; like_time?: number }, config?: RequestConfig) {
    const { cursor_id, cursor_time, id, like_time, ...rest } = params;
    return get(apiClient, Api.msgFeedLike, {
      platform: 'web', build: 0, mobi_app: 'web', web_location: 333.40164,
      id: id ?? cursor_id, like_time: like_time ?? cursor_time, ...rest,
    }, config);
  },

  // 赞详情
  async likeDetail(params: { card_id: string | number; pn?: number; last_mid?: number }, config?: RequestConfig) {
    return get(apiClient, Api.msgLikeDetail, {
      platform: 'web', build: 0, mobi_app: 'web', web_location: 333.40164,
      pn: 1, last_mid: 0, ...params,
    }, config);
  },

  // 系统消息
  async sysNotify(params: { page_size?: number; cursor?: string }, config?: RequestConfig) {
    return get(msgClient, Api.msgSysNotify, { page_size: 20, ...params }, config);
  },

  // 更新系统消息光标
  async sysUpdateCursor(params: { cursor: string }) {
    return post(msgClient, Api.msgSysUpdateCursor, null, { ...params, csrf: getCSRF() });
  },

  // 私信列表
  async sessions(params: { session_type?: number; sort_rule?: number; size?: number; end_ts?: number }, config?: RequestConfig) {
    return getWbi(tClient, Api.sessionList, {
      session_type: 1, group_fold: 1, unfollow_fold: 0, sort_rule: 2, build: 0, mobi_app: 'web', ...params,
    }, config);
  },

  // 私信用户信息
  async accountList(params: { uids: string }, config?: RequestConfig) {
    return get(tClient, Api.sessionAccountList, { build: 0, mobi_app: 'web', ...params }, config);
  },

  // 私信消息记录
  async sessionMsg(params: { talker_id: number; session_type?: number; size?: number; begin_seqno?: number }, config?: RequestConfig) {
    return getWbi(tClient, Api.sessionMsg, {
      session_type: 1, size: 20, sender_device_id: 1, build: 0, mobi_app: 'web', web_location: 333.1296, ...params,
    }, config);
  },

  // 私信图片上传（对齐 Flutter MsgHttp.uploadBfs：biz=im）
  async uploadBfs(p: { file: any; category?: string; biz?: string }, cancelToken?: NativeRequestCancelToken) {
    return uploadBfsFile(`${apiClient.baseURL}${Api.uploadBfs}`, p.file, {
      category: p.category,
      biz: p.biz,
    }, cancelToken);
  },

  // 标记已读
  async ackSession(params: { talker_id: number; session_type?: number; ack_seqno: number }) {
    return post(tClient, Api.ackSessionMsg, null, {
      session_type: 1, build: 0, mobi_app: 'web', ...params, csrf_token: getCSRF(), csrf: getCSRF(),
    });
  },

  // 发送私信
  async sendMsg(params: { receiver_id: number; content: string; msg_type?: number }) {
    return post(tClient, Api.sendMsg, null, {
      msg_type: 1, sender_device_id: 1, build: 0, mobi_app: 'web', ...params, csrf_token: getCSRF(), csrf: getCSRF(),
    });
  },

  // 删除会话
  async removeSession(params: { talker_id: number; session_type?: number }) {
    return post(tClient, Api.removeMsg, null, {
      session_type: 1, build: 0, mobi_app: 'web', ...params, csrf_token: getCSRF(), csrf: getCSRF(),
    });
  },

  // 置顶会话
  async setTop(params: { talker_id: number; op_type: number; session_type?: number }) {
    return post(tClient, Api.setTop, null, {
      session_type: 1, build: 0, mobi_app: 'web', ...params, csrf_token: getCSRF(), csrf: getCSRF(),
    });
  },

  // 私信会话链接设置
  async getSessionSs(params: { talker_uid: number | string }) {
    return get(tClient, Api.getSessionSs, {
      build: 0, mobi_app: 'web', csrf_token: getCSRF(), csrf: getCSRF(), ...params,
    });
  },

  // 私信推送设置（setting: 1 关闭 / 0 开启，对齐 Flutter setPushSs）
  async setPushSs(params: { setting: number; talker_uid: number | string }) {
    return post(tClient, Api.setPushSs, null, {
      build: 0, mobi_app: 'web', csrf_token: getCSRF(), csrf: getCSRF(), ...params,
    });
  },

  // 私信免打扰状态（setting: 1 免打扰 / 0 接收）
  async getMsgDnd(params: { own_uid: number; uids_str: string }) {
    return get(tClient, Api.getMsgDnd, {
      build: 0, mobi_app: 'web', csrf_token: getCSRF(), csrf: getCSRF(), ...params,
    });
  },

  // 设置私信免打扰（setting: 1 免打扰 / 0 接收）
  async setMsgDnd(params: { uid: number; setting: number; dnd_uid: number | string }) {
    return post(tClient, Api.setMsgDnd, null, {
      build: 0, mobi_app: 'web', csrf_token: getCSRF(), csrf: getCSRF(), ...params,
    });
  },

  // 消息屏蔽词列表
  async keywordBlockingList() {
    return grpcUnary<KeywordBlockingReply>('KeywordBlockingList', new Uint8Array(0));
  },

  // 添加消息屏蔽词
  async keywordBlockingAdd(keyword: string) {
    return grpcUnary<KeywordBlockingReply>('KeywordBlockingAdd', encodeStringField(1, keyword));
  },

  // 删除消息屏蔽词
  async keywordBlockingDelete(keyword: string) {
    return grpcUnary<KeywordBlockingReply>('KeywordBlockingDelete', encodeStringField(1, keyword));
  },

  // 删除消息feed
  async delMsgfeed(params: { id: number; type: number }) {
    return post(apiClient, Api.delMsgfeed, null, {
      tp: params.type, id: params.id, build: 0, mobi_app: 'web', csrf_token: getCSRF(), csrf: getCSRF(),
    });
  },

  // 删除系统消息
  async delSysMsg(params: { id: number }) {
    const body = formBody({
      ids: String(params.id),
      station_ids: '',
      type: '4',
      mobi_app: 'android',
      csrf: getCSRF() ?? '',
    });
    return post(msgClient, Api.delSysMsg, body, undefined, {
      headers: FORM_HEADERS,
    });
  },

  // IM用户信息
  async imUserInfos(params: { uids: string }) {
    return get(tClient, Api.imUserInfos, {
      build: 0, mobi_app: 'web', csrf_token: getCSRF(), csrf: getCSRF(), ...params,
    });
  },
};
