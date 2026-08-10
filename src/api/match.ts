import { apiClient, get } from './client';

export const matchApi = {
  async info(params: { cid: number | string }) {
    return get(apiClient, '/x/esports/match/info', { cid: params.cid, platform: 2 });
  },
};
