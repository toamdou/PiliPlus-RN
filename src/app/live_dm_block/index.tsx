/**
 * live_dm_block —— 直播间弹幕屏蔽管理（对齐 Flutter lib/pages/live_dm_block）。
 *
 * 数据流（字段核对 Flutter LiveHttp）：
 *  - 拉取：liveApi.infoByUser({ room_id }) → data.shield_info
 *      （keyword_list / shield_user_list / shield_rules{level,rank,verify}）；
 *  - 屏蔽词：liveApi.addShieldKeyword / liveApi.delShieldKeyword（form body：keyword + csrf）；
 *  - 屏蔽用户：liveApi.shieldUser（form body：uid + roomid + type，type=1 屏蔽 / type=0 解除）；
 *  - 禁言规则：liveApi.setSilent（form body：type=rank|verify + level，level 1 开启 / 0 关闭）。
 */
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, TextInput } from 'react-native';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { Stack, useLocalSearchParams, useScrollToTop } from 'expo-router';
import { Host, Picker, Text as SwiftText, ConfirmationDialog, Button as SwiftButton } from '@expo/ui/swift-ui';
import { pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors, useAccent } from '@/components/SwiftUIHost';
import { IoSToggle } from '@/components/IoSToggle';
import { liveApi } from '@/api/live';
import { useAuthStore } from '@/stores/auth';
import { showToast } from '@/utils/toast';
import { feedBack, feedBackSuccess } from '@/utils/feedback';
import { LoginGate } from '@/components/LoginGate';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { RADII, continuous, shadow } from '@/theme/tokens';
import { fixedItemLayout } from '@/utils/list-layout';

const ruleLayout = fixedItemLayout(52);

interface ShieldUser {
  uid: number;
  uname: string;
}

type DeleteTarget = { kind: 'keyword'; value: string } | { kind: 'user'; value: ShieldUser };

/* ===== 屏蔽规则行（memo：关键词/用户共用，按 getItemType 复用） ===== */
const LiveDmRuleRow = memo(function LiveDmRuleRow({
  item,
  index,
  colors,
  T,
  activeTab,
  onDelete,
}: {
  item: string | ShieldUser;
  index: number;
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
  activeTab: number;
  onDelete: (item: string | ShieldUser) => void;
}) {
  return (
    <>
      <View style={[styles.ruleRow, index > 0 && { borderTopColor: colors.separator, borderTopWidth: StyleSheet.hairlineWidth }]}>
        <View style={[styles.ruleIconBox, { backgroundColor: colors.fill2 }]}>
          <Ionicons name={activeTab === 0 ? 'text' : 'person-circle'} size={15} color={colors.textSecondary} />
        </View>
        <Text style={[T.subhead, styles.ruleText, { color: colors.text }]} numberOfLines={1}>
          {typeof item === 'string' ? item : item.uname || String(item.uid)}
        </Text>
        <Press haptic scaleTo={0.88} onPress={() => onDelete(item)} style={styles.delBtn}>
          <Ionicons name="close-circle" size={20} color={colors.textTertiary} />
        </Press>
      </View>
    </>
  );
});

const TABS = [
  { label: '关键词', hint: '输入要屏蔽的弹幕关键词' },
  { label: '用户', hint: '输入用户 UID，屏蔽其全部弹幕' },
];

export default function LiveDmBlockScreen() {
  const colors = useThemeColors();
  const accent = useAccent();
  const T = useType();
  const insets = useSafeAreaInsets();
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const { isLoggedIn } = useAuthStore();
  const [activeTab, setActiveTab] = useState(0);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [users, setUsers] = useState<ShieldUser[]>([]);
  const [rankOn, setRankOn] = useState(false);
  const [verifyOn, setVerifyOn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  /* 删除确认目标（屏蔽词 / 屏蔽用户） */
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const listRef = useRef<FlashListRef<string | ShieldUser>>(null);
  useScrollToTop(listRef);

  const rid = roomId ? parseInt(roomId, 10) : 0;

  const load = useCallback(async () => {
    if (!rid) return;
    setLoading(true);
    try {
      const res = await liveApi.infoByUser({ room_id: rid });
      if (res?.code === 0) {
        const info = res.data?.shield_info;
        setKeywords(info?.keyword_list ?? []);
        setUsers(info?.shield_user_list ?? []);
        setRankOn(info?.shield_rules?.rank === 1);
        setVerifyOn(info?.shield_rules?.verify === 1);
      } else {
        showToast(res?.message || '屏蔽信息加载失败');
      }
    } catch (e) {
      console.error('liveDmBlock load error:', e);
      showToast('屏蔽信息加载失败');
    } finally {
      setLoading(false);
    }
  }, [rid]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (isLoggedIn) load();
      else setLoading(false);
    }, 0);
    return () => clearTimeout(timer);
  }, [isLoggedIn, load]);

  /* ===== 屏蔽词 ===== */
  const addKeyword = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const res = await liveApi.addShieldKeyword({ keyword: text });
      if (res?.code === 0) {
        setKeywords((prev) => [text, ...prev]);
        setInput('');
        feedBackSuccess();
      } else {
        showToast(res?.message || '添加失败');
      }
    } catch (e) {
      console.error('addShieldKeyword error:', e);
      showToast('添加失败');
    } finally {
      setBusy(false);
    }
  }, [input, busy]);

  const delKeyword = useCallback(
    (keyword: string) => {
      setDeleteTarget({ kind: 'keyword', value: keyword });
    },
    [],
  );

  /* ===== 屏蔽用户 ===== */
  const shieldUser = useCallback(
    async (uid: number, type: number) => {
      const res = await liveApi.shieldUser({ uid, roomid: rid, type });
      return res;
    },
    [rid],
  );

  const addUser = useCallback(async () => {
    const text = input.trim();
    const uid = parseInt(text, 10);
    if (!text || isNaN(uid) || busy) return;
    setBusy(true);
    try {
      const res = await shieldUser(uid, 1);
      if (res?.code === 0) {
        const added = res.data?.uid != null
          ? { uid: res.data.uid, uname: res.data.uname || String(uid) }
          : { uid, uname: String(uid) };
        setUsers((prev) => [added, ...prev.filter((u) => u.uid !== uid)]);
        setInput('');
        feedBackSuccess();
      } else {
        showToast(res?.message || '屏蔽失败');
      }
    } catch (e) {
      console.error('shieldUser add error:', e);
      showToast('屏蔽失败');
    } finally {
      setBusy(false);
    }
  }, [input, busy, shieldUser]);

  const delUser = useCallback(
    (user: ShieldUser) => {
      setDeleteTarget({ kind: 'user', value: user });
    },
    [],
  );

  /* 确认删除：屏蔽词 / 解除屏蔽用户 */
  const confirmDelete = useCallback(async () => {
    const target = deleteTarget;
    if (!target) return;
    setDeleteTarget(null);
    try {
      if (target.kind === 'keyword') {
        const res = await liveApi.delShieldKeyword({ keyword: target.value });
        if (res?.code === 0) {
          setKeywords((prev) => prev.filter((k) => k !== target.value));
          feedBackSuccess();
        } else {
          showToast(res?.message || '删除失败');
        }
      } else {
        const res = await shieldUser(target.value.uid, 0);
        if (res?.code === 0) {
          setUsers((prev) => prev.filter((u) => u.uid !== target.value.uid));
          feedBackSuccess();
        } else {
          showToast(res?.message || '解除失败');
        }
      }
    } catch (e) {
      console.error('liveDmBlock delete error:', e);
      showToast(target.kind === 'keyword' ? '删除失败' : '解除失败');
    }
  }, [deleteTarget, shieldUser]);

  /* ===== 禁言规则（非正式会员 / 未绑定手机） ===== */
  const setSilentRule = useCallback(
    async (type: 'rank' | 'verify', level: number, setState: (v: boolean) => void) => {
      try {
        const res = await liveApi.setSilent({ type, level });
        if (res?.code === 0) {
          setState(level === 1);
          feedBack();
        } else {
          showToast(res?.message || '设置失败');
        }
      } catch (e) {
        console.error('liveSetSilent error:', e);
        showToast('设置失败');
      }
    },
    [],
  );

  const data = activeTab === 0 ? keywords : users;

  const handleDelete = useCallback(
    (item: string | ShieldUser) => {
      if (typeof item === 'string') delKeyword(item);
      else delUser(item);
    },
    [delKeyword, delUser],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: string | ShieldUser; index: number }) => (
      <LiveDmRuleRow item={item} index={index} colors={colors} T={T} activeTab={activeTab} onDelete={handleDelete} />
    ),
    [colors, T, activeTab, handleDelete],
  );

  const getItemType = useCallback((item: string | ShieldUser) => (typeof item === 'string' ? 'keyword' : 'user'), []);

  if (!isLoggedIn) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <Stack.Title large>弹幕屏蔽</Stack.Title>
        <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
        <LoginGate />
      </View>
    );
  }

  return (
    <Host style={{ flex: 1 }} useViewportSizeMeasurement>
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <Stack.Title large>弹幕屏蔽</Stack.Title>
        <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        {/* 全局屏蔽规则 */}
        <View style={[styles.rulesCard, { backgroundColor: colors.card }, shadow('sm', colors.isDark)]}>
          <Text style={[T.caption1, styles.rulesTitle, { color: colors.textTertiary }]}>全局屏蔽</Text>
          <View style={styles.switchRow}>
            <Text style={[T.subhead, { color: colors.text }]}>屏蔽非正式会员</Text>
            <IoSToggle
              value={rankOn}
              onValueChange={(v) => setSilentRule('rank', v ? 1 : 0, setRankOn)}
            />
          </View>
          <View style={[styles.switchRow, { borderTopColor: colors.separator, borderTopWidth: StyleSheet.hairlineWidth }]}>
            <Text style={[T.subhead, { color: colors.text }]}>屏蔽未绑定手机用户</Text>
            <IoSToggle
              value={verifyOn}
              onValueChange={(v) => setSilentRule('verify', v ? 1 : 0, setVerifyOn)}
            />
          </View>
        </View>

        {/* 关键词 / 用户切换 */}
        <View style={styles.tabRow}>
          <Host matchContents>
            <Picker
              label=""
              selection={activeTab}
              onSelectionChange={(v) => { setActiveTab(Number(v)); setInput(''); }}
              modifiers={[pickerStyle('segmented')]}>
              {TABS.map((t, i) => <SwiftText key={t.label} modifiers={[tag(i)]}>{t.label}</SwiftText>)}
            </Picker>
          </Host>
        </View>

        <FlashList
          ref={listRef}
          data={data}
          keyExtractor={(it, idx) => (typeof it === 'string' ? it : String(it.uid)) || String(idx)}
          contentContainerStyle={[
            styles.listContent,
            data.length > 0 && { backgroundColor: colors.card, borderRadius: RADII.lg, marginHorizontal: 14, ...continuous },
          ]}
          showsVerticalScrollIndicator={false}
          estimatedItemSize={52}
          overrideItemLayout={ruleLayout}
          drawDistance={250}
          overrideProps={{ initialDrawBatchSize: 10 }}
          getItemType={getItemType}
          ListEmptyComponent={
            loading ? null : (
              <View style={styles.emptyWrap}>
                <View style={[styles.emptyIconBox, { backgroundColor: colors.fill2 }]}>
                  <Ionicons name="ban" size={36} color={colors.textTertiary} />
                </View>
                <Text style={[T.headline, styles.emptyTitle, { color: colors.text }]}>
                  {activeTab === 0 ? '暂无屏蔽词' : '暂无屏蔽用户'}
                </Text>
                <Text style={[T.footnote, styles.emptySub, { color: colors.textSecondary }]}>
                  {TABS[activeTab].hint}
                </Text>
              </View>
            )
          }
          renderItem={renderItem}
        />

        {/* 添加栏 */}
        <View style={[styles.inputBar, { backgroundColor: colors.card, borderTopColor: colors.separator, paddingBottom: insets.bottom + 8 }]}>
          <View style={[styles.inputField, { backgroundColor: colors.fill2 }]}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder={TABS[activeTab].hint}
              placeholderTextColor={colors.textTertiary}
              style={[styles.textInput, { color: colors.text }]}
              keyboardType={activeTab === 1 ? 'number-pad' : 'default'}
              maxLength={activeTab === 0 ? 20 : 16}
            />
          </View>
          <Press
            haptic
            scaleTo={0.9}
            disabled={!input.trim() || busy}
            onPress={activeTab === 0 ? addKeyword : addUser}
            style={[styles.addBtn, { backgroundColor: input.trim() && !busy ? accent : colors.fill2 }]}>
            <Ionicons name="add" size={18} color={input.trim() && !busy ? '#FFFFFF' : colors.textTertiary} />
            <Text style={[T.footnote, styles.addBtnText, { color: input.trim() && !busy ? '#FFFFFF' : colors.textTertiary, fontWeight: '600' }]}>添加</Text>
          </Press>
        </View>
      </KeyboardAvoidingView>
      </View>
      {/* 删除确认 → SwiftUI ConfirmationDialog */}
      <ConfirmationDialog
        title={deleteTarget?.kind === 'keyword' ? '删除屏蔽词' : '解除屏蔽'}
        isPresented={!!deleteTarget}
        onIsPresentedChange={(v) => { if (!v) setDeleteTarget(null); }}
        titleVisibility="visible">
        <ConfirmationDialog.Trigger>
          <SwiftButton label="" onPress={() => {}} />
        </ConfirmationDialog.Trigger>
        <ConfirmationDialog.Actions>
          <SwiftButton
            label={deleteTarget?.kind === 'keyword' ? '删除' : '解除'}
            role="destructive"
            onPress={confirmDelete}
          />
          <SwiftButton label="取消" role="cancel" />
        </ConfirmationDialog.Actions>
        <ConfirmationDialog.Message>
          <SwiftText>
            {deleteTarget?.kind === 'keyword'
              ? `确定删除「${deleteTarget.value}」？`
              : deleteTarget?.kind === 'user'
                ? `确定解除对「${deleteTarget.value.uname}」的屏蔽？`
                : ''}
          </SwiftText>
        </ConfirmationDialog.Message>
      </ConfirmationDialog>
    </Host>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  /* 全局屏蔽卡 */
  rulesCard: { marginHorizontal: 14, marginTop: 12, borderRadius: RADII.lg, paddingHorizontal: 16, ...continuous },
  rulesTitle: { marginTop: 12, marginBottom: 2 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 9 },
  /* 分段切换 */
  tabRow: { paddingHorizontal: 14, paddingTop: 12, marginBottom: 2 },
  /* 列表 */
  listContent: { paddingHorizontal: 14, paddingBottom: 24 },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 14 },
  ruleIconBox: { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  ruleText: { flex: 1 },
  delBtn: { padding: 4 },
  /* 空态 */
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingTop: 80, paddingHorizontal: 40, gap: 8 },
  emptyIconBox: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  emptyTitle: { fontWeight: '600' },
  emptySub: { textAlign: 'center' },
  /* 添加栏 */
  inputBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  inputField: { flex: 1, borderRadius: RADII.lg, paddingHorizontal: 14, paddingVertical: 8, ...continuous },
  textInput: { fontSize: 14.5, paddingVertical: 0 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADII.md, ...continuous },
  addBtnText: {},
});

