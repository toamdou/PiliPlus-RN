import { apiClient, get, getWbi, post } from './client';
import { Api } from './endpoints';
import { getCSRF } from '@/utils/cookie';
import { FORM_HEADERS, formBody } from '@/utils/form';

export const musicApi = {
  /** 音乐详情（R5：参数名为 music_id + WBI 签名 + relation_from，对齐 Flutter music.dart bgmDetail） */
  async bgmDetail(params: { id: number | string }) {
    return getWbi(apiClient, Api.bgmDetail, {
      music_id: params.id,
      relation_from: 'bgm_page',
    });
  },

  /** 相关音乐推荐（R5：参数名为 music_id，对齐 Flutter music.dart bgmRecommend） */
  async bgmRecommend(params: { id: number | string }) {
    return get(apiClient, Api.bgmRecommend, { music_id: params.id });
  },

  /** 音乐收藏/取消收藏（R5：form + {music_id, state, csrf}，对齐 Flutter music.dart wishUpdate）
   *  state: 1 取消 / 2 收藏（hasLike ? 2 : 1） */
  async wishUpdate(params: { id: number | string; state?: number; hasLike?: boolean }) {
    const csrf = getCSRF();
    const state = params.state ?? (params.hasLike ? 2 : 1);
    return post(
      apiClient,
      Api.wishUpdate,
      formBody({ music_id: params.id, state, csrf }),
      undefined,
      { headers: FORM_HEADERS },
    );
  },
};
