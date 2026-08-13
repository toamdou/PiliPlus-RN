/**
 * audio —— 音频（音乐服务）相关接口最小补充。
 *
 * 说明：音频播放走 web 取流接口 `/audio/music-service-c/web/url`（audio/[id] 页在用），
 * 本文件只补"歌曲详情"（用于歌单/相关歌曲取 UP 主 uid），歌单本体复用
 * userApi.spaceAudio（`/audio/music-service/web/song/upper`）。
 *
 * ⚠️ 接口契约标注：`/audio/music-service/web/song/detail` 为 B 站音乐服务 web 接口，
 * 响应含 data.song / data.uploader 等字段（对齐 Flutter 端 audio 详情解析）；若字段漂移，
 * 以 `res?.data?.data` 兜底读取，不影响既有逻辑。
 */
import { apiClient, get } from './client';
import { Api } from './endpoints';

export const audioApi = {
  /** 音频详情（song_id 查询；返回 data.song 与 data.uploader.uid） */
  async songDetail(params: { sid: number | string }) {
    return get(apiClient, '/audio/music-service/web/song/detail', { song_id: params.sid });
  },
};

export { Api };
