import { apiClient, appClient, get, getWbi, type RequestConfig } from './client';
import { Api } from './endpoints';
import { signAppParamsAsync } from '@/utils/app-sign';

export const searchApi = {
  /** 搜索默认词 */
  async defaultWord(config?: RequestConfig) {
    return get(apiClient, Api.searchDefault, { limit: 10 }, config);
  },

  // 搜索建议
  async suggest(params: { term: string }, config?: RequestConfig) {
    return get(apiClient, Api.searchSuggest, { term: params.term, main_ver: 'v1' }, config);
  },

  // 分类搜索
  async byType(params: { keyword: string; search_type: string; page?: number; order?: string; duration?: number; tids?: number }, config?: RequestConfig) {
    return getWbi(apiClient, Api.searchByType, {
      page_size: 20,
      platform: 'pc',
      web_location: 1430654,
      ...params,
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
