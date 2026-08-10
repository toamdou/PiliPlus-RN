/**
 * toast —— 极简全局轻提示（订阅式，无需 Provider 上下文）。
 * Toast 组件在根布局挂载一次，调用 showToast(msg) 即在顶部弹出胶囊提示。
 */
type Listener = (msg: string) => void;

let listener: Listener | null = null;

export function setToastListener(l: Listener | null) {
  listener = l;
}

export function showToast(msg: string) {
  listener?.(msg);
}
