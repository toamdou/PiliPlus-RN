/** FlashList v2 overrideItemLayout 的可变布局对象（公开类型只声明 span）。 */
export interface FlashListItemLayout {
  span?: number;
  size?: number;
}

/** 固定行高：只覆盖纵向 size，不改列跨度。 */
export function fixedItemLayout(size: number) {
  return (layout: FlashListItemLayout) => {
    layout.size = size;
  };
}

/** 网格固定行高：同时声明单列跨度，供 numColumns > 1 的列表复用。 */
export function gridItemLayout(size: number) {
  return (layout: FlashListItemLayout) => {
    layout.span = 1;
    layout.size = size;
  };
}
