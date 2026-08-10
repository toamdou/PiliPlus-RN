import { requireNativeModule } from 'expo-modules-core';

type NativeDlnaDevice = {
  key: string;
  friendlyName: string;
  location: string;
  controlUrl: string;
};

type NativeDlnaModule = {
  isAvailableAsync(): Promise<boolean>;
  discoverDevicesAsync(timeoutMs: number): Promise<NativeDlnaDevice[]>;
  stopDiscoveryAsync(): Promise<boolean>;
  soapActionAsync(controlUrl: string, action: string, args: Record<string, string>): Promise<boolean>;
};

const NativeModule = requireNativeModule<NativeDlnaModule>('PiliDlna');

export async function discoverDevicesAsync(timeoutMs: number): Promise<NativeDlnaDevice[]> {
  return await NativeModule.discoverDevicesAsync(timeoutMs);
}

export async function stopDiscoveryAsync(): Promise<void> {
  await NativeModule.stopDiscoveryAsync();
}

export async function soapActionAsync(
  controlUrl: string,
  action: string,
  args: Record<string, string>,
): Promise<boolean> {
  return await NativeModule.soapActionAsync(controlUrl, action, args);
}
