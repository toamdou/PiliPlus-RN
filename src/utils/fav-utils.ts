/**
 * fav-utils —— 收藏夹共享工具（对齐 Flutter BiliUtils.isDefaultFav）。
 */

/**
 * 是否为默认收藏夹（attr 位掩码：bit0=私密，bit1=默认收藏夹）。
 * attr 为 null/undefined 时不判定为默认（对齐 Flutter null → false）。
 */
export function isDefaultFav(attr?: number | null): boolean {
  return attr != null && (attr & 2) === 2;
}

/** 收藏夹排序页临时缓存：避免把整份列表塞进路由参数导致 URL 超长/刷新丢失。 */
export interface FavSortCacheItem {
  id: string;
  title: string;
  media_count: number;
  cover: string;
  attr?: number;
}

let favSortCache: FavSortCacheItem[] | null = null;

export function setFavSortCache(list: FavSortCacheItem[]): void {
  favSortCache = list;
}

export function takeFavSortCache(): FavSortCacheItem[] | null {
  const value = favSortCache;
  favSortCache = null;
  return value;
}
