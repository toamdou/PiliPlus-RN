import { apiClient, get, post, getWbi, type RequestConfig } from './client';
import { Api } from './endpoints';
import { getCSRF } from '@/utils/cookie';

export const favApi = {
  // 收藏夹列表
  async folderList(params: { up_mid: number; pn?: number; ps?: number }, config?: RequestConfig) {
    return get(apiClient, Api.userFavFolder, { ps: 20, ...params }, config);
  },

  // 收藏夹详情
  async folderInfo(params: { media_id: number }) {
    return get(apiClient, Api.favFolderInfo, params);
  },

  // 收藏夹内容
  async resourceList(params: { media_id: number; pn?: number; ps?: number; keyword?: string; order?: string; tid?: number; type?: number }, config?: RequestConfig) {
    return get(apiClient, Api.favResourceList, { ps: 20, platform: 'web', type: 0, tid: 0, ...params }, config);
  },

  // 全部收藏夹(含视频所在)
  async folderAll(params: { up_mid: number; type?: number; rid?: number }, config?: RequestConfig) {
    return get(apiClient, Api.favFolder, { type: 2, ...params }, config);
  },

  // 批量收藏/取消
  async batchDeal(params: { rid: number; type: number; add_media_ids?: string; del_media_ids?: string }) {
    return post(apiClient, Api.favVideo, null, { ...params, csrf: getCSRF() });
  },

  // 创建收藏夹
  async addFolder(params: { title: string; intro?: string; privacy?: number }) {
    return post(apiClient, Api.addFolder, null, { privacy: 0, ...params, csrf: getCSRF() });
  },

  // 编辑收藏夹
  async editFolder(params: { media_id: number; title: string; intro?: string; privacy?: number }) {
    return post(apiClient, Api.editFolder, null, { ...params, csrf: getCSRF() });
  },

  // 删除收藏夹
  async deleteFolder(params: { media_ids: string }) {
    return post(apiClient, Api.deleteFolder, null, { ...params, csrf: getCSRF() });
  },

  // 收藏夹排序（sort: 收藏夹 id 逗号分隔）
  async sortFolder(params: { sort: string }) {
    return post(apiClient, Api.sortFavFolder, null, { ...params, csrf: getCSRF() });
  },

  // 清理失效内容
  async clean(params: { media_id: number }) {
    return post(apiClient, Api.cleanFav, null, { ...params, csrf: getCSRF() });
  },

  // 排序收藏夹内容
  async sort(params: { media_id: number; resources: string }) {
    return post(apiClient, Api.sortFav, null, { ...params, csrf: getCSRF() });
  },

  // 稍后再看列表
  async toViewList(params?: { pn?: number; ps?: number; viewed?: number; key?: string; asc?: boolean }, config?: RequestConfig) {
    return getWbi(apiClient, Api.seeYouLater, {
      pn: 1, ps: 20, viewed: 0, key: '', asc: false, need_split: true, web_location: 333.881, ...params,
    }, config);
  },

  // 添加稍后再看
  async addToView(params: { aid?: number; bvid?: string }) {
    return post(apiClient, Api.toViewLater, null, { ...params, csrf: getCSRF() });
  },

  /** 删除稍后再看（resources 为 aid 逗号分隔；"viewed:1" 清空已看） */
  async delToView(params: { resources: string }) {
    return post(apiClient, Api.toViewDel, null, { ...params, csrf: getCSRF() });
  },

  // 清空稍后再看
  async clearToView() {
    return post(apiClient, Api.toViewClear, null, { csrf: getCSRF() });
  },

  // 历史记录
  async history(params: { max?: number; view_at?: number; ps?: number; type?: string }, config?: RequestConfig) {
    return get(apiClient, Api.historyList, { ps: 20, type: '', ...params }, config);
  },

  // 搜索历史
  async searchHistory(params: { keyword: string; pn?: number }, config?: RequestConfig) {
    return get(apiClient, Api.searchHistory, { business: 'all', pn: 1, ...params }, config);
  },

  // 删除历史
  async delHistory(params: { kid: string }) {
    return post(apiClient, Api.delHistory, null, { ...params, csrf: getCSRF() });
  },

  // 清空历史
  async clearHistory() {
    return post(apiClient, Api.clearHistory, null, { csrf: getCSRF() });
  },

  // 暂停历史
  async pauseHistory(params: { switch: boolean }) {
    return post(apiClient, Api.pauseHistory, null, { ...params, csrf: getCSRF() });
  },

  // 追番列表
  async pgcFollow(params: { type?: number; pn?: number; ps?: number; vmid?: number; follow_status?: number }, config?: RequestConfig) {
    return get(apiClient, Api.favPgc, { type: 1, ps: 15, pn: 1, ...params }, config);
  },

  // 追番
  async pgcAdd(params: { season_id: number }) {
    return post(apiClient, Api.pgcAdd, null, { ...params, csrf: getCSRF() });
  },

  // 取消追番
  async pgcDel(params: { season_id: number }) {
    return post(apiClient, Api.pgcDel, null, { ...params, csrf: getCSRF() });
  },

  // 订阅列表
  async subFolder(params: { up_mid: number; pn?: number; ps?: number }, config?: RequestConfig) {
    return get(apiClient, Api.userSubFolder, { ps: 20, platform: 'web', ...params }, config);
  },

  // 收藏的课堂（PUGV）
  async favPugv(params: { mid: number; pn?: number; ps?: number }, config?: RequestConfig) {
    return get(apiClient, Api.favPugv, { ps: 20, pn: 1, web_location: 333.1387, ...params }, config);
  },

  // 收藏的话题
  async favTopic(params: { pn?: number; page_size?: number }, config?: RequestConfig) {
    return get(apiClient, Api.favTopicList, { page_size: 24, page_num: 1, web_location: 333.1387, ...params }, config);
  },

  // 收藏的专栏（opus feed）
  async favArticle(params: { page?: number; page_size?: number }, config?: RequestConfig) {
    return get(apiClient, Api.favArticle, { page_size: 20, page: 1, ...params }, config);
  },

  // 取消收藏专栏
  async delFavArticle(params: { id: number }) {
    return post(apiClient, Api.delFavArticle, null, { ...params, csrf: getCSRF() });
  },

  // 收藏的笔记
  async userNoteList(params: { pn?: number; ps?: number }, config?: RequestConfig) {
    return get(apiClient, Api.userNoteList, { ps: 10, pn: 1, csrf: getCSRF(), ...params }, config);
  },

  // 删除笔记收藏
  async delNote(params: { note_ids: string }) {
    return post(apiClient, Api.delNote, null, { ...params, csrf: getCSRF() });
  },

  // 复制/移动收藏夹内容
  async copyOrMove(params: { isCopy: boolean; srcMediaId?: number; tarMediaId: number; resources: string }) {
    return post(apiClient, params.isCopy ? Api.copyFav : Api.moveFav, null, {
      src_media_id: params.srcMediaId, tar_media_id: params.tarMediaId,
      resources: params.resources, platform: 'web', csrf: getCSRF(),
    });
  },

  // 取消全部收藏（收藏夹内单个内容）
  async unfavAll(params: { rid: number; type: number }) {
    return post(apiClient, Api.unfavAll, null, { ...params, csrf: getCSRF() });
  },

  // 收藏/取消收藏收藏夹
  async favFavFolder(params: { media_id: number }) {
    return post(apiClient, Api.favFavFolder, null, { ...params, csrf: getCSRF() });
  },

  // 取消订阅收藏夹/合集
  async cancelSub(params: { id: number; type: number }) {
    const url = params.type === 11 ? Api.unfavFolder : Api.unfavSeason;
    return post(apiClient, url, null, {
      ...(params.type === 11 ? { media_id: params.id } : { season_id: params.id }),
      platform: 'web', csrf: getCSRF(),
    });
  },

  // 合集详情
  async seasonList(params: { season_id: number; pn?: number; ps?: number }, config?: RequestConfig) {
    return get(apiClient, Api.favSeasonList, { ps: 20, ...params }, config);
  },

  // medialist
  async mediaList(params: { type: number; biz_id: number; oid?: number; ps?: number; direction?: boolean }) {
    return get(apiClient, Api.mediaList, { ps: 20, ...params });
  },
};
