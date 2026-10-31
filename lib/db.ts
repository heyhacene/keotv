import Dexie, { Table } from 'dexie';
import { Channel, Category, EpgProgram, PlaylistConfig, UserSettings } from '@/types/iptv';
import { NativeDatabase, isNativeDb } from './native-db';

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
    this.version(2).stores({
      channels: 'id, group_id, num, custom_order, name',
      categories: 'id, type, custom_order',
      epg_programs: 'id, channel_id, start, end, [channel_id+start]',
      playlists: 'id, type, status',
      settings: 'key',
    });
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
    if (await isNativeDb()) {
      const res = await NativeDatabase.getSetting({ key });
      if (res && res.value !== undefined && res.value !== null) {
        try {
          return JSON.parse(res.value) as T;
        } catch {
          return (res.value as unknown) as T;
        }
      }
    }
    const item = await db.settings.get(key);
    return item ? (item.value as T) : defaultValue;
  } catch (e) {
    console.error('Failed to get setting', key, e);
    return defaultValue;
  }
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  try {
    if (await isNativeDb()) {
      const valStr = typeof value === 'string' ? value : JSON.stringify(value);
      await NativeDatabase.setSetting({ key, value: valStr });
    }
    await db.settings.put({ key, value });
  } catch (e) {
    console.error('Failed to save setting', key, e);
  }
}

export async function getFavoriteChannelIds(): Promise<Set<string>> {
  try {
    const ids = await getSetting<string[]>('favorite_channel_ids', []);
    const set = new Set(Array.isArray(ids) ? ids : []);
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
    if (await isNativeDb()) {
      await NativeDatabase.toggleFavorite({ channelId: id, isFavorite: isFav });
    }
  } catch (err) {
    console.warn('Failed to persist favorite channel id:', err);
  }
}

/**
 * Unified high-performance bulk categories saver
 */
export async function saveBulkCategories(categories: Category[]): Promise<void> {
  if (categories.length === 0) return;
  if (await isNativeDb()) {
    try {
      await NativeDatabase.bulkInsertCategories({ categories });
    } catch (err) {
      console.warn('Native bulkInsertCategories fallback to Dexie:', err);
    }
  }
  await db.categories.bulkPut(categories);
}

/**
 * Unified high-performance bulk channels saver (handles 100k streams without UI freeze)
 */
export async function saveBulkChannels(channels: Channel[]): Promise<void> {
  if (channels.length === 0) return;
  if (await isNativeDb()) {
    try {
      const CHUNK = 5000;
      for (let i = 0; i < channels.length; i += CHUNK) {
        await NativeDatabase.bulkInsertChannels({ channels: channels.slice(i, i + CHUNK) });
      }
      return;
    } catch (err) {
      console.warn('Native bulkInsertChannels fallback to Dexie:', err);
    }
  }

  // Dexie chunked fallback
  const CHUNK_SIZE = 500;
  for (let i = 0; i < channels.length; i += CHUNK_SIZE) {
    const chunk = channels.slice(i, i + CHUNK_SIZE);
    try {
      await db.channels.bulkPut(chunk);
    } catch {
      await db.transaction('rw', db.channels, async () => {
        for (const item of chunk) {
          try { await db.channels.put(item); } catch {}
        }
      });
    }
  }
}

/**
 * Fast category channels loader (Native SQLite query or Dexie)
 */
export async function getCategoryChannels(params: {
  groupId?: string;
  streamType?: string;
  isFavorite?: boolean;
  sort?: 'playlist' | 'alpha' | 'num';
  limit?: number;
  offset?: number;
}): Promise<Channel[]> {
  if (await isNativeDb()) {
    try {
      const res = await NativeDatabase.getChannels(params);
      if (res && Array.isArray(res.channels)) {
        return res.channels;
      }
    } catch (err) {
      console.warn('Native getChannels fallback to Dexie:', err);
    }
  }

  // Dexie fallback
  let list: Channel[] = [];
  if (params.groupId) {
    list = await db.channels.where('group_id').equals(params.groupId).toArray();
  } else if (params.streamType) {
    list = await db.channels.where('stream_type').equals(params.streamType).toArray();
  } else if (params.isFavorite) {
    list = await db.channels.filter((c) => Boolean(c.is_favorite)).toArray();
  } else {
    list = await db.channels.limit(params.limit || 200).toArray();
  }

  if (params.sort === 'alpha') {
    list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  } else if (params.sort === 'num') {
    list.sort((a, b) => (a.num || 0) - (b.num || 0));
  } else {
    list.sort((a, b) => (a.custom_order || 0) - (b.custom_order || 0));
  }

  return list;
}

/**
 * Fast global search across all channels (Native SQLite LIKE or in-memory)
 */
export async function searchAllChannels(query: string, streamType?: string, limit: number = 100): Promise<Channel[]> {
  if (!query || !query.trim()) return [];
  if (await isNativeDb()) {
    try {
      const res = await NativeDatabase.searchChannels({ query, streamType, limit });
      if (res && Array.isArray(res.channels)) {
        return res.channels;
      }
    } catch (err) {
      console.warn('Native search fallback:', err);
    }
  }

  // Fallback Dexie search
  const norm = query.trim().toLowerCase();
  return await db.channels
    .filter((c) => {
      if (c.is_separator) return false;
      if (streamType && streamType !== 'all' && c.stream_type !== streamType) return false;
      return (c.name || '').toLowerCase().includes(norm);
    })
    .limit(limit)
    .toArray();
}
