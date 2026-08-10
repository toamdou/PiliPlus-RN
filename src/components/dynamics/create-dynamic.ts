import type { MentionUser } from '@/components/dynamics/MentionPicker';

export const MAX_TEXT = 2333;
export const MAX_IMAGES = 9;

export interface DynContentItem {
  raw_text: string;
  type: number;
  biz_id: string;
}

export interface DynReq {
  content: { contents: DynContentItem[] };
  scene: number;
  pics?: { pics: { img_src: string }[] };
  option: Record<string, never>;
  attach_card?: { common_card: { type: number; biz_id: number; reserve_source: number; reserve_lottery: number } };
  topic?: { id: number; name: string; from_source: string; from_topic_id: number };
  upload_id: string;
  meta: { app_meta: { from: string; mobi_app: string } };
}

/** 把正文拆成内容片段：@提及（type 2）单独成段，投票（type 4）追加在末尾 */
export function buildContents(
  text: string,
  mentions: MentionUser[],
  vote: { title: string; voteId: number } | null,
): DynContentItem[] {
  const contents: DynContentItem[] = [];
  const pushText = (t: string) => {
    if (t) contents.push({ raw_text: t, type: 1, biz_id: '' });
  };
  let pos = 0;
  while (pos < text.length) {
    const at = text.indexOf('@', pos);
    if (at === -1) {
      pushText(text.slice(pos));
      break;
    }
    let end = at + 1;
    while (end < text.length && !/\s/.test(text[end])) end += 1;
    const name = text.slice(at + 1, end);
    const user = mentions.find((m) => m.name === name);
    if (user) {
      pushText(text.slice(pos, at));
      contents.push({ raw_text: '@' + name, type: 2, biz_id: user.uid });
      pos = end;
    } else {
      // 未匹配的 @ 段（手打/被编辑过）按普通文本保留，避免静默改写发布内容
      pushText(text.slice(pos, at + 1));
      pos = at + 1;
    }
  }
  if (vote) {
    pushText('我发起了一个投票');
    contents.push({ raw_text: vote.title, type: 4, biz_id: String(vote.voteId) });
    contents.push({ raw_text: ' ', type: 1, biz_id: '' });
  }
  return contents;
}
