import { apiClient, get, getWbi, post, type RequestConfig } from './client';
import { Api } from './endpoints';
import { getCSRF } from '@/utils/cookie';
import { useAuthStore } from '@/stores/auth';

export const replyApi = {
  // 评论列表 - 对齐 Flutter 版
  // 未登录: /x/v2/reply/main + pagination_str + WBI 签名（防 -352 风控）
  // 已登录: /x/v2/reply + pn/ps
  async main(params: { oid: number; type: number; mode?: number; next?: number; pagination_str?: string; ps?: number; pn?: number }, config?: RequestConfig) {
    const { oid, type, mode = 3, next, pagination_str, ps = 20, pn } = params;
    const { isLoggedIn, anonymousMode } = useAuthStore.getState();
    const useAnon = !isLoggedIn || anonymousMode;

    if (!useAnon) {
      // 已登录且非匿名：使用旧端点 /x/v2/reply，不需要 WBI
      const queryParams: Record<string, any> = {
        oid,
        type,
        sort: mode === 3 ? 2 : 1, // mode 3=热度→sort 2; mode 2=时间→sort 1
        pn: pn ?? (next ?? 0) + 1,
        ps,
      };
      console.log('[replyApi.main] logged-in params:', JSON.stringify(queryParams));
      const res = await get(apiClient, Api.replyList, queryParams, config);
      console.log('[replyApi.main] response code:', res?.code, 'replies count:', res?.data?.replies?.length ?? 0);
      return res;
    } else {
      // 未登录/匿名：使用 /x/v2/reply/main + pagination_str + WBI 签名
      const paginationStr = pagination_str ?? '{"offset":""}';
      const queryParams: Record<string, any> = {
        oid,
        type,
        mode,
        pagination_str: paginationStr,
      };
      console.log('[replyApi.main] guest params:', JSON.stringify(queryParams));
      const res = await getWbi(apiClient, Api.replyMain, queryParams, config);
      console.log('[replyApi.main] response code:', res?.code, 'replies count:', res?.data?.replies?.length ?? 0);
      return res;
    }
  },

  // 楼中楼 - 对齐 Flutter HTTP replyReplyList（/x/v2/reply/reply: oid/root/type/sort + pn 分页）
  // sort: 1=按时间（Flutter 楼中楼默认）, 2=按热度
  // 未登录: 补 next 游标 + WBI 签名（对齐 main 端点游客策略，防止游客卡在第一页 / -352 风控）
  async reply(params: { oid: number; type: number; root: number; pn?: number; ps?: number; sort?: number; next?: number }, config?: RequestConfig) {
    const { oid, type, root, pn = 1, ps = 20, sort = 1, next } = params;
    const { isLoggedIn, anonymousMode } = useAuthStore.getState();
    const useAnon = !isLoggedIn || anonymousMode;

    if (useAnon) {
      // 游客：WBI 签名 + next 游标（首页 next=0），同时带上 pn/ps 兼容
      const queryParams: Record<string, any> = { oid, type, root, sort, next: next ?? pn - 1, pn, ps };
      return getWbi(apiClient, Api.replyReplyList, queryParams, config);
    }
    return get(apiClient, Api.replyReplyList, { oid, type, root, sort, pn, ps }, config);
  },

  // 我的评论（登录后返回当前账号最近发表的评论）
  async mine(params: { pn?: number; ps?: number }, config?: RequestConfig) {
    return get(apiClient, Api.replyMine, { pn: 1, ps: 20, ...params }, config);
  },

  // 点赞评论
  async like(params: { oid: number; type: number; rpid: number; action: number }) {
    return post(apiClient, Api.likeReply, null, { ...params, csrf: getCSRF() });
  },

  // 踩评论
  async hate(params: { oid: number; type: number; rpid: number; action: number }) {
    return post(apiClient, Api.hateReply, null, { ...params, csrf: getCSRF() });
  },

  // 发表评论
  async add(params: {
    oid: number; type: number; message: string;
    root?: number; parent?: number;
    pictures?: string;        // JSON: [{"img_src":"...","img_width":0,"img_height":0}]
    at_name_to_mid?: string;  // JSON: {"昵称": mid}
    sync_to_dynamic?: boolean;
  }) {
    const data: any = {
      oid: params.oid, type: params.type, message: params.message,
      root: params.root || 0, parent: params.parent || 0,
      csrf: getCSRF(),
    };
    if (params.pictures) data.pictures = params.pictures;
    if (params.at_name_to_mid) data.at_name_to_mid = params.at_name_to_mid;
    if (params.sync_to_dynamic) data.sync_to_dynamic = 1;
    return post(apiClient, Api.replyAdd, null, data);
  },

  // 删除评论
  async del(params: { oid: number; type: number; rpid: number }) {
    return post(apiClient, Api.replyDel, null, { ...params, csrf: getCSRF() });
  },

  // 置顶评论
  async top(params: { oid: number; type: number; rpid: number; action: number }) {
    return post(apiClient, Api.replyTop, null, { ...params, csrf: getCSRF() });
  },

  // 举报评论
  async report(params: { oid: number; rpid: number; reason: number; content?: string }) {
    return post(apiClient, Api.replyReport, null, { ...params, csrf: getCSRF() });
  },

  // 评论搜索（/x/v2/reply/search，按关键词搜索当前评论区）
  async search(params: { oid: number; type: number; keyword: string; pn?: number; ps?: number }, config?: RequestConfig) {
    const { type = 1, ps = 20, ...rest } = params;
    return get(apiClient, '/x/v2/reply/search', { type, ps, ...rest }, config);
  },

  /** 获取表情包面板 */
  async emote(params?: { business?: string }) {
    return get(apiClient, Api.myEmote, { business: 'reply', web_location: '333.1245', ...params });
  },
};
