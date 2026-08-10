export interface Episode {
  id: number; cid: number; bvid: string; title: string; cover: string; long_title: string;
  badge?: string;
}

export interface SeasonDetail {
  season_id: number;
  media_id: number;
  title: string;
  cover: string;
  evaluate: string;
  rating: { score: number; count: number };
  stat: { follow: number; view: number; danmaku: number };
  styles: string[];
  season_type?: number;
  is_finish?: number;
  new_ep?: { id?: number; index_show?: string; cover?: string; title?: string };
  episodes: Episode[];
}

export interface ReviewAuthor {
  mid: number;
  uname: string;
  avatar: string;
}

export interface ReviewItem {
  review_id: number;
  author: ReviewAuthor;
  title: string;
  content: string;
  push_time_str: string;
  score: number; // 接口原始 0-10，展示取半
  likes: number;
  liked: boolean;
  article_id: number;
}
