/**
 * validate —— buvid 激活与风控验证（对齐 Flutter validate.dart / init.dart）。
 * App 启动时调用 activateBuvid 完成设备标识激活，降低后续接口风控概率。
 */
import { apiClient, appClient, post } from './client';
import { Api } from './endpoints';
import { getCSRF } from '@/utils/cookie';
import { FORM_HEADERS, formBody } from '@/utils/form';

export const validateApi = {
  /** 激活 buvid（ExClimbWuzhi）——App 启动时调用 */
  async activateBuvid() {
    try {
      const payload = {
        '3064': 1,
        '5062': String(Date.now()),
        '03bf': 'https%3A%2F%2Fwww.bilibili.com%2F',
        '39c8': '333.999.fp.risk',
        '34f1': '',
        'd402': '',
        '654a': '',
        '6e7c': '874x393',
        '3c43': {
          '2673': 0, '5766': 24, '6527': 0, '7003': 1,
          '807e': 1, 'b8ce': 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)',
          '641c': 0, '07a4': 'zh-CN', '1c57': 'not available',
          '0bd0': 16, '748e': [874, 393], 'd61f': [874, 353],
          'fc9d': -480, '6aa9': 'Asia/Shanghai', '75b8': 1,
          '3b21': 1, '8a1c': 0, 'd52f': 'not available',
          'adca': 'MacIntel', '80c9': [[
            'PDF Viewer', 'Portable Document Format',
            [['application/pdf', 'pdf'], ['text/pdf', 'pdf']],
          ]],
        },
      };
      // R7（03-1.5）：报文须包一层 payload（Flutter init.dart:92-99 `{'payload': json}`），
      // 直接发裸 JSON 会导致激活无效、风控概率隐性上升。
      return await post(apiClient, Api.activateBuvidApi, JSON.stringify({ payload }), undefined, {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch {
      // 静默失败，不阻塞启动
    }
  },

  /** Gaia 风控验证注册（R6 解锁链：v_voucher → gaia/register，对齐 Flutter validate.dart gaiaVgateRegister） */
  async gaiaRegister(params: { token: string }) {
    return post(appClient, Api.gaiaVgateRegister, formBody({
      v_voucher: params.token,
      ...(getCSRF() ? { csrf: getCSRF() } : {}),
    }), undefined, {
      headers: FORM_HEADERS,
    });
  },

  /** Gaia 风控验证校验（R6 解锁链：geetest 结果 → gaia/validate，对齐 Flutter validate.dart gaiaVgateValidate） */
  async gaiaValidate(params: { challenge: string; seccode: string; token: string; validate: string }) {
    return post(appClient, Api.gaiaVgateValidate, formBody({
      challenge: params.challenge,
      seccode: params.seccode,
      token: params.token,
      validate: params.validate,
      ...(getCSRF() ? { csrf: getCSRF() } : {}),
    }), undefined, {
      headers: FORM_HEADERS,
    });
  },
};
