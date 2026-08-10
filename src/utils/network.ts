import { create } from 'zustand';
import NetInfo from '@react-native-community/netinfo';

interface NetworkState {
  isWifi: boolean;
  isConnected: boolean;
  type: string;
  init: () => void;
  destroy: () => void;
}

// NetInfo 监听器取消函数（模块级保存，防止重复注册导致泄漏）
let unsubscribe: (() => void) | null = null;

export const useNetwork = create<NetworkState>((set) => ({
  isWifi: true,
  isConnected: true,
  type: 'wifi',

  init: () => {
    // 防重复守卫：StrictMode / 热重载下 init() 可能多次调用
    if (unsubscribe) return;
    unsubscribe = NetInfo.addEventListener((state) => {
      set({
        isWifi: state.type === 'wifi',
        isConnected: state.isConnected ?? true,
        type: state.type,
      });
    });
  },

  destroy: () => {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  },
}));
