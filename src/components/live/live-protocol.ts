export interface QualityItem {
  quality: number;
  new_description: string;
}

const LIVE_QUALITY_DESC: Record<number, string> = {
  30000: '杜比',
  25000: '4K 原画',
  20000: '4K',
  15000: '2K',
  10000: '原画',
  400: '蓝光',
  250: '超清',
  150: '高清',
  80: '流畅',
};

export function buildQualityList(playurl: any): QualityItem[] {
  const seen = new Set<number>();
  const list: QualityItem[] = [];
  for (const stream of playurl?.stream || []) {
    for (const format of stream?.format || []) {
      for (const codec of format?.codec || []) {
        for (const qn of codec?.accept_qn || []) {
          if (!seen.has(qn)) {
            seen.add(qn);
            list.push({
              quality: qn,
              new_description: LIVE_QUALITY_DESC[qn] || `画质 ${qn}`,
            });
          }
        }
      }
    }
  }
  return list.sort((a, b) => b.quality - a.quality);
}

export function buildLiveUrl(playurl: any, cdnHost?: string, qn?: number): string {
  const streams = playurl?.stream || [];
  let target: { format: any; codec: any } | null = null;

  if (qn != null) {
    for (const stream of streams) {
      for (const format of stream?.format || []) {
        for (const codec of format?.codec || []) {
          if (codec?.current_qn === qn || (codec?.accept_qn || []).includes(qn)) {
            target = { format, codec };
            break;
          }
        }
        if (target) break;
      }
      if (target) break;
    }
  }

  if (!target) {
    const stream = streams[0];
    target = {
      format: stream?.format?.[0],
      codec: stream?.format?.[0]?.codec?.[0],
    };
  }

  const urlInfo = target?.codec?.url_info?.[0];
  if (!urlInfo || !target?.codec?.base_url) return '';
  let url = `${urlInfo.host}${target.codec.base_url}${urlInfo.extra || ''}`;
  return withLiveCdnHost(url, cdnHost);
}

const AUDIO_CODEC_HINTS = ['audio', 'dolby', 'flac', 'aac', 'mp4a'];

function isLikelyAudioCodec(codec: any): boolean {
  const haystack = [
    codec?.codec_name,
    codec?.codecs,
    codec?.mime_type,
    codec?.mimeType,
    codec?.id,
  ].filter(Boolean).join(' ').toLowerCase();
  return AUDIO_CODEC_HINTS.some((hint) => haystack.includes(hint));
}

function withLiveCdnHost(url: string, cdnHost?: string): string {
  if (!cdnHost || !cdnHost.trim()) return url;
  try {
    const parsed = new URL(url);
    parsed.hostname = cdnHost.trim();
    return parsed.toString();
  } catch (e) {
    console.error('liveCdnUrl parse error:', e);
    return url;
  }
}

function buildCodecUrl(codec: any): string {
  const urlInfo = codec?.url_info?.[0];
  if (!urlInfo || !codec?.base_url) return '';
  return `${urlInfo.host}${codec.base_url}${urlInfo.extra || ''}`;
}

/**
 * 直播“听”模式优先取音频 codec；only_audio=1 的 playurl 通常只含音频流。
 * 找不到音频 codec 时回退到常规视频流地址（AVPlayer 可仅消费其中的音轨）。
 */
export function getBestLiveAudioUrl(playurl: any, cdnHost?: string, qn?: number): string {
  const candidates: { codec: any; qnMatch: boolean }[] = [];
  for (const stream of playurl?.stream || []) {
    for (const format of stream?.format || []) {
      for (const codec of format?.codec || []) {
        if (!isLikelyAudioCodec(codec)) continue;
        if (!buildCodecUrl(codec)) continue;
        const qnMatch = qn != null && (
          codec?.current_qn === qn || (codec?.accept_qn || []).includes(qn)
        );
        candidates.push({ codec, qnMatch });
      }
    }
  }
  candidates.sort((a, b) => Number(b.qnMatch) - Number(a.qnMatch));
  const audioUrl = candidates[0] ? buildCodecUrl(candidates[0].codec) : '';
  if (audioUrl) return withLiveCdnHost(audioUrl, cdnHost);
  return buildLiveUrl(playurl, cdnHost, qn);
}
