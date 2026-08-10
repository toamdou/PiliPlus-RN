import type { DynArticleParagraph, DynMajor, DynVote } from './dynamic-types';

export interface DynamicItem {
  id_str: string;
  type: string;
  basic?: { comment_id_str?: string; comment_type?: number; rid_str?: string };
  orig?: DynamicItem;
  modules: {
    module_author?: { name?: string; face?: string; pub_ts?: number; mid?: number; isPinned?: boolean; privatePub?: number };
    module_dynamic?: {
      desc?: { text?: string };
      topic?: { id: number; name: string };
      major?: DynMajor;
      additional?: { type?: string; vote?: DynVote };
    };
    module_stat?: { like?: { count: number }; comment?: { count: number }; forward?: { count: number } };
    module_tag?: { text?: string };
    module_collection?: { title?: string };
    module_content?: DynArticleParagraph[];
  };
}

export interface PortalLiveItem {
  face: string;
  mid: number;
  uname: string;
  room_id: number;
  title: string;
}

export interface PortalUpItem {
  face: string;
  mid: number;
  uname: string;
  has_update: boolean;
}

export interface PortalData {
  live_users?: { count?: number; items?: PortalLiveItem[] };
  up_list?: { items?: PortalUpItem[] };
}

export type DynamicCardAction =
  | 'later'
  | 'copy'
  | 'share'
  | 'cover'
  | 'repost'
  | 'edit'
  | 'delete'
  | 'setTop'
  | 'rmTop'
  | 'private'
  | 'public'
  | 'report';
