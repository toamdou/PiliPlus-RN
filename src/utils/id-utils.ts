/**
 * id-utils —— av/bv 互转（移植自 Flutter lib/utils/id_utils.dart）。
 *
 * B站 App 端推荐接口经常不直接返回 bvid，仅给 aid/player_args.aid，
 * 需用 av2bv 兜底转换，否则视频卡片点击因 bvid 为空而静默失败。
 *
 * 注意：常量超出 32 位，JS 位运算会溢出，必须用 BigInt。
 */

const XOR_CODE = 23442827791579n;
const MAX_AID = 1n << 51n;
const BASE = 58n;
const DATA = 'FcwAPNKTMug3GV5Lj7EJnHpWsx4tb8haYeviqBz6rkCy12mUSDQX9RdoZf';

/** av 转 bv */
export function av2bv(aid: number): string {
  // 非法输入防护（审计 06-C1/N7）：BigInt(NaN)/BigInt(非有限数) 会抛 RangeError，
  // 通知页 subjectId 等来源可能传入 NaN/undefined，直接返回空串让调用方走兜底，不崩溃。
  if (!Number.isFinite(aid) || aid < 0 || aid > Number.MAX_SAFE_INTEGER) return '';
  const bytes = ['B', 'V', '1', '0', '0', '0', '0', '0', '0', '0', '0', '0'];
  let bvIndex = bytes.length - 1;
  let tmp = (MAX_AID | BigInt(aid)) ^ XOR_CODE;
  while (tmp > 0n) {
    bytes[bvIndex--] = DATA[Number(tmp % BASE)];
    tmp /= BASE;
  }
  // swap(3, 9) / swap(4, 7)
  [bytes[3], bytes[9]] = [bytes[9], bytes[3]];
  [bytes[4], bytes[7]] = [bytes[7], bytes[4]];
  return bytes.join('');
}
