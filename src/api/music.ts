import { apiClient, get, post } from './client';
import { Api } from './endpoints';

export const musicApi = {
  async bgmDetail(params: { id: number | string }) {
    return get(apiClient, Api.bgmDetail, params);
  },
  async bgmRecommend(params: { id: number | string }) {
    return get(apiClient, Api.bgmRecommend, params);
  },
  async wishUpdate(params: { id: number | string; wish: number }) {
    return post(apiClient, Api.wishUpdate, null, params);
  },
};
