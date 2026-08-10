import { type ViewProps } from 'react-native';
import {
  requireNativeModule,
  requireNativeViewManager,
} from 'expo-modules-core';

type PiliWebViewInternalLinkEvent = {
  nativeEvent: { url: string };
};

type PiliWebViewSource = {
  uri?: string;
  url?: string;
};

type PiliWebViewProps = ViewProps & {
  source?: PiliWebViewSource;
  sourceUrl?: string;
  javaScriptEnabled?: boolean;
  allowsBackForwardNavigationGestures?: boolean;
  onOpenInternalLink?: (event: PiliWebViewInternalLinkEvent) => void;
};

type NativePiliWebViewProps = {
  sourceUrl?: string;
  javaScriptEnabled?: boolean;
  allowsBackForwardNavigationGestures?: boolean;
  onOpenInternalLink?: (payload: { url: string }) => void;
};

type NativePiliWebViewModule = {
  isAvailableAsync(): Promise<boolean>;
  clearBilibiliDataAsync(): Promise<void>;
};

const NativeModule = requireNativeModule<NativePiliWebViewModule>('PiliWebView');

export async function clearBilibiliDataAsync(): Promise<void> {
  await NativeModule.clearBilibiliDataAsync();
}

const NativePiliWebView = requireNativeViewManager<NativePiliWebViewProps>(
  'PiliWebView',
  'PiliWebView',
);

export function PiliWebView(props: PiliWebViewProps) {
  const {
    source,
    sourceUrl,
    javaScriptEnabled = true,
    allowsBackForwardNavigationGestures = false,
    onOpenInternalLink,
    ...viewProps
  } = props;

  const resolvedSourceUrl = sourceUrl ?? source?.uri ?? source?.url ?? '';

  return (
    <NativePiliWebView
      {...viewProps}
      sourceUrl={resolvedSourceUrl}
      javaScriptEnabled={javaScriptEnabled}
      allowsBackForwardNavigationGestures={allowsBackForwardNavigationGestures}
      onOpenInternalLink={onOpenInternalLink ? (payload) => onOpenInternalLink({ nativeEvent: payload }) : undefined}
    />
  );
}
