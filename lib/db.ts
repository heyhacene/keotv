import Dexie, { Table } from 'dexie';
import { Channel, Category, EpgProgram, PlaylistConfig } from '@/types/iptv';

/**
 * SINGLE source of truth for the whole app: one IndexedDB database (Dexie).
 * Every read and every write of the catalog goes through this database.
 * (A previous build wrote to a second native SQLite store while reading this one,
 * which caused an endless re-sync loop. Never introduce a second store again.)
 */
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
    // v4: index on `added` so "Récemment ajoutés" no longer loads the whole VOD catalog in memory
    this.version(4).stores({
      channels: 'id, group_id, stream_type, num, custom_order, name, added',
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
    return item && item.value !== undefined ? (item.value as T) : defaultValue;
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

/**
 * Favorite ids are stored in settings (source of truth). IndexedDB cannot index booleans,
 * so scanning `is_favorite` would read the whole catalog (100k rows): never do that.
 */
export async function getFavoriteChannelIds(): Promise<Set<string>> {
  try {
    const ids = await getSetting<string[]>('favorite_channel_ids', []);
    return new Set(Array.isArray(ids) ? ids : []);
  } catch {
    return new Set();
  }
}

export async function saveFavoriteChannelId(id: string, isFav: boolean): Promise<void> {
  try {
    const set = await getFavoriteChannelIds();
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

export async function saveBulkCategories(categories: Category[]): Promise<void> {
  if (categories.length === 0) return;
  await db.categories.bulkPut(categories);
}

/** Chunked channel writer (keeps each IndexedDB transaction small on low-end Android TV boxes). */
export async function saveBulkChannels(channels: Channel[], chunkSize = 2000): Promise<void> {
  for (let i = 0; i < channels.length; i += chunkSize) {
    await db.channels.bulkPut(channels.slice(i, i + chunkSize));
  }
}

/** Indexed loader for one category / stream type (never scans the full table). */
export async function getCategoryChannels(params: {
  groupId?: string;
  streamType?: string;
  sort?: 'playlist' | 'alpha' | 'num';
  limit?: number;
}): Promise<Channel[]> {
  let list: Channel[] = [];
  if (params.groupId) {
    list = await db.channels.where('group_id').equals(params.groupId).toArray();
  } else if (params.streamType) {
    list = await db.channels.where('stream_type').equals(params.streamType).toArray();
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
 * Fast search across channels (Dexie)
 */
export async function searchAllChannels(query: string, streamType?: string, limit: number = 100): Promise<Channel[]> {
  if (!query || !query.trim()) return [];
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
