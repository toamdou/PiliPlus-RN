/**
 * 全屏电量/时间标签已由原生 `PiliFullscreenController` 渲染，
 * 此 JS 组件不再持有 30s 时钟，直接返回空节点避免重复显示。
 */
export function BatteryLabel() {
  return null;
}
