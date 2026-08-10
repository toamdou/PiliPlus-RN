export interface NativeNetworkSettingsState {
  enableSystemProxy?: boolean;
  systemProxyHost?: string;
  systemProxyPort?: string;
  enableHttp2?: boolean;
  badCertificateCallback?: boolean;
  maxCacheSize?: number;
  retryCount?: number;
  retryDelay?: number;
}

/** 把设置里的网络字段转为原生网络配置（请求与 configureNetworkAsync 共用）。 */
export function buildNativeNetworkSettings(
  state: NativeNetworkSettingsState,
): Record<string, unknown> {
  const proxyPort = state.systemProxyPort
    ? parseInt(state.systemProxyPort, 10)
    : undefined;
  return {
    useSystemProxy: state.enableSystemProxy !== false,
    enableHttp2: state.enableHttp2 ?? false,
    badCertificateCallback: state.badCertificateCallback ?? false,
    maxCacheSize: state.maxCacheSize ?? 64,
    retries: Math.max(0, state.retryCount ?? 0),
    retryDelayMs: Math.max(0, state.retryDelay ?? 0),
    ...(state.enableSystemProxy !== false && state.systemProxyHost && proxyPort
      ? { proxyHost: state.systemProxyHost, proxyPort }
      : {}),
  };
}
