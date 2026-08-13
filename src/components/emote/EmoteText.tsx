/**
 * EmoteText —— 文本内表情渲染（对照 Flutter `EmoteSpan` / 动态 RICH_TEXT_NODE_TYPE_EMOJI）。
 *
 * RN iOS Fabric 的 <Text> 不支持嵌套 Image（无 NSTextAttachment 机制），
 * 因此这里采用「分片 + flexWrap 行」方案：把文本按 `[关键字]` 切段，
 * 命中表情映射的分片渲染为 inline 的 expo-image（对齐中部、尺寸跟随字号），
 * 未命中的分片保留为普通文本。整体为纯展示增强，不改变原文内容。
 *
 * 用法：
 *   <EmoteText text={message} emotes={emoteMap} style={[T.body, { color }]} />
 *
 * 可选 prefix：把「@昵称：」等前缀作为首片与正文同一行流动（用于楼中楼）。
 */
import { useMemo, type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { biliCover } from '@/utils/image-url';
import type { EmoteMap } from '@/api/emote';

/** [关键字] 匹配（括号内 1~32 个非空白非括号字符，覆盖 [tv_doge]/[微笑] 等常见形态） */
const EMOTE_TOKEN_RE = /\[([^\[\]\s]{1,32})\]/g;

/** 表情图片相对字号的比例（~1.4 倍 em，即 15pt 文本 → 20pt 表情，符合任务 20-24pt 区间） */
const EMOTE_SCALE = 1.4;

interface EmoteSegment {
  type: 'text' | 'emote';
  text: string;
  url?: string;
}

/** 把文本按表情映射切段；无映射或未命中任何表情时返回 null（直接走普通 Text 渲染） */
export function parseEmoteSegments(text: string, emotes?: EmoteMap | null): EmoteSegment[] | null {
  if (!text) return null;
  if (!emotes) return null;

  const segments: EmoteSegment[] = [];
  let lastIndex = 0;
  EMOTE_TOKEN_RE.lastIndex = 0;
  let matched = false;

  let m: RegExpExecArray | null;
  while ((m = EMOTE_TOKEN_RE.exec(text)) !== null) {
    const token = m[0];
    const url = emotes[token];
    if (!url) continue; // 未命中：当作普通文本
    if (m.index > lastIndex) {
      segments.push({ type: 'text', text: text.slice(lastIndex, m.index) });
    }
    segments.push({ type: 'emote', text: token, url });
    lastIndex = m.index + token.length;
    matched = true;
  }
  if (!matched) return null;

  if (lastIndex < text.length) {
    segments.push({ type: 'text', text: text.slice(lastIndex) });
  }
  return segments;
}

export function EmoteText({
  text,
  emotes,
  style,
  numberOfLines,
  prefix,
}: {
  /** 原始文本（可能含 [表情] 代码） */
  text: string;
  /** 表情映射表 `[关键字] → url`；为空/null 时回退纯文本渲染 */
  emotes?: EmoteMap | null;
  /** 文本样式（颜色/字号/行高跟随外部传入） */
  style?: StyleProp<TextStyle>;
  /** 行数限制（>0 生效） */
  numberOfLines?: number;
  /** 行首前缀（与正文同一行流动，如「@昵称：」） */
  prefix?: ReactNode;
}) {
  const segments = useMemo(() => parseEmoteSegments(text, emotes), [text, emotes]);

  const hasEmote = segments !== null && segments.length > 0;
  const hasPrefix = prefix != null;

  // 无表情命中：直接渲染普通 Text（保持原有布局/测量行为完全不变），前缀一并保留
  if (!hasEmote) {
    return (
      <Text style={style} numberOfLines={numberOfLines}>
        {prefix}
        {text}
      </Text>
    );
  }

  // 表情字号跟随文本 fontSize（缺省 15pt → 20pt 表情）
  const flatStyle = StyleSheet.flatten(style) || {};
  const fontSize = typeof flatStyle.fontSize === 'number' ? flatStyle.fontSize : 15;
  const emoteSize = Math.round(fontSize * EMOTE_SCALE);
  // 行高跟随文本行高，保证整行视觉高度不被图片撑破
  const lineHeight = typeof flatStyle.lineHeight === 'number' ? flatStyle.lineHeight : fontSize * 1.35;

  return (
    <View
      style={[
        styles.wrap,
        // 行数限制：用 maxHeight 近似行截断（RN 无 View 级 numberOfLines）
        numberOfLines != null && numberOfLines > 0
          ? { maxHeight: lineHeight * numberOfLines, overflow: 'hidden' }
          : null,
      ]}>
      {hasPrefix ? <Text style={style}>{prefix}</Text> : null}
      {segments!.map((seg, i) =>
        seg.type === 'emote' ? (
          <ExpoImage
            key={`e${i}`}
            source={{ uri: biliCover(seg.url!, Math.round(emoteSize * 2), Math.round(emoteSize * 2)) }}
            recyclingKey={seg.url}
            cachePolicy="memory-disk"
            style={[styles.emote, { width: emoteSize, height: emoteSize, marginVertical: (lineHeight - emoteSize) / 2 }]}
            contentFit="contain"
          />
        ) : (
          <Text key={`t${i}`} style={style}>
            {seg.text}
          </Text>
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  emote: {},
});
