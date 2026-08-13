import { apiClient, appClient, get, post, getWbi, type RequestConfig } from './client';
import { Api } from './endpoints';
import { signAppParamsAsync } from '@/utils/app-sign';
import { getCSRF } from '@/utils/cookie';
import { FORM_HEADERS, formBody } from '@/utils/form';
import { useSettingsStore } from '@/stores/settings';
import { useNetwork } from '@/utils/network';
import { buildDmRiskParams } from '@/utils/player-utils';

/** 举报原因（reason_id 码：1色情低俗 2垃圾广告 3违法违规 4人身攻击，视频/评论举报共用） */
export const REPORT_REASONS: { code: number; label: string }[] = [
  { code: 1, label: '色情低俗' },
  { code: 2, label: '垃圾广告' },
  { code: 3, label: '违法违规' },
  { code: 4, label: '人身攻击' },
];

/** /x/player/videoshot 雪碧图元信息：image 是整张雪碧图，帧由 img_x_len/img_y_len 网格切分。 */
export interface VideoShotData {
  pvdata?: string;
  img_x_len: number;
  img_y_len: number;
  img_x_size: number;
  img_y_size: number;
  image: string[];
  index?: number[];
}

export const videoApi = {
  // 获取视频详情
  async view(params: { aid?: number; bvid?: string }, config?: RequestConfig) {
    return get(apiClient, Api.videoIntro, params, config);
  },

  // 获取视频流
  // fnval=0 返回 durl（progressive MP4 合流），iOS AVPlayer 无法播放分离的 DASH，
  // 故 RN 端统一取 durl 子集（最高 qn 通常 80），双端一致。
  // 风控参数（dm_img_*/web_location/gaia_source）对齐 Flutter，缺失会返回 -352/-403 导致空 URL。
  async playUrl(params: {
    avid?: number; bvid?: string; cid: number;
    qn?: number; fnval?: number; fourk?: number;
  }, config?: RequestConfig) {
    const s = useSettingsStore.getState();
    const isWifi = useNetwork.getState().isWifi;
    const qn = params.qn || (isWifi ? s.defaultQuality : s.cellularQuality);
    const fourk = s.p1080 ? 1 : 0;
    const dmRisk = await buildDmRiskParams();
    const base: Record<string, any> = {
      ...params,
      qn,
      fnval: 0,
      fnver: 0,
      fourk,
      // 风控参数（对齐 Flutter http/video.dart videoUrl）
      gaia_source: 'pre-load',
      isGaiaAvoided: true,
      web_location: 1315873,
      ...dmRisk,
    };
    // 优先尝试 WBI 签名版本（/x/player/wbi/playurl）
    try {
      const res = await getWbi(apiClient, Api.ugcUrl, base, config);
      if (res?.data?.durl || res?.data?.dash) return res;
      console.warn('[videoApi.playUrl] WBI endpoint returned code:', res?.code, 'msg:', res?.message);
    } catch (e) {
      console.warn('[videoApi.playUrl] WBI endpoint error:', e);
    }
    // 回退到非 WBI 版本（旧接口，无需签名）
    const fallback = await get(apiClient, '/x/player/playurl', base, config);
    if (fallback?.code !== 0) {
      console.error('[videoApi.playUrl] fallback also failed, code:', fallback?.code, 'msg:', fallback?.message);
    }
    return fallback;
  },

  // 番剧视频流（R1/04-3.9：fnval 由 4048 纯 DASH 改 0 返回 durl 合流，保证 iOS AVPlayer 有声可播）
  async pgcPlayUrl(params: { cid: number; bvid?: string; ep_id?: number; season_id?: number; qn?: number; fnval?: number }, config?: RequestConfig) {
    const s = useSettingsStore.getState();
    const isWifi = useNetwork.getState().isWifi;
    const qn = params.qn || (isWifi ? s.defaultQuality : s.cellularQuality);
    const fourk = s.p1080 ? 1 : 0;
    return get(apiClient, Api.pgcUrl, { fnval: 0, fourk, ...params, qn }, config);
  },

  // 播放信息(字幕等)
  async playInfo(params: { aid: number; cid: number; bvid?: string }, config?: RequestConfig) {
    return getWbi(apiClient, Api.playInfo, params, config);
  },

  // 点赞
  async like(params: { aid: number; like: number }) {
    const signed = await signAppParamsAsync(params);
    return post(appClient, Api.likeVideo, null, signed);
  },

  // 点踩（app 端参数为字符串：dislike '0'=点踩 '1'=取消，对齐 Flutter dislikeVideo）
  async dislike(params: { aid: number; dislike: '0' | '1' }) {
    const signed = await signAppParamsAsync(params);
    return post(appClient, Api.dislikeVideo, null, signed);
  },

  // 投币
  async coin(params: { aid: number; multiply: number; select_like?: number }) {
    const signed = await signAppParamsAsync(params);
    return post(appClient, Api.coinVideo, null, signed);
  },

  // 一键三连（R8：form + csrf + referer/origin，对齐 Flutter ugcTriple）
  async triple(params: { aid?: number; bvid?: string }) {
    const bvid = params.bvid || '';
    return post(
      apiClient,
      Api.ugcTriple,
      formBody({
        aid: params.aid,
        bvid,
        eab_x: 2,
        ramval: 0,
        source: 'web_normal',
        ga: 1,
        csrf: getCSRF() || '',
        spmid: '333.788.0.0',
        statistics: '{"appId":100,"platform":5}',
      }),
      undefined,
      {
        headers: {
          ...FORM_HEADERS,
          origin: 'https://www.bilibili.com',
          referer: bvid ? `https://www.bilibili.com/video/${bvid}` : 'https://www.bilibili.com',
        },
      },
    );
  },

  // 举报视频（B站标准举报接口：type=1 视频，rid 资源id，reason_id 1色情低俗 2垃圾广告 3违法违规 4人身攻击）
  async report(params: { rid: number; type: number; reason_id: number; content?: string }) {
    return post(apiClient, Api.videoReport, null, { ...params, csrf: getCSRF() });
  },

  // PGC 一键三连（R8：form + csrf + referer/origin，对齐 Flutter pgcTriple）
  async pgcTriple(params: { ep_id: number; season_id?: number }) {
    return post(
      apiClient,
      Api.pgcTriple,
      formBody({ ep_id: params.ep_id, csrf: getCSRF() || '' }),
      undefined,
      {
        headers: {
          ...FORM_HEADERS,
          origin: 'https://www.bilibili.com',
          referer: `https://www.bilibili.com/bangumi/play/${params.season_id ? `ss${params.season_id}` : `ep${params.ep_id}`}`,
        },
      },
    );
  },

  // PGC 点赞
  async pgcLike(params: { season_id: number; like: number }) {
    return post(apiClient, Api.pgcLikeCoinFav, null, { ...params, csrf: getCSRF() });
  },

  // 收藏（R8：form + csrf，对齐 Flutter favVideo）
  async favVideo(params: { rid: number; type: number; add_media_ids?: string; del_media_ids?: string }) {
    return post(apiClient, Api.favVideo, formBody({
      resources: `${params.type}_${params.rid}`,
      add_media_ids: params.add_media_ids ?? '',
      del_media_ids: params.del_media_ids ?? '',
      csrf: getCSRF() || '',
    }), undefined, {
      headers: FORM_HEADERS,
    });
  },

  // 获取收藏夹列表
  async favFolder(params: { up_mid: number; type?: number; rid?: number }) {
    return get(apiClient, Api.favFolder, params);
  },

  // 相关视频
  async related(params: { aid?: number; bvid?: string }, config?: RequestConfig) {
    return get(apiClient, Api.relatedList, params, config);
  },

  // 视频分P
  async pagelist(params: { aid?: number; bvid?: string }) {
    return get(apiClient, Api.ab2c, params);
  },

  // 在线人数
  async onlineTotal(params: { aid: number; cid: number; bvid?: string }, config?: RequestConfig) {
    return get(apiClient, Api.onlineTotal, params, config);
  },

  // 心跳上报
  async heartbeat(params: {
    aid?: number; bvid?: string; cid: number;
    played_time: number; real_time: number;
    play_type: number; network_type: number;
  }) {
    return post(apiClient, Api.heartBeat, null, params);
  },

  // 历史上报
  async historyReport(params: { aid: number; cid: number; progress: number }) {
    return post(apiClient, Api.historyReport, null, { ...params, csrf: getCSRF() });
  },

  // 视频标签
  async tags(params: { aid?: number; bvid?: string }) {
    return get(apiClient, Api.videoTags, params);
  },

  // 视频关系(点赞投币收藏状态)
  async relation(params: { aid?: number; bvid?: string }) {
    return get(apiClient, Api.videoRelation, params);
  },

  // AI总结
  async aiConclusion(params: { bvid: string; cid: number; up_mid: number }, config?: RequestConfig) {
    return getWbi(apiClient, Api.aiConclusion, params, config);
  },

  // 视频截图
  async videoshot(params: { aid?: number; bvid?: string; cid?: number; index?: number }, config?: RequestConfig) {
    return get(apiClient, Api.videoshot, params, config);
  },

  // 稍后再看
  async toViewLater(params: { aid?: number; bvid?: string }) {
    return post(apiClient, Api.toViewLater, null, { ...params, csrf: getCSRF() });
  },

  // 推荐视频(app)：对齐 Flutter rcmdVideoListApp —— idx 为"换一批"索引，
  // pull=true 表示首次拉取（freshIdx=0），后续滑动加载 idx 递增 + pull=false
  async recommendApp(params?: Record<string, any>, config?: RequestConfig) {
    const freshIdx = (params?.fresh_idx as number) ?? 0;
    const signed = await signAppParamsAsync({
      idx: freshIdx,
      pull: freshIdx === 0 ? 'true' : 'false',
      flush: 5,
      column: 4,
      style: 2,
      ...params,
    });
    return get(appClient, Api.recommendListApp, signed, config);
  },

  // 推荐视频(web)：对齐 Flutter rcmdVideoList —— fresh_idx/brush 为"换一批"索引
  async recommendWeb(params?: Record<string, any>, config?: RequestConfig) {
    const freshIdx = (params?.fresh_idx as number) ?? 0;
    return getWbi(apiClient, Api.recommendListWeb, {
      version: 1,
      fresh_type: 4,
      feed_version: 'V8',
      homepage_ver: 1,
      y_num: 4,
      ps: 20,
      fresh_idx: freshIdx,
      brush: freshIdx,
      ...params,
    }, config);
  },

  // 热门
  async hot(params: { pn: number; ps?: number }, config?: RequestConfig) {
    return get(apiClient, Api.hotList, { ps: 20, ...params }, config);
  },

  // 排行榜
  async ranking(params?: { rid?: number; type?: string }, config?: RequestConfig) {
    return getWbi(apiClient, Api.getRankApi, { rid: 0, type: 'all', ...params }, config);
  },

  // PGC 排行榜（番剧 / 国创）
  async pgcRank(params: { season_type: number; day?: number }, config?: RequestConfig) {
    return getWbi(apiClient, Api.pgcRank, { day: 3, ...params }, config);
  },

  // PGC 季榜（电影 / 剧集 / 记录 / 综艺）
  async pgcSeasonRank(params: { season_type: number; day?: number }, config?: RequestConfig) {
    return getWbi(apiClient, Api.pgcSeasonRank, { day: 3, ...params }, config);
  },

  // 每周必看：期数列表
  async popularSeriesList(config?: RequestConfig) {
    return getWbi(apiClient, Api.popularSeriesList, { web_location: 333.934 }, config);
  },

  // 每周必看：某一期视频列表
  async popularSeriesOne(params: { number: number }, config?: RequestConfig) {
    return getWbi(apiClient, Api.popularSeriesOne, { web_location: 333.934, ...params }, config);
  },

  // 入站必刷（分页，单页最多 100 条）
  async popularPrecious(params?: { page?: number; page_size?: number }, config?: RequestConfig) {
    return getWbi(apiClient, Api.popularPrecious, {
      page_size: 100,
      page: 1,
      web_location: 333.934,
      ...params,
    }, config);
  },

  // 不感兴趣（对齐 Flutter feedDislike：goto 必发，如 'av'）
  async feedDislike(params: { id: number; reason_id: number; goto?: string }) {
    const signed = await signAppParamsAsync(params);
    return post(appClient, Api.feedDislike, null, signed);
  },

  // 取消不感兴趣
  async feedDislikeCancel(params: { id: number }) {
    const signed = await signAppParamsAsync(params);
    return post(appClient, Api.feedDislikeCancel, null, signed);
  },

  // 历史状态
  async historyStatus(config?: RequestConfig) {
    return get(apiClient, Api.historyStatus, undefined, config);
  },

  // 视频笔记（pn/ps 分页，对齐 Flutter getVideoNoteList）
  async noteList(params: { oid: number; oid_type?: number; pn?: number; ps?: number }, config?: RequestConfig) {
    return get(apiClient, Api.archiveNoteList, { oid_type: 0, ps: 10, ...params }, config);
  },

  // 交互视频选择边（对齐 Flutter /x/stein/edgeinfo_v2）
  async edgeInfo(params: { bvid: string; graph_version?: number; edge_id?: number }, config?: RequestConfig) {
    return get(apiClient, '/x/stein/edgeinfo_v2', params, config);
  },
};
