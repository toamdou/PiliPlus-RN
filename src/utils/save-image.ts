/**
 * save-image —— 保存网络图片到系统相册。
 * 下载与相册写入统一由 pili-native-core 的 PHPhotoLibrary 原生路径完成。
 */
import { saveImageToPhotosAsync } from 'pili-native-core';
import { useSettingsStore } from '@/stores/settings';
import { normalizeHttpUrl } from '@/utils/format';
import { showToast } from '@/utils/toast';

/**
 * 保存网络图片到系统相册，内部处理权限、下载、保存与全部成功 / 失败提示。
 * @param url 图片地址（兼容 `//`、`http://` 开头的 b 站封面）
 */
export async function saveImageToAlbum(url: string): Promise<void> {
  const silent = useSettingsStore.getState().silentDownImg;
  const notify = (msg: string) => {
    if (!silent) showToast(msg);
  };
  if (!url || !url.trim()) {
    notify('封面地址为空');
    return;
  }
  try {
    notify('正在保存封面…');
    const fullUrl = normalizeHttpUrl(url);
    await saveImageToPhotosAsync(fullUrl);
    notify('已保存到相册');
  } catch (e) {
    notify(`保存失败：${e instanceof Error ? e.message : String(e)}`);
  }
}
