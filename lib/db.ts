import Dexie, { Table } from 'dexie';
import { Channel, Category, EpgProgram, PlaylistConfig, UserSettings } from '@/types/iptv';

export class KeoTVDatabase extends Dexie {
  channels!: Table<Channel, string>;
  categories!: Table<Category, string>;
  epg_programs!: Table<EpgProgram, string>;
  playlists!: Table<PlaylistConfig, string>;
  settings!: Table<{ key: string; value: any }, string>;

  constructor() {
    super('KeoTVDB');
    this.version(1).stores({
      channels: 'id, group_id, is_favorite, num, custom_order, name',
      categories: 'id, type, is_hidden, custom_order',
      epg_programs: 'id, channel_id, start, end, [channel_id+start]',
      playlists: 'id, type, status',
      settings: 'key',
    });
    // Version 2: Drop invalid boolean indices (is_favorite, is_hidden) which throw DataError in Android WebView
    this.version(2).stores({
      channels: 'id, group_id, num, custom_order, name',
      categories: 'id, type, custom_order',
      epg_programs: 'id, channel_id, start, end, [channel_id+start]',
      playlists: 'id, type, status',
      settings: 'key',
    });
    // Version 3: Index stream_type for fast section filtering (live, vod, series)
    this.version(3).stores({
      channels: 'id, group_id, stream_type, num, custom_order, name',
      categories: 'id, type, custom_order',
      epg_programs: 'id, channel_id, start, end, [channel_id+start]',
      playlists: 'id, type, status',
      settings: 'key',
    });
  }
}

export const db = new KeoTVDatabase();

export async function getSetting<T>(key: string, defaultValue: T): Promise<T> {
  try {
    const item = await db.settings.get(key);
    return item ? (item.value as T) : defaultValue;
  } catch (e) {
    console.error('Failed to get setting', key, e);
    return defaultValue;
  }
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  try {
    await db.settings.put({ key, value });
  } catch (e) {
    console.error('Failed to save setting', key, e);
  }
}

export async function getFavoriteChannelIds(): Promise<Set<string>> {
  try {
    const ids = await getSetting<string[]>('favorite_channel_ids', []);
    const set = new Set(Array.isArray(ids) ? ids : []);
    // Also harvest any existing favorite channels in db.channels
    const existingFavChannels = await db.channels.filter((c) => Boolean(c.is_favorite)).toArray();
    let updated = false;
    for (const c of existingFavChannels) {
      if (!set.has(c.id)) {
        set.add(c.id);
        updated = true;
      }
    }
    if (updated) {
      await setSetting('favorite_channel_ids', Array.from(set));
    }
    return set;
  } catch {
    return new Set();
  }
}

export async function saveFavoriteChannelId(id: string, isFav: boolean): Promise<void> {
  try {
    const ids = await getSetting<string[]>('favorite_channel_ids', []);
    const set = new Set(Array.isArray(ids) ? ids : []);
    if (isFav) {
      set.add(id);
    } else {
      set.delete(id);
    }
    await setSetting('favorite_channel_ids', Array.from(set));
  } catch (err) {
    console.warn('Failed to persist favorite channel id:', err);
  }
}

