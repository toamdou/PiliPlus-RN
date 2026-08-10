import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { dynamicsApi, type VoteCreateInfo } from '@/api/dynamics';
import { useAuthStore } from '@/stores/auth';
import { feedBackSuccess } from '@/utils/feedback';
import { showToast } from '@/utils/toast';
import { formatDate } from '@/utils/format';
import { RADII, continuous, shadow } from '@/theme/tokens';

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 10;
const MIN_END_DELAY_MS = 5 * 60 * 1000;
const MAX_END_DELAY_MS = 90 * 24 * 60 * 60 * 1000;
const APP_START_TIME = Date.now();

export default function CreateVoteScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ voteId?: string }>();
  const colors = useThemeColors();
  const T = useType();
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const userInfo = useAuthStore((s) => s.userInfo);
  const voteId = params.voteId ? Number(params.voteId) : undefined;
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [multi, setMulti] = useState(false);
  const [choiceCnt, setChoiceCnt] = useState(1);
  const [endTime, setEndTime] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d;
  });
  const [loadingInfo, setLoadingInfo] = useState(Boolean(voteId));
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!voteId) return;
    const timer = setTimeout(async () => {
      try {
        const res = await dynamicsApi.voteInfo({ vote_id: voteId });
        const vi = res?.data?.vote_info ?? res?.data;
        if (!vi?.vote_id) {
          setLoadError('无效的投票 ID');
          return;
        }
        setTitle(vi.title ?? '');
        setDesc(vi.desc ?? '');
        const loaded = (vi.options ?? []).map((o: any) => o?.opt_desc ?? '').slice(0, MAX_OPTIONS);
        const loadedChoiceCnt = Math.min(
          Math.max(1, vi.choice_cnt ?? 1),
          Math.max(MIN_OPTIONS, loaded.length),
        );
        setChoiceCnt(loadedChoiceCnt);
        setMulti(loadedChoiceCnt > 1);
        setOptions(loaded.length >= MIN_OPTIONS ? loaded.slice(0, MAX_OPTIONS) : ['', '']);
        if (vi.end_time) setEndTime(new Date(vi.end_time * 1000));
        setLoadError('');
      } catch (e) {
        console.error('vote info error:', e);
        setLoadError('投票信息加载失败');
      } finally {
        setLoadingInfo(false);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [voteId]);

  const canSave = useMemo(() => {
    if (loadingInfo || loadError) return false;
    if (!title.trim()) return false;
    if (options.length < MIN_OPTIONS || options.some((o) => !o.trim())) return false;
    return endTime.getTime() - APP_START_TIME >= MIN_END_DELAY_MS;
  }, [endTime, loadError, loadingInfo, options, title]);

  const addOption = useCallback(() => {
    setOptions((prev) => (prev.length >= MAX_OPTIONS ? prev : [...prev, '']));
  }, []);

  const removeOption = useCallback((index: number) => {
    setOptions((prev) => (prev.length <= MIN_OPTIONS ? prev : prev.filter((_, i) => i !== index)));
    const nextLen = Math.max(MIN_OPTIONS, options.length - 1);
    if (choiceCnt > nextLen) setChoiceCnt(nextLen);
  }, [choiceCnt, options.length]);

  const setOption = useCallback((index: number, value: string) => {
    setOptions((prev) => prev.map((o, i) => (i === index ? value : o)));
  }, []);

  const handleSave = useCallback(async () => {
    if (!isLoggedIn) {
      router.push('/login' as any);
      return;
    }
    if (!canSave) {
      showToast('请填写标题、选项和截止时间');
      return;
    }
    setSaving(true);
    try {
      const duration = Math.max(
        MIN_END_DELAY_MS / 1000,
        Math.floor((endTime.getTime() - Date.now()) / 1000),
      );
      const voteInfo: VoteCreateInfo = {
        title: title.trim(),
        desc: desc.trim(),
        type: 0,
        choice_cnt: multi ? Math.max(2, choiceCnt) : 1,
        duration,
        options: options.map((o) => ({ opt_desc: o.trim(), img_url: '' })),
        only_fans_level: 0,
        vote_publisher: userInfo?.mid ?? 0,
        ...(voteId ? { vote_id: voteId } : {}),
      };
      const res = voteId
        ? await dynamicsApi.updateVote({ vote_info: voteInfo })
        : await dynamicsApi.createVote({ vote_info: voteInfo });
      if (res?.code !== 0) {
        showToast(res?.message || '保存失败');
        return;
      }
      feedBackSuccess();
      showToast(voteId ? '投票已更新' : '投票已创建');
      router.back();
    } catch (e) {
      console.error('save vote error:', e);
      showToast('保存失败，请重试');
    } finally {
      setSaving(false);
    }
  }, [canSave, endTime, isLoggedIn, multi, choiceCnt, options, router, title, desc, userInfo, voteId]);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ title: voteId ? '编辑投票' : '创建投票', headerBackButtonDisplayMode: 'minimal' }} />
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {loadingInfo ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="small" color={colors.textTertiary} />
          </View>
        ) : loadError ? (
          <View style={styles.loadingWrap}>
            <Ionicons name="cloud-offline-outline" size={34} color={colors.textTertiary} />
            <Text style={[T.subhead, { color: colors.text }]}>{loadError}</Text>
          </View>
        ) : (
          <>
            <View style={[styles.card, { backgroundColor: colors.card, ...shadow('sm', colors.isDark) }]}>
              <Text style={[T.footnote, styles.label, { color: colors.textSecondary }]}>投票标题</Text>
              <TextInput
                style={[styles.input, { color: colors.text }]}
                placeholder="请填写标题"
                placeholderTextColor={colors.textTertiary}
                value={title}
                onChangeText={setTitle}
                maxLength={32}
              />
            </View>

            <View style={[styles.card, { backgroundColor: colors.card, ...shadow('sm', colors.isDark) }]}>
              <Text style={[T.footnote, styles.label, { color: colors.textSecondary }]}>投票说明（可选）</Text>
              <TextInput
                style={[styles.input, { color: colors.text }]}
                placeholder="补充说明"
                placeholderTextColor={colors.textTertiary}
                value={desc}
                onChangeText={setDesc}
                maxLength={100}
              />
            </View>

            <View style={[styles.card, { backgroundColor: colors.card, ...shadow('sm', colors.isDark) }]}>
              <Text style={[T.footnote, styles.label, { color: colors.textSecondary }]}>投票选项</Text>
              {options.map((opt, index) => (
                <View key={index} style={styles.optionRow}>
                  <Text style={[T.caption1, styles.optionIndex, { color: colors.textTertiary }]}>
                    {index + 1}
                  </Text>
                  <TextInput
                    style={[styles.optionInput, { color: colors.text }]}
                    placeholder={`选项${index + 1}，最多20字`}
                    placeholderTextColor={colors.textTertiary}
                    value={opt}
                    onChangeText={(v) => setOption(index, v)}
                    maxLength={20}
                  />
                  {options.length > MIN_OPTIONS ? (
                    <Press hitSlop={8} onPress={() => removeOption(index)}>
                      <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
                    </Press>
                  ) : null}
                </View>
              ))}
              {options.length < MAX_OPTIONS ? (
                <Press haptic scaleTo={0.94} onPress={addOption} style={[styles.addBtn, { borderColor: colors.separator }]}>
                  <Ionicons name="add" size={14} color={colors.textSecondary} />
                  <Text style={[T.caption1, { color: colors.textSecondary }]}>添加选项</Text>
                </Press>
              ) : null}
            </View>

            <View style={[styles.card, { backgroundColor: colors.card, ...shadow('sm', colors.isDark) }]}>
              <Text style={[T.footnote, styles.label, { color: colors.textSecondary }]}>选项规则</Text>
              <View style={[styles.segmented, { backgroundColor: colors.fill3 }]}>
                <Press
                  onPress={() => { setMulti(false); setChoiceCnt(1); }}
                  style={[styles.segItem, !multi && styles.segItemActive]}>
                  <Text style={[T.caption1, { color: multi ? colors.textSecondary : '#FFFFFF' }]}>单选</Text>
                </Press>
                <Press
                  onPress={() => { setMulti(true); setChoiceCnt((prev) => Math.max(2, prev)); }}
                  style={[styles.segItem, multi && styles.segItemActive]}>
                  <Text style={[T.caption1, { color: multi ? '#FFFFFF' : colors.textSecondary }]}>
                    {multi && choiceCnt > 2 ? `最多选${choiceCnt}项` : '最多选2项'}
                  </Text>
                </Press>
              </View>
            </View>

            <View style={[styles.card, { backgroundColor: colors.card, ...shadow('sm', colors.isDark) }]}>
              <Text style={[T.footnote, styles.label, { color: colors.textSecondary }]}>截止时间</Text>
              <Text style={[T.caption1, { color: colors.textTertiary, marginBottom: 8 }]}>
                当前：{formatDate(Math.floor(endTime.getTime() / 1000))}（至少 5 分钟后）
              </Text>
              <View style={styles.pickerRow}>
                <Text style={[T.caption1, styles.pickerLabel, { color: colors.textSecondary }]}>日期</Text>
                <DateTimePicker
                  value={endTime}
                  mode="date"
                  display="compact"
                  presentation="inline"
                  minimumDate={new Date(APP_START_TIME + MIN_END_DELAY_MS)}
                  maximumDate={new Date(APP_START_TIME + MAX_END_DELAY_MS)}
                  accentColor={ACCENT}
                  onValueChange={(_, date) => {
                    const next = new Date(date);
                    next.setHours(endTime.getHours(), endTime.getMinutes(), 0, 0);
                    setEndTime(next);
                  }}
                />
              </View>
              <View style={styles.pickerRow}>
                <Text style={[T.caption1, styles.pickerLabel, { color: colors.textSecondary }]}>时间</Text>
                <DateTimePicker
                  value={endTime}
                  mode="time"
                  display="compact"
                  presentation="inline"
                  accentColor={ACCENT}
                  onValueChange={(_, date) => {
                    const next = new Date(endTime);
                    next.setHours(date.getHours(), date.getMinutes(), 0, 0);
                    setEndTime(next);
                  }}
                />
              </View>
            </View>
          </>
        )}
      </ScrollView>

      {!loadingInfo && !loadError ? (
        <View style={styles.footer}>
          <Press
            haptic
            scaleTo={0.95}
            disabled={!canSave || saving}
            onPress={handleSave}
            style={[styles.saveBtn, { opacity: canSave && !saving ? 1 : 0.55 }]}>
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.saveText}>{voteId ? '保存修改' : '发起投票'}</Text>
            )}
          </Press>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  card: { borderRadius: RADII.card, padding: 14, gap: 8, ...continuous },
  label: { fontWeight: '500' },
  input: { fontSize: 15, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(120,120,128,0.3)' },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  optionIndex: { width: 20, textAlign: 'center', fontWeight: '600' },
  optionInput: { flex: 1, fontSize: 15, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(120,120,128,0.3)' },
  addBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: RADII.circle,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 10,
    ...continuous,
  },
  segmented: { flexDirection: 'row', borderRadius: RADII.circle, padding: 2, alignSelf: 'flex-start', ...continuous },
  segItem: { paddingHorizontal: 18, paddingVertical: 6, borderRadius: RADII.circle },
  segItemActive: { backgroundColor: ACCENT },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  pickerLabel: { width: 36 },
  loadingWrap: { alignItems: 'center', paddingTop: 90, gap: 10 },
  footer: { paddingHorizontal: 16, paddingBottom: 20 },
  saveBtn: {
    backgroundColor: ACCENT,
    borderRadius: RADII.md,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    ...continuous,
  },
  saveText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
