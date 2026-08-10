import { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView } from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Toggle } from '@expo/ui/swift-ui';
import { Host, useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { useType } from '@/components/type-scale';
import { Press } from '@/components/motion';
import { favApi } from '@/api/fav';
import { RADII, continuous } from '@/theme/tokens';
import { feedBackSuccess } from '@/utils/feedback';
import { showToast } from '@/utils/toast';

const MAX_TITLE = 20;
const MAX_INTRO = 200;

export default function FavCreateScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const T = useType();
  const insets = useSafeAreaInsets();
  const { mediaId } = useLocalSearchParams<{ mediaId?: string }>();
  const isEdit = !!mediaId;

  const [title, setTitle] = useState('');
  const [intro, setIntro] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  /* 编辑态：attr 位掩码（bit0=私密，bit1=默认收藏夹，见 Flutter BiliUtils） */
  const [attr, setAttr] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const isDefault = attr != null && (attr & 2) === 2;

  useEffect(() => {
    if (!mediaId) return;
    favApi.folderInfo({ media_id: parseInt(mediaId, 10) })
      .then((res) => {
        if (res?.code === 0 && res?.data) {
          const a = res.data.attr ?? 0;
          setAttr(a);
          setTitle(res.data.title || '');
          setIntro(res.data.intro || '');
          setIsPublic((a & 1) === 0);
        } else {
          setLoadFailed(true);
        }
      })
      .catch((e) => {
        console.error('favCreate load folder info error:', e);
        setLoadFailed(true);
      });
  }, [mediaId]);

  const doSave = async () => {
    const name = title.trim();
    if (!name) {
      showToast('名称不能为空');
      return;
    }
    setSaving(true);
    try {
      const privacy = isPublic ? 0 : 1;
      const res = isEdit
        ? await favApi.editFolder({ media_id: parseInt(mediaId!, 10), title: name, intro: intro.trim(), privacy })
        : await favApi.addFolder({ title: name, intro: intro.trim(), privacy });
      if (res?.code !== 0) {
        showToast(res?.message || (isEdit ? '保存失败' : '创建失败'));
        return;
      }
      feedBackSuccess();
      showToast(isEdit ? '保存成功' : '创建成功');
      router.back();
    } catch (e) {
      console.error('favCreate save error:', e);
      showToast(isEdit ? '保存失败' : '创建失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Host style={{ flex: 1 }} useViewportSizeMeasurement>
      <Stack.Title large>{isEdit ? '编辑收藏夹' : '新建收藏夹'}</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <ScrollView
          style={styles.content}
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
          keyboardShouldPersistTaps="handled">
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            {/* 名称 */}
            <View style={[styles.fieldRow, { borderBottomColor: colors.separator }]}>
              <Text style={[T.subhead, styles.fieldLabel, { color: colors.text }]}>名称</Text>
              <TextInput
                style={[T.subhead, styles.fieldInput, { color: isDefault ? colors.textTertiary : colors.text, flex: 1 }]}
                placeholder="请输入收藏夹名称"
                placeholderTextColor={colors.textTertiary}
                value={title}
                onChangeText={setTitle}
                editable={!isDefault}
                maxLength={MAX_TITLE}
              />
              <Text style={[T.caption2, { color: colors.textTertiary }]}>{`${title.length}/${MAX_TITLE}`}</Text>
            </View>
            {/* 简介 */}
            <View style={[styles.fieldRow, { borderBottomColor: colors.separator, alignItems: 'flex-start' }]}>
              <Text style={[T.subhead, styles.fieldLabel, { color: colors.text, paddingTop: 2 }]}>简介</Text>
              <TextInput
                style={[T.subhead, styles.fieldInput, { color: colors.text, flex: 1, minHeight: 84, textAlignVertical: 'top' }]}
                placeholder="可填写简介（选填）"
                placeholderTextColor={colors.textTertiary}
                value={intro}
                onChangeText={setIntro}
                multiline
                maxLength={MAX_INTRO}
              />
              <Text style={[T.caption2, { color: colors.textTertiary }]}>{`${intro.length}/${MAX_INTRO}`}</Text>
            </View>
            {/* 公开/私密 */}
            <View style={[styles.fieldRow, { borderBottomWidth: 0 }]}>
              <View>
                <Text style={[T.subhead, { color: colors.text }]}>公开</Text>
                <Text style={[T.caption2, { color: colors.textTertiary, marginTop: 2 }]}>
                  {isPublic ? '所有人可见' : '仅自己可见'}
                </Text>
              </View>
              <View style={{ flex: 1 }} />
              <Toggle label="公开" isOn={isPublic} onIsOnChange={setIsPublic} />
            </View>
          </View>
          {isDefault && (
            <Text style={[T.caption2, { color: colors.textTertiary, marginTop: 10, paddingHorizontal: 4 }]}>
              默认收藏夹不支持修改名称
            </Text>
          )}
          {loadFailed && (
            <Text style={[T.caption1, { color: '#FF3B30', marginTop: 12, paddingHorizontal: 4 }]}>
              收藏夹信息加载失败，请返回重试
            </Text>
          )}
          <Press
            haptic="medium"
            scaleTo={0.97}
            onPress={doSave}
            disabled={saving || (isEdit && loadFailed)}
            style={[styles.saveBtn, { backgroundColor: (saving || (isEdit && loadFailed)) ? '#B8B8BC' : ACCENT }]}>
            <Ionicons name={isEdit ? 'checkmark' : 'add'} size={18} color="#FFFFFF" />
            <Text style={[T.subhead, styles.saveText]}>{saving ? '保存中…' : isEdit ? '保存' : '创建'}</Text>
          </Press>
        </ScrollView>
      </View>
    </Host>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 16 },
  card: {
    borderRadius: RADII.card,
    paddingHorizontal: 16,
    ...continuous,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  fieldLabel: { width: 44, fontWeight: '600' },
  fieldInput: { padding: 0 },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 24,
    borderRadius: RADII.lg,
    paddingVertical: 14,
    ...continuous,
  },
  saveText: { color: '#FFFFFF', fontWeight: '600' },
});
