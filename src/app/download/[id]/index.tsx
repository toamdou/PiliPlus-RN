/**
 * 单任务分 P 详情（对齐 Flutter download/detail）。
 * - 多 P 视频：展示分 P 列表 + 每 P 状态（完成/下载中/暂停/失败）+ 单独播放/删除/暂停/恢复/重试；
 * - 单 P 视频：展示任务本身并复用同一套操作；
 * - 支持按清晰度与多选分 P 补下未下载的分 P（下载仍是"缓存当前流 URL"模型，
 *   清晰度选择作用于所选 P 的取流 URL）。
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Host, useThemeColors } from '@/components/SwiftUIHost';
import { BILI } from '@/theme/bili-colors';
import { RADII, continuous, shadow } from '@/theme/tokens';
import { useType } from '@/components/type-scale';
import { Press } from '@/components/motion';
import {
  downloadVideoParts,
  getDownloadTask,
  getTaskParts,
  pauseTask,
  removeDownload,
  resumeTask,
  retryDownload,
  subscribeDownloadsChanged,
  type DownloadItem,
  type DownloadPartMeta,
} from '@/utils/download';
import { videoApi } from '@/api/video';
import { useSettingsStore } from '@/stores/settings';
import { formatDuration } from '@/utils/format';
import { showToast } from '@/utils/toast';
import { biliCover } from '@/utils/image-url';
import EmptyState from '@/components/EmptyState';

/* 清晰度档位（qn），对齐设置页 defaultQuality 常用档 */
const QUALITY_OPTIONS: { qn: number; label: string }[] = [
  { qn: 80, label: '1080P' },
  { qn: 64, label: '720P' },
  { qn: 32, label: '480P' },
  { qn: 16, label: '360P' },
];

function qualityLabel(qn?: number): string {
  if (!qn) return '默认画质';
  return QUALITY_OPTIONS.find((o) => o.qn === qn)?.label ?? `${qn}P`;
}

const STATUS_TEXT: Record<DownloadItem['status'], string> = {
  done: '已下载',
  downloading: '下载中',
  paused: '已暂停',
  error: '下载失败',
};

export default function DownloadDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = String(params.id || '');
  const colors = useThemeColors();
  const T = useType();
  const [task, setTask] = useState<DownloadItem | null>(null);
  const [parts, setParts] = useState<DownloadItem[]>([]);
  const [fullParts, setFullParts] = useState<DownloadPartMeta[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [quality, setQuality] = useState<number>(() => {
    const dq = useSettingsStore.getState().defaultQuality;
    return QUALITY_OPTIONS.some((o) => o.qn === dq) ? dq : 80;
  });
  const [selectedExtra, setSelectedExtra] = useState<Set<number>>(new Set());
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    if (!id) {
      setLoaded(true);
      return;
    }
    const t = await getDownloadTask(id);
    setTask(t);
    if (!t) {
      setParts([]);
      setFullParts([]);
      setLoaded(true);
      return;
    }
    const p = await getTaskParts(id);
    setParts(p);
    // 多 P 视频拉取全集分 P 列表（补齐未下载分 P 的 cid，供"下载其他分P"用）
    if (p.length > 1 || (t.bvid && typeof t.partCount === 'number' && t.partCount > 1)) {
      try {
        const res = await videoApi.pagelist({ bvid: t.bvid, aid: t.aid });
        const pages = (res?.data || []).map((x: any) => ({
          cid: x.cid,
          part: x.part || `P${x.page}`,
          duration: x.duration || 0,
        }));
        setFullParts(pages);
      } catch {
        setFullParts([]);
      }
    } else {
      setFullParts([]);
    }
    setLoaded(true);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => subscribeDownloadsChanged(() => { void load(); }), [load]);

  const existingCids = new Set(
    parts.map((p) => p.cid).filter((c): c is number => typeof c === 'number'),
  );
  const missingParts = fullParts.filter((p) => !existingCids.has(p.cid));

  const handlePlay = useCallback((item: DownloadItem) => {
    if (item.status !== 'done' || !item.path) {
      showToast('文件未下载完成');
      return;
    }
    router.push({ pathname: '/download/player', params: { uri: item.path, title: item.title } } as any);
  }, [router]);

  const handleDelete = useCallback((item: DownloadItem) => {
    Alert.alert('删除下载', `确定删除“${item.partTitle || item.title}”吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          await removeDownload(item.id);
          await load();
        },
      },
    ]);
  }, [load]);

  const handleRetry = useCallback(async (item: DownloadItem) => {
    const ok = await retryDownload(item);
    showToast(ok ? '已重新加入下载' : '重试失败');
    await load();
  }, [load]);

  const handlePause = useCallback(async (item: DownloadItem) => {
    await pauseTask(item.id);
    showToast('已暂停');
  }, []);

  const handleResume = useCallback(async (item: DownloadItem) => {
    await resumeTask(item.id);
    showToast('已恢复下载');
  }, []);

  const toggleExtra = useCallback((cid: number) => {
    setSelectedExtra((prev) => {
      const next = new Set(prev);
      if (next.has(cid)) next.delete(cid);
      else next.add(cid);
      return next;
    });
  }, []);

  const startExtra = useCallback(async () => {
    if (!task || selectedExtra.size === 0) return;
    setStarting(true);
    try {
      const res = await downloadVideoParts({
        bvid: task.bvid,
        aid: task.aid,
        title: task.title,
        pic: task.pic,
        author: task.author,
        taskId: task.taskId ?? task.bvid,
        parts: fullParts,
        selectedCids: Array.from(selectedExtra),
        quality,
      });
      showToast(res.failed > 0 ? `已加入 ${res.ok} 个，失败 ${res.failed} 个` : `已加入 ${res.ok} 个分P`);
    } catch {
      showToast('下载失败');
    }
    setStarting(false);
    setSelectedExtra(new Set());
    await load();
  }, [task, selectedExtra, fullParts, quality, load]);

  const renderPartActions = useCallback((item: DownloadItem) => {
    const del = (
      <Press haptic scaleTo={0.88} onPress={() => handleDelete(item)} style={styles.iconBtn}>
        <Ionicons name="trash-outline" size={18} color={colors.textTertiary} />
      </Press>
    );
    if (item.status === 'done') {
      return (
        <>
          <Press haptic scaleTo={0.88} onPress={() => handlePlay(item)} style={[styles.iconBtn, { backgroundColor: 'rgba(52,199,89,0.14)' }]}>
            <Ionicons name="play" size={18} color="#34C759" />
          </Press>
          {del}
        </>
      );
    }
    if (item.status === 'downloading') {
      return (
        <>
          <Press haptic scaleTo={0.88} onPress={() => handlePause(item)} style={styles.iconBtn}>
            <Ionicons name="pause" size={18} color={colors.textSecondary} />
          </Press>
          {del}
        </>
      );
    }
    if (item.status === 'paused') {
      return (
        <>
          <Press haptic scaleTo={0.88} onPress={() => handleResume(item)} style={styles.iconBtn}>
            <Ionicons name="play" size={18} color={colors.textSecondary} />
          </Press>
          {del}
        </>
      );
    }
    return (
      <>
        <Press haptic scaleTo={0.88} onPress={() => handleRetry(item)} style={[styles.iconBtn, { backgroundColor: 'rgba(255,59,48,0.12)' }]}>
          <Ionicons name="refresh" size={18} color="#FF3B30" />
        </Press>
        {del}
      </>
    );
  }, [colors, handleDelete, handlePlay, handlePause, handleResume, handleRetry]);

  const renderPart = useCallback((item: DownloadItem, index: number) => {
    const partNo = (item.partIndex ?? index) + 1;
    const title = item.partTitle || (parts.length > 1 ? `P${partNo}` : task?.title || item.title);
    const progress = typeof item.progress === 'number' ? item.progress : 0;
    const showProgress = item.status === 'downloading' || item.status === 'paused';
    return (
      <View key={item.id} style={[styles.partRow, { backgroundColor: colors.card }, shadow('sm', colors.isDark)]}>
        <View style={[styles.partIndex, { backgroundColor: colors.fill2 }]}>
          <Text style={[T.caption1, { color: colors.textSecondary, fontWeight: '700' }]}>{partNo}</Text>
        </View>
        <View style={styles.partInfo}>
          <Text style={[T.subhead, { color: colors.text }]} numberOfLines={2}>{title}</Text>
          <View style={styles.partMeta}>
            <Ionicons
              name={item.status === 'done' ? 'checkmark-circle' : item.status === 'error' ? 'alert-circle' : item.status === 'paused' ? 'pause-circle' : 'hourglass'}
              size={14}
              color={item.status === 'done' ? '#34C759' : item.status === 'error' ? '#FF3B30' : item.status === 'paused' ? '#FF9F0A' : colors.textTertiary}
            />
            <Text style={[T.caption1, { color: colors.textTertiary }]}>{STATUS_TEXT[item.status]}</Text>
          </View>
          {showProgress ? (
            <View style={[styles.progressTrack, { backgroundColor: colors.fill2 }]}>
              <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%`, backgroundColor: colors.accent }]} />
            </View>
          ) : null}
        </View>
        <View style={styles.partActions}>{renderPartActions(item)}</View>
      </View>
    );
  }, [colors, T, parts.length, task, renderPartActions]);

  return (
    <Host style={{ flex: 1 }} useViewportSizeMeasurement>
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <Stack.Title large>{task?.title || '下载详情'}</Stack.Title>
        <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
        {!loaded ? null : !task ? (
          <EmptyState icon="file-tray-outline" title="下载不存在" subtitle="该下载已被删除或失效" />
        ) : (
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* 头部卡片：封面 + 标题 + UP 主 + 画质 */}
            <View style={[styles.header, { backgroundColor: colors.card }, shadow('sm', colors.isDark)]}>
              {task.pic ? (
                <ExpoImage source={{ uri: biliCover(task.pic, 320, 200) }} recyclingKey={task.pic} cachePolicy="memory-disk" style={[styles.cover, { backgroundColor: colors.fill2 }]} contentFit="cover" />
              ) : (
                <View style={[styles.cover, { backgroundColor: colors.fill2, justifyContent: 'center', alignItems: 'center' }]}>
                  <Ionicons name="videocam-outline" size={28} color={colors.textTertiary} />
                </View>
              )}
              <View style={styles.headerInfo}>
                <Text style={[T.headline, { color: colors.text }]} numberOfLines={2}>{task.title}</Text>
                {task.author ? (
                  <Text style={[T.caption1, { color: colors.textSecondary }]} numberOfLines={1}>UP：{task.author}</Text>
                ) : null}
                <View style={styles.headerMeta}>
                  <Text style={[T.caption1, { color: colors.textTertiary }]}>{qualityLabel(task.quality)}</Text>
                  {typeof task.partCount === 'number' && task.partCount > 1 ? (
                    <Text style={[T.caption1, { color: colors.textTertiary }]}>{`共 ${task.partCount} 个分P`}</Text>
                  ) : null}
                </View>
              </View>
            </View>

            {/* 分P 列表（多 P 视频）或单任务操作 */}
            <Text style={[T.subhead, styles.sectionTitle, { color: colors.text }]}>
              {parts.length > 1 ? `分P（${parts.length}）` : '下载任务'}
            </Text>
            <View style={styles.partList}>
              {parts.map((p, i) => renderPart(p, i))}
            </View>

            {/* 下载其他分P（多选 + 清晰度选择） */}
            {missingParts.length > 0 ? (
              <>
                <Text style={[T.subhead, styles.sectionTitle, { color: colors.text }]}>下载其他分P</Text>
                <View style={[styles.panel, { backgroundColor: colors.card }, shadow('sm', colors.isDark)]}>
                  <View style={styles.qualityRow}>
                    <Text style={[T.caption1, { color: colors.textSecondary }]}>清晰度</Text>
                    <View style={styles.qualityChips}>
                      {QUALITY_OPTIONS.map((o) => (
                        <Press
                          key={o.qn}
                          haptic
                          scaleTo={0.94}
                          onPress={() => setQuality(o.qn)}
                          style={[styles.chip, { backgroundColor: quality === o.qn ? BILI.pink : colors.fill2 }]}>
                          <Text style={[T.caption1, { color: quality === o.qn ? '#FFFFFF' : colors.textSecondary, fontWeight: quality === o.qn ? '700' : '500' }]}>
                            {o.label}
                          </Text>
                        </Press>
                      ))}
                    </View>
                  </View>
                  <View style={styles.missingList}>
                    {missingParts.map((p, i) => (
                      <Press key={p.cid} haptic scaleTo={0.98} onPress={() => toggleExtra(p.cid)} style={[styles.missingRow, { backgroundColor: selectedExtra.has(p.cid) ? BILI.pinkDim : colors.fill2 }]}>
                        <View style={styles.missingIndex}>
                          <Text style={[T.caption1, { color: colors.textSecondary, fontWeight: '700' }]}>{(fullParts.findIndex((fp) => fp.cid === p.cid)) + 1}</Text>
                        </View>
                        <View style={styles.missingInfo}>
                          <Text style={[T.footnote, { color: colors.text }]} numberOfLines={1}>{p.part}</Text>
                          {p.duration && p.duration > 0 ? (
                            <Text style={[T.caption2, { color: colors.textTertiary }]}>{formatDuration(p.duration)}</Text>
                          ) : null}
                        </View>
                        <Ionicons
                          name={selectedExtra.has(p.cid) ? 'checkmark-circle' : 'ellipse-outline'}
                          size={22}
                          color={selectedExtra.has(p.cid) ? colors.accent : colors.textTertiary}
                        />
                      </Press>
                    ))}
                  </View>
                  <Press
                    haptic
                    scaleTo={0.95}
                    onPress={startExtra}
                    disabled={starting || selectedExtra.size === 0}
                    style={[styles.startBtn, { backgroundColor: selectedExtra.size > 0 && !starting ? colors.accent : colors.fill2 }]}>
                    <Text style={[T.subhead, { color: selectedExtra.size > 0 && !starting ? '#FFFFFF' : colors.textTertiary, fontWeight: '600' }]}>
                      {starting ? '正在加入…' : selectedExtra.size > 0 ? `开始下载（${selectedExtra.size}）` : '请选择分P'}
                    </Text>
                  </Press>
                </View>
              </>
            ) : null}
          </ScrollView>
        )}
      </View>
    </Host>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 40, gap: 10 },
  header: { flexDirection: 'row', gap: 12, padding: 10, borderRadius: RADII.md },
  cover: { width: 120, height: 76, borderRadius: RADII.thumb, ...continuous },
  headerInfo: { flex: 1, gap: 6, justifyContent: 'center' },
  headerMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { marginTop: 4, fontWeight: '600' },
  partList: { gap: 8 },
  partRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: RADII.md },
  partIndex: { width: 34, height: 34, borderRadius: RADII.sm, alignItems: 'center', justifyContent: 'center', ...continuous },
  partInfo: { flex: 1, gap: 6 },
  partMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  progressTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  partActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconBtn: { width: 34, height: 34, borderRadius: RADII.circle, alignItems: 'center', justifyContent: 'center' },
  panel: { padding: 12, borderRadius: RADII.md, gap: 12 },
  qualityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  qualityChips: { flexDirection: 'row', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADII.circle, ...continuous },
  missingList: { gap: 8 },
  missingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: RADII.sm },
  missingIndex: { width: 26, height: 26, borderRadius: RADII.xs, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.06)' },
  missingInfo: { flex: 1, gap: 2 },
  startBtn: { alignItems: 'center', paddingVertical: 11, borderRadius: RADII.md, ...continuous },
});
