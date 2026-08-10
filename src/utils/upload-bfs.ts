import { buildNativeUploadOptions } from '@/utils/native-request';
import { cancelNativeRequest, uploadFileAsync } from 'pili-native-core';
import { USER_AGENT, BASE_HEADERS } from '@/utils/app-sign';
import { getCSRF } from '@/utils/cookie';
import type { NativeRequestCancelToken } from '@/utils/request-cancel';

/** B 站 BFS 图片上传（私信/动态共用，对齐 Flutter uploadBfs）。 */
export async function uploadBfsFile(
  url: string,
  file: { uri?: string; name?: string; type?: string },
  options: { category?: string; biz?: string } = {},
  cancelToken?: NativeRequestCancelToken,
): Promise<Record<string, any>> {
  if (!file?.uri) throw new Error('Missing file URI for upload');
  const nativeOptions = buildNativeUploadOptions({
    url,
    fileUri: String(file.uri),
    ...(cancelToken ? { requestId: cancelToken.id } : {}),
    fileName: file.name,
    mimeType: file.type,
    category: options.category,
    biz: options.biz,
    csrf: getCSRF() ?? '',
    headers: {
      'User-Agent': USER_AGENT,
      'Accept-Encoding': 'gzip, deflate',
      ...BASE_HEADERS,
    },
    timeoutMs: 30_000,
    responseType: 'json',
  });

  if (cancelToken) {
    if (cancelToken.aborted) throw new Error('Upload cancelled');
    cancelToken.onAbort(() => {
      void cancelNativeRequest(cancelToken.id);
    });
  }
  const result = await uploadFileAsync(nativeOptions);
  if (!result?.ok) {
    const raw = result?.data;
    const message = typeof raw === 'string' ? raw : JSON.stringify(raw ?? '');
    throw new Error(message || 'Upload failed');
  }
  return (typeof result.data === 'string' ? JSON.parse(result.data) : result.data) as Record<string, any>;
}
