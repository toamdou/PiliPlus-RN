export type MemberTab =
  | 'videos'
  | 'dynamics'
  | 'coins'
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
