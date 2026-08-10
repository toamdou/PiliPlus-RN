/** form-urlencoded 请求头（对齐 Flutter 的 formUrlEncodedContentType 请求） */
export const FORM_HEADERS: Record<string, string> = {
  'Content-Type': 'application/x-www-form-urlencoded',
};

/** 过滤 null/undefined 后编码 form body。 */
export function formBody(params: Record<string, any>): string {
  return new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v != null)
      .map(([k, v]) => [k, String(v)]),
  ).toString();
}

/** 与 client.ts 的 object form 序列化一致：null/undefined 也编码为空字符串。 */
export function formBodyStrict(params: Record<string, any>): string {
  return new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v ?? '')]),
  ).toString();
}
