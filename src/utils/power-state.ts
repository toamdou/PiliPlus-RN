import { create } from 'zustand';
import { addPowerStateListener, getPowerState, type PowerState } from 'pili-native-core';

const DEFAULT_POWER_STATE: PowerState = {
  lowPowerMode: false,
  thermalState: 'nominal',
  batteryLevel: -1,
  batteryState: 'unknown',
};

interface PowerStateStore {
  state: PowerState;
  /** 挂载一次原生监听；幂等，返回空清理函数（监听随模块常驻，避免多消费者互相解除） */
  attach: () => () => void;
}

let listenerAttached = false;

export const usePowerStateStore = create<PowerStateStore>((set) => ({
  state: DEFAULT_POWER_STATE,
  attach: () => {
    if (!listenerAttached) {
      listenerAttached = true;
      addPowerStateListener((next) => {
        set({ state: next });
      });
      void getPowerState()
        .then((state) => set({ state }))
        .catch(() => {});
    }
    return () => {};
  },
}));

export function isPowerConstrained(
  state: Pick<PowerState, 'lowPowerMode' | 'thermalState'>,
): boolean {
  return (
    state.lowPowerMode ||
    state.thermalState === 'serious' ||
    state.thermalState === 'critical'
  );
}

export async function isPowerConstrainedNow(): Promise<boolean> {
  try {
    const state = await getPowerState();
    usePowerStateStore.setState({ state });
    return isPowerConstrained(state);
  } catch {
    return isPowerConstrained(usePowerStateStore.getState().state);
  }
}
