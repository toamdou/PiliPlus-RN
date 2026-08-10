import { create } from 'zustand';
import { storage, secureStorage } from '@/utils/storage';
import { releaseAudioPlayer } from '@/utils/audio-player';
import { usePlayerStore } from '@/stores/player';
import {
  loadCookies,
  clearCookies,
  saveCookiesForAccount,
  loadCookiesForAccount,
  clearCookiesForAccount,
  renameCookies,
  clearNetworkCaches,
  setCredentialAnonymous,
  readAccountStore,
  writeAccountStore,
  writeActiveAccount,
  clearAccountStore,
  accountRecordFromAccount,
} from '@/utils/cookie';
import type { NativeAccountRecord, NativeAccountStore } from 'pili-native-core';
import { clearBilibiliDataAsync } from 'pili-webview';

export interface UserInfo {
  mid: number;
  name: string;
  face: string;
  level: number;
  sign: string;
  vipStatus: number;
  vipType: number;
  officialVerify?: { type: number; desc: string };
  pendant?: { image: string; name: string };
}

export interface Account {
  mid: number;
  name: string;
  face: string;
  accessKey: string;
  userInfo: UserInfo;
}

const ACCOUNTS_META_KEY = 'accounts';
const ACCOUNT_RECORD_PREFIX = 'piliplus_account_';

interface AccountsMeta {
  order: number[];
  currentIndex: number;
}

function accountRecordKey(mid: number): string {
  return `${ACCOUNT_RECORD_PREFIX}${mid}`;
}

function makeAccount(info: UserInfo, key: string): Account {
  return { mid: info.mid, name: info.name, face: info.face, accessKey: key, userInfo: info };
}

function accountFromRecord(record: NativeAccountRecord): Account | null {
  if (!record || !record.mid || !record.name || !record.accessKey) return null;
  const userInfo: UserInfo = record.userInfo && record.userInfo.mid
    ? (record.userInfo as UserInfo)
    : {
        mid: record.mid,
        name: record.name,
        face: record.face || '',
        level: 0,
        sign: '',
        vipStatus: 0,
        vipType: 0,
      };
  return {
    mid: record.mid,
    name: record.name,
    face: record.face || '',
    accessKey: record.accessKey,
    userInfo,
  };
}

async function persistAccount(account: Account): Promise<void> {
  const store = await readAccountStore();
  if (!store) return;
  const index = store.records.findIndex((record) => record.mid === account.mid);
  const record = accountRecordFromAccount(account, store.records[index]?.cookies);
  if (index >= 0) {
    store.records[index] = record;
  } else {
    store.records.push(record);
  }
  await writeAccountStore(store);
}

async function removeAccountRecord(mid: number): Promise<void> {
  const store = await readAccountStore();
  if (!store) return;
  const records = store.records.filter((record) => record.mid !== mid);
  const currentIndex = Math.min(store.currentIndex, Math.max(0, records.length - 1));
  await writeAccountStore({ ...store, records, currentIndex });
}

async function activateAccount(
  accounts: Account[],
  index: number,
  anonymousMode: boolean,
  name: string,
  accessKey: string,
): Promise<void> {
  const existing = await readAccountStore();
  const byMid = new Map((existing?.records ?? []).map((record) => [record.mid, record]));
  const records = accounts.map((account) => {
    const previous = byMid.get(account.mid);
    return accountRecordFromAccount(account, previous?.cookies);
  });
  const store: NativeAccountStore = {
    records,
    currentIndex: index,
    anonymousMode,
    activeAccessKey: accessKey,
  };
  const cookies = records[index]?.cookies ?? [];
  const ok = await writeActiveAccount(accessKey, store, cookies);
  if (!ok) throw new Error('Failed to persist active account');
  await loadCookiesForAccount(name, accessKey);
}

async function readLegacyAccounts(meta: AccountsMeta): Promise<Account[]> {
  const accounts: Account[] = [];
  for (const mid of meta.order) {
    const raw = await secureStorage.get(accountRecordKey(mid));
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as Partial<Account>;
      if (parsed && parsed.mid === mid && parsed.name && parsed.accessKey) {
        const userInfo: UserInfo = parsed.userInfo && parsed.userInfo.mid
          ? parsed.userInfo
          : {
              mid: parsed.mid,
              name: parsed.name,
              face: parsed.face || '',
              level: 0,
              sign: '',
              vipStatus: 0,
              vipType: 0,
            };
        accounts.push({
          mid: parsed.mid,
          name: parsed.name,
          face: parsed.face || '',
          accessKey: parsed.accessKey,
          userInfo,
        });
      }
    } catch {}
  }
  return accounts;
}

interface AuthState {
  isLoggedIn: boolean;
  /** 匿名模式（无痕）：搜索/评论/播放记录不携带身份信息，对齐 Flutter Accounts.anonymity */
  anonymousMode: boolean;
  userInfo: UserInfo | null;
  accessKey: string | null;
  accounts: Account[];
  currentAccountIndex: number;
  init: () => Promise<void>;
  logout: () => Promise<void>;
  addAccount: (info: UserInfo, key: string) => Promise<void>;
  switchAccount: (index: number) => Promise<void>;
  removeAccount: (index: number) => Promise<void>;
  updateUserInfo: (info: Partial<UserInfo>) => void;
  setAnonymous: (v: boolean) => Promise<void>;
}

function stopActiveAudio() {
  void releaseAudioPlayer();
  usePlayerStore.getState().reset();
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isLoggedIn: false,
  anonymousMode: false,
  userInfo: null,
  accessKey: null,
  accounts: [],
  currentAccountIndex: -1,

  init: async () => {
    await loadCookies();
    const native = await readAccountStore();
    if (native && Array.isArray(native.records) && native.records.length > 0) {
      const accounts = native.records
        .map(accountFromRecord)
        .filter((account): account is Account => account != null);
      if (accounts.length > 0) {
        let index = native.currentIndex;
        if (!Number.isInteger(index) || index < 0 || index >= accounts.length) {
          const activeIndex = accounts.findIndex((account) => account.accessKey === native.activeAccessKey);
          index = activeIndex >= 0 ? activeIndex : 0;
        }
        const current = accounts[index];
        const anonymousMode = native.anonymousMode === true;
        setCredentialAnonymous(anonymousMode);
        await loadCookiesForAccount(current.name, current.accessKey);
        set({
          isLoggedIn: true,
          anonymousMode,
          userInfo: current.userInfo,
          accessKey: current.accessKey,
          accounts,
          currentAccountIndex: index,
        });
        return;
      }
    }

    // 旧版 AsyncStorage/SecureStore 账号数据迁移为原生 Keychain 账号记录。
    const anonSaved = await storage.get('anonymous_mode');
    const anonymousMode = anonSaved === 'true';
    if (anonymousMode) setCredentialAnonymous(true);

    const meta = await storage.getJSON<AccountsMeta>(ACCOUNTS_META_KEY);
    if (meta && Array.isArray(meta.order) && meta.order.length > 0) {
      const accounts = await readLegacyAccounts(meta);
      if (accounts.length > 0) {
        let index = meta.currentIndex;
        if (!Number.isInteger(index) || index < 0 || index >= accounts.length) index = 0;
        const current = accounts[index];
        await writeAccountStore({
          records: accounts.map((account) => accountRecordFromAccount(account)),
          currentIndex: index,
          anonymousMode,
          activeAccessKey: current.accessKey,
        });
        for (const account of accounts) {
          await saveCookiesForAccount(account.name, account.accessKey);
        }
        await loadCookiesForAccount(current.name, current.accessKey);
        for (const account of accounts) {
          await secureStorage.remove(accountRecordKey(account.mid));
        }
        await storage.remove(ACCOUNTS_META_KEY);
        await storage.remove('anonymous_mode');
        set({
          isLoggedIn: true,
          anonymousMode,
          userInfo: current.userInfo,
          accessKey: current.accessKey,
          accounts,
          currentAccountIndex: index,
        });
        return;
      }
      await storage.remove(ACCOUNTS_META_KEY);
    }

    const savedUser = await storage.getJSON<UserInfo>('user_info');
    const savedKey = await secureStorage.get('access_key');
    if (savedUser && savedUser.mid && savedKey) {
      const account = makeAccount(savedUser, savedKey);
      await writeAccountStore({
        records: [accountRecordFromAccount(account)],
        currentIndex: 0,
        anonymousMode,
        activeAccessKey: savedKey,
      });
      await saveCookiesForAccount(account.name, savedKey);
      await loadCookiesForAccount(account.name, savedKey);
      await storage.remove('user_info');
      await secureStorage.remove('access_key');
      await storage.remove('anonymous_mode');
      set({
        isLoggedIn: true,
        anonymousMode,
        userInfo: savedUser,
        accessKey: savedKey,
        accounts: [account],
        currentAccountIndex: 0,
      });
      return;
    }

    set({ accounts: [], currentAccountIndex: -1, anonymousMode });
  },

  addAccount: async (info, key) => {
    const state = get();
    const accounts = [...state.accounts];
    let index = accounts.findIndex((a) => a.mid === info.mid);
    const account = makeAccount(info, key);
    stopActiveAudio();

    if (index >= 0) {
      const oldName = accounts[index].name;
      if (oldName !== info.name) await renameCookies(oldName, info.name);
      accounts[index] = account;
    } else {
      accounts.push(account);
      index = accounts.length - 1;
    }

    if (!(await readAccountStore())) {
      await writeAccountStore({
        records: accounts.map((a) => accountRecordFromAccount(a)),
        currentIndex: index,
        anonymousMode: false,
        activeAccessKey: key,
      });
    }
    await saveCookiesForAccount(account.name, key);
    await activateAccount(accounts, index, false, account.name, key);
    setCredentialAnonymous(false);
    set({
      isLoggedIn: true,
      anonymousMode: false,
      userInfo: info,
      accessKey: key,
      accounts,
      currentAccountIndex: index,
    });
  },

  switchAccount: async (index) => {
    const state = get();
    const accounts = state.accounts;
    if (accounts.length === 0 || index === state.currentAccountIndex) return;
    if (index < 0 || index >= accounts.length) return;

    stopActiveAudio();
    const current = state.currentAccountIndex >= 0 ? accounts[state.currentAccountIndex] : null;
    const next = accounts[index];
    if (current) {
      await saveCookiesForAccount(current.name, current.accessKey);
    }
    await activateAccount(accounts, index, false, next.name, next.accessKey);
    setCredentialAnonymous(false);
    set({
      isLoggedIn: true,
      anonymousMode: false,
      userInfo: next.userInfo,
      accessKey: next.accessKey,
      currentAccountIndex: index,
    });
  },

  removeAccount: async (index) => {
    const state = get();
    const accounts = [...state.accounts];
    if (index < 0 || index >= accounts.length) return;

    const [removed] = accounts.splice(index, 1);
    await removeAccountRecord(removed.mid);
    await clearCookiesForAccount(removed.name);

    if (accounts.length === 0) {
      await get().logout();
      return;
    }

    const wasCurrent = index === state.currentAccountIndex;
    let nextIndex = state.currentAccountIndex;
    if (!wasCurrent && index < state.currentAccountIndex) {
      nextIndex -= 1;
    }
    if (wasCurrent) {
      stopActiveAudio();
      nextIndex = Math.min(index, accounts.length - 1);
      const next = accounts[nextIndex];
      await saveCookiesForAccount(next.name, next.accessKey);
      await activateAccount(accounts, nextIndex, false, next.name, next.accessKey);
      setCredentialAnonymous(false);
    }
    set({
      accounts,
      currentAccountIndex: nextIndex,
      ...(wasCurrent
        ? {
            isLoggedIn: true,
            anonymousMode: false,
            userInfo: accounts[nextIndex].userInfo,
            accessKey: accounts[nextIndex].accessKey,
          }
        : {}),
    });
  },

  logout: async () => {
    stopActiveAudio();
    const { accounts } = get();
    await clearAccountStore();
    for (const account of accounts) {
      await clearCookiesForAccount(account.name).catch(() => {});
      await secureStorage.remove(accountRecordKey(account.mid)).catch(() => {});
    }
    await storage.remove(ACCOUNTS_META_KEY);
    await storage.remove('user_info');
    await storage.remove('anonymous_mode');
    await secureStorage.remove('access_key');
    await clearCookies();
    setCredentialAnonymous(false);
    set({ isLoggedIn: false, userInfo: null, accessKey: null, accounts: [], currentAccountIndex: -1 });
  },

  updateUserInfo: (info) => {
    const state = get();
    const current = state.userInfo;
    if (!current) return;
    const updated = { ...current, ...info };
    const accounts = [...state.accounts];
    const currentIndex = state.currentAccountIndex;
    if (currentIndex >= 0 && currentIndex < accounts.length) {
      const oldAccount = accounts[currentIndex];
      const nextName = updated.name || oldAccount.name;
      if (oldAccount.name !== nextName) {
        void renameCookies(oldAccount.name, nextName);
      }
      const account: Account = {
        mid: updated.mid || oldAccount.mid,
        name: nextName,
        face: updated.face || oldAccount.face,
        accessKey: state.accessKey || oldAccount.accessKey,
        userInfo: updated,
      };
      accounts[currentIndex] = account;
      void persistAccount(account);
      set({ userInfo: updated, accounts });
    } else {
      set({ userInfo: updated });
    }
  },

  setAnonymous: async (v) => {
    setCredentialAnonymous(v);
    set({ anonymousMode: v });
    const store = await readAccountStore();
    if (store) {
      store.anonymousMode = v;
      await writeAccountStore(store);
    }
    await clearNetworkCaches().catch(() => {});
    if (v) await clearBilibiliDataAsync().catch(() => {});
  },
}));
