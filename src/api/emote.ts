/**
 * emote —— 表情接口（对照 Flutter `emote.dart` / `ReplyHttp.getEmoteList`）。
 *
 * 接口：`/x/emote/user/panel/web?business=reply&web_location=333.1245`
 * （Flutter `Api.myEmote`），返回当前用户的表情包面板（packages）。
 * 未登录/游客调用该接口时 `data.packages` 为 null（实测），且该接口依赖登录态，
 * 因此接口失败或为空时统一回退到内置兜底表情包（`FALLBACK_EMOTES`，覆盖
 * [tv_doge]/[微笑]/[doge] 等常用 B 站表情，CDN 直链已验证可用），保证功能可用。
 */
import { get, apiClient } from './client';
import { Api } from './endpoints';

/* ===== 类型 ===== */

/** 单个表情（对齐 Flutter Emote：text 通常自带方括号，如 [tv_doge]） */
export interface EmoteItem {
  /** 表情关键字（可能带方括号，如 "[tv_doge]"） */
  text: string;
  /** 表情图片地址（文字表情包可能为空） */
  url?: string;
  /** meta.size：1=小图 2=大图 */
  size?: number;
  /** 表情别名（长按提示用） */
  alias?: string;
}

/** 表情包（对齐 Flutter Package：url/type/emote） */
export interface EmotePackage {
  /** 表情包 id */
  package_id?: number | string;
  /** 表情包名称（文字表情包 tab 名；图片表情包一般无 text 字段） */
  name?: string;
  /** 表情包 tab 图标（url） */
  url?: string;
  /** 表情包类型：4=文字表情包（单元格直接渲染文字），其余为图片表情 */
  type?: number;
  emotes: EmoteItem[];
}

/**
 * 表情映射表：`[关键字]` → 图片 URL。
 * EmoteText 渲染、EmotePicker 命中判断都基于该表。
 */
export type EmoteMap = Record<string, string>;

/* ===== 内置兜底表情包（接口不可用时的保底数据） =====
 * 全部为 B 站官方表情（CDN 直链 i0.hdslb.com/bfs/emote，已验证 200），
 * 覆盖 [tv_*] 小电视系列与 [微笑]/[doge]/[滑稽] 等经典表情。 */

const EMOTE_CDN = 'https://i0.hdslb.com/bfs/emote';

/** [关键字, 文件 hash] 对（来自 B 站官方 owo 表情映射） */
const FALLBACK_EMOTE_HASHES: [string, string][] = [
  ['tv_doge', '6ea59c827c414b4a2955fe79e0f6fd3dcd515e24'],
  ['tv_微笑', '70dc5c7b56f93eb61bddba11e28fb1d18fddcd4c'],
  ['tv_斜眼笑', '911f987aa8bc1bee12d52aafe62bc41ef4474e6c'],
  ['tv_惊吓', '0d15c7e2ee58e935adc6a7193ee042388adc22af'],
  ['tv_白眼', 'c1d59f439e379ee50eef488bcb5e5378e5044ea4'],
  ['tv_坏笑', '1f0b87f731a671079842116e0991c91c2c88645a'],
  ['tv_难过', '87f46748d3f142ebc6586ff58860d0e2fc8263ba'],
  ['tv_生气', '26702dcafdab5e8225b43ffd23c94ac1ff932654'],
  ['tv_委屈', 'd04dba7b5465779e9755d2ab6f0a897b9b33bb77'],
  ['tv_呆', 'fe1179ebaa191569b0d31cecafe7a2cd1c951c9d'],
  ['tv_发怒', '34ba3cd204d5b05fec70ce08fa9fa0dd612409ff'],
  ['tv_呕吐', '9f996894a39e282ccf5e66856af49483f81870f3'],
  ['tv_思考', '90cf159733e558137ed20aa04d09964436f618a1'],
  ['tv_疑问', '0793d949b18d7be716078349c202c15ff166f314'],
  ['tv_大哭', '23269aeb35f99daee28dda129676f6e9ea87934f'],
  ['tv_鼓掌', '1d21793f96ef4e6f48b23e53e3b9e42da833a0f6'],
  ['tv_抠鼻', 'c666f55e88d471e51bbd9fab9bb308110824a6eb'],
  ['tv_亲亲', 'a8111ad55953ef5e3be3327ef94eb4a39d535d06'],
  ['tv_调皮', 'b9c41de8e82dd7a8515ae5e3cb63e898bf245186'],
  ['tv_笑哭', '1abc628f6d4f4caf9d0e7800878f4697abbc8273'],
  ['tv_晕', '5443c22b4d07fb1907ccc610c8e6db254f2461b7'],
  ['tv_点赞', 'f85c354995bd99e28fc76c869bfe42ba6438eff4'],
  ['tv_害羞', 'a37683fb5642fa3ddfc7f4e5525fd13e42a2bdb1'],
  ['tv_睡着', '8b196675b53af58264f383c50ad0945048290b33'],
  ['tv_色', '61822c7e9aae5da76475e7892534545336b23a6f'],
  ['tv_吐血', '09dd16a7aa59b77baa1155d47484409624470c77'],
  ['tv_无奈', 'ea8ed89ee9878f2fece2dda0ea8a5dbfe21b5751'],
  ['tv_再见', '180129b8ea851044ce71caf55cc8ce44bd4a4fc8'],
  ['tv_流汗', 'cead1c351ab8d79e9f369605beb90148db0fbed3'],
  ['tv_偷笑', 'bb690d4107620f1c15cff29509db529a73aee261'],
  ['tv_抓狂', 'fe31c08edad661d63762b04e17b8d5ae3c71a757'],
  ['tv_黑人问号', '45821a01f51bc867da9edbaa2e070410819a95b2'],
  ['tv_困', '241ee304e44c0af029adceb294399391e4737ef2'],
  ['tv_打脸', '56ab10b624063e966bfcb76ea5dc4794d87dfd47'],
  ['tv_闭嘴', 'c9e990da7f6e93975e25fd8b70e2e290aa4086ef'],
  ['tv_鄙视', '6e72339f346a692a495b123174b49e4e8e781303'],
  ['tv_腼腆', '89712c0d4af73e67f89e35cbc518420380a7f6f4'],
  ['tv_馋', 'fc7e829b845c43c623c8b490ee3602b7f0e76a31'],
  ['tv_可爱', '9e55fd9b500ac4b96613539f1ce2f9499e314ed9'],
  ['tv_发财', '34db290afd2963723c6eb3c4560667db7253a21a'],
  ['tv_生病', '8b0ec90e6b86771092a498c54f09fc94621c1900'],
  ['tv_流鼻血', 'c32d39db2737f89b904ca32700d140a9241b0767'],
  ['tv_尴尬', '7cfa62dafc59798a3d3fb262d421eeeff166cfa4'],
  ['tv_大佬', '093c1e2c490161aca397afc45573c877cdead616'],
  ['tv_流泪', '7e71cde7858f0cd50d74b0264aa26db612a8a167'],
  ['tv_冷漠', 'b9cbc755c2b3ee43be07ca13de84e5b699a3f101'],
  ['tv_皱眉', '72ccad6679fea0d14cce648b4d818e09b8ffea2d'],
  ['tv_鬼脸', '0ffbbddf8a94d124ca2f54b360bbc04feb6bbfea'],
  ['tv_调侃', '4bc022533ef31544ca0d72c12c808cf4a1cce3e3'],
  ['tv_目瞪口呆', '0b8cb81a68de5d5365212c99375e7ace3e7891b7'],
  ['微笑', '685612eadc33f6bc233776c6241813385844f182'],
  ['doge', '3087d273a78ccaff4bb1e9972e2ba2a7583c9f11'],
  ['滑稽', 'd15121545a99ac46774f1f4465b895fe2d1411c3'],
  ['呲牙', 'b5a5898491944a4268360f2e7a84623149672eb6'],
  ['笑哭', 'c3043ba94babf824dea03ce500d0e73763bf4f40'],
  ['打call', '431432c43da3ee5aab5b0e4f8931953e649e9975'],
  ['妙啊', 'b4cb77159d58614a9b787b91b1cd22a81f383535'],
  ['吃瓜', '4191ce3c44c2b3df8fd97c33f85d3ab15f4f3c84'],
  ['脱单doge', 'bf7e00ecab02171f8461ee8cf439c73db9797748'],
  ['口罩', '3ad2f66b151496d2a5fb0a8ea75f32265d778dd3'],
  ['星星眼', '63c9d1a31c0da745b61cdb35e0ecb28635675db2'],
  ['辣眼睛', '35d62c496d1e4ea9e091243fa812866f5fecc101'],
  ['OK', '4683fd9ffc925fa6423110979d7dcac5eda297f4'],
  ['歪嘴', '4384050fbab0586259acdd170b510fe262f08a17'],
  ['调皮', '8290b7308325e3179d2154327c85640af1528617'],
  ['嗑瓜子', '28a91da1685d90124cfeead74622e1ebb417c0eb'],
  ['藏狐', 'ba0937ef6f3ccca85e2e0047e6263f3b4da37201'],
  ['脸红', '0922c375da40e6b69002bd89b858572f424dcfca'],
  ['给心心', '1597302b98827463f5b75c7cac1f29ea6ce572c4'],
  ['嘟嘟', 'abd7404537d8162720ccbba9e0a8cdf75547e07a'],
  ['哦呼', '362bded07ea5434886271d23fa25f5d85d8af06c'],
  ['喜欢', '8a10a4d73a89f665feff3d46ca56e83dc68f9eb8'],
  ['酸了', '92b1c8cbceea3ae0e8e32253ea414783e8ba7806'],
  ['嫌弃', 'de4c0783aaa60ec03de0a2b90858927bfad7154b'],
  ['大哭', '2caafee2e5db4db72104650d87810cc2c123fc86'],
  ['害羞', '9d2ec4e1fbd6cb1b4d12d2bbbdd124ccb83ddfda'],
  ['疑惑', 'b7840db4b1f9f4726b7cb23c0972720c1698d661'],
  ['喜极而泣', '485a7e0c01c2d70707daae53bee4a9e2e31ef1ed'],
  ['奸笑', 'bb84906573472f0a84cebad1e9000eb6164a6f5a'],
  ['笑', '81edf17314cea3b48674312b4364df44d5c01f17'],
  ['偷笑', '6c49d226e76c42cd8002abc47b3112bc5a92f66a'],
  ['惊讶', 'f8e9a59cad52ae1a19622805696a35f0a0d853f3'],
  ['捂脸', '6921bb43f0c634870b92f4a8ad41dada94a5296d'],
  ['阴险', 'ba8d5f8e7d136d59aab52c40fd3b8a43419eb03c'],
  ['囧', '12e41d357a9807cc80ef1e1ed258127fcc791424'],
  ['呆', '33ad6000d9f9f168a0976bc60937786f239e5d8c'],
  ['抠鼻', 'cb89184c97e3f6d50acfd7961c313ce50360d70f'],
  ['大笑', 'ca94ad1c7e6dac895eb5b33b7836b634c614d1c0'],
  ['惊喜', '0afecaf3a3499479af946f29749e1a6c285b6f65'],
  ['无语', '44667b7d9349957e903b1b62cb91fb9b13720f04'],
  ['点赞', '1a67265993913f4c35d15a6028a30724e83e7d35'],
  ['鼓掌', '895d1fc616b4b6c830cf96012880818c0e1de00d'],
  ['尴尬', 'cb321684ed5ce6eacdc2699092ab8fe7679e4fda'],
  ['委屈', 'd2f26cbdd6c96960320af03f5514c5b524990840'],
  ['傲娇', '010540d0f61220a0db4922e4a679a1d8eca94f4e'],
  ['疼', '905fd9a99ec316e353b9bd4ecd49a5f0a301eabf'],
  ['冷', 'cb0ebbd0668640f07ebfc0e03f7a18a8cd00b4ed'],
  ['热', '4e58a2a6f5f1580ac33df2d2cf7ecad7d9ab3635'],
  ['生病', '0f25ce04ae1d7baf98650986454c634f6612cb76'],
  ['吓', '9c10c5ebc7bef27ec641b8a1877674e0c65fea5d'],
  ['吐', '06946bfe71ac48a6078a0b662181bb5cad09decc'],
  ['捂眼', 'c5c6d6982e1e53e478daae554b239f2b227b172b'],
  ['嘘声', 'e64af664d20716e090f10411496998095f62f844'],
  ['思考', 'cfa9b7e89e4bfe04bbcd34ccb1b0df37f4fa905c'],
  ['再见', 'fc510306bae26c9aec7e287cdf201ded27b065b9'],
  ['翻白眼', 'eba54707c7168925b18f6f8b1f48d532fe08c2b1'],
  ['哈欠', '888d877729cbec444ddbd1cf4c9af155a7a06086'],
  ['奋斗', 'bb2060c15dba7d3fd731c35079d1617f1afe3376'],
  ['墨镜', '3a03aebfc06339d86a68c2d893303b46f4b85771'],
  ['难过', 'a651db36701610aa70a781fa98c07c9789b11543'],
  ['撇嘴', '531863568e5668c5ac181d395508a0eeb1f0cda4'],
  ['抓狂', '4c87afff88c22439c45b79e9d2035d21d5622eba'],
  ['生气', '3195714219c4b582a4fb02033dd1519913d0246d'],
  ['干杯', '8da12d5f55a2c7e9778dcc05b40571979fe208e6'],
  ['爱心', 'ed04066ea7124106d17ffcaf75600700e5442f5c'],
  ['胜利', 'b49fa9f4b1e7c3477918153b82c60b114d87347c'],
  ['加油', 'c7aaeacb21e107292d3bb053e5abde4a4459ed30'],
  ['抱拳', '89516218158dbea18ab78e8873060bf95d33bbbe'],
  ['响指', '1b5c53cf14336903e1d2ae3527ca380a1256a077'],
  ['保佑', 'fafe8d3de0dc139ebe995491d2dac458a865fb30'],
  ['支持', '3c210366a5585706c09d4c686a9d942b39feeb50'],
  ['拥抱', '41780a4254750cdaaccb20735730a36044e98ef3'],
  ['跪了', 'f2b3aee7e521de7799d4e3aa379b01be032698ac'],
  ['怪我咯', '07cc6077f7f7d75b8d2c722dd9d9828a9fb9e46d'],
];

/** 内置兜底表情包（接口失败/空时兜底，首个 tab 为"小电视 tv" 系列） */
export const FALLBACK_EMOTES: EmotePackage[] = [
  {
    package_id: 'fallback-tv',
    name: '小电视',
    type: 1,
    emotes: FALLBACK_EMOTE_HASHES.filter(([k]) => k.startsWith('tv_')).map(([k, h]) => ({
      text: `[${k}]`,
      url: `${EMOTE_CDN}/${h}.png`,
    })),
  },
  {
    package_id: 'fallback-classic',
    name: '经典',
    type: 1,
    emotes: FALLBACK_EMOTE_HASHES.filter(([k]) => !k.startsWith('tv_')).map(([k, h]) => ({
      text: `[${k}]`,
      url: `${EMOTE_CDN}/${h}.png`,
    })),
  },
];

/** 内置兜底映射表：[关键字] → CDN 直链 */
export const FALLBACK_EMOTE_MAP: EmoteMap = (() => {
  const map: EmoteMap = {};
  for (const [k, h] of FALLBACK_EMOTE_HASHES) map[`[${k}]`] = `${EMOTE_CDN}/${h}.png`;
  return map;
})();

/* ===== 数据获取（模块级缓存，多实例共享） ===== */

let packagesCache: EmotePackage[] | null = null;
let packagesPromise: Promise<EmotePackage[]> | null = null;

/** 规范化单个表情关键字：统一补上方括号（接口返回 [tv_doge] / tv_doge 两种形态） */
function normalizeKey(text: string): string {
  const t = (text || '').trim();
  if (!t) return '';
  return t.startsWith('[') ? t : `[${t}]`;
}

/** 解析接口 packages → 统一 EmotePackage[] */
function parsePackages(raw: any): EmotePackage[] {
  const list = Array.isArray(raw) ? raw : [];
  const packages: EmotePackage[] = [];
  for (const p of list ?? []) {
    if (!p || typeof p !== 'object') continue;
    const emotes: EmoteItem[] = [];
    for (const e of Array.isArray(p.emote) ? p.emote : []) {
      if (!e || typeof e !== 'object') continue;
      const text = normalizeKey(e.text);
      if (!text) continue;
      emotes.push({
        text,
        url: typeof e.url === 'string' && e.url ? e.url : undefined,
        size: Number(e.meta?.size) || undefined,
        alias: typeof e.alias === 'string' ? e.alias : undefined,
      });
    }
    if (emotes.length === 0) continue;
    packages.push({
      package_id: p.id ?? p.package_id ?? undefined,
      name: typeof p.text === 'string' && p.text ? p.text : undefined,
      url: typeof p.url === 'string' && p.url ? p.url : undefined,
      type: Number(p.type) || undefined,
      emotes,
    });
  }
  return packages;
}

/**
 * 获取表情包列表（按需拉取一次并缓存；接口失败/空时回退内置兜底）。
 * @param options.force 强制刷新（忽略缓存）
 */
export async function getEmotePackages(options?: { force?: boolean }): Promise<EmotePackage[]> {
  if (!options?.force && packagesCache) return packagesCache;
  if (!options?.force && packagesPromise) return packagesPromise;

  const request = (async (): Promise<EmotePackage[]> => {
    try {
      const res: any = await get(apiClient, Api.myEmote, {
        business: 'reply',
        web_location: '333.1245',
      });
      const parsed = res?.code === 0 ? parsePackages(res?.data?.packages) : [];
      if (parsed.length > 0) return parsed;
      // 接口可用但无数据（如未登录）：回退兜底
      return FALLBACK_EMOTES;
    } catch (e) {
      // 网络/风控失败：回退兜底，保证表情功能可用
      console.warn('[emote] 表情接口不可用，使用内置兜底表情：', e);
      return FALLBACK_EMOTES;
    }
  })();

  if (!options?.force) {
    packagesPromise = request;
    request
      .then((v) => { packagesCache = v; })
      .catch(() => {})
      .finally(() => { packagesPromise = null; });
    return request;
  }
  const fresh = await request;
  packagesCache = fresh;
  return fresh;
}

/**
 * 获取全量表情映射表 `[关键字] → url`（多包展平）。
 * 供 EmoteText 文本解析命中。缓存与 getEmotePackages 共享。
 */
export async function getEmoteMap(options?: { force?: boolean }): Promise<EmoteMap> {
  const packages = await getEmotePackages(options);
  const map: EmoteMap = {};
  for (const p of packages) {
    for (const e of p.emotes) {
      if (e.url && !map[e.text]) map[e.text] = e.url;
    }
  }
  // 兜底表优先（保证 [tv_doge] 等常用关键字即使接口数据不全也能命中）
  for (const [k, v] of Object.entries(FALLBACK_EMOTE_MAP)) {
    if (!map[k]) map[k] = v;
  }
  return map;
}
