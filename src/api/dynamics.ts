import { apiClient, get, post, getWbi, type RequestConfig } from './client';
import { Api } from './endpoints';
import { getCSRF } from '@/utils/cookie';
import { useAuthStore } from '@/stores/auth';
import { FORM_HEADERS, formBodyStrict } from '@/utils/form';
import { uploadBfsFile } from '@/utils/upload-bfs';
import { generateUploadIdAsync } from 'pili-native-core';
import type { NativeRequestCancelToken } from '@/utils/request-cancel';

/** 投票创建/更新载荷（对齐 Flutter lib/models/dynamics/vote_model.dart VoteInfo.toJson） */
export interface VoteCreateInfo {
  title?: string;
  desc?: string;
  type?: number;
  choice_cnt?: number;
  duration?: number;
  options?: { opt_desc?: string; img_url?: string }[];
  only_fans_level?: number;
  vote_publisher?: number;
  vote_id?: number;
}

export const dynamicsApi = {
  // 动态列表
  async feedAll(params: { type?: 'all' | 'video' | 'pgc' | 'article'; type_list?: string; offset?: string; page?: number; timezone_offset?: number; features?: string }, config?: RequestConfig) {
    return getWbi(apiClient, Api.followDynamic, {
      timezone_offset: -480, features: 'itemOpusStyle,listOnlyfans,onlyfansQaCard', ...params,
    }, config);
  },

  // 动态详情
  async detail(params: { id: string; timezone_offset?: number }) {
    return get(apiClient, Api.dynamicDetail, {
      timezone_offset: -480, features: 'itemOpusStyle,listOnlyfans,onlyfansQaCard', ...params,
    });
  },

  // 动态点赞
  async thumb(params: { dyn_id_str: string; up: number }) {
    return post(apiClient, Api.thumbDynamic, null, { spmid: '333.1365.0.0', ...params, csrf: getCSRF() });
  },

  // 用户动态
  async space(params: { host_mid: number; offset?: string; features?: string }) {
    return get(apiClient, Api.memberDynamic, { features: 'itemOpusStyle,listOnlyfans,onlyfansQaCard', ...params });
  },

  // 用户动态搜索
  async spaceSearch(params: { host_mid: number; keyword: string; offset?: string }) {
    return get(apiClient, Api.dynSearch, { ...params });
  },

  // 未读动态数
  async unread() {
    return get(apiClient, Api.getUnreadDynamic);
  },

  // UP主动态列表
  async uplist() {
    return get(apiClient, Api.dynUplist);
  },

  // 正在直播的UP
  async portal(config?: RequestConfig) {
    return get(apiClient, Api.followUp, { up_list_more: 1, web_location: 333.1365 }, config);
  },

  // 删除动态
  async remove(params: { dyn_id_str: string }) {
    return post(apiClient, Api.removeDynamic, null, { ...params, csrf: getCSRF() });
  },

  // 置顶动态
  async setTop(params: { dyn_str: string }) {
    return post(apiClient, Api.setTopDyn, null, { ...params, csrf: getCSRF() });
  },

  // 取消置顶
  async rmTop(params: { dyn_str: string }) {
    return post(apiClient, Api.rmTopDyn, null, { ...params, csrf: getCSRF() });
  },

  // 动态图片详情
  async picDetail(params: { dyn_id: string }) {
    return get(apiClient, Api.dynPic, params);
  },

  // 话题动态
  async topicFeed(params: { topic_id: number; offset?: string; sort_by?: number; page_size?: number; source?: string; features?: string }, config?: RequestConfig) {
    return get(apiClient, Api.topicFeed, params, config);
  },

  // 话题详情
  async topicTop(params: { topic_id: number; source?: string }) {
    return get(apiClient, Api.topicTop, params);
  },

  // 话题折叠展开
  async topicFold(params: { topic_id: number; sort_by?: number }) {
    return get(apiClient, Api.topicFold, params);
  },

  // 话题收藏
  async addFavTopic(params: { topic_id: number | string }) {
    return post(apiClient, Api.addFavTopic, formBodyStrict({ topic_id: params.topic_id, csrf: getCSRF() }), undefined, {
      headers: FORM_HEADERS,
    });
  },

  // 取消话题收藏
  async delFavTopic(params: { topic_id: number | string }) {
    return post(apiClient, Api.delFavTopic, formBodyStrict({ topic_id: params.topic_id, csrf: getCSRF() }), undefined, {
      headers: FORM_HEADERS,
    });
  },

  // 话题点赞
  async likeTopic(params: { topic_id: number | string; up_mid?: number; action?: 'like' | 'cancel_like' }) {
    return post(apiClient, Api.likeTopic, formBodyStrict({
      action: params.action ?? 'like',
      up_mid: params.up_mid ?? 0,
      topic_id: params.topic_id,
      csrf: getCSRF(),
      business: 'topic',
    }), undefined, {
      headers: FORM_HEADERS,
    });
  },

  // 动态反应(表情)
  async reaction(params: { dyn_id: string; offset?: string }) {
    return get(apiClient, Api.dynReaction, params);
  },

  // opus详情
  async opusDetail(params: { id: string }) {
    return get(apiClient, Api.opusDetail, params);
  },

  // 投票信息
  async voteInfo(params: { vote_id: number | string }) {
    return get(apiClient, Api.voteInfo, params);
  },

  // 投票（payload 对齐 Flutter DynamicsHttp.doVote：JSON body + csrf）
  async doVote(params: { vote_id: number; votes: number[]; voter_uid?: number; status?: number; op_bit?: number; dynamic_id?: number }) {
    const csrf = getCSRF();
    return post(apiClient, Api.doVote, {
      vote_id: params.vote_id,
      votes: params.votes,
      voter_uid: params.voter_uid ?? 0,
      status: params.status ?? 0,
      op_bit: params.op_bit ?? 0,
      dynamic_id: params.dynamic_id ?? 0,
      csrf_token: csrf,
      csrf,
    }, { csrf });
  },

  // 创建投票（body: {'vote_info': ...}，对齐 Flutter DynamicsHttp.createVote）
  async createVote(params: { vote_info: VoteCreateInfo }) {
    return post(apiClient, Api.createVote, { vote_info: params.vote_info }, { csrf: getCSRF() });
  },

  // 更新投票（vote_info 内含 vote_id，对齐 Flutter DynamicsHttp.updateVote）
  async updateVote(params: { vote_info: VoteCreateInfo }) {
    return post(apiClient, Api.updateVote, { vote_info: params.vote_info }, { csrf: getCSRF() });
  },

  // 关注的人的投票
  async followeeVotes() {
    return get(apiClient, Api.followeeVotes);
  },

  // 专栏列表
  async articleList(params: { id: number; sort?: string }, config?: RequestConfig) {
    return get(apiClient, Api.articleList, { sort: 'publish_time', ...params }, config);
  },

  // 动态预约（JSON body + query csrf，对齐 Flutter DynamicsHttp.dynReserve）
  async dynReserve(params: { reserve_id: number; cur_btn_status: number; dynamic_id_str: string; reserve_total?: number }) {
    return post(apiClient, Api.dynReserve, {
      reserve_id: params.reserve_id,
      cur_btn_status: params.cur_btn_status,
      dynamic_id_str: params.dynamic_id_str,
      ...(params.reserve_total != null ? { reserve_total: params.reserve_total } : {}),
    }, { csrf: getCSRF() });
  },

  // 话题推荐
  async topicRcmd(params?: Record<string, any>, config?: RequestConfig) {
    return get(apiClient, Api.dynTopicRcmd, params, config);
  },

  // @提及搜索
  async mention(params: { keyword: string }) {
    return get(apiClient, Api.dynMention, params);
  },

  // 创建预约（form-urlencoded，对齐 Flutter DynamicsHttp.createReserve）
  async createReserve(params: { title: string; live_plan_start_time: number; sub_type?: number }) {
    return post(apiClient, Api.createReserve, formBodyStrict({
      type: 2,
      sub_type: params.sub_type ?? 0,
      from: 1,
      title: params.title,
      live_plan_start_time: params.live_plan_start_time,
      csrf: getCSRF(),
    }), undefined, { headers: FORM_HEADERS });
  },

  // 更新预约（form-urlencoded + id，对齐 Flutter DynamicsHttp.updateReserve）
  async updateReserve(params: { reserve_id: number; title: string; live_plan_start_time: number; sub_type?: number }) {
    return post(apiClient, Api.updateReserve, formBodyStrict({
      type: 2,
      sub_type: params.sub_type ?? 0,
      from: 1,
      title: params.title,
      live_plan_start_time: params.live_plan_start_time,
      id: params.reserve_id,
      csrf: getCSRF(),
    }), undefined, { headers: FORM_HEADERS });
  },

  // 预约信息
  async reserveInfo(params: { reserve_id: number }) {
    return get(apiClient, Api.reserveInfo, params);
  },

  // 动态可见性设置
  async privatePubSetting(params: { dyn_id: string; private_pub: number }) {
    return post(apiClient, Api.dynPrivatePubSetting, null, { ...params, csrf: getCSRF() });
  },

  // 编辑动态
  async editDyn(params: { dyn_id: string; content: string }) {
    return post(apiClient, Api.editDyn, null, { ...params, csrf: getCSRF() });
  },

  // 转发动态（对齐 Flutter DynamicsHttp.createDynamic repost 分支：scene=4 + web_repost_src）
  async repost(params: { dyn_id: string; content?: string; private_pub?: number }) {
    const mid = useAuthStore.getState().userInfo?.mid ?? 0;
    const content = params.content?.trim() || '';
    const dynReq: Record<string, any> = {
      content: {
        contents: content ? [{ raw_text: content, type: 1, biz_id: '' }] : [],
      },
      scene: 4,
      option: params.private_pub === 1 ? { private_pub: 1 } : {},
      upload_id: await generateUploadIdAsync(String(mid)),
      meta: { app_meta: { from: 'create.dynamic.web', mobi_app: 'web' } },
    };
    return post(
      apiClient,
      Api.createDynamic,
      JSON.stringify({
        dyn_req: dynReq,
        web_repost_src: { dyn_id_str: params.dyn_id },
      }),
      {
        platform: 'web',
        csrf: getCSRF(),
        'x-bili-device-req-json': encodeURIComponent(JSON.stringify({ platform: 'web', device: 'pc' })),
        'x-bili-web-req-json': encodeURIComponent(JSON.stringify({ spm_id: '333.999' })),
      },
      { headers: { 'Content-Type': 'application/json' } },
    );
  },

  // 气泡
  async bubble(params?: Record<string, any>, config?: RequestConfig) {
    return get(apiClient, Api.bubble, params, config);
  },

  // 上传动态图片
  async uploadBfs(p: { file: any; category?: string; biz?: string }, cancelToken?: NativeRequestCancelToken) {
    return uploadBfsFile(`${apiClient.baseURL}${Api.uploadBfs}`, p.file, {
      category: p.category,
      biz: p.biz,
    }, cancelToken);
  },

  // 动态举报
  async report(params: { dynamic_id: string; reason: number }) {
    return post(apiClient, Api.dynamicReport, null, { ...params, csrf: getCSRF() });
  },
};
