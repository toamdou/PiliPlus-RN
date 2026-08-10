import { apiClient, appClient, get, post, getWbi, type RequestConfig } from './client';
import { Api } from './endpoints';
import { signAppParamsAsync, STATISTICS } from '@/utils/app-sign';
import { getCSRF } from '@/utils/cookie';
import { FORM_HEADERS, formBodyStrict } from '@/utils/form';
import { buildDmRiskParams } from '@/utils/player-utils';

/** 空间隐私设置项（对齐 Flutter SpaceSettingModel） */
export interface SpaceSettingModel {
  name: string;
  key: string;
  value?: number | null;
  isReverse?: boolean;
}

export interface SpaceSettingPrivacy {
  list1: SpaceSettingModel[];
  list2: SpaceSettingModel[];
  list3: SpaceSettingModel[];
}

export interface SpaceSettingData {
  privacy?: SpaceSettingPrivacy | null;
}

export interface SpaceSettingResponse {
  code: number;
  message?: string;
  data?: SpaceSettingData;
}

/* ===== 风控参数（对齐 Flutter lib/http/member.dart）=====
 * web 端 WBI 接口必须携带 dm_img_* 风控参数 + PC 浏览器 UA + space referer，
 * 否则触发风控返回 412/-352。 */
const PC_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.2 Safari/605.1.15';
const SPACE_ORIGIN = 'https://space.bilibili.com';

function spaceHeaders(mid: number, path = 'dynamic') {
  return {
    headers: {
      'User-Agent': PC_UA,
      origin: SPACE_ORIGIN,
      referer: path ? `${SPACE_ORIGIN}/${mid}/${path}` : `${SPACE_ORIGIN}/${mid}`,
    },
  };
}

export const userApi = {
  // 用户状态统计
  async navStat() {
    return get(apiClient, Api.userStatOwner);
  },

  // 用户信息(WBI签名) —— 对齐 Flutter memberInfo：dm_img 风控参数 + PC UA + space referer
  async memberInfo(params: { mid: number; token?: string }) {
    return getWbi(
      apiClient,
      Api.memberInfo,
      {
        token: '',
        platform: 'web',
        web_location: 1550101,
        ...(await buildDmRiskParams()),
        ...params,
      },
      spaceHeaders(params.mid),
    );
  },

  // 用户名片
  async card(params: { mid: number; photo?: boolean }) {
    return get(apiClient, Api.memberCardInfo, { photo: true, ...params });
  },

  // 用户投稿 —— 对齐 Flutter searchArchive：web_location 333.1387 + dm_img + PC UA
  async archive(params: { mid: number; pn?: number; ps?: number; order?: string; keyword?: string; tid?: number; special_type?: string }, config?: RequestConfig) {
    return getWbi(
      apiClient,
      Api.searchArchive,
      {
        ps: 30, pn: 1, order: 'pubdate', platform: 'web', web_location: 333.1387,
        order_avoided: true, ...(await buildDmRiskParams()), ...params,
      },
      { ...spaceHeaders(params.mid, ''), ...config },
    );
  },

  // 用户动态 —— 对齐 Flutter memberDynamic：WBI + dm_img + PC UA
  async dynamics(params: { host_mid: number; offset?: string; features?: string }, config?: RequestConfig) {
    return getWbi(
      apiClient,
      Api.memberDynamic,
      {
        offset: '',
        timezone_offset: '-480',
        features: 'itemOpusStyle',
        platform: 'web',
        web_location: '333.1387',
        ...(await buildDmRiskParams()),
        'x-bili-device-req-json': '{"platform":"web","device":"pc","spmid":"333.1387"}',
        ...params,
      },
      { ...spaceHeaders(params.host_mid), ...config },
    );
  },

  // 关注/粉丝数
  async stat(params: { vmid: number }) {
    return get(apiClient, Api.userStat, params);
  },

  // 关注列表
  async followings(params: { vmid: number; pn?: number; ps?: number; order?: string; order_type?: string }, config?: RequestConfig) {
    return get(apiClient, Api.followings, { ps: 50, order: 'desc', ...params }, config);
  },

  // 粉丝列表
  async fans(params: { vmid: number; pn?: number; ps?: number; order?: string; order_type?: string }, config?: RequestConfig) {
    return get(apiClient, Api.fans, { ps: 50, order: 'desc', ...params }, config);
  },

  // 修改关系(关注/取关)
  async modifyRelation(params: { fid: number; act: number; re_src?: number }) {
    return post(apiClient, Api.relationMod, null, { re_src: 11, ...params, csrf: getCSRF() });
  },

  // 查询关系
  async relation(params: { fid: number }, config?: RequestConfig) {
    return get(apiClient, Api.relation, params, config);
  },

  // 黑名单
  async blacks(params: { pn?: number; ps?: number }, config?: RequestConfig) {
    return get(apiClient, Api.blackLst, { ps: 50, ...params }, config);
  },

  // 获赞数/播放数
  async upstat(params: { mid: number }) {
    return get(apiClient, Api.getMemberViewApi, params);
  },

  // 用户合集/系列
  async seasonsSeries(params: { mid: number; pn?: number; ps?: number }, config?: RequestConfig) {
    return get(apiClient, Api.getMemberSeasonsApi, { ps: 20, ...params }, config);
  },

  // 合集视频
  async seasonArchives(params: { season_id: number; pn?: number; ps?: number }, config?: RequestConfig) {
    return get(apiClient, Api.seasonArchives, { ps: 30, sort_reverse: false, ...params }, config);
  },

  // 系列视频
  async seriesArchives(params: { series_id: number; pn?: number; ps?: number }, config?: RequestConfig) {
    return get(apiClient, Api.seriesArchives, { ps: 30, ...params }, config);
  },

  // 关注分组
  async followTags() {
    return get(apiClient, Api.followUpTag);
  },

  // 分组下的UP
  async followGroup(params: { tagid: number; pn?: number; ps?: number }, config?: RequestConfig) {
    return get(apiClient, Api.followUpGroup, { ps: 50, ...params }, config);
  },

  // 设置分组
  async addUsersToTag(params: { fids: string; tagids: string }) {
    return post(apiClient, Api.addUsers, null, { ...params, csrf: getCSRF() });
  },

  // 特别关注
  async addSpecial(params: { fid: number }) {
    return post(apiClient, Api.addSpecial, null, { ...params, csrf: getCSRF() });
  },

  // 取消特别关注
  async delSpecial(params: { fid: number }) {
    return post(apiClient, Api.delSpecial, null, { ...params, csrf: getCSRF() });
  },

  // 空间(app端)
  async spaceApp(params: { vmid: number; from_view_aid?: number }) {
    const signed = await signAppParamsAsync({
      build: 8430300,
      version: '8.43.0',
      c_locale: 'zh_CN',
      channel: 'master',
      mobi_app: 'android',
      platform: 'android',
      s_locale: 'zh_CN',
      statistics: STATISTICS,
      vmid: params.vmid,
      ...(params.from_view_aid != null ? { from_view_aid: params.from_view_aid } : {}),
    });
    return get(appClient, Api.space, signed);
  },

  // 空间投稿(app端)
  async spaceArchiveApp(params: { vmid: number; cursor?: string }, config?: RequestConfig) {
    const signed = await signAppParamsAsync(params);
    return get(appClient, Api.spaceArchive, signed, config);
  },

  // 空间文章 —— 对齐 Flutter MemberHttp.spaceArticle：app 端参数用 vmid（非 mid）
  async spaceArticle(params: { mid: number; pn?: number }, config?: RequestConfig) {
    const signed = await signAppParamsAsync({
      build: 8430300,
      channel: 'master',
      version: '8.43.0',
      c_locale: 'zh_CN',
      s_locale: 'zh_CN',
      mobi_app: 'android',
      platform: 'android',
      statistics: STATISTICS,
      pn: 1,
      ps: 10,
      vmid: params.mid,
      ...(params.pn != null ? { pn: params.pn } : {}),
    });
    return get(appClient, Api.spaceArticle, signed, config);
  },

  // 空间音频
  async spaceAudio(params: { mid: number; pn?: number }, config?: RequestConfig) {
    return get(apiClient, Api.spaceAudio, { pn: 1, ps: 20, order: 1, web_location: 333.1387, uid: params.mid, ...params }, config);
  },

  // 空间课堂
  async spaceCheese(params: { mid: number; pn?: number }, config?: RequestConfig) {
    return get(apiClient, Api.spaceCheese, { pn: 1, ps: 30, web_location: 333.1387, ...params }, config);
  },

  // 空间作品(opus)
  async spaceOpus(params: { host_mid: number; page?: number; offset?: string; type?: string }, config?: RequestConfig) {
    return getWbi(apiClient, Api.spaceOpus, { page: 1, offset: '', type: 'all', web_location: 333.1387, ...params }, config);
  },

  // 充电排行
  async upowerRank(params: { up_mid: number; pn?: number; privilege_type?: number }, config?: RequestConfig) {
    return get(apiClient, Api.upowerRank, { ps: 100, mobi_app: 'web', web_location: 333.1196, ...params }, config);
  },

  // 最近投币 —— 对齐 Flutter MemberHttp.coinArc：pn/ps/vmid
  async coinArc(params: { mid: number; pn?: number }) {
    const signed = await signAppParamsAsync({ pn: params.pn ?? 1, ps: 20, vmid: params.mid });
    return get(appClient, Api.coinArc, signed);
  },

  // 最近点赞
  async likeArc(params: { mid: number; pn?: number }) {
    const signed = await signAppParamsAsync({ pn: 1, ps: 20, vmid: params.mid, ...params });
    return get(appClient, Api.likeArc, signed);
  },

  // 空间橱窗
  async spaceShop(params: { mid: number }, config?: RequestConfig) {
    const signed = await signAppParamsAsync({ mVersion: 309, mallVersion: 8430300, ...params });
    return post(appClient, Api.spaceShop, { from: `cps_productTab_${params.mid}`, searchAfter: 0, msource: `cps_productTab_${params.mid}`, pageSize: 8, upMid: String(params.mid) }, signed, config);
  },

  // 舰长
  async memberGuard(params: { ruid: number; page?: number }, config?: RequestConfig) {
    return get(apiClient, Api.memberGuard, { page: 1, page_size: 20, ...params }, config);
  },

  // 举报用户
  async reportMember(params: { mid: number; reason?: string }) {
    return post(apiClient, Api.reportMember, null, { ...params, csrf: getCSRF() });
  },

  // 搜索关注
  async followSearch(params: { vmid: number; pn?: number; ps?: number; name: string }, config?: RequestConfig) {
    return getWbi(apiClient, Api.followSearch, { ps: 20, pn: 1, order: 'desc', order_type: 'attention', gaia_source: 'main_web', web_location: 333.999, ...params }, config);
  },

  // 创建关注分组
  async createFollowTag(params: { tag: string }) {
    return post(apiClient, Api.createFollowTag, null, { ...params, csrf: getCSRF() });
  },

  // 重命名分组
  async updateFollowTag(params: { tagid: number; name: string }) {
    return post(apiClient, Api.updateFollowTag, null, { ...params, csrf: getCSRF() });
  },

  // 删除分组
  async delFollowTag(params: { tagid: number }) {
    return post(apiClient, Api.delFollowTag, null, { ...params, csrf: getCSRF() });
  },

  // 分组排序
  async sortFollowTag(params: { tagids: string }) {
    return post(apiClient, Api.sortFollowTag, null, { ...params, csrf: getCSRF() });
  },

  // 用户动态搜索
  async dynSearch(params: { host_mid: number; pn?: number; offset?: string; keyword: string }, config?: RequestConfig) {
    return get(apiClient, Api.dynSearch, { page: 1, offset: '', features: 'itemOpusStyle', web_location: 333.1387, ...params }, config);
  },

  // 置顶视频
  async getTopVideo() {
    return get(apiClient, Api.getTopVideoApi);
  },

  // 合集/系列列表
  async seasonSeriesList(params: { mid: number; pn?: number }, config?: RequestConfig) {
    return get(apiClient, Api.seasonSeries, { page_num: 1, page_size: 10, ...params }, config);
  },

  /** 硬币余额 */
  async coin() {
    return get(apiClient, Api.getCoin, {});
  },

  /** 硬币日志 */
  async coinLog(params?: { pn?: number; ps?: number }, config?: RequestConfig) {
    return get(apiClient, Api.coinLog, { pn: 1, ps: 20, ...params }, config);
  },

  /** 经验日志 */
  async expLog(params?: { pn?: number; ps?: number }, config?: RequestConfig) {
    return get(apiClient, Api.expLog, { pn: 1, ps: 20, ...params }, config);
  },

  /** 共同关注（web 参数为 vmid，对齐 Flutter UserHttp.sameFollowing） */
  async sameFollowing(params: { mid: number; pn?: number }, config?: RequestConfig) {
    return get(apiClient, Api.sameFollowing, {
      pn: params.pn ?? 1,
      vmid: params.mid,
      csrf: getCSRF(),
      web_location: 333.789,
      'x-bili-device-req-json': '{"platform":"web","device":"pc","spmid":"333.789"}',
    }, config);
  },

  /** 关注我的（web 参数为 vmid，对齐 Flutter UserHttp.followedUp） */
  async followedUp(params: { mid: number; pn?: number }, config?: RequestConfig) {
    return get(apiClient, Api.followedUp, {
      pn: params.pn ?? 1,
      vmid: params.mid,
      csrf: getCSRF(),
      web_location: 333.789,
      'x-bili-device-req-json': '{"platform":"web","device":"pc","spmid":"333.789"}',
    }, config);
  },

  /** 空间隐私设置（对齐 Flutter UserHttp.spaceSetting） */
  async spaceSetting(params: { mid: number }): Promise<SpaceSettingResponse> {
    return get(apiClient, Api.spaceSetting, params);
  },

  /** 批量修改空间隐私设置（对齐 Flutter UserHttp.spaceSettingMod） */
  async spaceSettingMod(data: Record<string, number>): Promise<{ code: number; message?: string }> {
    const csrf = getCSRF();
    const body = formBodyStrict(data);
    return post(apiClient, Api.spaceSettingMod, body, { csrf }, {
      headers: FORM_HEADERS,
    });
  },
};
