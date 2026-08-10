import { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { useType } from '@/components/type-scale';
import { Press } from '@/components/motion';
import { appClient, get, post } from '@/api/client';
import { signAppParamsAsync, STATISTICS } from '@/utils/app-sign';
import { getAccessKey } from '@/utils/cookie';
import { FORM_HEADERS, formBodyStrict } from '@/utils/form';
import { useAuthStore } from '@/stores/auth';
import { showToast } from '@/utils/toast';
import { biliCover } from '@/utils/image-url';

interface MyInfo {
  name: string;
  face: string;
  sign: string;
  birthday: string;
  sex: number;
}

const APP_PARAMS = {
  build: '2001100',
  c_locale: 'zh_CN',
  channel: 'master',
  mobi_app: 'android_hd',
  platform: 'android',
  s_locale: 'zh_CN',
  statistics: STATISTICS,
};

export default function EditProfileScreen() {
  const colors = useThemeColors();
  const T = useType();
  const updateUserInfo = useAuthStore((s) => s.updateUserInfo);
  const [info, setInfo] = useState<MyInfo | null>(null);
  const [name, setName] = useState('');
  const [sign, setSign] = useState('');
  const [birthday, setBirthday] = useState('');
  const [sex, setSex] = useState(0);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await get(appClient, '/x/v2/account/myinfo', undefined, { params: await signAppParamsAsync({ ...APP_PARAMS }) });
      const d = res?.data?.data;
      if (d) {
        const next = {
          name: d.name || '',
          face: d.face || '',
          sign: d.sign || '',
          birthday: d.birthday || '',
          sex: d.sex ?? 0,
        };
        setInfo(next);
        setName(next.name);
        setSign(next.sign);
        setBirthday(next.birthday);
        setSex(next.sex);
      }
    } catch {
      showToast('加载资料失败');
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const saveField = useCallback(async (type: 'uname' | 'sign' | 'birthday' | 'sex', value: string) => {
    const accessKey = getAccessKey();
    if (!accessKey) {
      showToast('请退出账号后重新登录');
      return;
    }
    setSaving(true);
    try {
      const body = formBodyStrict(
        await signAppParamsAsync({
          ...APP_PARAMS,
          [type === 'sign' ? 'user_sign' : type === 'uname' ? 'uname' : type === 'birthday' ? 'birthday' : 'sex']: value,
        }),
      );
      const res = await post(appClient, `/x/member/app/${type}/update`, body, undefined, {
        headers: FORM_HEADERS,
      });
      if (res?.data?.code === 0) {
        showToast('已保存');
        if (type === 'uname') updateUserInfo({ name: value } as any);
      } else {
        showToast(res?.data?.message || '保存失败');
      }
    } catch {
      showToast('保存失败');
    } finally {
      setSaving(false);
    }
  }, [updateUserInfo]);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Title large>账号资料</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <ScrollView contentContainerStyle={styles.content}>
        {info?.face ? <ExpoImage source={{ uri: biliCover(info.face, 160, 160) }} style={[styles.avatar, { backgroundColor: colors.fill2 }]} contentFit="cover" /> : null}
        <Text style={[T.caption1, { color: colors.textTertiary }]}>修改昵称会消耗硬币，请谨慎操作</Text>
        <Text style={[T.subhead, { color: colors.text }]}>昵称</Text>
        <TextInput value={name} onChangeText={setName} style={[styles.input, { backgroundColor: colors.fill2, color: colors.text }]} placeholderTextColor={colors.textTertiary} />
        <Press haptic scaleTo={0.94} disabled={saving || !name} onPress={() => saveField('uname', name)} style={[styles.saveBtn, { backgroundColor: saving ? colors.fill3 : ACCENT }]}>
          <Text style={[T.subhead, styles.saveText]}>保存昵称</Text>
        </Press>
        <Text style={[T.subhead, { color: colors.text }]}>签名</Text>
        <TextInput value={sign} onChangeText={setSign} multiline numberOfLines={3} style={[styles.input, styles.signInput, { backgroundColor: colors.fill2, color: colors.text }]} placeholderTextColor={colors.textTertiary} />
        <Press haptic scaleTo={0.94} disabled={saving} onPress={() => saveField('sign', sign)} style={[styles.saveBtn, { backgroundColor: saving ? colors.fill3 : ACCENT }]}>
          <Text style={[T.subhead, styles.saveText]}>保存签名</Text>
        </Press>
        <Text style={[T.subhead, { color: colors.text }]}>生日（YYYY-MM-DD）</Text>
        <TextInput value={birthday} onChangeText={setBirthday} style={[styles.input, { backgroundColor: colors.fill2, color: colors.text }]} placeholderTextColor={colors.textTertiary} />
        <Press haptic scaleTo={0.94} disabled={saving} onPress={() => saveField('birthday', birthday)} style={[styles.saveBtn, { backgroundColor: saving ? colors.fill3 : ACCENT }]}>
          <Text style={[T.subhead, styles.saveText]}>保存生日</Text>
        </Press>
        <Text style={[T.subhead, { color: colors.text }]}>性别</Text>
        <View style={styles.sexRow}>
          {[{ label: '保密', value: 0 }, { label: '男', value: 1 }, { label: '女', value: 2 }].map((s) => (
            <Press key={s.value} haptic scaleTo={0.92} onPress={() => { setSex(s.value); saveField('sex', String(s.value)); }} style={[styles.sexBtn, { backgroundColor: sex === s.value ? ACCENT : colors.fill2 }]}>
              <Text style={[T.subhead, { color: sex === s.value ? '#FFFFFF' : colors.text }]}>{s.label}</Text>
            </Press>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 18, gap: 8 },
  avatar: { width: 88, height: 88, borderRadius: 44, alignSelf: 'center' },
  input: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  signInput: { minHeight: 70, textAlignVertical: 'top' },
  saveBtn: { alignItems: 'center', paddingVertical: 11, borderRadius: 14, marginBottom: 6 },
  saveText: { color: '#FFFFFF', fontWeight: '600' },
  sexRow: { flexDirection: 'row', gap: 10 },
  sexBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12 },
});
