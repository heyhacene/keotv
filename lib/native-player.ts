import { Capacitor, registerPlugin } from '@capacitor/core';

export interface NativePlayerPlayOptions {
  urls: string[];
  titles: string[];
  index: number;
  userAgent: string;
  isLive: boolean;
  seriesId?: string;
  preferredAudio?: string;
  preferredSubtitle?: string;
}

export interface NativePlayerPreviewOptions {
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
  muted?: boolean;
  userAgent?: string;
}

export interface NativePlayerPreviewRectOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  muted?: boolean;
}

interface NativePlayerPlugin {
  play(options: NativePlayerPlayOptions): Promise<void>;
  playPreview(options: NativePlayerPreviewOptions): Promise<void>;
  updatePreviewRect(options: NativePlayerPreviewRectOptions): Promise<void>;
  stopPreview(): Promise<void>;
}

// Android ExoPlayer (Media3) based player, injected at build time by the CI workflow.
export const NativePlayer = registerPlugin<NativePlayerPlugin>('NativePlayer');

export function isNativePlayerAvailable(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('NativePlayer');
  } catch {
    return false;
  }
}

export const NATIVE_PLAYER_USER_AGENT = 'IPTVSmartersPro/3.1.5 (Linux; Android 12)';
