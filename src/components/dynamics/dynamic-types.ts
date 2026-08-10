export interface DynPic {
  src?: string;
  url?: string;
}

export interface DynArchive {
  bvid?: string;
  aid?: number;
  id?: number;
  epid?: number;
  season_id?: number;
  cover?: string;
  title?: string;
  duration_text?: string;
  stat?: { play?: number | string };
  badge?: { text?: string };
  jump_url?: string;
}

export interface DynLive {
  id?: number;
  room_id?: number;
  live_status?: number;
  cover?: string;
  title?: string;
  desc_first?: string;
  area_name?: string;
  badge?: { text?: string };
}

export interface DynMusic {
  id?: number;
  cover?: string;
  title?: string;
  label?: string;
}

export interface DynCommon {
  title?: string;
  title_prefix?: string;
  desc?: string;
  cover?: string;
  jump_url?: string;
}

export interface DynMedialist {
  id?: number;
  cover?: string;
  title?: string;
  sub_title?: string;
  badge?: { text?: string };
  jump_url?: string;
}

export interface DynVote {
  vote_id: number;
  title?: string;
  join_num?: number;
}

export interface DynArticleParagraph {
  text?: { nodes?: { word?: { words?: string }; rich?: { text?: string; orig_text?: string } }[] };
  heading?: { nodes?: { word?: { words?: string }; rich?: { text?: string; orig_text?: string } }[] };
  pic?: { url?: string };
}

export interface DynMajor {
  type?: string;
  archive?: DynArchive;
  ugc_season?: DynArchive;
  pgc?: DynArchive;
  courses?: DynArchive;
  draw?: { items?: DynPic[] };
  opus?: { title?: string; summary?: { text?: string }; pics?: DynPic[] };
  live?: DynLive;
  live_rcmd?: DynLive;
  music?: DynMusic;
  common?: DynCommon;
  upower_common?: DynCommon;
  medialist?: DynMedialist;
  none?: { tips?: string };
  vote?: DynVote;
}

export interface ReserveButton {
  status?: number;
  type?: number;
  check_text?: string;
  uncheck_text?: string;
  disable?: number;
  jump_text?: string;
  jump_url?: string;
}

export interface ReserveCard {
  rid?: number;
  reserve_total?: number;
  state?: number;
  title?: string;
  button?: ReserveButton;
  desc1?: { text?: string };
  desc2?: { text?: string };
  desc3?: { text?: string };
}

export interface VoteOption {
  opt_idx?: number;
  opt_desc?: string;
  cnt?: number;
  img_url?: string;
}

export interface VoteInfoData {
  vote_id?: number;
  title?: string;
  desc?: string;
  type?: number;
  choice_cnt?: number;
  end_time?: number;
  join_num?: number;
  options?: VoteOption[];
  my_votes?: number[];
}

export interface DynDetail {
  id_str: string;
  type: string;
  basic?: { comment_id_str?: string; comment_type?: number; rid_str?: string };
  orig?: DynDetail;
  modules: {
    module_author?: { name?: string; face?: string; pub_ts?: number; mid?: number; isPinned?: boolean; privatePub?: number };
    module_dynamic?: {
      desc?: { text?: string };
      major?: DynMajor;
      additional?: {
        type?: string;
        vote?: DynVote;
        reserve?: ReserveCard;
      };
      topic?: { id?: number; name?: string };
    };
    module_stat?: { like?: { count: number; status?: boolean }; comment?: { count: number }; forward?: { count: number } };
    module_tag?: { text?: string };
    module_collection?: { title?: string };
    module_content?: DynArticleParagraph[];
  };
}

/* ===== 统一动态媒体解析（流内/话题/详情共用） ===== */
export interface DynMediaLike {
  type?: string;
  modules?: {
    module_dynamic?: {
      desc?: { text?: string };
      major?: DynMajor;
      additional?: { type?: string; vote?: DynVote };
    };
    module_tag?: { text?: string };
    module_collection?: { title?: string };
    module_content?: DynArticleParagraph[];
  };
}

export function dynMajor(item?: DynMediaLike): DynMajor | undefined {
  return item?.modules?.module_dynamic?.major;
}

export function dynType(item?: DynMediaLike): string | undefined {
  return item?.type;
}

export function dynArchiveFromMajor(major?: DynMajor): DynArchive | undefined {
  return major?.archive ?? major?.ugc_season ?? major?.pgc ?? major?.courses;
}

export function dynArchive(item?: DynMediaLike): DynArchive | undefined {
  return dynArchiveFromMajor(dynMajor(item));
}

export function dynImagesFromMajor(major?: DynMajor): string[] {
  const items = major?.draw?.items ?? major?.opus?.pics ?? [];
  return items.map((p) => p?.src || p?.url || '').filter(Boolean);
}

export function dynImages(item?: DynMediaLike): string[] {
  return dynImagesFromMajor(dynMajor(item));
}

export function dynLiveFromMajor(major?: DynMajor): { id: number; cover: string; title: string; badge?: string; area?: string; liveStatus?: number } | null {
  const live = major?.live ?? major?.live_rcmd;
  if (!live) return null;
  const id = live.id ?? live.room_id ?? 0;
  if (!id) return null;
  return {
    id,
    cover: live.cover || '',
    title: live.title || '直播',
    badge: live.badge?.text,
    area: live.area_name,
    liveStatus: live.live_status,
  };
}

export function dynLive(item?: DynMediaLike): { id: number; cover: string; title: string; badge?: string; area?: string; liveStatus?: number } | null {
  return dynLiveFromMajor(dynMajor(item));
}

export function dynArticleTitle(item?: DynMediaLike): string {
  return item?.modules?.module_tag?.text || item?.modules?.module_collection?.title || '';
}

export function dynArticleImages(item?: DynMediaLike): string[] {
  const out: string[] = [];
  for (const p of item?.modules?.module_content ?? []) {
    const url = p?.pic?.url;
    if (url) out.push(url);
  }
  if (out.length === 0) out.push(...dynImages(item));
  return out.slice(0, 3);
}

export function dynParagraphText(item?: DynMediaLike): string {
  const paragraphs = item?.modules?.module_content ?? [];
  const chunks: string[] = [];
  for (const p of paragraphs) {
    const nodes = p?.text?.nodes ?? p?.heading?.nodes ?? [];
    for (const n of nodes) {
      const word = n?.word?.words;
      const rich = n?.rich?.text || n?.rich?.orig_text;
      if (word) chunks.push(word);
      else if (rich) chunks.push(rich);
    }
  }
  return chunks.join('').trim();
}

export function dynVote(item?: DynMediaLike): DynVote | undefined {
  const major = dynMajor(item);
  return item?.modules?.module_dynamic?.additional?.vote ?? major?.vote;
}

export function dynMusic(item?: DynMediaLike): DynMusic | undefined {
  return dynMajor(item)?.music;
}

export function dynCommon(item?: DynMediaLike): DynCommon | undefined {
  const major = dynMajor(item);
  return major?.common ?? major?.upower_common;
}

export function dynMedialist(item?: DynMediaLike): DynMedialist | undefined {
  return dynMajor(item)?.medialist;
}

export function dynNoneTips(item?: DynMediaLike): string | undefined {
  return dynMajor(item)?.none?.tips;
}

export function dynSummary(item?: DynMediaLike): string {
  const major = dynMajor(item);
  return item?.modules?.module_dynamic?.desc?.text || major?.opus?.summary?.text || major?.opus?.title || '';
}

/* ===== 兼容旧入口（动态详情） ===== */
export function detailArchive(item?: DynDetail): DynArchive | undefined {
  return dynArchive(item);
}

export function detailImages(item?: DynDetail): string[] {
  return dynImages(item);
}

export function detailLive(item?: DynDetail): { id: number; cover: string; title: string; badge?: string; area?: string; liveStatus?: number } | null {
  return dynLive(item);
}

export function detailArticleTitle(item?: DynDetail): string {
  return dynArticleTitle(item);
}

export function detailArticleImages(item?: DynDetail): string[] {
  return dynArticleImages(item);
}

export function detailParagraphText(item?: DynDetail): string {
  return dynParagraphText(item);
}
