/**
 * ArticleReader —— 专栏原生阅读器主体（批次5 专栏阅读器 P3/L）。
 *
 * 职责：
 *  - 渲染标题 / 作者行（头像、昵称、发布时间，点击跳空间页）；
 *  - 把 /x/article/view 返回的两种正文格式统一渲染：
 *      · HTML 格式（data.content）：轻量标签树解析 → 段落/标题/图片/引用/列表/代码块；
 *      · JSON 段落格式（data.opus.content 或 data.type==3 的 ops）：para_type 1/2/3/4/5/7/8。
 *  - 图片点击进全屏 ImageViewer（原生缩放/长按菜单）；
 *  - 链接点击回调（WebView / 站内路由由父级决定）。
 *
 * 排版全部走 useType（字号随设置全局缩放）+ token 化圆角（RADII），符合批次4 设计系统收敛约定。
 */
import { memo, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { useThemeColors } from '@/components/SwiftUIHost';
import { useType } from '@/components/type-scale';
import { Press } from '@/components/motion';
import { ImageViewer } from '@/components/ImageViewer';
import { biliCover } from '@/utils/image-url';
import { formatDate } from '@/utils/format';
import { RADII, continuous } from '@/theme/tokens';

/* ================= 解析模型 ================= */

interface InlineNode {
  type: 'text' | 'link' | 'image';
  text?: string;
  href?: string;
  src?: string;
  style?: { bold?: boolean; italic?: boolean; strike?: boolean };
}

type ArticleBlock =
  | { type: 'h1'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'p'; nodes: InlineNode[]; quote?: boolean }
  | { type: 'img'; src: string; width?: number; height?: number; caption?: string }
  | { type: 'list'; items: InlineNode[][] }
  | { type: 'code'; text: string }
  | { type: 'divider' };

interface HTagNode {
  tag: string;
  attrs?: Record<string, string>;
  text?: string;
  children: HTagNode[];
}

/* ================= HTML 轻量解析（B 站专栏 HTML 结构较扁平，无需引入 DOM 库） ================= */

function stripTags(html: string): string {
  return html
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function nodeText(node: HTagNode): string {
  let out = '';
  const walk = (n: HTagNode) => {
    if (n.tag === '#text') out += n.text ?? '';
    else for (const c of n.children) walk(c);
  };
  walk(node);
  return out.replace(/\s+/g, ' ').trim();
}

function childrenToHtml(children: HTagNode[]): string {
  return children.map(nodeToHtml).join('');
}

function nodeToHtml(node: HTagNode): string {
  if (node.tag === '#text') return node.text ?? '';
  const attrs = node.attrs ?? {};
  const attrStr = Object.entries(attrs)
    .filter(([k]) => k !== '__raw')
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ');
  const inner = node.children.map(nodeToHtml).join('');
  return `<${node.tag}${attrStr ? ` ${attrStr}` : ''}>${inner}</${node.tag}>`;
}

/** 标签树构建：把一段 HTML 解析为顶层节点树（不依赖第三方 DOM 解析）。 */
function parseHtmlTree(html: string): HTagNode {
  const root: HTagNode = { tag: '#root', children: [] };
  const stack: HTagNode[] = [root];
  const re = /<\/?([a-zA-Z][a-zA-Z0-9]*)([^>]*?)(\/?)>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const text = html.slice(last, m.index);
    if (text) stack[stack.length - 1].children.push({ tag: '#text', text, children: [] });
    const tag = m[1].toLowerCase();
    const selfClosing = m[3] === '/' || tag === 'br' || tag === 'img' || tag === 'hr';
    const attrs: Record<string, string> = {};
    const attrRe = /([a-zA-Z_:][a-zA-Z0-9_:.\-]*)\s*=\s*"([^"]*)"/g;
    let am: RegExpExecArray | null;
    while ((am = attrRe.exec(m[2]))) attrs[am[1].toLowerCase()] = am[2];
    attrs.__raw = m[0];
    if (m[0].startsWith('</')) {
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === tag) {
          stack.length = i;
          break;
        }
      }
    } else if (selfClosing) {
      stack[stack.length - 1].children.push({ tag, attrs, children: [] });
    } else {
      const node: HTagNode = { tag, attrs, children: [] };
      stack[stack.length - 1].children.push(node);
      stack.push(node);
    }
    last = m.index + m[0].length;
  }
  const tail = html.slice(last);
  if (tail) stack[stack.length - 1].children.push({ tag: '#text', text: tail, children: [] });
  return root;
}

/** 段落内联解析：文本 / <a> 链接 / 内联 <img> 表情 / <br> 换行。 */
function parseInline(html: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  const base = { bold: false, italic: false, strike: false, href: '' as string | undefined };
  const styleStack: Array<typeof base> = [base];
  const re = /<\/?(b|strong|em|i|s|strike|del|u|a|img|br|span)([^>]*)>/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  const flush = (text: string) => {
    if (!text) return;
    const s = styleStack[styleStack.length - 1];
    if (s.href) nodes.push({ type: 'link', text, href: s.href });
    else if (s.bold || s.italic || s.strike) nodes.push({ type: 'text', text, style: { bold: s.bold, italic: s.italic, strike: s.strike } });
    else nodes.push({ type: 'text', text });
  };
  while ((m = re.exec(html))) {
    flush(html.slice(last, m.index));
    const isClose = m[0].startsWith('</');
    const tag = m[1].toLowerCase();
    const top = () => styleStack[styleStack.length - 1];
    if (tag === 'br') {
      nodes.push({ type: 'text', text: '\n' });
    } else if (tag === 'img' && !isClose) {
      const src = /src\s*=\s*["']([^"']+)["']/i.exec(m[2])?.[1] ?? '';
      if (src) nodes.push({ type: 'image', src });
    } else if (tag === 'a') {
      if (isClose) {
        if (styleStack.length > 1) styleStack.pop();
      } else {
        const href = /href\s*=\s*["']([^"']+)["']/i.exec(m[2])?.[1] ?? undefined;
        styleStack.push({ ...top(), href });
      }
    } else if (['b', 'strong', 'em', 'i', 's', 'strike', 'del', 'u'].includes(tag)) {
      if (isClose) {
        if (styleStack.length > 1) styleStack.pop();
      } else {
        styleStack.push({
          ...top(),
          bold: top().bold || tag === 'b' || tag === 'strong',
          italic: top().italic || tag === 'i' || tag === 'em',
          strike: top().strike || tag === 's' || tag === 'strike' || tag === 'del',
        });
      }
    } else {
      // span 等标签：仅当带 bold 类时标记加粗，否则透传样式
      if (isClose) {
        if (styleStack.length > 1) styleStack.pop();
      } else {
        const boldClass = /class\s*=\s*["'][^"']*\bbold\b[^"']*["']/i.test(m[2]);
        styleStack.push({ ...top(), bold: top().bold || boldClass });
      }
    }
    last = m.index + m[0].length;
  }
  flush(html.slice(last));
  return nodes;
}

function collectImages(node: HTagNode): Array<{ src: string; width?: number; height?: number }> {
  const imgs: Array<{ src: string; width?: number; height?: number }> = [];
  const walk = (n: HTagNode) => {
    if (n.tag === 'img') {
      const src = n.attrs?.src ?? n.attrs?.['data-src'] ?? '';
      if (src && !src.includes('/emote/') && !src.includes('/mall/')) {
        imgs.push({ src });
      }
    }
    for (const c of n.children) walk(c);
  };
  walk(node);
  return imgs;
}

function nodeToBlocks(node: HTagNode, out: ArticleBlock[]): ArticleBlock[] {
  const tag = node.tag;
  if (tag === '#root') {
    // 根节点：递归下降处理顶层子元素
    for (const c of node.children) nodeToBlocks(c, out);
    return out;
  }
  if (tag === '#text' || tag === 'span') return out;
  if (['h1', 'h2', 'h3', 'h4', 'h5'].includes(tag)) {
    const text = nodeText(node);
    if (text) {
      // h1/h2 大字层级；h3/h4/h5 统一收敛为 h3 层级，避免 union 漂移
      const headingType: ArticleBlock['type'] = tag === 'h1' ? 'h1' : tag === 'h2' ? 'h2' : 'h3';
      out.push({ type: headingType, text });
    }
    return out;
  }
  if (tag === 'p' || tag === 'div' || tag === 'section') {
    const imgs = collectImages(node);
    // div 容器整体是一张图时按图块渲染，避免嵌套 p
    if (imgs.length === 1 && node.children.some((c) => c.tag === 'img')) {
      const onlyImg = node.children.filter((c) => c.tag === 'img');
      if (onlyImg.length === 1 && nodeText(node).length === 0) {
        out.push({ type: 'img', src: imgs[0].src });
        return out;
      }
    }
    const nodes = parseInline(childrenToHtml(node.children));
    if (nodes.length > 0) out.push({ type: 'p', nodes });
    return out;
  }
  if (tag === 'figure') {
    const img = collectImages(node)[0];
    const capNode = node.children.find((c) => c.tag === 'figcaption');
    if (img) out.push({ type: 'img', src: img.src, caption: capNode ? nodeText(capNode) : undefined });
    return out;
  }
  if (tag === 'blockquote') {
    const nodes = parseInline(childrenToHtml(node.children));
    if (nodes.length > 0) out.push({ type: 'p', nodes, quote: true });
    return out;
  }
  if (tag === 'img') {
    const src = node.attrs?.src ?? node.attrs?.['data-src'] ?? '';
    if (src) out.push({ type: 'img', src });
    return out;
  }
  if (tag === 'hr') {
    out.push({ type: 'divider' });
    return out;
  }
  if (tag === 'ul' || tag === 'ol') {
    const items: InlineNode[][] = [];
    for (const li of node.children) {
      if (li.tag === 'li') {
        const inlines = parseInline(childrenToHtml(li.children));
        if (inlines.length > 0) items.push(inlines);
      }
    }
    if (items.length > 0) out.push({ type: 'list', items });
    return out;
  }
  if (tag === 'pre') {
    const code = nodeText(node);
    if (code) out.push({ type: 'code', text: code });
    return out;
  }
  // 其余容器递归下降
  for (const c of node.children) nodeToBlocks(c, out);
  return out;
}

/* ================= JSON 段落格式（data.opus.content 或 type==3） ================= */

interface JsonRich {
  text?: string;
  type?: string;
  jump_url?: string;
  orig_text?: string;
  rid?: string;
  emoji?: { url?: string };
}
interface JsonNode {
  node_type?: number;
  type?: string;
  word?: {
    words?: string;
    style?: { bold?: boolean; italic?: boolean; strikethrough?: boolean };
    color?: string;
    font_level?: string;
    fontSize?: number;
  };
  rich?: JsonRich;
}
interface JsonParagraph {
  para_type?: number;
  align?: number;
  text?: { nodes?: JsonNode[] };
  pic?: { pics?: Array<{ url?: string; width?: number; height?: number }> };
  line?: { pic?: { url?: string; width?: number; height?: number } };
  heading?: { nodes?: JsonNode[] };
  list?: { items?: Array<{ nodes?: JsonNode[] }> };
  code?: { content?: string; lang?: string };
}

function jsonNodesToInline(nodes: JsonNode[]): InlineNode[] {
  const out: InlineNode[] = [];
  for (const n of nodes) {
    if (n.word) {
      const w = n.word;
      out.push({
        type: 'text',
        text: w.words ?? '',
        style: {
          bold: w.style?.bold === true,
          italic: w.style?.italic === true,
          strike: w.style?.strikethrough === true,
        },
      });
    } else if (n.rich) {
      const r = n.rich;
      const text = r.text ?? r.orig_text ?? '';
      if (r.type === 'RICH_TEXT_NODE_TYPE_EMOJI' && r.emoji?.url) {
        out.push({ type: 'image', src: r.emoji.url });
      } else if (r.type === 'RICH_TEXT_NODE_TYPE_AT') {
        // @用户：跳空间页（rid 为 mid）
        out.push({ type: 'link', text, href: r.rid ? `bilibili://space/${r.rid}` : undefined });
      } else if (r.type === 'RICH_TEXT_NODE_TYPE_TEXT' || !r.jump_url) {
        out.push({ type: 'text', text });
      } else {
        out.push({ type: 'link', text, href: r.jump_url });
      }
    }
    // formula（latex）与其它节点暂降级为纯文本占位
  }
  return out;
}

function jsonToBlocks(paras: JsonParagraph[]): ArticleBlock[] {
  const blocks: ArticleBlock[] = [];
  for (const p of paras) {
    switch (p.para_type) {
      case 1:
      case 4: {
        const nodes = jsonNodesToInline(p.text?.nodes ?? []);
        if (nodes.length > 0) blocks.push({ type: 'p', nodes, quote: p.para_type === 4 });
        break;
      }
      case 2: {
        const pics = p.pic?.pics ?? [];
        for (const pic of pics) {
          if (pic.url) blocks.push({ type: 'img', src: pic.url, width: pic.width, height: pic.height });
        }
        break;
      }
      case 3: {
        const linePic = p.line?.pic;
        if (linePic?.url) blocks.push({ type: 'img', src: linePic.url, width: linePic.width, height: linePic.height });
        else blocks.push({ type: 'divider' });
        break;
      }
      case 5: {
        const items = (p.list?.items ?? []).map((it) => jsonNodesToInline(it.nodes ?? []));
        if (items.length > 0) blocks.push({ type: 'list', items });
        break;
      }
      case 7: {
        if (p.code?.content) blocks.push({ type: 'code', text: p.code.content });
        break;
      }
      case 8: {
        const text = jsonNodesToInline(p.heading?.nodes ?? []).map((n) => n.text ?? '').join('');
        if (text) blocks.push({ type: 'h2', text });
        break;
      }
      default:
        // para_type 6（link_card）等暂降级：有文本时按段落输出
        const nodes = jsonNodesToInline(p.text?.nodes ?? []);
        if (nodes.length > 0) blocks.push({ type: 'p', nodes });
        break;
    }
  }
  return blocks;
}

/* ================= 内联渲染 ================= */

const InlineNodes = memo(function InlineNodes({
  nodes,
  onOpenLink,
}: {
  nodes: InlineNode[];
  onOpenLink: (href?: string) => void;
}) {
  const colors = useThemeColors();
  const T = useType();
  return (
    <>
      {nodes.map((n, i) => {
        if (n.type === 'image') {
          return (
            <ExpoImage
              key={i}
              source={{ uri: n.src }}
              style={styles.inlineEmote}
              contentFit="contain"
              cachePolicy="memory-disk"
            />
          );
        }
        if (n.type === 'link') {
          return (
            <Text
              key={i}
              style={[T.body, styles.inlineLink, { color: colors.accent }]}
              onPress={() => onOpenLink(n.href)}>
              {n.text}
            </Text>
          );
        }
        return (
          <Text
            key={i}
            style={[
              T.body,
              styles.inlineText,
              { color: colors.textSecondary },
              n.style?.bold && { fontWeight: '700' },
              n.style?.italic && { fontStyle: 'italic' },
              n.style?.strike && { textDecorationLine: 'line-through' },
            ]}>
            {n.text}
          </Text>
        );
      })}
    </>
  );
});

/* ================= 组件 ================= */

export interface ArticleAuthor {
  name?: string;
  face?: string;
  mid?: number;
}

export interface ArticleReaderProps {
  title: string;
  author?: ArticleAuthor;
  publishTime?: number;
  /** HTML 格式正文 */
  content?: string;
  /** JSON 段落格式正文（data.opus.content） */
  paragraphs?: any[];
  /** 全文图片列表（用于全屏查看器，缺省从正文块收集） */
  images?: string[];
  /** 链接点击回调（父级决定 WebView / 站内路由） */
  onOpenLink?: (href?: string) => void;
}

export function ArticleReader({
  title,
  author,
  publishTime,
  content,
  paragraphs,
  images,
  onOpenLink,
}: ArticleReaderProps) {
  const colors = useThemeColors();
  const T = useType();
  const router = useRouter();

  /* 正文块：优先 JSON 段落，其次 HTML，最后空 */
  const blocks = useMemo(() => {
    if (Array.isArray(paragraphs) && paragraphs.length > 0) return jsonToBlocks(paragraphs as JsonParagraph[]);
    if (content) return nodeToBlocks(parseHtmlTree(content), []);
    return [];
  }, [paragraphs, content]);

  /* 查看器图片列表：优先外部传入，其次从正文收集 */
  const bodyImages = useMemo(() => {
    const list: string[] = [];
    const walk = (b: ArticleBlock) => {
      if (b.type === 'img') list.push(b.src);
      if (b.type === 'p') for (const n of b.nodes) if (n.type === 'image') list.push(n.src ?? '');
    };
    for (const b of blocks) walk(b);
    return list.filter(Boolean);
  }, [blocks]);
  const viewerImages = useMemo(() => {
    if (images && images.length > 0) return images;
    return bodyImages;
  }, [images, bodyImages]);

  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIdx, setViewerIdx] = useState(0);

  const openImage = useMemo(() => (src: string) => {
    if (viewerImages.length === 0) return;
    const idx = viewerImages.findIndex((u) => u === src);
    setViewerIdx(idx >= 0 ? idx : 0);
    setViewerVisible(true);
  }, [viewerImages]);

  const handleOpenLink = useMemo(() => (href?: string) => {
    if (!href) return;
    if (/^bilibili:\/\/space\/(\d+)/.test(href)) {
      const mid = href.match(/^bilibili:\/\/space\/(\d+)/)?.[1];
      if (mid) router.push(`/member/${mid}` as Href);
      return;
    }
    onOpenLink?.(href);
  }, [onOpenLink, router]);

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { backgroundColor: colors.bg }]}
        showsVerticalScrollIndicator={false}>
        {/* 标题 */}
        {title ? (
          <Text style={[T.title1, styles.title, { color: colors.text, fontWeight: '700' }]}>
            {title}
          </Text>
        ) : null}

        {/* 作者行 */}
        {author?.name || author?.mid ? (
          <Press
            haptic
            scaleTo={0.97}
            onPress={() => {
              if (author.mid) router.push(`/member/${author.mid}` as Href);
            }}
            style={styles.authorRow}>
            {author.face ? (
              <ExpoImage
                source={{ uri: biliCover(author.face, 80, 80) }}
                recyclingKey={author.face}
                cachePolicy="memory-disk"
                style={[styles.avatar, { backgroundColor: colors.fill2 }]}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: colors.fill2 }]} />
            )}
            <View style={styles.authorMeta}>
              <Text style={[T.subhead, { color: colors.text, fontWeight: '600' }]} numberOfLines={1}>
                {author.name || `用户${author.mid}`}
              </Text>
              {publishTime ? (
                <Text style={[T.caption1, { color: colors.textTertiary, marginTop: 2 }]}>
                  {formatDate(publishTime)}
                </Text>
              ) : null}
            </View>
          </Press>
        ) : null}

        <View style={[styles.articleBody, { borderTopColor: colors.separator }]}>
          {blocks.length === 0 ? (
            <Text style={[T.footnote, { color: colors.textTertiary, textAlign: 'center', paddingVertical: 40 }]}>
              正文为空或暂不支持解析该排版
            </Text>
          ) : (
            blocks.map((block, i) => <BlockView key={i} block={block} onOpenLink={handleOpenLink} onOpenImage={openImage} />)
          )}
        </View>
      </ScrollView>

      <ImageViewer
        visible={viewerVisible}
        images={viewerImages}
        initialIndex={viewerIdx}
        onClose={() => setViewerVisible(false)}
      />
    </>
  );
}

/* ================= 块级渲染 ================= */

function BlockView({
  block,
  onOpenLink,
  onOpenImage,
}: {
  block: ArticleBlock;
  onOpenLink: (href?: string) => void;
  onOpenImage: (src: string) => void;
}) {
  const colors = useThemeColors();
  const T = useType();
  switch (block.type) {
    case 'h1':
    case 'h2':
    case 'h3':
      return (
        <Text style={[T.title3, styles.heading, { color: colors.text, fontWeight: '700' }]}>
          {block.text}
        </Text>
      );
    case 'p':
      return (
        <View
          style={[
            styles.paragraph,
            block.quote && [styles.quote, { backgroundColor: colors.fill1, borderLeftColor: colors.border }],
            block.quote && continuous,
          ]}>
          <InlineNodes nodes={block.nodes} onOpenLink={onOpenLink} />
        </View>
      );
    case 'img':
      return <ArticleImageBlock block={block} onOpenImage={onOpenImage} />;
    case 'list':
      return (
        <View style={styles.listBlock}>
          {block.items.map((item, i) => (
            <View key={i} style={styles.listItem}>
              <View style={[styles.bullet, { backgroundColor: colors.textTertiary }]} />
              <View style={styles.listItemBody}>
                <InlineNodes nodes={item} onOpenLink={onOpenLink} />
              </View>
            </View>
          ))}
        </View>
      );
    case 'code':
      return (
        <View style={[styles.codeBlock, { backgroundColor: colors.fill1 }, continuous]}>
          <Text style={[T.footnote, styles.codeText, { color: colors.text }]}>{block.text}</Text>
        </View>
      );
    case 'divider':
      return <View style={[styles.divider, { backgroundColor: colors.separator }]} />;
    default:
      return null;
  }
}

function ArticleImageBlock({
  block,
  onOpenImage,
}: {
  block: Extract<ArticleBlock, { type: 'img' }>;
  onOpenImage: (src: string) => void;
}) {
  const colors = useThemeColors();
  const T = useType();
  const ratio = block.width && block.height && block.width > 0 ? block.width / block.height : 1.5;
  return (
    <Press haptic scaleTo={0.99} style={styles.imageWrap} onPress={() => onOpenImage(block.src)}>
      <ExpoImage
        source={{ uri: biliCover(block.src, 800) }}
        cachePolicy="memory-disk"
        style={[styles.image, { aspectRatio: ratio, backgroundColor: colors.fill2 }]}
        contentFit="contain"
        transition={150}
      />
      {block.caption ? (
        <Text style={[T.caption1, styles.imageCaption, { color: colors.textTertiary }]}>{block.caption}</Text>
      ) : null}
    </Press>
  );
}

/* ================= 样式 ================= */

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 120 },
  title: { letterSpacing: -0.3, lineHeight: 34 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16, marginBottom: 4 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarPlaceholder: { borderRadius: 20 },
  authorMeta: { flex: 1 },
  articleBody: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 16, marginTop: 12 },
  paragraph: { marginBottom: 14 },
  inlineText: { lineHeight: 26 },
  inlineLink: { lineHeight: 26, fontWeight: '500', textDecorationLine: 'underline' },
  inlineEmote: { width: 22, height: 22, marginHorizontal: 1 },
  quote: {
    borderLeftWidth: 4,
    borderRadius: RADII.xs,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 14,
  },
  heading: { marginTop: 22, marginBottom: 10, letterSpacing: -0.2 },
  imageWrap: { marginVertical: 8, alignItems: 'center' },
  image: { width: '100%', borderRadius: RADII.thumb },
  imageCaption: { marginTop: 6, textAlign: 'center' },
  listBlock: { marginBottom: 14, gap: 8 },
  listItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  bullet: { width: 6, height: 6, borderRadius: 3, marginTop: 9 },
  listItemBody: { flex: 1 },
  codeBlock: {
    borderRadius: RADII.sm,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginVertical: 8,
    overflow: 'hidden',
  },
  codeText: { fontFamily: 'Menlo', lineHeight: 20 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 14 },
});
