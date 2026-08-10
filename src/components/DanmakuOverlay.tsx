import { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useSettingsStore } from '@/stores/settings';
import { useAuthStore } from '@/stores/auth';
import { danmakuApi } from '@/api/danmaku';
import { formatDuration } from '@/utils/format';
import { showToast } from '@/utils/toast';
import { PiliPlayer } from 'pili-player';
import { createNativeRequestCancelToken } from '@/utils/request-cancel';
import {
  bindPlayer,
  cancelDanmakuLoadAsync,
  loadAndPrepareDanmakuAsync,
  PiliDanmakuOverlay,
  type DanmakuLoadOptions,
  type DanmakuTapEvent,
  type PreparedDanmaku,
} from 'pili-danmaku';

/** 顶部/底部弹幕停留秒数（对齐 Flutter danmakuStaticDuration 默认 4.0） */
const STATIC_DURATION = 4;
/** 常驻弹幕列表上限（只保留最近 6000 条，控制内存） */
const MAX_RESIDENT_DANMAKU = 6000;
/** 高能进度条分桶粒度（秒） */
const DENSITY_BUCKET_SEC = 10;
/** 低于该密度比例的分桶不显示标记 */
const DENSITY_MIN_LEVEL = 0.35;
export interface DanmakuDensityMarker {
  start: number;
  end: number;
  level: number;
}

interface Props {
  cid: number;
  visible?: boolean;
  /** 弹幕显示区域高度（默认 220），由 video/[id].tsx 按播放器布局高度 ×0.6 传入 */
  height?: number;
  /** 弹幕区顶部偏移（状态栏高度）：播放器槽位含状态栏区域时，弹幕从状态栏下方开始，避免画进状态栏 */
  topInset?: number;
  /** 视频总时长（秒）：>0 时走 protobuf 分段弹幕（含 dmid/彩色标记），否则回退 legacy XML */
  duration?: number;
  /** 点击弹幕菜单里的跳转时间 */
  onSeek?: (time: number) => void;
  /** 高能进度条密度标记（showDmChart 开启时回调给父级进度条渲染） */
  onDensityChange?: (markers: DanmakuDensityMarker[]) => void;
}

interface FilterRules {
  keywords: string[];
  regexps: RegExp[];
  users: Set<string>;
}

type DanmakuMenuItem = {
  id: string;
  text: string;
  time: number;
};

const EMPTY_FILTER_RULES: FilterRules = {
  keywords: [],
  regexps: [],
  users: new Set(),
};

const EMPTY_PREPARED: PreparedDanmaku = { items: [], density: [] };

const DM_REPORT_REASONS = [
  { label: '违法违规', reason: 1 },
  { label: '垃圾广告', reason: 2 },
  { label: '色情低俗', reason: 3 },
  { label: '引战/人身攻击', reason: 4 },
];

async function loadFilterRules(onLoaded: (rules: FilterRules) => void) {
  try {
    const res = await danmakuApi.filterList();
    const data = res?.data as any;
    if (!data) return;
    const collected: { type?: number; filter?: string }[] = [];
    if (Array.isArray(data.rule)) collected.push(...data.rule);
    (['rule0', 'rule1', 'rule2'] as const).forEach((key, idx) => {
      if (Array.isArray(data[key])) {
        for (const r of data[key]) collected.push({ type: idx, filter: r?.filter });
      }
    });
    const keywords: string[] = [];
    const regexps: RegExp[] = [];
    const users = new Set<string>();
    for (const r of collected) {
      const f = String(r.filter ?? '').trim();
      if (!f) continue;
      if (r.type === 1) {
        try {
          regexps.push(new RegExp(f.replace(/^\/(.*)\/$/, '$1'), 'i'));
        } catch {
          // 非法正则忽略
        }
      } else if (r.type === 2) {
        users.add(f);
      } else {
        keywords.push(f);
      }
    }
    onLoaded({ keywords, regexps, users });
  } catch {
    // 未登录或拉取失败时不过滤
  }
}

/**
 * 弹幕覆盖层组件：分段拉取、protobuf/XML 解析、过滤/合并/去重/密度统计与上屏条目
 * 全部在原生 `pili-danmaku` 完成，JS 只提交 cid、规则输入与渲染设置。
 */
export function DanmakuOverlay({
  cid,
  visible = true,
  height = 220,
  topInset = 0,
  duration = 0,
  onSeek,
  onDensityChange,
}: Props) {
  const [filterRules, setFilterRules] = useState<FilterRules>(EMPTY_FILTER_RULES);
  const [dmMenu, setDmMenu] = useState<{ item: DanmakuMenuItem; report: boolean } | null>(null);
  const [prepared, setPrepared] = useState<PreparedDanmaku>(EMPTY_PREPARED);

  // 订阅渲染所需设置（设置页改动可实时生效）
  const dmEnabled = useSettingsStore((s) => s.danmakuEnabled);
  const mergeDanmaku = useSettingsStore((s) => s.mergeDanmaku);
  const dmOpacity = useSettingsStore((s) => s.danmakuOpacity);
  const dmFontSize = useSettingsStore((s) => s.danmakuFontSize);
  const dmSpeed = useSettingsStore((s) => s.danmakuSpeed);
  const dmLineHeight = useSettingsStore((s) => s.danmakuLineHeight);
  const showVipDm = useSettingsStore((s) => s.showVipDanmaku);
  const showChart = useSettingsStore((s) => s.showDmChart);
  const tapDm = useSettingsStore((s) => s.enableTapDm);
  const { isLoggedIn } = useAuthStore();

  // 原生路径绑定共享 AVPlayer 作为弹幕时钟源，时间由原生媒体时钟驱动。
  useEffect(() => {
    bindPlayer(PiliPlayer.shared.getSharedPlayerId());
  }, []);

  // cid / 开关 / 过滤规则 / 时长变化时由原生一次性拉取并准备；切换或卸载即取消。
  useEffect(() => {
    if (!cid || !dmEnabled || duration <= 0) {
      return;
    }
    let cancelled = false;
    const token = createNativeRequestCancelToken();
    const options: DanmakuLoadOptions = {
      duration,
      merge: mergeDanmaku,
      keywords: filterRules.keywords,
      regexps: filterRules.regexps.map((re) => re.source),
      users: [...filterRules.users],
      showVipDm,
      dmFontSize,
      dmSpeed,
      staticDuration: STATIC_DURATION,
      maxResident: MAX_RESIDENT_DANMAKU,
      densityBucketSec: DENSITY_BUCKET_SEC,
      densityMinLevel: DENSITY_MIN_LEVEL,
      skipCookies: useAuthStore.getState().anonymousMode,
    };
    token.onAbort(() => {
      cancelDanmakuLoadAsync(token.id);
    });
    loadAndPrepareDanmakuAsync(cid, options, token.id)
      .then((result) => {
        if (!cancelled && !token.aborted) setPrepared(result);
      })
      .catch(() => {
        if (!cancelled && !token.aborted) setPrepared(EMPTY_PREPARED);
      });
    return () => {
      cancelled = true;
      token.abort();
    };
  }, [
    cid,
    dmEnabled,
    dmFontSize,
    dmSpeed,
    duration,
    filterRules,
    mergeDanmaku,
    showVipDm,
  ]);

  // 拉取用户弹幕屏蔽列表
  useEffect(() => {
    if (!cid) return;
    let cancelled = false;
    loadFilterRules((rules) => {
      if (!cancelled) setFilterRules(rules);
    });
    return () => {
      cancelled = true;
    };
  }, [cid]);

  const activePrepared = !dmEnabled || duration <= 0 ? EMPTY_PREPARED : prepared;

  // 高能进度条密度标记：showDmChart 开启时回传给父级进度条渲染
  const densityMarkers = useMemo(
    () => (showChart && dmEnabled && duration > 0 ? prepared.density : []),
    [dmEnabled, duration, prepared.density, showChart],
  );
  useEffect(() => {
    onDensityChange?.(densityMarkers);
    return () => onDensityChange?.([]);
  }, [densityMarkers, onDensityChange]);

  /* ===== 点击弹幕菜单：点赞 / 复制 / 举报 / 跳转时间 ===== */
  async function likeDanmaku(item: DanmakuMenuItem) {
    if (!isLoggedIn) {
      showToast('请先登录');
      return;
    }
    try {
      const res = await danmakuApi.like({ oid: cid, dmid: item.id, op: 1 });
      if (res?.code === 0) showToast('已点赞');
      else showToast(res?.message || '点赞失败');
    } catch {
      showToast('点赞失败');
    }
  }

  async function copyDanmaku(text: string) {
    try {
      await Clipboard.setStringAsync(text);
      showToast('已复制');
    } catch {
      showToast('复制失败');
    }
  }

  async function submitDanmakuReport(item: DanmakuMenuItem, reason: number) {
    if (!isLoggedIn) {
      showToast('请先登录');
      return;
    }
    try {
      const res = await danmakuApi.report({ oid: cid, dmid: item.id, reason });
      if (res?.code === 0) showToast('举报已提交');
      else showToast(res?.message || '举报失败');
    } catch {
      showToast('举报失败');
    }
  }

  function reportDanmaku(item: DanmakuMenuItem) {
    if (!isLoggedIn) {
      setDmMenu(null);
      showToast('请先登录');
      return;
    }
    setDmMenu({ item, report: true });
  }

  const handleNativeDanmakuTap = useCallback((event: DanmakuTapEvent) => {
    if (!tapDm) return;
    setDmMenu({
      item: {
        id: String(event.id),
        text: event.text,
        time: event.time,
      },
      report: false,
    });
  }, [tapDm]);

  const dmMenuLayer = dmMenu ? (
    <View style={styles.dmMenuLayer} pointerEvents="auto">
      <Pressable style={StyleSheet.absoluteFill} onPress={() => setDmMenu(null)} />
      <View style={styles.dmMenuCard}>
        <Text style={styles.dmMenuTitle} numberOfLines={2}>{dmMenu.item.text}</Text>
        {dmMenu.report ? (
          <>
            {DM_REPORT_REASONS.map((r) => (
              <Pressable
                key={r.reason}
                style={styles.dmMenuBtn}
                onPress={() => {
                  submitDanmakuReport(dmMenu.item, r.reason);
                  setDmMenu(null);
                }}>
                <Text style={styles.dmMenuText}>{r.label}</Text>
              </Pressable>
            ))}
            <Pressable
              style={styles.dmMenuBtn}
              onPress={() => setDmMenu({ item: dmMenu.item, report: false })}>
              <Text style={[styles.dmMenuText, { color: 'rgba(255,255,255,0.65)' }]}>返回</Text>
            </Pressable>
          </>
        ) : (
          <View style={styles.dmMenuRow}>
            <Pressable
              style={styles.dmMenuBtn}
              onPress={() => {
                likeDanmaku(dmMenu.item);
                setDmMenu(null);
              }}>
              <Text style={styles.dmMenuText}>点赞</Text>
            </Pressable>
            <Pressable
              style={styles.dmMenuBtn}
              onPress={() => {
                copyDanmaku(dmMenu.item.text);
                setDmMenu(null);
              }}>
              <Text style={styles.dmMenuText}>复制</Text>
            </Pressable>
            <Pressable
              style={styles.dmMenuBtn}
              onPress={() => reportDanmaku(dmMenu.item)}>
              <Text style={styles.dmMenuText}>举报</Text>
            </Pressable>
            {onSeek && (
              <Pressable
                style={styles.dmMenuBtn}
                onPress={() => {
                  onSeek(dmMenu.item.time);
                  setDmMenu(null);
                }}>
                <Text style={styles.dmMenuText}>跳转 {formatDuration(dmMenu.item.time)}</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    </View>
  ) : null;

  if (!dmEnabled || !visible) return null;

  return (
    <View style={[styles.container, { top: topInset, height }]}>
      <PiliDanmakuOverlay
        style={StyleSheet.absoluteFill}
        items={activePrepared.items}
        visible
        density={1}
        height={height}
        opacity={dmOpacity}
        speed={dmSpeed}
        lineHeight={dmLineHeight}
        interactive={tapDm}
        pointerEvents={tapDm ? 'auto' : 'none'}
        onDanmakuTap={handleNativeDanmakuTap}
      />
      {dmMenuLayer}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
  },
  dmMenuLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dmMenuCard: {
    minWidth: 220,
    maxWidth: '92%',
    backgroundColor: 'rgba(20,20,22,0.94)',
    borderRadius: 8,
    padding: 10,
    gap: 6,
  },
  dmMenuTitle: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 2,
  },
  dmMenuRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'center',
  },
  dmMenuBtn: {
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
  },
  dmMenuText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
});
