import { useState, useEffect, useRef } from 'react';
import { StyleSheet, TextInput as RNTextInput } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { Host, useThemeColors } from '@/components/SwiftUIHost';
import {
  Form,
  Section,
  Picker,
  Text,
  TextField,
  SecureField,
  Button,
  VStack,
  HStack,
  Spacer,
  ProgressView,
  RNHostView,
} from '@expo/ui/swift-ui';
import {
  pickerStyle,
  tag,
  buttonStyle,
  controlSize,
  frame,
  font,
  foregroundStyle,
  onSubmit,
  keyboardType,
  autocorrectionDisabled,
  textContentType,
  padding,
  disabled,
} from '@expo/ui/swift-ui/modifiers';
import { loginApi, DIAL_PREFIX, type LoginResultData } from '@/api/login';
import { feedBack, feedBackSuccess, feedBackError } from '@/utils/feedback';
import { showToast } from '@/utils/toast';
import { useAuthStore } from '@/stores/auth';
import { getAccessKey, saveCookiesForAccount } from '@/utils/cookie';
import {
  addQRCodePollListener,
  createQRCodeAsync,
  startQRCodePolling,
  stopQRCodePolling,
  type QRCodePollEvent,
} from 'pili-native-core';

type QrStatus = 'loading' | 'waiting' | 'scanned' | 'confirmed' | 'expired';

/** 验证码有效期：对齐 Flutter loginBySmsCode 的 5 分钟 */
const SMS_CODE_EXPIRE_MS = 5 * 60 * 1000;

/** 短信验证码按钮：倒计时与发送状态只在按钮内更新，避免整页每秒重渲染。 */
function SmsCodeButton({ onSend }: { onSend: () => Promise<boolean> }) {
  const [cooldown, setCooldown] = useState(0);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((v) => v - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function handlePress() {
    if (cooldown > 0 || sending) return;
    setSending(true);
    try {
      const ok = await onSend();
      if (ok) setCooldown(60);
    } finally {
      setSending(false);
    }
  }

  return (
    <Button
      label={cooldown > 0 ? `等待${cooldown}秒` : '获取验证码'}
      onPress={handlePress}
      modifiers={[
        buttonStyle('bordered'),
        controlSize('small'),
        disabled(cooldown > 0 || sending),
      ]}
    />
  );
}

/** 解析浏览器导出的 Cookie 串（支持 Cookie: 前缀、分号/换行分隔和简单 JSON） */
function parseCookiePairs(raw: string): { name: string; value: string }[] {
  let text = raw.trim();
  if (/^cookie\s*:/i.test(text)) text = text.replace(/^cookie\s*:\s*/i, '');
  if (text.startsWith('{')) {
    try {
      const obj = JSON.parse(text);
      if (Array.isArray(obj?.cookies)) {
        return obj.cookies
          .map((c: any) => ({ name: String(c?.name ?? ''), value: String(c?.value ?? '') }))
          .filter((c: any) => c.name && c.value);
      }
      if (typeof obj?.cookie === 'string') text = obj.cookie.trim();
    } catch {
      // 不是 JSON，继续按 Cookie 串解析
    }
  }
  const pairs: { name: string; value: string }[] = [];
  for (const segment of text.split(/[;\n]/)) {
    const eq = segment.indexOf('=');
    if (eq <= 0) continue;
    const name = segment.slice(0, eq).trim();
    const value = segment.slice(eq + 1).trim();
    if (name && value) pairs.push({ name, value });
  }
  return pairs;
}

export default function LoginScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { addAccount, accounts, currentAccountIndex } = useAuthStore();
  const [modeIdx, setModeIdx] = useState(0); // 0=扫码 1=密码 2=验证码 3=Cookie
  const [qrUrl, setQrUrl] = useState('');
  const [qrImageUri, setQrImageUri] = useState('');
  const [qrStatus, setQrStatus] = useState<QrStatus>('loading');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [tel, setTel] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [selectedCountryId, setSelectedCountryId] = useState(DIAL_PREFIX[0].id);
  const [captchaKey, setCaptchaKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cookieText, setCookieText] = useState('');
  const pollSubRef = useRef<(() => void) | null>(null);
  const authCodeRef = useRef('');
  const sendTimeRef = useRef(0);

  /** 登录收尾（扫码/密码/短信/Cookie 共用）：保存凭证 → 拉取用户信息 → 写入 auth store */
  async function completeLogin(data: LoginResultData, fallbackKey = ''): Promise<boolean> {
    // 先保存当前账号 Cookie，避免登录新账号覆盖后无法切回
    const currentAccount = accounts[currentAccountIndex];
    if (currentAccount) {
      await saveCookiesForAccount(currentAccount.name, currentAccount.accessKey);
    }
    await loginApi.handleLoginCookies(data);
    const userRes = await loginApi.getUserInfo();
    if (!userRes?.data || userRes.data.isLogin === false) return false;
    const info = {
      mid: userRes.data.mid,
      name: userRes.data.uname,
      face: userRes.data.face,
      level: userRes.data.level_info?.current_level || 0,
      sign: userRes.data.sign || '',
      vipStatus: userRes.data.vipStatus || 0,
      vipType: userRes.data.vipType || 0,
    };
    const key = data.token_info?.access_token || fallbackKey;
    await addAccount(info, key);
    feedBackSuccess();
    if (router.canGoBack()) router.back();
    else router.replace('/' as any);
    return true;
  }

  /** Cookie 登录：解析完整 Cookie 串 → 写入本地 → 拉取用户信息 → 进入首页 */
  async function handleCookieLogin() {
    const pairs = parseCookiePairs(cookieText);
    if (pairs.length === 0) {
      setError('未识别到有效的 Cookie，请检查格式');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const accessPair = pairs.find((p) => p.name.toLowerCase() === 'access_key');
      const ok = await completeLogin(
        {
          ...(accessPair ? { token_info: { access_token: accessPair.value } } : {}),
          cookie_info: { cookies: pairs },
        },
        getAccessKey() ?? 'cookie',
      );
      if (!ok) {
        feedBackError();
        setError('Cookie 无效或已过期，请重新复制');
      }
    } catch (e) {
      console.error('cookie login failed:', e);
      feedBackError();
      setError(e instanceof Error ? e.message : 'Cookie 登录失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (modeIdx === 0) initQRCode();
    return () => {
      void stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modeIdx]);

  async function initQRCode() {
    setQrStatus('loading');
    try {
      const res = await loginApi.getQRCode();
      if (res?.data) {
        setQrUrl(res.data.url);
        const nativeUri = await createQRCodeAsync(res.data.url, 200);
        if (!nativeUri) throw new Error('QR code generation failed');
        setQrImageUri(nativeUri);
        authCodeRef.current = res.data.auth_code;
        setQrStatus('waiting');
        await startPolling(res.data.auth_code);
      }
    } catch {
      setQrStatus('expired');
      await stopPolling();
    }
  }

  async function stopPolling() {
    if (pollSubRef.current) {
      pollSubRef.current();
      pollSubRef.current = null;
    }
    await stopQRCodePolling().catch(() => {});
  }

  async function startPolling(authCode: string) {
    await stopPolling();

    const handlePollResult = async (code: number, data?: any) => {
      if (code === 0) {
        await stopPolling();
        await completeLogin(data);
      } else if (code === 86038) {
        setQrStatus('expired');
        await stopPolling();
      } else if (code === 86090) {
        setQrStatus('scanned');
      }
    };

    const unsubscribe = addQRCodePollListener((event: QRCodePollEvent) => {
      void handlePollResult(event.code, event.data);
    });
    if (!unsubscribe) throw new Error('QR polling native module unavailable');
    const nativeStarted = await startQRCodePolling(authCode, 2000);
    if (!nativeStarted) {
      unsubscribe();
      throw new Error('QR polling failed to start');
    }
    pollSubRef.current = unsubscribe;
  }

  async function handlePwdLogin() {
    if (!username || !password) {
      setError('请输入账号和密码');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await loginApi.loginByPwd({ username, password });
      if (res?.code === 0) {
        await completeLogin(res.data);
      } else {
        feedBackError();
        setError(res?.message || '登录失败');
      }
    } catch (e) {
      console.error('密码登录失败', e);
      feedBackError();
      setError(e instanceof Error ? e.message : '网络错误');
    } finally {
      setLoading(false);
    }
  }

  /** 获取短信验证码（对齐 Flutter sendSmsCode：60s 倒计时 + captcha_key 缓存） */
  async function handleSendSms(): Promise<boolean> {
    if (!tel) {
      showToast('手机号不能为空');
      return false;
    }
    try {
      const country = DIAL_PREFIX.find((p) => p.id === selectedCountryId) ?? DIAL_PREFIX[0];
      const res = await loginApi.sendSms({ cid: country.countryId, tel });
      if (res.code === 0 && !res.data?.recaptcha_url) {
        showToast('发送成功');
        setCaptchaKey(res.data?.captcha_key ?? '');
        sendTimeRef.current = Date.now();
        return true;
      } else if (res.code === 0 || res.code === -105) {
        // 服务端要求图形验证码（geetest）；按用户要求不接入验证环节，直接提示服务端信息
        feedBackError();
        showToast(
          res.message && res.message !== '0'
            ? res.message
            : '需要安全验证，暂不支持，请使用扫码或密码登录',
        );
      } else {
        feedBackError();
        showToast(res.message || '发送验证码失败，请稍后重试');
      }
    } catch (e) {
      console.error('发送短信验证码失败', e);
      feedBackError();
      showToast('网络错误，请稍后再试');
    }
    return false;
  }

  /** 短信验证码登录（对齐 Flutter loginBySmsCode：getWebKey → loginBySms → 保存凭证） */
  async function handleSmsLogin() {
    if (!tel) {
      showToast('手机号不能为空');
      return;
    }
    if (!captchaKey) {
      showToast('请先点击获取验证码');
      return;
    }
    if (!smsCode) {
      showToast('验证码不能为空');
      return;
    }
    if (Date.now() - sendTimeRef.current > SMS_CODE_EXPIRE_MS) {
      showToast('验证码已过期，请重新获取');
      return;
    }
    setLoading(true);
    try {
      const country = DIAL_PREFIX.find((p) => p.id === selectedCountryId) ?? DIAL_PREFIX[0];
      const webKeyRes = await loginApi.getWebKey();
      if (webKeyRes.code !== 0 || !webKeyRes.data?.key) {
        feedBackError();
        showToast(webKeyRes.message || '获取公钥失败');
        return;
      }
      const res = await loginApi.loginBySms({
        cid: country.countryId,
        tel,
        code: smsCode,
        captchaKey,
        key: webKeyRes.data.key,
      });
      if (res.code !== 0) {
        feedBackError();
        showToast(res.message || '登录失败');
        return;
      }
      const data = res.data;
      if (!data?.token_info || !data?.cookie_info?.cookies) {
        feedBackError();
        showToast('登录异常，接口未返回身份信息，可能是因为账号风控，请尝试其它登录方式');
        return;
      }
      showToast('登录成功');
      await completeLogin(data);
    } catch (e) {
      console.error('短信验证码登录失败', e);
      feedBackError();
      showToast('网络错误，请稍后再试');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Stack.Title large>登录</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <Form>
          <Section>
            <Picker
              selection={modeIdx}
              onSelectionChange={(v) => setModeIdx(Number(v))}
              modifiers={[pickerStyle('segmented')]}>
              <Text modifiers={[tag(0)]}>扫码登录</Text>
              <Text modifiers={[tag(1)]}>密码登录</Text>
              <Text modifiers={[tag(2)]}>验证码登录</Text>
              <Text modifiers={[tag(3)]}>Cookie 登录</Text>
            </Picker>
          </Section>

          {modeIdx === 0 ? (
            <Section
              title="使用哔哩哔哩客户端扫码"
              footer={<Text>打开哔哩哔哩 App，扫一扫即可登录</Text>}>
              <VStack spacing={16} modifiers={[frame({ maxWidth: 9999 }), padding({ vertical: 20 })]}>
                {qrStatus === 'loading' && <ProgressView />}
                {(qrStatus === 'waiting' || qrStatus === 'scanned') && qrUrl ? (
                  <RNHostView matchContents>
                    <ExpoImage
                      source={{ uri: qrImageUri }}
                      style={{ width: 200, height: 200, borderRadius: 12 }}
                    />
                  </RNHostView>
                ) : null}
                {qrStatus === 'scanned' && (
                  <Text modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
                    已扫码，请在手机上确认
                  </Text>
                )}
                {qrStatus === 'waiting' && (
                  <Text modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
                    等待扫码…
                  </Text>
                )}
                {qrStatus === 'expired' && (
                  <Button label="二维码已过期，点击刷新" onPress={() => { feedBack(); initQRCode(); }} />
                )}
              </VStack>
            </Section>
          ) : modeIdx === 1 ? (
            <>
              <Section title="账号密码">
                <TextField
                  placeholder="手机号 / 邮箱"
                  onTextChange={setUsername}
                  modifiers={[
                    textContentType('username'),
                    keyboardType('email-address'),
                    autocorrectionDisabled(),
                    onSubmit(handlePwdLogin),
                  ]}
                />
                <SecureField
                  placeholder="密码"
                  onTextChange={setPassword}
                  modifiers={[textContentType('password'), onSubmit(handlePwdLogin)]}
                />
              </Section>

              {error ? (
                <Section>
                  <Text modifiers={[foregroundStyle('#FF3B30'), font({ size: 13 })]}>{error}</Text>
                </Section>
              ) : null}

              <Section>
                {loading ? (
                  <HStack modifiers={[frame({ maxWidth: 9999 })]}>
                    <Spacer />
                    <ProgressView />
                    <Spacer />
                  </HStack>
                ) : (
                  <Button
                    label="登录"
                    onPress={handlePwdLogin}
                    modifiers={[
                      buttonStyle('borderedProminent'),
                      controlSize('large'),
                      frame({ maxWidth: 9999 }),
                    ]}
                  />
                )}
              </Section>
            </>
          ) : modeIdx === 2 ? (
            <>
              <Section
                title="手机短信验证码"
                footer={
                  <Text>手机号仅用于 bilibili 官方发送验证码与登录接口，不予保存；本地仅存储登录凭证。</Text>
                }>
                <Picker
                  label="国家/地区"
                  systemImage="phone"
                  selection={selectedCountryId}
                  onSelectionChange={(v) => setSelectedCountryId(Number(v))}
                  modifiers={[pickerStyle('menu')]}>
                  {DIAL_PREFIX.map((p) => (
                    <Text key={p.id} modifiers={[tag(p.id)]}>
                      {p.cname} +{p.countryId}
                    </Text>
                  ))}
                </Picker>
                <TextField
                  placeholder="手机号"
                  onTextChange={(v) => setTel(v.replace(/\D/g, ''))}
                  modifiers={[
                    keyboardType('phone-pad'),
                    textContentType('telephoneNumber'),
                    autocorrectionDisabled(),
                  ]}
                />
                <HStack spacing={8}>
                  <TextField
                    placeholder="验证码"
                    onTextChange={(v) => setSmsCode(v.replace(/\D/g, ''))}
                    modifiers={[
                      keyboardType('phone-pad'),
                      textContentType('oneTimeCode'),
                      autocorrectionDisabled(),
                      onSubmit(handleSmsLogin),
                    ]}
                  />
                  <SmsCodeButton onSend={handleSendSms} />
                </HStack>
              </Section>

              <Section>
                {loading ? (
                  <HStack modifiers={[frame({ maxWidth: 9999 })]}>
                    <Spacer />
                    <ProgressView />
                    <Spacer />
                  </HStack>
                ) : (
                  <Button
                    label="登录"
                    onPress={handleSmsLogin}
                    modifiers={[
                      buttonStyle('borderedProminent'),
                      controlSize('large'),
                      frame({ maxWidth: 9999 }),
                    ]}
                  />
                )}
              </Section>
            </>
          ) : (
            <>
              <Section
                title="粘贴 Cookie"
                footer={
                  <Text>支持浏览器导出的完整 Cookie 串，例如 SESSDATA、bili_jct、DedeUserID。</Text>
                }>
                <RNHostView>
                  <RNTextInput
                    style={[styles.cookieInput, { color: colors.text, backgroundColor: colors.fill2 }]}
                    placeholder="SESSDATA=...; bili_jct=...; DedeUserID=..."
                    placeholderTextColor={colors.textTertiary}
                    multiline
                    numberOfLines={6}
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={cookieText}
                    onChangeText={setCookieText}
                    textAlignVertical="top"
                  />
                </RNHostView>
              </Section>

              {error ? (
                <Section>
                  <Text modifiers={[foregroundStyle('#FF3B30'), font({ size: 13 })]}>{error}</Text>
                </Section>
              ) : null}

              <Section>
                {loading ? (
                  <HStack modifiers={[frame({ maxWidth: 9999 })]}>
                    <Spacer />
                    <ProgressView />
                    <Spacer />
                  </HStack>
                ) : (
                  <Button
                    label="登录"
                    onPress={handleCookieLogin}
                    modifiers={[
                      buttonStyle('borderedProminent'),
                      controlSize('large'),
                      frame({ maxWidth: 9999 }),
                    ]}
                  />
                )}
              </Section>
            </>
          )}
        </Form>
      </Host>
    </>
  );
}

const styles = StyleSheet.create({
  cookieInput: {
    minHeight: 120,
    borderRadius: 10,
    padding: 10,
    fontSize: 13,
    lineHeight: 18,
  },
});
