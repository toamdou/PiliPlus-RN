import { cancelNativeRequest, nativeRequestAsync } from 'pili-native-core';
import { useSettingsStore } from '@/stores/settings';
import { buildNativeRequestOptions } from '@/utils/native-request';
import type { NativeRequestCancelToken } from '@/utils/request-cancel';

export interface SBSegment {
  UUID: string;
  segment: [number, number]; // [startTime, endTime] in seconds
  category: string; // sponsor, selfpromo, interaction, intro, outro, preview, filler, music_offtopic, poi_highlight
  actionType: string; // skip, mute, full, poi
  votes: number;
  locked: number;
}

function getBlockServer(): string {
  return useSettingsStore.getState().sponsorBlockServer || 'https://www.bsbsb.top';
}

function getUserId(): string {
  return 'rn-piliplus-user';
}

function buildNativeOptions(
  url: string,
  method: 'GET' | 'POST',
  body?: string,
  headers?: Record<string, string>,
  cancelToken?: NativeRequestCancelToken,
) {
  return buildNativeRequestOptions({
    url,
    method,
    headers: headers ?? {},
    ...(cancelToken ? { requestId: cancelToken.id } : {}),
    ...(body === undefined ? {} : { body }),
    responseType: method === 'GET' ? 'json' : 'text',
  });
}

function wireCancel(
  cancelToken: NativeRequestCancelToken | undefined,
  requestId: string | undefined,
) {
  if (!cancelToken || !requestId) return;
  cancelToken.onAbort(() => void cancelNativeRequest(requestId));
}

export const sponsorBlockApi = {
  async getSkipSegments(
    bvid: string,
    cid: number,
    cancelToken?: NativeRequestCancelToken,
  ): Promise<SBSegment[]> {
    try {
      const server = getBlockServer();
      const options = buildNativeOptions(
        `${server}/api/skipSegments?videoID=${bvid}&cid=${cid}`,
        'GET',
        undefined,
        undefined,
        cancelToken,
      );
      wireCancel(cancelToken, options.requestId);
      const res = await nativeRequestAsync(
        options,
      );
      if (res.status === 200) {
        const data = res.data;
        if (Array.isArray(data)) return data;
      }
      return [];
    } catch {
      return [];
    }
  },

  async voteOnSponsorTime(
    uuid: string,
    type: number,
    cancelToken?: NativeRequestCancelToken,
  ): Promise<boolean> {
    try {
      const server = getBlockServer();
      const options = buildNativeOptions(
        `${server}/api/voteOnSponsorTime?UUID=${uuid}&type=${type}&userID=${getUserId()}`,
        'POST',
        undefined,
        undefined,
        cancelToken,
      );
      wireCancel(cancelToken, options.requestId);
      const res = await nativeRequestAsync(
        options,
      );
      return res.status === 200;
    } catch {
      return false;
    }
  },

  async viewedVideoSponsorTime(
    uuid: string,
    cancelToken?: NativeRequestCancelToken,
  ): Promise<void> {
    try {
      const server = getBlockServer();
      const options = buildNativeOptions(
        `${server}/api/viewedVideoSponsorTime`,
        'POST',
        JSON.stringify({ UUID: uuid }),
        { 'Content-Type': 'application/json' },
        cancelToken,
      );
      wireCancel(cancelToken, options.requestId);
      await nativeRequestAsync(
        options,
      );
    } catch {
      // 静默
    }
  },
};
