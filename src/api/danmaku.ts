import { apiClient, get, post, type RequestConfig } from './client';
import { Api } from './endpoints';
import { getCSRF } from '@/utils/cookie';

/**
 * 与 Flutter DanmakuHttp 对齐的 web_player 公共埋点参数。
 * 点赞(/x/v2/dm/thumbup/add)、举报(/x/dm/report/add) 等接口需要这些来源字段。
 */
const DM_COMMON = {
  platform: 'web_player',
  polaris_app_id: 100,
  polaris_platform: 5,
  spmid: '333.788.0.0',
  from_spmid: '333.788.0.0',
  statistics: '{"appId":100,"platform":5,"abtest":"","version":""}',
};

export const danmakuApi = {
  /**
   * 获取分段弹幕(protobuf)。对齐 Flutter DmGrpc.dmSegMobile：
   * 分段长度 6 分钟，segment_index 从 1 开始（控制器内部会 +1）。
   * 注：返回为 protobuf 二进制，需配合解码器使用。
   */
  async list(params: { oid: number; segment_index?: number; type?: number }, config?: RequestConfig) {
    return get(apiClient, '/x/v2/dm/web/seg.so', { type: 1, segment_index: 1, ...params }, { responseType: 'arraybuffer', ...config });
  },

  /**
   * 发送弹幕。对齐 Flutter DanmakuHttp.shootDanmaku。
   * - rnd 使用微秒时间戳（Flutter microsecondsSinceEpoch）：携带此项冷却 5s，否则 90s。
   * - bvid 可选：服务端 oid / bvid 二选一即可，RN 调用方目前传 oid。
   * - fontsize 为「发送弹幕」的字号（服务端存储，默认 25），与本地「显示字号」设置无关。
   */
  async post(params: {
    oid: number; type: number; msg: string; bvid?: string;
    mode?: number; color?: number; fontsize?: number;
    progress?: number; pool?: number; rnd?: number;
    colorful?: boolean; checkboxType?: number;
  }) {
    const { colorful, checkboxType } = params;
    const data: Record<string, unknown> = {
      type: params.type ?? 1,
      oid: params.oid,
      msg: params.msg,
      mode: params.mode ?? 1,
      color: colorful ? 16777215 : (params.color ?? 16777215),
      fontsize: params.fontsize ?? 25,
      pool: params.pool ?? 0,
      progress: params.progress ?? 0,
      rnd: params.rnd ?? Date.now() * 1000,
      csrf: getCSRF(),
    };
    if (params.bvid) data.bvid = params.bvid;
    if (colorful) data.colorful = 60001; // 专属渐变彩色（需要会员）
    if (checkboxType != null) data.checkbox_type = checkboxType; // UP 身份标识
    return post(apiClient, Api.shootDanmaku, null, data);
  },

  // 弹幕屏蔽列表
  async filterList() {
    return get(apiClient, Api.danmakuFilter, { type: 0 });
  },

  // 添加屏蔽词
  async filterAdd(params: { type: number; filter: string }) {
    return post(apiClient, Api.danmakuFilterAdd, null, { ...params, csrf: getCSRF() });
  },

  // 删除屏蔽词
  async filterDel(params: { ids: string }) {
    return post(apiClient, Api.danmakuFilterDel, null, { ...params, csrf: getCSRF() });
  },

  /**
   * 弹幕点赞。对齐 Flutter DanmakuHttp.danmakuLike：
   * op 1=点赞 2=取消；需携带 web_player 来源埋点参数。
   */
  async like(params: { oid: number; dmid: number | string; op: number }) {
    return post(apiClient, Api.danmakuLike, null, {
      ...DM_COMMON,
      ...params,
      csrf: getCSRF(),
    });
  },

  /**
   * 弹幕举报。对齐 Flutter DanmakuHttp.danmakuReport：
   * 接口字段名为 cid（非 oid），并需 originCid / block / 来源埋点参数。
   * 为兼容现有调用方，入参仍用 oid，内部映射为 cid。
   */
  async report(params: { oid: number; dmid: number | string; reason: number; content?: string }) {
    return post(apiClient, Api.danmakuReport, null, {
      ...DM_COMMON,
      cid: params.oid,
      originCid: params.oid,
      dmid: params.dmid,
      reason: params.reason,
      block: false,
      ...(params.content != null ? { content: params.content } : {}),
      csrf: getCSRF(),
    });
  },

  /**
   * 撤回弹幕。对齐 Flutter DanmakuHttp.danmakuRecall：
   * 接口字段名为 cid，且需 type=1。入参仍用 oid，内部映射为 cid。
   */
  async recall(params: { oid: number; dmid: number | string }) {
    return post(apiClient, Api.danmakuRecall, null, {
      cid: params.oid,
      dmid: params.dmid,
      type: 1,
      csrf: getCSRF(),
    });
  },

  // 编辑弹幕状态(保护/删除)：state 1=删除 2=保护 3=取消保护
  async editState(params: { oid: number; dmids: string; state: number }) {
    return post(apiClient, Api.danmakuEditState, null, { type: 1, pool: 0, ...params, csrf: getCSRF() });
  },
};
