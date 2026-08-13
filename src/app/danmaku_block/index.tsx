import { useState, useEffect, useCallback, useRef, memo } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, KeyboardAvoidingView, ActionSheetIOS,
} from 'react-native';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { Stack, useScrollToTop } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Host, Picker, TextField, Text as SwiftText, useNativeState } from '@expo/ui/swift-ui';
import { pickerStyle, tag, submitLabel, autocorrectionDisabled } from '@expo/ui/swift-ui/modifiers';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { danmakuApi } from '@/api/danmaku';
import { useAuthStore } from '@/stores/auth';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RADII, continuous } from '@/theme/tokens';
import EmptyState from '@/components/EmptyState';

interface Rule { id: number; filter: string; }

/* B站用户屏蔽以 uid 的 CRC-32(IEEE) 十六进制存储，添加时需转换 */
function crc32Hex(str: string): string {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) & 0xFF;
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
  }
  return ((crc ^ 0xFFFFFFFF) >>> 0).toString(16);
}

const TABS = [
  { label: '关键词', type: 0, hint: '包含该词的弹幕将被屏蔽' },
  { label: '正则', type: 1, hint: '按正则表达式匹配屏蔽' },
  { label: '用户', type: 2, hint: '输入用户 UID，屏蔽其全部弹幕' },
];

/* ===== 规则行（memo：回收复用时不重建闭包） ===== */
const RuleRow = memo(function RuleRow({
  item,
  index,
  colors,
  T,
  activeTab,
  rulesLength,
  onDelete,
}: {
  item: Rule;
  index: number;
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
  activeTab: number;
  rulesLength: number;
  onDelete: (rule: Rule) => void;
}) {
  return (
    <View style={[styles.ruleRow, index < rulesLength - 1 && { borderBottomColor: colors.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <View style={[styles.ruleIconBox, { backgroundColor: colors.fill2 }]}>
        <Ionicons name={activeTab === 0 ? 'text' : activeTab === 1 ? 'code-slash' : 'person-circle'} size={15} color={colors.textSecondary} />
      </View>
      <Text style={[T.subhead, styles.ruleText, { color: colors.text }]} numberOfLines={2}>{item.filter}</Text>
      <Press haptic scaleTo={0.88} onPress={() => onDelete(item)} style={styles.delBtn}>
        <Ionicons name="close-circle" size={20} color={colors.textTertiary} />
      </Press>
    </View>
  );
});

export default function DanmakuBlockScreen() {
  const colors = useThemeColors();
  const T = useType();
  const insets = useSafeAreaInsets();
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const [rules, setRules] = useState<Rule[][]>([[], [], []]);
  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const inputText = useNativeState('');
  const listRef = useRef<FlashListRef<Rule>>(null);
  useScrollToTop(listRef);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await danmakuApi.filterList();
      if (res?.data) {
        const map = (arr: any[]) => (arr || []).map((r: any) => ({ id: r.id, filter: String(r.filter ?? '') }));
        setRules([map(res.data.rule0), map(res.data.rule1), map(res.data.rule2)]);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      if (isLoggedIn) load();
      else setLoading(false);
    }, 0);
    return () => clearTimeout(t);
  }, [isLoggedIn, load]);

  const addRule = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const filter = activeTab === 2 ? crc32Hex(text) : text;
      const res = await danmakuApi.filterAdd({ type: activeTab, filter });
      if (res?.code === 0) {
        const added: Rule = res.data?.id != null
          ? { id: res.data.id, filter: String(res.data.filter ?? filter) }
          : { id: Date.now(), filter };
        setRules((prev) => { const n = [...prev]; n[activeTab] = [...n[activeTab], added]; return n; });
        setInput('');
        inputText.set( '');
      }
    } catch {
    } finally {
      setBusy(false);
    }
  }, [input, busy, activeTab]);

  const delRule = useCallback(async (rule: Rule) => {
    try {
      const res = await danmakuApi.filterDel({ ids: String(rule.id) });
      if (res?.code === 0) {
        setRules((prev) => { const n = [...prev]; n[activeTab] = n[activeTab].filter((r) => r.id !== rule.id); return n; });
      }
    } catch {}
  }, [activeTab]);

  const confirmDelete = useCallback((rule: Rule) => {
    const message = `确定删除「${rule.filter}」？`;
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: '删除屏蔽规则',
        message,
        options: ['删除', '取消'],
        cancelButtonIndex: 1,
        destructiveButtonIndex: 0,
      },
      (index) => {
        if (index === 0) void delRule(rule);
      },
    );
  }, [delRule]);

  const activeRules = rules[activeTab];

  /* renderItem memo：FlashList v2 按引用相等性跳过单元格重渲染 */
  const renderRule = useCallback(
    ({ item, index }: { item: Rule; index: number }) => (
      <RuleRow item={item} index={index} colors={colors} T={T} activeTab={activeTab} rulesLength={activeRules.length} onDelete={confirmDelete} />
    ),
    [colors, activeRules.length, activeTab, T, confirmDelete],
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ title: '弹幕屏蔽', headerShown: true, headerLargeTitle: false }} />
      <Stack.Title large>弹幕屏蔽</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        {/* 类型切换 */}
        <View style={{ paddingHorizontal: 14, paddingTop: 12 }}>
          <Host matchContents>
            <Picker label="" selection={activeTab}
              onSelectionChange={(v) => { setActiveTab(Number(v)); setInput(''); inputText.set( ''); }}
              modifiers={[pickerStyle('segmented')]}>
              {TABS.map((t, i) => <SwiftText key={t.type} modifiers={[tag(i)]}>{t.label}</SwiftText>)}
            </Picker>
          </Host>
        </View>
        <Text style={[T.caption1, styles.tabHint, { color: colors.textTertiary }]}>{TABS[activeTab].hint}</Text>

        <FlashList
          ref={listRef}
          data={isLoggedIn ? activeRules : []}
          keyExtractor={(it) => String(it.id)}
          contentContainerStyle={[styles.listContent, isLoggedIn && activeRules.length > 0 && { backgroundColor: colors.card, borderRadius: RADII.lg, marginHorizontal: 14, marginTop: 10, ...continuous }]}
          showsVerticalScrollIndicator={false}
          estimatedItemSize={52}
          drawDistance={250}
          overrideProps={{ initialDrawBatchSize: 10 }}
          ListEmptyComponent={
            loading ? null : (
              <EmptyState
                icon={isLoggedIn ? 'ban' : 'lock-closed'}
                title={isLoggedIn ? '暂无屏蔽规则' : '请先登录'}
                subtitle={isLoggedIn ? `添加${TABS[activeTab].label}规则，净化弹幕环境` : '登录后可管理弹幕屏蔽'}
              />
            )
          }
          renderItem={renderRule}
        />
        {isLoggedIn && loading && (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={colors.textTertiary} />
          </View>
        )}

        {/* 添加栏 */}
        {isLoggedIn && (
          <View style={[styles.inputBar, { backgroundColor: colors.card, borderTopColor: colors.separator, paddingBottom: insets.bottom + 8 }]}>
            <View style={[styles.inputField, { backgroundColor: colors.fill2 }]}>
              <Host matchContents>
                <TextField
                  placeholder={TABS[activeTab].hint}
                  text={inputText}
                  onTextChange={(value) => { setInput(value); }}
                  modifiers={[submitLabel('done'), autocorrectionDisabled()]}
                />
              </Host>
            </View>
            <Press
              haptic
              scaleTo={0.9}
              disabled={!input.trim() || busy}
              onPress={addRule}
              style={[styles.addBtn, { backgroundColor: input.trim() && !busy ? ACCENT : colors.fill2 }]}>
              <Ionicons name="add" size={18} color={input.trim() && !busy ? '#FFFFFF' : colors.textTertiary} />
              <Text style={[T.footnote, styles.addBtnText, { color: input.trim() && !busy ? '#FFFFFF' : colors.textTertiary, fontWeight: '600' }]}>添加</Text>
            </Press>
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  tabHint: { paddingHorizontal: 16, paddingTop: 8 },
  listContent: { paddingHorizontal: 14, paddingBottom: 24 },
  /* 规则行 */
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 2 },
  ruleIconBox: { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  ruleText: { flex: 1 },
  delBtn: { padding: 4 },
  /* 加载 */
  loadingWrap: { paddingTop: 90, alignItems: 'center' },
  /* 添加栏 */
  inputBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  inputField: { flex: 1, borderRadius: RADII.lg, paddingHorizontal: 14, paddingVertical: 7, ...continuous },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADII.md, ...continuous },
  addBtnText: {},
});
