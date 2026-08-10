import { useEffect } from 'react';
import { presentTextInputAsync } from 'pili-native-core';

interface Props {
  visible: boolean;
  title: string;
  message?: string;
  initialValue?: string;
  onCancel: () => void;
  onConfirm: (text: string) => void;
}

/** 设置文本输入统一走原生 UIAlertController + UITextField。 */
export function SettingsPromptSheet({
  visible,
  title,
  message,
  initialValue = '',
  onCancel,
  onConfirm,
}: Props) {
  useEffect(() => {
    if (!visible) return;
    let active = true;
    presentTextInputAsync(title, message ?? null, initialValue)
      .then((text) => {
        if (!active) return;
        if (text == null) onCancel();
        else onConfirm(text);
      })
      .catch(() => {
        if (active) onCancel();
      });
    return () => {
      active = false;
    };
  }, [visible, title, message, initialValue, onCancel, onConfirm]);

  return null;
}
