import { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { msgApi } from '@/api/msg';
import { Press, Reveal } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { RADII, continuous } from '@/theme/tokens';
import { feedBackSuccess } from '@/utils/feedback';
import { showToast } from '@/utils/toast';
import EmptyState from '@/components/EmptyState';
import ErrorState from '@/components/ErrorState';

export default function WhisperBlockScreen() {
  const colors = useThemeColors();
  const T = useType();
  const [items, setItems] = useState<string[]>([]);
  const [keyword, setKeyword] = useState('');
  const [listLimit, setListLimit] = useState<number | undefined>(undefined);
  const [charLimit, setCharLimit] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await msgApi.keywordBlockingList();
      setItems(res?.items || []);
      setListLimit(res?.listLimit);
      setCharLimit(res?.charLimit);
    } catch (e) {
      console.error('keyword blocking list error:', e);
      setError('加载失败，请重试');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { load(); }, 0);
    return () => clearTimeout(t);
  }, [load]);

  const addKeyword = useCallback(async () => {
    const kw = keyword.trim();
    if (!kw || busy) return;
    if (charLimit && kw.length > charLimit) {
      showToast(`最多 ${charLimit} 个字符`);
      return;
    }
    if (listLimit && items.length >= listLimit) {
      showToast('屏蔽词数量已达上限');
      return;
    }
    setBusy(true);
    try {
      const res = await msgApi.keywordBlockingAdd(kw);
      setItems((prev) => prev.includes(kw) ? prev : [...prev, kw]);
      setKeyword('');
      feedBackSuccess();
      showToast(res?.toast || '添加成功');
    } catch (e) {
      console.error('keyword blocking add error:', e);
      showToast('添加失败');
    } finally {
      setBusy(false);
    }
  }, [keyword, busy, charLimit, listLimit, items.length]);

  const removeKeyword = useCallback((kw: string) => {
    Alert.alert('删除屏蔽词', `该屏蔽词将不再生效：${kw}`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          try {
            const res = await msgApi.keywordBlockingDelete(kw);
            setItems((prev) => prev.filter((x) => x !== kw));
            feedBackSuccess();
            showToast(res?.toast || '删除成功');
          } catch {
            showToast('删除失败');
          }
        },
      },
    ]);
  }, []);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Title large>消息屏蔽词</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <View style={styles.toolbar}>
        <View style={[styles.inputRow, { backgroundColor: colors.searchBg }]}>
          <Ionicons name="ban-outline" size={16} color={colors.textTertiary} />
          <TextInput
            value={keyword}
            onChangeText={setKeyword}
            placeholder="输入要屏蔽的词"
            placeholderTextColor={colors.textTertiary}
            maxLength={charLimit || 20}
            returnKeyType="done"
            onSubmitEditing={addKeyword}
            style={[T.footnote, styles.input, { color: colors.text }]}
          />
          <Press haptic scaleTo={0.92} onPress={addKeyword} disabled={busy || !keyword.trim()} style={[styles.addBtn, { backgroundColor: keyword.trim() ? ACCENT : colors.fill3 }]}>
            <Ionicons name="add" size={17} color={keyword.trim() ? '#FFFFFF' : colors.textTertiary} />
          </Press>
        </View>
        <View style={styles.hintRow}>
          <Text style={[T.caption1, { color: colors.textSecondary }]}>点击屏蔽词即可删除</Text>
          {listLimit != null ? (
            <Text style={[T.caption1, { color: colors.textTertiary }]}>{items.length}/{listLimit}</Text>
          ) : null}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator size="small" color={colors.textTertiary} style={{ marginTop: 40 }} />
        ) : error ? (
          <ErrorState title={typeof error === 'string' ? error : '加载失败'} onRetry={load} />
        ) : items.length === 0 ? (
          <EmptyState
            icon="ban-outline"
            title="还未添加屏蔽词"
            subtitle="添加后，将不再接受包含屏蔽词的消息"
          />
        ) : (
          <View style={styles.chipWrap}>
            {items.map((kw, index) => (
              <Reveal key={kw} delay={Math.min(index, 10) * 30} distance={8}>
                <Press haptic scaleTo={0.94} onPress={() => removeKeyword(kw)} style={[styles.chip, { backgroundColor: colors.fill2 }, continuous]}>
                  <Text style={[T.footnote, styles.chipText, { color: colors.text }]}>{kw}</Text>
                  <Ionicons name="close" size={13} color={colors.textTertiary} />
                </Press>
              </Reveal>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  toolbar: { paddingHorizontal: 14, paddingTop: 10, gap: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 42, borderRadius: RADII.md, paddingHorizontal: 12, ...continuous },
  input: { flex: 1, paddingVertical: 0 },
  addBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  hintRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2 },
  scrollContent: { padding: 14, paddingBottom: 50 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADII.circle, ...continuous },
  chipText: { fontWeight: '500' },
});
