import { getAccessKey } from '@/utils/cookie';
import { useAuthStore } from '@/stores/auth';
import { signAppParamsAsync as nativeSignAppParamsAsync } from 'pili-native-core';

export const USER_AGENT = 'Mozilla/5.0 BiliDroid/8.43.0 (bbcallen@gmail.com) os/android model/android mobi_app/android build/8430300 channel/master innerVer/8430300 osVer/15 network/2';
export const STATISTICS = '{"appId":1,"platform":3,"version":"8.43.0","abtest":""}';
export const TRACE_ID = '11111111111111111111111111111111:1111111111111111:0:0';

export const BASE_HEADERS: Record<string, string> = {
  'Referer': 'https://www.bilibili.com',
};

/** App 端签名：JS 注入 access_key，参数排序 + MD5 由原生完成。 */
export async function signAppParamsAsync(params: Record<string, any>): Promise<Record<string, any>> {
  const { anonymousMode } = useAuthStore.getState();
  const accessKey = anonymousMode ? undefined : getAccessKey();
  const merged = { ...(accessKey ? { access_key: accessKey } : {}), ...params };
  return nativeSignAppParamsAsync(merged);
}
