import { liveClient, get, post, getWbi, type RequestConfig } from './client';
import { Api } from './endpoints';
import { getCSRF, getAccessKey } from '@/utils/cookie';
import { STATISTICS, signAppParamsAsync } from '@/utils/app-sign';
import { FORM_HEADERS, formBody } from '@/utils/form';
import { wbiSignQuery } from '@/utils/wbi-sign';

export const liveApi = {
  // 直播间信息
  async roomInfo(params: { room_id: number; qn?: number; onlyAudio?: boolean }, config?: RequestConfig) {
    const query: Record<string, any> = {
      protocol: '0,1', format: '0,1,2', codec: '0,1,2', qn: 10000, platform: 'web', ptype: 8,
      dolby: 5, panorama: 1, web_location: 444.8, ...params,
    };
    if (params.onlyAudio) query.only_audio = 1;
    return getWbi(liveClient, Api.liveRoomInfo, query, config);
  },

  // 直播间H5信息
  async roomInfoH5(params: { room_id: number }, config?: RequestConfig) {
    return get(liveClient, Api.liveRoomInfoH5, params, config);
  },

  // 直播弹幕预获取
  async dmPrefetch(params: { roomid: number }, config?: RequestConfig) {
    return get(liveClient, Api.liveRoomDmPrefetch, params, config);
  },

  // 直播弹幕密钥
  async dmToken(params: { id: number }, config?: RequestConfig) {
    return getWbi(liveClient, Api.liveRoomDmToken, { id: params.id, web_location: 444.8 }, config);
  },

  // 发送直播弹幕
  async sendMsg(params: { roomid: number; msg: string; color?: number; fontsize?: number; mode?: number; bubble?: number }) {
    const csrf = getCSRF();
    const signed = await wbiSignQuery({ web_location: 444.8 });
    return post(liveClient, Api.sendLiveMsg, formBody({
      color: params.color ?? 16777215,
      fontsize: params.fontsize ?? 25,
      mode: params.mode ?? 1,
      bubble: params.bubble ?? 0,
      msg: params.msg,
      rnd: Math.floor(Date.now() / 1000),
      roomid: params.roomid,
      csrf,
      csrf_token: csrf,
      room_type: 0,
      jumpfrom: 0,
      reply_mid: 0,
      reply_attr: 0,
      replay_dmid: '',
      statistics: '{"appId":100,"platform":5}',
      reply_type: 0,
      reply_uname: '',
    }), signed, { headers: FORM_HEADERS });
  },

  // 直播表情（room_id 缺失时仅返回公共表情包，对齐 Flutter LiveHttp.getLiveEmoticons）
  async emoticons(roomId?: number, config?: RequestConfig) {
    return get(liveClient, Api.getLiveEmoticons, {
      platform: 'pc',
      ...(roomId ? { room_id: roomId } : {}),
    }, config);
  },

  // 直播关注列表
  async follow(params: { page?: number; page_size?: number }, config?: RequestConfig) {
    return get(liveClient, Api.liveFollow, { page: 1, page_size: 20, ...params }, config);
  },

  // 直播搜索（app 端签名；type: room | user，对齐 Flutter LiveHttp.liveSearch）
  async liveSearch(params: { page?: number; keyword: string; type: 'room' | 'user' }, config?: RequestConfig) {
    const signed = await signAppParamsAsync({
      actionKey: 'appkey',
      build: 8430300,
      channel: 'master',
      version: '8.43.0',
      c_locale: 'zh_CN',
      device: 'android',
      page: params.page ?? 1,
      pagesize: 30,
      keyword: params.keyword,
      disable_rcmd: 0,
      mobi_app: 'android',
      platform: 'android',
      s_locale: 'zh_CN',
      statistics: STATISTICS,
      type: params.type,
    });
    return get(liveClient, Api.liveSearch, signed, config);
  },

  // 直播分区列表
  async areaList() {
    return get(liveClient, Api.liveAreaList);
  },

  // 直播分区房间列表
  async secondList(params: { parent_area_id: number; area_id: number; page?: number; sort_type?: string }, config?: RequestConfig) {
    return get(liveClient, Api.liveSecondList, { page: 1, sort_type: 'online', ...params }, config);
  },

  // 进入直播间上报
  async roomEntryAction(params: { room_id: number }, config?: RequestConfig) {
    return post(liveClient, Api.roomEntryAction, null, { ...params, csrf_token: getCSRF(), csrf: getCSRF() }, config);
  },

  // 直播点赞
  async likeReport(params: { room_id: number; anchor_id: number }) {
    return post(liveClient, Api.liveLikeReport, null, { ...params, csrf_token: getCSRF(), csrf: getCSRF() });
  },

  // 直播点赞（app 端完整参数，对齐 Flutter liveLikeReport）
  async likeReportV3(params: { room_id: number; anchor_id: number; uid: number; click_time?: number }) {
    const csrf = getCSRF();
    const signed = await wbiSignQuery({
      click_time: params.click_time ?? 1,
      room_id: params.room_id,
      uid: params.uid,
      anchor_id: params.anchor_id,
      web_location: 444.8,
      csrf,
      csrf_token: csrf,
    });
    return post(liveClient, Api.liveLikeReport, formBody(signed), undefined, { headers: FORM_HEADERS });
  },

  // 直播内容反馈/举报（app 端 GET + 签名，对齐 Flutter liveFeedback）
  async feedbackDislike(params: { room_id: number; id: number; id_type: string; page?: number }) {
    const signed = await signAppParamsAsync({
      actionKey: 'appkey',
      build: 8430300,
      channel: 'master',
      c_locale: 'zh_CN',
      device: 'android',
      disable_rcmd: 0,
      mobi_app: 'android',
      platform: 'android',
      s_locale: 'zh_CN',
      statistics: STATISTICS,
      version: '8.43.0',
      type: 'dislike',
      page: 1,
      ...params,
    });
    return get(liveClient, Api.liveFeedback, signed, { headers: { 'app-key': 'android' } });
  },

  // SuperChat消息
  async superChatMsg(params: { room_id: number }, config?: RequestConfig) {
    return get(liveClient, Api.superChatMsg, params, config);
  },

  // 贡献榜
  async contributionRank(params: { room_id: number; ruid: number; page?: number; type?: string; sw?: string }, config?: RequestConfig) {
    return getWbi(liveClient, Api.liveContributionRank, {
      ruid: params.ruid,
      room_id: params.room_id,
      page: params.page ?? 1,
      page_size: 100,
      type: params.type ?? 'online_rank',
      'switch': params.sw ?? 'contribution_rank',
      platform: 'web',
      web_location: 444.8,
    }, config);
  },

  // 勋章墙
  async medalWall(params: { target_id: number }) {
    return get(liveClient, Api.liveMedalWall, params);
  },

  // 用户直播信息（弹幕屏蔽设置，对齐 Flutter LiveHttp.getLiveInfoByUser）
  async infoByUser(params: { room_id: number }) {
    return get(liveClient, Api.getLiveInfoByUser, params);
  },

  // 直播首页 Feed（app 端接口，参数/headers 对齐 Flutter LiveHttp.liveFeedIndex）
  async feedIndex(params?: Record<string, any>, config?: RequestConfig) {
    const requestConfig: RequestConfig = {
      ...config,
      headers: { 'app-key': 'android', ...(config?.headers ?? {}) },
    };
    return get(
      liveClient,
      Api.liveFeedIndex,
      {
        channel: 'master',
        actionKey: 'appkey',
        build: 8430300,
        version: '8.43.0',
        c_locale: 'zh_CN',
        device: 'android',
        device_name: 'android',
        device_type: 0,
        fnval: 912,
        disable_rcmd: 0,
        https_url_req: 1,
        mobi_app: 'android',
        network: 'wifi',
        page: 1,
        platform: 'android',
        s_locale: 'zh_CN',
        scale: 2,
        statistics: STATISTICS,
        access_key: getAccessKey() || undefined,
        ...params,
      },
      requestConfig,
    );
  },

  // 获取收藏分区
  async getFavTag() {
    return get(liveClient, Api.getLiveFavTag);
  },

  // 设置收藏分区
  async setFavTag(params: { tag_id: number; action: number }) {
    return post(liveClient, Api.setLiveFavTag, null, { ...params, csrf: getCSRF() });
  },

  // 房间分区列表
  async roomAreaList(params?: { parent_id?: number }) {
    return get(liveClient, Api.liveRoomAreaList, params);
  },

  // 弹幕禁言规则（type: level | rank | verify，level 1 开启 / 0 关闭，对齐 Flutter LiveHttp.liveSetSilent）
  async setSilent(params: { type: 'level' | 'rank' | 'verify'; level: number }) {
    const csrf = getCSRF();
    return post(
      liveClient,
      Api.liveSetSilent,
      formBody({ ...params, csrf, csrf_token: csrf }),
      undefined,
      { headers: FORM_HEADERS },
    );
  },

  // 添加屏蔽词
  async addShieldKeyword(params: { keyword: string }) {
    const csrf = getCSRF();
    return post(
      liveClient,
      Api.addShieldKeyword,
      formBody({ keyword: params.keyword, csrf, csrf_token: csrf }),
      undefined,
      { headers: FORM_HEADERS },
    );
  },

  // 删除屏蔽词
  async delShieldKeyword(params: { keyword: string }) {
    const csrf = getCSRF();
    return post(
      liveClient,
      Api.delShieldKeyword,
      formBody({ keyword: params.keyword, csrf, csrf_token: csrf }),
      undefined,
      { headers: FORM_HEADERS },
    );
  },

  // 屏蔽用户（type: 1 屏蔽 / 0 解除，对齐 Flutter LiveHttp.liveShieldUser）
  async shieldUser(params: { uid: number; roomid: number; type: number }) {
    const csrf = getCSRF();
    return post(
      liveClient,
      Api.liveShieldUser,
      formBody({ ...params, csrf, csrf_token: csrf }),
      undefined,
      { headers: FORM_HEADERS },
    );
  },

  // 弹幕举报
  async dmReport(params: { room_id: number; dm_id: number; reason: number }) {
    return post(liveClient, Api.liveDmReport, null, { ...params, csrf: getCSRF() });
  },

  // SC举报
  async superChatReport(params: { id: number; room_id: number }) {
    return post(liveClient, Api.superChatReport, null, { ...params, csrf: getCSRF() });
  },

  // 直播反馈
  async feedback(params: { room_id: number; content: string }) {
    return post(liveClient, Api.liveFeedback, null, { ...params, csrf: getCSRF() });
  },
};
