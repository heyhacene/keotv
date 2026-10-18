import { Capacitor, registerPlugin } from '@capacitor/core';

export interface NativePlayerPlayOptions {
  urls: string[];
  titles: string[];
  index: number;
  userAgent: string;
  isLive: boolean;
}

interface NativePlayerPlugin {
  play(options: NativePlayerPlayOptions): Promise<void>;
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
