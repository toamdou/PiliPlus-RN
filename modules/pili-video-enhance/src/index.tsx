import React from 'react';
import { View, type ViewProps } from 'react-native';
import { requireNativeViewManager, requireOptionalNativeModule } from 'expo-modules-core';

export type PlayerLike = {
  __expo_shared_object_id__?: unknown;
};

export type EnhancementMode = 'off' | 'on';

export type EnhanceOptions = {
  superResolution?: EnhancementMode;
  frameInterpolation?: EnhancementMode;
  sdrToHdr?: EnhancementMode;
};

export type FeatureReason =
  | 'unsupported-os'
  | 'unsupported-chip'
  | 'unsupported-display'
  | 'unsupported-codec'
  | 'drm-unsupported'
  | 'expo-go'
  | 'unknown';

export type FeatureSupport = {
  available: boolean;
  reason?: FeatureReason;
};

export type EnhancementCapabilities = {
  available: boolean;
  platform: 'ios';
  osVersion: string;
  chipName: string;
  refreshRateHz: number;
  hdrCapable: boolean;
  safeAreaInsets: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  superResolution: FeatureSupport;
  frameInterpolation: FeatureSupport;
  sdrToHdr: FeatureSupport;
};

export type EnhancementState = {
  playerId: number;
  state: 'attaching' | 'active' | 'paused' | 'fallingBack' | 'detached';
  activeEnhancements: Required<EnhanceOptions>;
};

export type EnhancementError = {
  playerId: number;
  code: string;
  message: string;
  enhancement?: keyof EnhanceOptions;
};

export type EnhancedVideoViewProps = ViewProps & {
  player?: PlayerLike | null;
  playerId?: number | null;
  options?: EnhanceOptions;
  contentFit?: 'contain' | 'cover' | 'fill';
  safeAreaInsets?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  onReady?: () => void;
  onFirstFrameRender?: () => void;
  onStateChange?: (state: EnhancementState) => void;
  onError?: (error: EnhancementError) => void;
};

type NativeEnhanceModule = {
  getCapabilitiesAsync(): Promise<EnhancementCapabilities>;
};

const NativeModule = requireOptionalNativeModule<NativeEnhanceModule>('PiliVideoEnhance');

export function isModuleAvailable(): boolean {
  return NativeModule != null;
}

export async function getCapabilitiesAsync(): Promise<EnhancementCapabilities | null> {
  if (!NativeModule) {
    return null;
  }
  try {
    return await NativeModule.getCapabilitiesAsync();
  } catch {
    return null;
  }
}

const NativeEnhancedVideoView = isModuleAvailable()
  ? requireNativeViewManager('PiliVideoEnhance', 'EnhancedVideoView')
  : null;

function getPlayerId(player: PlayerLike | null | undefined): number | null {
  if (!player) return null;
  // SharedObject ID installed by expo-modules-core.
  const id = player.__expo_shared_object_id__;
  return typeof id === 'number' ? id : null;
}

export function EnhancedVideoView(props: EnhancedVideoViewProps) {
  const { player, playerId, onReady, onFirstFrameRender, onStateChange, onError, ...viewProps } =
    props;
  const resolvedPlayerId = playerId ?? getPlayerId(player);

  if (!NativeEnhancedVideoView || resolvedPlayerId == null) {
    return <View {...viewProps} />;
  }

  return (
    <NativeEnhancedVideoView
      {...viewProps}
      player={resolvedPlayerId}
      onReady={onReady}
      onFirstFrameRender={onFirstFrameRender}
      onStateChange={onStateChange}
      onError={onError}
    />
  );
}
