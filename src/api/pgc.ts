import { apiClient, get, post, type RequestConfig } from './client';
import { Api } from './endpoints';
import { getCSRF } from '@/utils/cookie';
import { FORM_HEADERS, formBody } from '@/utils/form';

export const pgcApi = {
  // 番剧详情
  async seasonInfo(params: { season_id?: number; ep_id?: number }, config?: RequestConfig) {
    return get(apiClient, Api.pgcInfo, params, config);
  },

  // 剧集信息
  async episodeInfo(params: { ep_id: number }, config?: RequestConfig) {
    return get(apiClient, Api.episodeInfo, params, config);
  },

  // 番剧视频流
  async playUrl(params: { cid: number; bvid?: string; ep_id?: number; qn?: number; fnval?: number }, config?: RequestConfig) {
    return get(apiClient, Api.pgcUrl, { fnval: 4048, fourk: 1, ...params }, config);
  },

  // 追番
  async followAdd(params: { season_id: number }) {
    return post(apiClient, Api.pgcAdd, null, { ...params, csrf: getCSRF() });
  },

  // 取消追番
  async followDel(params: { season_id: number }) {
    return post(apiClient, Api.pgcDel, null, { ...params, csrf: getCSRF() });
  },

  // 更新追番状态
  async followUpdate(params: { season_id: number; status: number }) {
    return post(apiClient, Api.pgcUpdate, null, { ...params, csrf: getCSRF() });
  },

  // 追番列表
  async followList(params: { vmid: number; type?: number; pn?: number; ps?: number }) {
    return get(apiClient, Api.favPgc, { type: 1, ps: 15, ...params });
  },

  // 番剧索引条件
  async indexCondition(params?: { season_type?: number }, config?: RequestConfig) {
    return get(apiClient, Api.pgcIndexCondition, { season_type: 1, ...params }, config);
  },

  // 番剧索引结果
  async indexResult(params: { season_type: number; order?: number | string; sort?: number | string; page?: number; pagesize?: number; [key: string]: any }, config?: RequestConfig) {
    return get(apiClient, Api.pgcIndexResult, { pagesize: 20, page: 1, ...params }, config);
  },

  // 番剧排行
  async rank(params: { season_type?: number; day?: number }, config?: RequestConfig) {
    return get(apiClient, Api.pgcRank, { season_type: 1, day: 3, ...params }, config);
  },

  // 番剧排行（别名）
  async pgcRank(params?: { season_type?: number }, config?: RequestConfig) {
    return get(apiClient, Api.pgcRank, { season_type: 1, ...params }, config);
  },

  // 番剧时间表
  async timeline(params?: { types?: string; before?: number; after?: number }, config?: RequestConfig) {
    return get(apiClient, Api.pgcTimeline, { types: '1', before: 6, after: 6, ...params }, config);
  },

  // 番剧点评
  async reviewLong(params: { media_id: number; pn?: number; ps?: number }, config?: RequestConfig) {
    return get(apiClient, Api.pgcReviewL, { ps: 20, ...params }, config);
  },

  // 短评
  async reviewShort(params: { media_id: number; pn?: number; ps?: number }, config?: RequestConfig) {
    return get(apiClient, Api.pgcReviewS, { ps: 20, ...params }, config);
  },

  // 点赞点评（review_type 固定 2=短评，对齐 Flutter PgcHttp.pgcReviewLike）
  async reviewLike(params: { media_id: number; review_id: number }) {
    return post(
      apiClient,
      Api.pgcReviewLike,
      formBody({ media_id: params.media_id, review_type: 2, review_id: params.review_id, csrf: getCSRF() }),
      undefined,
      { headers: FORM_HEADERS },
    );
  },

  // 发布短评（score 0-10，对齐 Flutter PgcHttp.pgcReviewPost）
  async reviewPost(params: { media_id: number; content: string; score?: number }) {
    return post(
      apiClient,
      Api.pgcReviewPost,
      formBody({ media_id: params.media_id, score: params.score, content: params.content, csrf: getCSRF() }),
      undefined,
      { headers: FORM_HEADERS },
    );
  },

  // 用户追番状态
  async seasonStatus(params: { season_id: number }, config?: RequestConfig) {
    return get(apiClient, Api.seasonStatus, params, config);
  },

  // 点赞/投币/收藏(番剧)
  async communityAction(params: { ep_id: number; type: string; action: number }) {
    return post(apiClient, Api.pgcLikeCoinFav, null, { ...params, csrf: getCSRF() });
  },

  // 一键三连(番剧)
  async triple(params: { ep_id: number }) {
    return post(apiClient, Api.pgcTriple, null, { ...params, csrf: getCSRF() });
  },
};
