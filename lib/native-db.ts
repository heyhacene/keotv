import { registerPlugin, Capacitor } from '@capacitor/core';
import { Category, Channel, PlaylistConfig } from '@/types/iptv';

export interface NativeDatabasePluginInterface {
  isAvailable(): Promise<{ available: boolean; type: string }>;
  bulkInsertCategories(options: { categories: Category[] }): Promise<{ inserted: number }>;
  bulkInsertChannels(options: { channels: Channel[] }): Promise<{ inserted: number }>;
  getCategories(options?: { type?: string; includeHidden?: boolean }): Promise<{ categories: Category[] }>;
  getChannels(options?: {
    groupId?: string;
    streamType?: string;
    isFavorite?: boolean;
    sort?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ channels: Channel[] }>;
  searchChannels(options: { query: string; streamType?: string; limit?: number }): Promise<{ channels: Channel[] }>;
  toggleFavorite(options: { channelId: string; isFavorite?: boolean }): Promise<void>;
  updateCategoryCounts(): Promise<void>;
  getSetting(options: { key: string }): Promise<{ value?: string }>;
  setSetting(options: { key: string; value: string }): Promise<void>;
  clearAll(): Promise<void>;
}

export const NativeDatabase = registerPlugin<NativeDatabasePluginInterface>('NativeDatabase');

let _isAvailableChecked = false;
let _isAvailable = false;

export async function isNativeDb(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  if (_isAvailableChecked) return _isAvailable;
  try {
    const res = await NativeDatabase.isAvailable();
    _isAvailable = Boolean(res?.available);
  } catch (err) {
    _isAvailable = false;
  }
  _isAvailableChecked = true;
  return _isAvailable;
}
