/**
 * 专栏文章接口（批次5：补齐 03-§3.4#4 缺失的 /x/article/viewinfo、/x/article/view）。
 *
 * 两端接口均需 WBI 签名（复用 client.getWbi → 原生 PiliSigner，key 走 24h 缓存）；
 * 收藏走 web 表单接口（id + csrf，对齐 Flutter FavHttp.addFavArticle / delFavArticle）。
 * 点赞：专栏点赞在服务端走动态点赞体系（dyn_id_str），复用 src/api/dynamics.ts 的 dynamicsApi.thumb。
 */
import { apiClient, getWbi, post, type RequestConfig } from './client';
import { getCSRF } from '@/utils/cookie';

export const articleApi = {
  /** 专栏统计/收藏态（GET /x/article/viewinfo，WBI）。
   *  返回 data.favorite（是否已收藏）+ data.stats{like,favorite,reply,share}（阅读计数）。 */
  async viewInfo(params: { id: number | string }, config?: RequestConfig) {
    return getWbi(apiClient, '/x/article/viewinfo', {
      id: params.id,
      mobi_app: 'pc',
      from: 'web',
      gaia_source: 'main_web',
    }, config);
  },

  /** 专栏正文（GET /x/article/view，WBI）。
   *  返回 data.title / content(HTML) / author{mid,name,face} / publish_time / type /
   *  origin_image_urls / dyn_id_str / opus{content 段落 JSON} / ops。 */
  async view(params: { id: number | string }, config?: RequestConfig) {
    return getWbi(apiClient, '/x/article/view', {
      id: params.id,
      gaia_source: 'main_web',
      web_location: '333.976',
    }, config);
  },

  /** 收藏专栏（POST /x/article/favorites/add，form，对齐 Flutter FavHttp.addFavArticle）。 */
  async addFav(params: { id: number | string }) {
    return post(apiClient, '/x/article/favorites/add', null, { id: params.id, csrf: getCSRF() });
  },

  /** 取消收藏专栏（POST /x/article/favorites/del，form，对齐 Flutter FavHttp.delFavArticle）。 */
  async delFav(params: { id: number | string }) {
    return post(apiClient, '/x/article/favorites/del', null, { id: params.id, csrf: getCSRF() });
  },
};
