import { memo, useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, ActionSheetIOS } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { userApi } from '@/api/user';
import { useAuthStore } from '@/stores/auth';
import { SkeletonRow } from '@/components/Skeleton';
import { LoginGate } from '@/components/LoginGate';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { RADII, continuous } from '@/theme/tokens';
import { showToast } from '@/utils/toast';
import { feedBackMedium, feedBackSuccess } from '@/utils/feedback';
import { fixedItemLayout } from '@/utils/list-layout';
import { NativeBottomSheet } from '@/components/NativeBottomSheet';
import EmptyState from '@/components/EmptyState';

const rowLayout = fixedItemLayout(58);

interface FollowTag {
  tagid: number;
  name: string;
  count?: number;
  tip?: string;
}

type TagDialog = { mode: 'create' } | { mode: 'rename'; tag: FollowTag };

/* ===== 分组行（memo：长按/移动闭包只在行内重建） ===== */
const FollowTagRow = memo(function FollowTagRow({
  item,
  index,
  tagsLength,
  colors,
  T,
  sortMode,
  customIdx,
  customTagsLength,
  onOpen,
  onOpenMenu,
  onMove,
}: {
  item: FollowTag;
  index: number;
  tagsLength: number;
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
  sortMode: boolean;
  customIdx: number;
  customTagsLength: number;
  onOpen: (tag: FollowTag) => void;
  onOpenMenu: (tag: FollowTag) => void;
  onMove: (tagid: number, dir: -1 | 1) => void;
}) {
  const custom = isCustomTag(item);
  const iconColor = item.tagid === -10 ? ACCENT : colors.textSecondary;
  return (
    <>
      <Press
        haptic
        scaleTo={0.98}
        onPress={() => onOpen(item)}
        onLongPress={custom ? () => onOpenMenu(item) : undefined}
        style={[styles.row, index < tagsLength - 1 && { borderBottomColor: colors.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}>
        <View style={[styles.tagIcon, { backgroundColor: colors.fill2 }]}>
          <Ionicons name={tagIconName(item)} size={18} color={iconColor} />
        </View>
        <View style={styles.tagInfo}>
          <Text style={[T.subhead, styles.tagName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
          {item.tip ? <Text style={[T.caption2, styles.tagTip, { color: colors.textTertiary }]} numberOfLines={1}>{item.tip}</Text> : null}
        </View>
        {sortMode ? (
          custom ? (
            <View style={styles.moveBtns}>
              <Press
                haptic
                scaleTo={0.9}
                disabled={customIdx <= 0}
                onPress={() => onMove(item.tagid, -1)}
                style={[styles.moveBtn, { backgroundColor: colors.fill2 }]}>
                <Ionicons name="chevron-up" size={14} color={customIdx <= 0 ? colors.textTertiary : colors.textSecondary} />
              </Press>
              <Press
                haptic
                scaleTo={0.9}
                disabled={customIdx >= customTagsLength - 1}
                onPress={() => onMove(item.tagid, 1)}
                style={[styles.moveBtn, { backgroundColor: colors.fill2 }]}>
                <Ionicons name="chevron-down" size={14} color={customIdx >= customTagsLength - 1 ? colors.textTertiary : colors.textSecondary} />
              </Press>
            </View>
          ) : (
            <Ionicons name="lock-closed-outline" size={15} color={colors.textTertiary} />
          )
        ) : (
          <>
            {item.count != null ? (
              <Text style={[T.caption1, styles.countText, { color: colors.textTertiary }]}>{item.count}</Text>
            ) : null}
            <Ionicons name="chevron-forward" size={16} color={colors.quaternaryLabel} />
          </>
        )}
      </Press>
    </>
  );
});

/* 自定义分组（tagid > 0 可改名/删除/排序；0=全部关注、-10=特别关注、-2=悄悄关注为默认） */
function isCustomTag(t: FollowTag): boolean {
  return t.tagid > 0;
}

function tagIconName(tag: FollowTag): keyof typeof Ionicons.glyphMap {
  if (tag.tagid === 0) return 'people-outline';
  if (tag.tagid === -10) return 'star';
  if (tag.tagid === -2) return 'eye-off-outline';
  return 'folder-outline';
}

export default function FollowTagsScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const T = useType();
  const { isLoggedIn } = useAuthStore();
  const [tags, setTags] = useState<FollowTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sortMode, setSortMode] = useState(false);
  const [sorting, setSorting] = useState(false);
  const [dialog, setDialog] = useState<TagDialog | null>(null);

  const customTags = tags.filter(isCustomTag);

  const loadTags = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    try {
      const res = await userApi.followTags();
      const list = (res?.data ?? []) as FollowTag[];
      /* 全部关注为固定首位；特别关注提到默认分组之后的最前，作为入口 */
      const sorted = [...list].sort((a, b) => {
        if (a.tagid === -10) return -1;
        if (b.tagid === -10) return 1;
        return 0;
      });
      setTags([{ tagid: 0, name: '全部关注' }, ...sorted]);
    } catch (e) {
      console.error('load follow tags error:', e);
      showToast('分组加载失败');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;
    const timer = setTimeout(() => { loadTags(); }, 0);
    return () => clearTimeout(timer);
  }, [isLoggedIn, loadTags]);

  const handleCreate = useCallback(async (tagName: string) => {
    setDialog(null);
    try {
      const res = await userApi.createFollowTag({ tag: tagName });
      if (res?.code === 0) {
        const tagid = res?.data?.tagid;
        if (typeof tagid === 'number' && Number.isInteger(tagid)) {
          setTags((prev) => [...prev, { tagid, name: tagName, count: 0 }]);
        }
        showToast('创建成功');
        feedBackSuccess();
      } else {
        showToast(res?.message || '创建失败');
      }
    } catch (e) {
      console.error('create follow tag error:', e);
      showToast('创建失败');
    }
  }, []);

  const handleRename = useCallback(async (tag: FollowTag, tagName: string) => {
    setDialog(null);
    try {
      const res = await userApi.updateFollowTag({ tagid: tag.tagid, name: tagName });
      if (res?.code === 0) {
        setTags((prev) => prev.map((t) => (t.tagid === tag.tagid ? { ...t, name: tagName } : t)));
        showToast('修改成功');
        feedBackSuccess();
      } else {
        showToast(res?.message || '修改失败');
      }
    } catch (e) {
      console.error('update follow tag error:', e);
      showToast('修改失败');
    }
  }, []);

  const doDelete = useCallback(async (tag: FollowTag) => {
    try {
      const res = await userApi.delFollowTag({ tagid: tag.tagid });
      if (res?.code === 0) {
        setTags((prev) => prev.filter((t) => t.tagid !== tag.tagid));
        showToast('删除成功');
        feedBackSuccess();
      } else {
        showToast(res?.message || '删除失败');
      }
    } catch (e) {
      console.error('del follow tag error:', e);
      showToast('删除失败');
    }
  }, []);

  const handleDelete = useCallback((tag: FollowTag) => {
    const message = `删除「${tag.name}」后，该分组下的用户依旧保留，是否继续？`;
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: '删除分组',
        message,
        options: ['删除', '取消'],
        cancelButtonIndex: 1,
        destructiveButtonIndex: 0,
      },
      (index) => {
        if (index === 0) void doDelete(tag);
      },
    );
  }, [doDelete]);

  const moveTag = useCallback((tagid: number, dir: -1 | 1) => {
    setTags((prev) => {
      const customs = prev.filter(isCustomTag);
      const defs = prev.filter((t) => !isCustomTag(t));
      const idx = customs.findIndex((t) => t.tagid === tagid);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= customs.length) return prev;
      const next = [...customs];
      const tmp = next[idx];
      next[idx] = next[target];
      next[target] = tmp;
      return [...defs, ...next];
    });
  }, []);

  const handleSortDone = useCallback(async () => {
    if (customTags.length === 0) {
      setSortMode(false);
      return;
    }
    setSorting(true);
    try {
      const res = await userApi.sortFollowTag({ tagids: customTags.map((t) => t.tagid).join(',') });
      if (res?.code === 0) {
        showToast('排序完成');
        feedBackSuccess();
        setSortMode(false);
      } else {
        showToast(res?.message || '排序失败');
      }
    } catch (e) {
      console.error('sort follow tag error:', e);
      showToast('排序失败');
    } finally {
      setSorting(false);
    }
  }, [customTags]);

  const openTag = useCallback((tag: FollowTag) => {
    if (tag.tagid === 0) {
      router.push({ pathname: '/follow', params: { type: 'following' } });
    } else {
      router.push({ pathname: '/follow', params: { type: 'following', tagid: String(tag.tagid), name: tag.name } });
    }
  }, [router]);

  const openTagMenu = useCallback((tag: FollowTag) => {
    feedBackMedium();
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: tag.name,
        options: ['修改名称', '删除分组', '取消'],
        cancelButtonIndex: 2,
        destructiveButtonIndex: 1,
      },
      (index) => {
        if (index === 0) {
          setDialog({ mode: 'rename', tag });
        } else if (index === 1) {
          handleDelete(tag);
        }
      },
    );
  }, [handleDelete]);

  const renderRow = useCallback(({ item, index }: { item: FollowTag; index: number }) => {
    const customIdx = customTags.findIndex((t) => t.tagid === item.tagid);
    return (
      <FollowTagRow
        item={item}
        index={index}
        tagsLength={tags.length}
        colors={colors}
        T={T}
        sortMode={sortMode}
        customIdx={customIdx}
        customTagsLength={customTags.length}
        onOpen={openTag}
        onOpenMenu={openTagMenu}
        onMove={moveTag}
      />
    );
  }, [colors, tags.length, T, customTags, sortMode, openTag, openTagMenu, moveTag]);

  if (!isLoggedIn) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <Stack.Title large>关注分组</Stack.Title>
        <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
        <LoginGate />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <Stack.Title large>关注分组</Stack.Title>
        <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
        <Stack.Toolbar placement="right">
          {sortMode ? (
            <Stack.Toolbar.Button disabled={sorting} onPress={handleSortDone}>完成</Stack.Toolbar.Button>
          ) : (
            <>
              <Stack.Toolbar.Button onPress={() => setDialog({ mode: 'create' })}>新建</Stack.Toolbar.Button>
              <Stack.Toolbar.Button onPress={() => setSortMode(true)}>排序</Stack.Toolbar.Button>
            </>
          )}
        </Stack.Toolbar>
        <FlashList
          data={tags}
          keyExtractor={(it) => String(it.tagid)}
          contentContainerStyle={[styles.listContent, tags.length > 0 && { backgroundColor: colors.card, borderRadius: RADII.lg, marginHorizontal: 14, marginTop: 12, ...continuous }]}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={() => { loadTags(true); }}
          estimatedItemSize={58}
          overrideItemLayout={rowLayout}
          drawDistance={250}
          overrideProps={{ initialDrawBatchSize: 10 }}
          ListEmptyComponent={
            loading ? null : (
              <EmptyState
                icon="folder-open-outline"
                title="暂无分组"
                subtitle="点击右上角「新建」创建关注分组"
              />
            )
          }
          renderItem={renderRow}
        />
        {loading && tags.length === 0 && (
          <View style={[styles.skeletonCard, { backgroundColor: colors.card }]}>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </View>
        )}
      </View>

      {/* 新建 / 改名输入框 */}
      {dialog && (
        <TagNameDialog
          title={dialog.mode === 'create' ? '新建分组' : '修改名称'}
          initial={dialog.mode === 'create' ? '' : dialog.tag.name}
          onCancel={() => setDialog(null)}
          onSubmit={(name) => {
            if (dialog.mode === 'create') handleCreate(name);
            else handleRename(dialog.tag, name);
          }}
        />
      )}
    </View>
  );
}

function TagNameDialog({ title, initial, onCancel, onSubmit }: {
  title: string;
  initial: string;
  onCancel: () => void;
  onSubmit: (name: string) => void;
}) {
  const colors = useThemeColors();
  const T = useType();
  const [name, setName] = useState(initial);
  const trimmed = name.trim();
  const submit = () => { if (trimmed) onSubmit(trimmed); };
  const content = (
    <Press style={[styles.dialogCard, { backgroundColor: colors.card }]} onPress={() => {}}>
      <Text style={[T.headline, styles.dialogTitle, { color: colors.text }]}>{title}</Text>
      <TextInput
        style={[styles.dialogInput, { backgroundColor: colors.fill2, color: colors.text }]}
        value={name}
        onChangeText={setName}
        maxLength={16}
        placeholder="分组名称"
        placeholderTextColor={colors.textTertiary}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={submit}
      />
      <View style={styles.dialogBtns}>
        <Press haptic scaleTo={0.96} style={[styles.dialogBtn, { backgroundColor: colors.fill2 }]} onPress={onCancel}>
          <Text style={[T.subhead, { color: colors.textSecondary }]}>取消</Text>
        </Press>
        <Press haptic scaleTo={0.96} style={[styles.dialogBtn, { backgroundColor: ACCENT, opacity: trimmed ? 1 : 0.5 }]} onPress={submit}>
          <Text style={[T.subhead, styles.dialogOkText]}>确定</Text>
        </Press>
      </View>
    </Press>
  );
  return (
    <NativeBottomSheet visible onClose={onCancel} detents={['medium']} dragIndicator="hidden">
      <View style={styles.nativeDialogWrap}>
        {content}
      </View>
    </NativeBottomSheet>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingBottom: 40 },
  /* 行 */
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  tagIcon: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center', ...continuous },
  tagInfo: { flex: 1, gap: 2 },
  tagName: { fontWeight: '600' },
  tagTip: {},
  countText: { fontWeight: '500' },
  moveBtns: { flexDirection: 'row', gap: 6 },
  moveBtn: { width: 30, height: 30, borderRadius: RADII.sm, justifyContent: 'center', alignItems: 'center', ...continuous },
  /* 骨架 */
  skeletonCard: { position: 'absolute', top: 12, left: 14, right: 14, borderRadius: RADII.lg, paddingHorizontal: 16, paddingTop: 4, ...continuous },
  /* 新建/改名对话框 */
  nativeDialogWrap: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 16, paddingBottom: 24 },
  dialogCard: { borderRadius: RADII.lg, padding: 18, gap: 14, ...continuous },
  dialogTitle: { fontWeight: '600', textAlign: 'center' },
  dialogInput: { borderRadius: RADII.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, ...continuous },
  dialogBtns: { flexDirection: 'row', gap: 10 },
  dialogBtn: { flex: 1, borderRadius: RADII.md, alignItems: 'center', paddingVertical: 11, ...continuous },
  dialogOkText: { color: '#FFFFFF', fontWeight: '600' },
});

