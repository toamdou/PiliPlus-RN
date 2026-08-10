export const SEARCH_BAR_H = 44;
export const CATEGORY_BAR_H = 44;
export const PARTITION_BAR_H = 44;

export const CATEGORIES = ['直播', '推荐', '热门', '分区', '番剧', '影视'] as const;
export type Category = (typeof CATEGORIES)[number];

export interface Partition {
  label: string;
  rid?: number;
  seasonType?: number;
}

export const PARTITIONS: Partition[] = [
  { label: '全站', rid: 0 },
  { label: '番剧', seasonType: 1 },
  { label: '国创', seasonType: 4 },
  { label: '动画', rid: 1005 },
  { label: '音乐', rid: 1003 },
  { label: '舞蹈', rid: 1004 },
  { label: '游戏', rid: 1008 },
  { label: '知识', rid: 1010 },
  { label: '科技', rid: 1012 },
  { label: '运动', rid: 1018 },
  { label: '汽车', rid: 1013 },
  { label: '美食', rid: 1020 },
  { label: '动物', rid: 1024 },
  { label: '鬼畜', rid: 1007 },
  { label: '时尚', rid: 1014 },
  { label: '娱乐', rid: 1002 },
  { label: '影视', rid: 1001 },
  { label: '记录', seasonType: 3 },
  { label: '电影', seasonType: 2 },
  { label: '剧集', seasonType: 5 },
  { label: '综艺', seasonType: 7 },
];
