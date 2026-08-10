import { useState } from 'react';
import { Stack } from 'expo-router';
import { Host } from '@/components/SwiftUIHost';
import {
  Form,
  Section,
  TextField,
  SecureField,
  Button,
  HStack,
} from '@expo/ui/swift-ui';
import {
  buttonStyle,
  controlSize,
  frame,
  tint,
  keyboardType,
  autocorrectionDisabled,
  textContentType,
  disabled,
} from '@expo/ui/swift-ui/modifiers';
import { useSettingsStore, getSettingsSnapshot, type SettingsState } from '@/stores/settings';
import { webdavPut, webdavGet, SETTINGS_BACKUP_FILE, type WebDavConfig } from '@/utils/webdav';
import { showToast } from '@/utils/toast';

export default function WebDavSettingsScreen() {
  const s = useSettingsStore();
  const [uri, setUri] = useState(s.webdavUri);
  const [username, setUsername] = useState(s.webdavUsername);
  const [password, setPassword] = useState(s.webdavPassword);
  const [directory, setDirectory] = useState(s.webdavDirectory);
  const [busy, setBusy] = useState<'backup' | 'restore' | null>(null);

  const persistForm = () => {
    s.set({
      webdavUri: uri.trim(),
      webdavUsername: username.trim(),
      webdavPassword: password,
      webdavDirectory: directory.trim() || '/',
    });
  };

  const save = () => {
    persistForm();
    showToast('已保存');
  };

  const clear = () => {
    setUri('');
    setUsername('');
    setPassword('');
    setDirectory('/');
    s.set({
      webdavUri: '',
      webdavUsername: '',
      webdavPassword: '',
      webdavDirectory: '/',
    });
    showToast('已清空');
  };

  const backup = async () => {
    if (busy) return;
    const config: WebDavConfig = {
      uri: uri.trim(),
      username: username.trim(),
      password,
      directory: directory.trim() || '/',
    };
    if (!config.uri) {
      showToast('请先填写 WebDAV 地址');
      return;
    }
    setBusy('backup');
    persistForm();
    try {
      const { webdavPassword: _webdavPassword, ...safeSnapshot } = getSettingsSnapshot();
      await webdavPut(
        config,
        SETTINGS_BACKUP_FILE,
        JSON.stringify(safeSnapshot, null, 2),
      );
      showToast('备份成功');
    } catch (e) {
      showToast(`备份失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const restore = async () => {
    if (busy) return;
    const config: WebDavConfig = {
      uri: uri.trim(),
      username: username.trim(),
      password,
      directory: directory.trim() || '/',
    };
    if (!config.uri) {
      showToast('请先填写 WebDAV 地址');
      return;
    }
    setBusy('restore');
    try {
      const text = await webdavGet(config, SETTINGS_BACKUP_FILE);
      const parsed = JSON.parse(text) as Record<string, unknown>;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('备份文件格式无效');
      }
      // 备份文件不信任密码字段：密码只存在本地 SecureStore，恢复后保持当前输入。
      delete parsed.webdavPassword;
      const partial: Partial<SettingsState> = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (key === 'init' || key === 'set' || value === undefined) continue;
        (partial as Record<string, unknown>)[key] = value;
      }
      s.set(partial);
      if (typeof partial.webdavUri === 'string') setUri(partial.webdavUri);
      if (typeof partial.webdavUsername === 'string') setUsername(partial.webdavUsername);
      if (typeof partial.webdavPassword === 'string') setPassword(partial.webdavPassword);
      if (typeof partial.webdavDirectory === 'string') setDirectory(partial.webdavDirectory);
      showToast('恢复成功');
    } catch (e) {
      showToast(`恢复失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Stack.Title>WebDAV 设置</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <Form modifiers={[tint('#FB7299')]}>
          <Section title="连接">
            <TextField
              placeholder="https://example.com/dav"
              onTextChange={setUri}
              modifiers={[
                keyboardType('url'),
                textContentType('URL'),
                autocorrectionDisabled(),
              ]}
            />
            <TextField
              placeholder="用户名"
              onTextChange={setUsername}
              modifiers={[
                textContentType('username'),
                autocorrectionDisabled(),
              ]}
            />
            <SecureField
              placeholder="密码"
              onTextChange={setPassword}
              modifiers={[textContentType('password')]}
            />
            <TextField
              placeholder="/"
              onTextChange={setDirectory}
              modifiers={[autocorrectionDisabled()]}
            />
          </Section>
          <Section>
            <HStack modifiers={[frame({ maxWidth: 9999 })]}>
              <Button
                label="保存配置"
                onPress={save}
                modifiers={[
                  buttonStyle('bordered'),
                  controlSize('large'),
                  frame({ maxWidth: 9999 }),
                ]}
              />
            </HStack>
            <Button
              label="清空配置"
              role="destructive"
              onPress={clear}
              modifiers={[
                buttonStyle('bordered'),
                controlSize('large'),
                frame({ maxWidth: 9999 }),
              ]}
            />
          </Section>
          <Section title="同步">
            <HStack spacing={8} modifiers={[frame({ maxWidth: 9999 })]}>
              <Button
                label={busy === 'backup' ? '备份中…' : '备份设置'}
                onPress={backup}
                modifiers={[
                  buttonStyle('bordered'),
                  controlSize('large'),
                  frame({ maxWidth: 9999 }),
                  disabled(busy !== null),
                ]}
              />
              <Button
                label={busy === 'restore' ? '恢复中…' : '恢复设置'}
                onPress={restore}
                modifiers={[
                  buttonStyle('bordered'),
                  controlSize('large'),
                  frame({ maxWidth: 9999 }),
                  disabled(busy !== null),
                ]}
              />
            </HStack>
          </Section>
        </Form>
      </Host>
    </>
  );
}
