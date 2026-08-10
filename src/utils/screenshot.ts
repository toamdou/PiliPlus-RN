import type { PiliPlayer } from 'pili-player';
import { showToast } from '@/utils/toast';

/** 截取视频当前帧并直存系统相册（原生 AVPlayerItemVideoOutput + PHPhotoLibrary）。 */
export async function captureVideoFrameToAlbum(
  player: PiliPlayer,
  _currentTime: number
): Promise<void> {
  try {
    showToast('正在保存截图…');
    await player.saveScreenshotToPhotosAsync();
    showToast('截图已保存到相册');
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (/not supported|unsupported|unavailable|not available/i.test(message)) {
      showToast('当前版本不支持截图');
    } else {
      showToast(`截图失败：${message}`);
    }
  }
}
