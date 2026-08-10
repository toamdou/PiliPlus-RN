/**
 * ImageViewer —— 全屏图片查看器（UIKit PiliImageViewer）。
 *
 * 原生查看器负责图片缩放、滑动关闭、左右切换与长按菜单
 * （保存当前解码图 / 复制图片地址）；RN 只传开关。
 */
import { PiliImageViewer } from 'pili-native-core';
import { useSettingsStore } from '@/stores/settings';

interface Props {
  visible: boolean;
  images: string[];
  initialIndex?: number;
  onClose: () => void;
}

export function ImageViewer({ visible, images, initialIndex = 0, onClose }: Props) {
  const enableImgMenu = useSettingsStore((s) => s.enableImgMenu);

  return (
    <PiliImageViewer
      visible={visible}
      images={images}
      initialIndex={initialIndex}
      contextMenuEnabled={enableImgMenu}
      onClose={onClose}
    />
  );
}
