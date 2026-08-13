import { apiClient, appClient, get, getWbi, type RequestConfig } from './client';
import { Api } from './endpoints';
import { signAppParamsAsync } from '@/utils/app-sign';
import { validateApi } from './validate';

/** 搜索触发风控需要用户完成 geetest 滑块验证时抛出的结构化错误（R6）。
 *  当前 RN 无 geetest 交互组件（Flutter 用 GeetestWebviewDialog），
 *  本错误携带 register 返回的挑战参数，供 UI 层后续接入验证后调用 byTypeWithVoucher 重试。 */
export class SearchCaptchaError extends Error {
  readonly token: string;
  readonly gt: string;
  readonly challenge: string;
  constructor(payload: { token: string; gt: string; challenge: string }) {
    super('搜索触发风控，需要完成验证码');
    this.name = 'SearchCaptchaError';
    this.token = payload.token;
    this.gt = payload.gt;
    this.challenge = payload.challenge;
  }
}

/** R6 解锁链第一步：v_voucher → gaia/register，返回 geetest 挑战参数（对齐 Flutter request_utils.validate）。 */
async function registerSearchVoucher(voucher: string): Promise<{ token: string; gt: string; challenge: string }> {
  const reg = await validateApi.gaiaRegister({ token: voucher });
  const data: any = reg?.data;
  const token = data?.token as string | undefined;
  const gt = data?.geetest?.gt as string | undefined;
  const challenge = data?.geetest?.challenge as string | undefined;
  if (!token || !gt || !challenge) throw new SearchCaptchaError({ token: token || '', gt: gt || '', challenge: challenge || '' });
  return { token, gt, challenge };
}

/** R6 解锁链第二步：geetest 通过后 gaia/validate 换取 grisk_id（带 voucher 重试用，对齐 Flutter request_utils.gaiaVgateValidate）。 */
async function validateSearchVoucher(payload: { token: string; gt: string; challenge: string; validate: string; seccode: string }): Promise<string> {
  const res = await validateApi.gaiaValidate({
    token: payload.token,
    challenge: payload.challenge,
    validate: payload.validate,
    seccode: payload.seccode,
  });
  const data: any = res?.data;
  if (data?.is_valid === 1 && typeof data?.grisk_id === 'string') return data.grisk_id;
  throw new Error('搜索风控验证未通过');
}

/** 分类搜索（R6：补 search.bilibili.com origin/referer，风控头与浏览器语义一致，降低 -352 触发率）。 */
function searchHeaders(searchType: string, keyword: string, extra?: Record<string, any>): Record<string, any> {
  return {
    origin: 'https://search.bilibili.com',
    referer: `https://search.bilibili.com/${searchType}?keyword=${encodeURIComponent(keyword)}`,
    ...(extra ?? {}),
  };
}

export const searchApi = {
  /** 搜索默认词 */
  async defaultWord(config?: RequestConfig) {
    return get(apiClient, Api.searchDefault, { limit: 10 }, config);
  },

  // 搜索建议
  async suggest(params: { term: string }, config?: RequestConfig) {
    return get(apiClient, Api.searchSuggest, { term: params.term, main_ver: 'v1' }, config);
  },

  // 分类搜索（R6：origin/referer + v_voucher 检测）
  async byType(params: { keyword: string; search_type: string; page?: number; order?: string; duration?: number; tids?: number }, config?: RequestConfig) {
    return getWbi(apiClient, Api.searchByType, {
      page_size: 20,
      platform: 'pc',
      web_location: 1430654,
      ...params,
    }, {
      ...config,
      headers: { ...searchHeaders(params.search_type, params.keyword), ...(config?.headers ?? {}) },
    });
  },

  /** 分类搜索（带 geetest 解锁后的 grisk_id 重试，R6）。 */
  async byTypeWithVoucher(params: { keyword: string; search_type: string; page?: number; order?: string; gaiaVtoken: string }, config?: RequestConfig) {
    return getWbi(apiClient, Api.searchByType, {
      page_size: 20,
      platform: 'pc',
      web_location: 1430654,
      gaia_vtoken: params.gaiaVtoken,
      keyword: params.keyword,
      search_type: params.search_type,
      page: params.page,
      ...(params.order ? { order: params.order } : {}),
    }, {
      ...config,
      headers: {
        ...searchHeaders(params.search_type, params.keyword),
        cookie: `x-bili-gaia-vtoken=${params.gaiaVtoken}`,
        ...(config?.headers ?? {}),
      },
    });
  },

  /** 搜索风控自愈入口（R6）：响应含 v_voucher 时调用 gaia register 获取 geetest 挑战参数，
   *  供 UI 层展示验证（RN 暂未内置 geetest 组件，可在调用方接入后走 finishVoucherUnlock 收尾）。 */
  async resolveVoucher(voucher: string): Promise<{ token: string; gt: string; challenge: string }> {
    return registerSearchVoucher(voucher);
  },

  /** 完整解锁链（供 UI 层 geetest 通过后调用）：validate 换取 grisk_id。 */
  async finishVoucherUnlock(payload: { token: string; gt: string; challenge: string; validate: string; seccode: string }): Promise<string> {
    return validateSearchVoucher(payload);
  },

  /** 综合搜索（GET /x/web-interface/wbi/search/all/v2，WBI；03-§3.4#1 补齐）。
   *  返回 data.result 为分组数组：{ result_type: 'video'|'bili_user'|'media_bangumi'|'media_ft'|'live_room'|'article', data: [...] }。
   *  仅第 1 页返回各分组；翻页时增量主要在 video 分组（对齐 Flutter SearchHttp.searchAll）。 */
  async all(params: {
    keyword: string;
    page?: number;
    order?: string;
    duration?: number;
    tids?: number;
    order_sort?: number;
    user_type?: number;
    category_id?: number;
    pubtime_begin_s?: number;
    pubtime_end_s?: number;
  }, config?: RequestConfig) {
    return getWbi(apiClient, '/x/web-interface/wbi/search/all/v2', {
      keyword: params.keyword,
      page: params.page ?? 1,
      ...(params.order ? { order: params.order } : {}),
      ...(params.duration != null ? { duration: params.duration } : {}),
      ...(params.tids != null ? { tids: params.tids } : {}),
      ...(params.order_sort != null ? { order_sort: params.order_sort } : {}),
      ...(params.user_type != null ? { user_type: params.user_type } : {}),
      ...(params.category_id != null ? { category_id: params.category_id } : {}),
      ...(params.pubtime_begin_s != null ? { pubtime_begin_s: params.pubtime_begin_s } : {}),
      ...(params.pubtime_end_s != null ? { pubtime_end_s: params.pubtime_end_s } : {}),
    }, config);
  },

  /** 搜索趋势 */
  async trending(config?: RequestConfig) {
    return get(apiClient, Api.searchTrending, {}, config);
  },

  // 搜索推荐(app端)
  async recommend(config?: RequestConfig) {
    return get(appClient, Api.searchRecommend, await signAppParamsAsync({}), config);
  },

  // 话题发布搜索（app 端签名；payload 对齐 Flutter SearchHttp.topicPubSearch）
  async topicPubSearch(params: { keywords: string; content?: string; page_num?: number }) {
    const pageNum = params.page_num ?? 1;
    return get(appClient, Api.topicPubSearch, await signAppParamsAsync({
      keywords: params.keywords,
      content: params.content ?? '',
      ...(pageNum === 1 ? { page_size: 20, page_num: 1 } : { offset: 20 * (pageNum - 1) }),
    }));
  },
};
