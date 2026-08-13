export type MemberTab =
  | 'videos'
  | 'dynamics'
  | 'coins'
  | 'like'
  | 'opus'
  | 'article'
  | 'audio'
  | 'cheese'
  | 'shop'
  | 'guard'
  | 'favorite'
  | 'bangumi'
  | 'collection';

export interface MemberInfo {
  mid: number;
  name: string;
  face: string;
  sign: string;
  level: number;
  vip: { status: number; type: number };
  official: { title: string };
  /** 批次5 P3：空间接口 /x/space/wbi/acc/info 返回的头像挂件（pendant）。接口不含该字段时保持 undefined，前端不渲染 */
  pendant?: { image: string; name: string } | null;
}

export interface VideoItem {
  bvid: string;
  title: string;
  pic: string;
  play: number;
  created: number;
  length: string;
}

export interface DynItem {
  id: string;
  type: string;
  text: string;
  pics: string[];
  author: string;
  time: string;
}
