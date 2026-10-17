import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Channel, Category, PlaylistConfig } from '@/types/iptv';

// Safe helper to convert any response (array, stringified JSON, or PHP associative object) into an array
export function toArray<T = any>(data: any): T[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) return parsed;
      if (typeof parsed === 'object' && parsed !== null) return Object.values(parsed);
    } catch {
      return [];
    }
  }
  if (typeof data === 'object') {
    return Object.values(data);
  }
  return [];
}

// Universal HTTP fetcher that bypasses CORS on Android TV / Mobile using Capacitor Native HTTP
export async function fetchHttp(url: string, responseType: 'json' | 'text' = 'json'): Promise<any> {
  const cleanUrl = url.trim();

  if (Capacitor.isNativePlatform()) {
    try {
      // Use responseType 'text' over Android bridge to prevent Java OutOfMemory / TransactionTooLargeException
      const response = await CapacitorHttp.get({
        url: cleanUrl,
        responseType: 'text',
        connectTimeout: 30000,
        readTimeout: 120000,
      });

      if (response.status >= 400) {
        throw new Error(`Le serveur IPTV a répondu avec le code HTTP ${response.status}`);
      }

      if (responseType === 'json') {
        try {
          return typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
        } catch {
          return response.data;
        }
      }
      return response.data;
    } catch (nativeErr: any) {
      console.warn('CapacitorHttp native request failed, trying fetch fallback:', nativeErr);
    }
  }

  // Webview / Browser fallback
  const res = await fetch(cleanUrl, {
    headers: {
      'Accept': responseType === 'json' ? 'application/json, text/plain, */*' : '*/*',
    },
  });

  if (!res.ok) {
    throw new Error(`Erreur réseau (${res.status} ${res.statusText})`);
  }

  if (responseType === 'json') {
    return await res.json();
  }
  return await res.text();
}

// Detect category icon based on category name
export function detectCategoryIcon(name: string): string {
  const upper = (name || '').toUpperCase();
  if (upper.includes('SPORT') || upper.includes('FOOT') || upper.includes('CANAL+') || upper.includes('BEIN') || upper.includes('RMC')) {
    return 'Trophy';
  }
  if (upper.includes('CINEMA') || upper.includes('FILM') || upper.includes('MOVIE') || upper.includes('SERIE') || upper.includes('NETFLIX') || upper.includes('PRIME')) {
    return 'Film';
  }
  if (upper.includes('INFO') || upper.includes('NEWS') || upper.includes('ACTU') || upper.includes('BFM') || upper.includes('CNEWS')) {
    return 'Globe';
  }
  if (upper.includes('DOC') || upper.includes('DISCOVERY') || upper.includes('GEO') || upper.includes('HIST')) {
    return 'Compass';
  }
  if (upper.includes('FAV') || upper.includes('TOP') || upper.includes('VIP')) {
    return 'Star';
  }
  return 'Tv';
}

// Detect video resolution from channel name
export function detectResolution(name: string): '4K' | 'FHD' | 'HD' | 'SD' {
  const upper = (name || '').toUpperCase();
  if (upper.includes('4K') || upper.includes('UHD')) return '4K';
  if (upper.includes('FHD') || upper.includes('1080')) return 'FHD';
  if (upper.includes('HD') || upper.includes('720')) return 'HD';
  if (upper.includes('SD') || upper.includes('576')) return 'SD';
  return 'HD';
}

// Extract attributes from M3U #EXTINF tags (handles double quotes, single quotes, or unquoted values)
export function extractAttribute(line: string, attrName: string): string {
  const doubleQuote = new RegExp(`${attrName}="([^"]*)"`, 'i');
  const singleQuote = new RegExp(`${attrName}='([^']*)'`, 'i');
  const noQuote = new RegExp(`${attrName}=([^\\s,]+)`, 'i');

  const m1 = line.match(doubleQuote);
  if (m1) return m1[1].trim();
  const m2 = line.match(singleQuote);
  if (m2) return m2[1].trim();
  const m3 = line.match(noQuote);
  if (m3) return m3[1].trim();
  return '';
}

// Auto-detect stream type (live, vod, series) based on name, group and url
export function detectStreamType(name: string, groupName: string, url: string): 'live' | 'vod' | 'series' {
  const gUpper = (groupName || '').toUpperCase();
  const nUpper = (name || '').toUpperCase();
  const urlLower = (url || '').toLowerCase();

  // Series detection
  if (
    urlLower.includes('/series/') ||
    gUpper.includes('SERIE') ||
    gUpper.includes('SERIES') ||
    gUpper.includes('SAISON') ||
    gUpper.includes('SEASON') ||
    /\bS\d{1,2}\s*E\d{1,2}\b/i.test(name)
  ) {
    return 'series';
  }

  // VOD / Movies detection
  if (
    urlLower.includes('/movie/') ||
    urlLower.endsWith('.mp4') ||
    urlLower.endsWith('.mkv') ||
    urlLower.endsWith('.avi') ||
    urlLower.endsWith('.mov') ||
    gUpper.includes('VOD') ||
    gUpper.includes('FILM') ||
    gUpper.includes('MOVIE') ||
    gUpper.includes('CINEMA')
  ) {
    return 'vod';
  }

  return 'live';
}

export interface FetchCategoryStreamsParams {
  serverUrl: string;
  username: string;
  password: string;
  categoryId: string;
  categoryName: string;
  streamType: 'live' | 'vod' | 'series';
}

// On-demand category fetcher: fetches streams for a specific category in ~200ms
export async function fetchCategoryStreamsOnDemand(params: FetchCategoryStreamsParams): Promise<Channel[]> {
  let server = params.serverUrl.trim().replace(/\/+$/, '');
  if (!server.startsWith('http://') && !server.startsWith('https://')) {
    server = 'http://' + server;
  }
  const username = encodeURIComponent(params.username.trim());
  const password = encodeURIComponent(params.password.trim());
  const rawCatId = params.categoryId.trim();
  const catName = params.categoryName || 'Bouquet';
  const type = params.streamType;

  let action = 'get_live_streams';
  if (type === 'vod') action = 'get_vod_streams';
  if (type === 'series') action = 'get_series';

  const url = `${server}/player_api.php?username=${username}&password=${password}&action=${action}&category_id=${rawCatId}`;

  const res = await fetchHttp(url, 'json');
  const items = toArray(res);
  const channels: Channel[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;

    const streamId = item.stream_id || item.series_id || item.id || (i + 1);
    let streamUrl = '';
    if (type === 'vod') {
      const ext = item.container_extension || 'mp4';
      streamUrl = `${server}/movie/${username}/${password}/${streamId}.${ext}`;
    } else if (type === 'series') {
      const ext = item.container_extension || 'mp4';
      streamUrl = `${server}/series/${username}/${password}/${streamId}.${ext}`;
    } else {
      streamUrl = `${server}/live/${username}/${password}/${streamId}.m3u8`;
    }

    const chNum = typeof item.num === 'number' && item.num > 0 ? item.num : (i + 1);
    const itemName = item.name
      ? String(item.name).trim()
      : type === 'vod'
      ? `Film ${i + 1}`
      : type === 'series'
      ? `Série ${i + 1}`
      : `Chaîne ${i + 1}`;
    const logo = item.stream_icon || item.cover || '';

    channels.push({
      id: `ch_xtream_${type}_${streamId}`,
      num: chNum,
      name: itemName,
      logo: logo ? String(logo).trim() : '',
      stream_url: streamUrl,
      stream_type: type,
      group_id: `grp_${rawCatId}`,
      group_name: catName,
      epg_id: item.epg_channel_id ? String(item.epg_channel_id).trim() : undefined,
      is_favorite: false,
      is_hidden: false,
      custom_order: i + 1,
      resolution: detectResolution(itemName),
    });
  }

  return channels;
}

export interface XtreamSyncParams {
  serverUrl: string;
  username: string;
  password: string;
  name?: string;
  onProgress?: (step: string) => void;
}

export async function syncXtreamPlaylist(params: XtreamSyncParams): Promise<{
  playlist: PlaylistConfig;
  categories: Category[];
  channels: Channel[];
}> {
  const { onProgress } = params;
  let server = params.serverUrl.trim().replace(/\/+$/, '');
  if (!server.startsWith('http://') && !server.startsWith('https://')) {
    server = 'http://' + server;
  }
  const username = encodeURIComponent(params.username.trim());
  const password = encodeURIComponent(params.password.trim());
  const playlistName = params.name?.trim() || 'Abonnement Xtream';

  onProgress?.('Étape 1/4 : Connexion au serveur et vérification des accès...');

  // 1. Authenticate with Xtream player API
  const authUrl = `${server}/player_api.php?username=${username}&password=${password}`;
  let authData: any;
  try {
    authData = await fetchHttp(authUrl, 'json');
  } catch (err: any) {
    throw new Error(`Impossible de contacter le serveur Xtream (${server}) : ${err.message || 'Vérifiez l’adresse URL et votre connexion.'}`);
  }

  // Handle Xtream response structure
  if (typeof authData === 'string') {
    try {
      authData = JSON.parse(authData);
    } catch {
      // not json
    }
  }

  const userInfo = authData?.user_info;
  if (!userInfo || userInfo.auth === 0 || userInfo.status === 'Disabled') {
    throw new Error('Identifiant ou mot de passe Xtream incorrect, ou compte inactif sur ce serveur.');
  }

  // 2a. Fetch Live categories
  onProgress?.('Étape 2/4 : Récupération des catégories (Direct, Films, Séries)...');
  const catUrl = `${server}/player_api.php?username=${username}&password=${password}&action=get_live_categories`;
  let rawLiveCategories: any[] = [];
  try {
    const res = await fetchHttp(catUrl, 'json');
    rawLiveCategories = toArray(res);
  } catch (err) {
    console.warn('Could not fetch live categories directly:', err);
  }

  // 2b. Fetch VOD categories
  const vodCatUrl = `${server}/player_api.php?username=${username}&password=${password}&action=get_vod_categories`;
  let rawVodCategories: any[] = [];
  try {
    const res = await fetchHttp(vodCatUrl, 'json');
    rawVodCategories = toArray(res);
  } catch (err) {
    console.warn('Could not fetch vod categories:', err);
  }

  // 2c. Fetch Series categories
  const seriesCatUrl = `${server}/player_api.php?username=${username}&password=${password}&action=get_series_categories`;
  let rawSeriesCategories: any[] = [];
  try {
    const res = await fetchHttp(seriesCatUrl, 'json');
    rawSeriesCategories = toArray(res);
  } catch (err) {
    console.warn('Could not fetch series categories:', err);
  }

  // 3. Fetch Live streams
  onProgress?.('Étape 3/4 : Téléchargement des chaînes en direct...');
  const streamsUrl = `${server}/player_api.php?username=${username}&password=${password}&action=get_live_streams`;
  let rawLiveStreams: any[] = [];
  try {
    const res = await fetchHttp(streamsUrl, 'json');
    rawLiveStreams = toArray(res);
  } catch (err: any) {
    console.warn('Live streams batch fetch failed, will load on demand:', err);
  }

  // 4. Fetch VOD streams (first batch for instant display, rest loads on demand)
  onProgress?.('Étape 4/4 : Téléchargement du catalogue Films...');
  const vodStreamsUrl = `${server}/player_api.php?username=${username}&password=${password}&action=get_vod_streams`;
  let rawVodStreams: any[] = [];
  try {
    const res = await fetchHttp(vodStreamsUrl, 'json');
    rawVodStreams = toArray(res);
  } catch (err: any) {
    console.warn('VOD streams batch fetch deferred to on-demand loading:', err);
  }

  // Build category dictionary for Live
  const liveCategoryMap = new Map<string, string>();
  for (const c of rawLiveCategories) {
    if (c && c.category_id !== undefined && c.category_id !== null) {
      const idStr = String(c.category_id).trim();
      const nameStr = c.category_name ? String(c.category_name).trim() : `Bouquet ${idStr}`;
      liveCategoryMap.set(idStr, nameStr);
    }
  }

  // Build category dictionary for VOD
  const vodCategoryMap = new Map<string, string>();
  for (const c of rawVodCategories) {
    if (c && c.category_id !== undefined && c.category_id !== null) {
      const idStr = String(c.category_id).trim();
      const nameStr = c.category_name ? String(c.category_name).trim() : `Films ${idStr}`;
      vodCategoryMap.set(idStr, nameStr);
    }
  }

  // Build category dictionary for Series
  const seriesCategoryMap = new Map<string, string>();
  for (const c of rawSeriesCategories) {
    if (c && c.category_id !== undefined && c.category_id !== null) {
      const idStr = String(c.category_id).trim();
      const nameStr = c.category_name ? String(c.category_name).trim() : `Séries ${idStr}`;
      seriesCategoryMap.set(idStr, nameStr);
    }
  }

  const liveCategoryCounts = new Map<string, number>();
  const vodCategoryCounts = new Map<string, number>();
  const channels: Channel[] = [];
  const playlistId = 'pl_xtream_' + Date.now();

  // Track the EXACT order of categories as they appear in the stream lineup (matches TiviMate / Smarters)
  const liveCategoryOrderFromStreams: string[] = [];
  const seenLiveCatIds = new Set<string>();

  for (let i = 0; i < rawLiveStreams.length; i++) {
    const item = rawLiveStreams[i];
    if (!item) continue;

    let rawCatId = item.category_id;
    if ((rawCatId === undefined || rawCatId === null || rawCatId === '') && Array.isArray(item.category_ids) && item.category_ids.length > 0) {
      rawCatId = item.category_ids[0];
    }
    const catIdStr = rawCatId !== undefined && rawCatId !== null && String(rawCatId).trim() !== ''
      ? String(rawCatId).trim()
      : 'other';

    if (!seenLiveCatIds.has(catIdStr)) {
      seenLiveCatIds.add(catIdStr);
      liveCategoryOrderFromStreams.push(catIdStr);
    }

    const catName = liveCategoryMap.get(catIdStr) || (catIdStr === 'other' ? 'Autres Chaînes' : `Bouquet ${catIdStr}`);
    liveCategoryCounts.set(catIdStr, (liveCategoryCounts.get(catIdStr) || 0) + 1);

    const streamId = item.stream_id || item.id || (i + 1);
    const streamUrl = `${server}/live/${username}/${password}/${streamId}.m3u8`;
    const chNum = typeof item.num === 'number' && item.num > 0 ? item.num : (i + 1);

    channels.push({
      id: `ch_xtream_live_${streamId}`,
      num: chNum,
      name: item.name ? String(item.name).trim() : `Chaîne ${i + 1}`,
      logo: item.stream_icon ? String(item.stream_icon).trim() : '',
      stream_url: streamUrl,
      stream_type: 'live',
      group_id: `grp_${catIdStr}`,
      group_name: catName,
      epg_id: item.epg_channel_id ? String(item.epg_channel_id).trim() : undefined,
      is_favorite: false,
      is_hidden: false,
      custom_order: i + 1, // Strict stream lineup order
      resolution: detectResolution(item.name || ''),
    });
  }

  // Process VOD streams if downloaded
  const vodCategoryOrderFromStreams: string[] = [];
  const seenVodCatIds = new Set<string>();

  for (let i = 0; i < rawVodStreams.length; i++) {
    const item = rawVodStreams[i];
    if (!item) continue;

    const catIdStr = item.category_id !== undefined && item.category_id !== null && String(item.category_id).trim() !== ''
      ? String(item.category_id).trim()
      : 'other_vod';

    if (!seenVodCatIds.has(catIdStr)) {
      seenVodCatIds.add(catIdStr);
      vodCategoryOrderFromStreams.push(catIdStr);
    }

    const catName = vodCategoryMap.get(catIdStr) || 'Films & VOD';
    vodCategoryCounts.set(catIdStr, (vodCategoryCounts.get(catIdStr) || 0) + 1);

    const streamId = item.stream_id || item.id || (i + 1);
    const ext = item.container_extension || 'mp4';
    const streamUrl = `${server}/movie/${username}/${password}/${streamId}.${ext}`;
    const chNum = typeof item.num === 'number' && item.num > 0 ? item.num : (i + 1);

    channels.push({
      id: `ch_xtream_vod_${streamId}`,
      num: chNum,
      name: item.name ? String(item.name).trim() : `Film ${i + 1}`,
      logo: item.stream_icon ? String(item.stream_icon).trim() : '',
      stream_url: streamUrl,
      stream_type: 'vod',
      group_id: `grp_${catIdStr}`,
      group_name: catName,
      epg_id: undefined,
      is_favorite: false,
      is_hidden: false,
      custom_order: i + 1,
      resolution: detectResolution(item.name || ''),
    });
  }

  // Construct complete categories list preserving the exact broadcast lineup order
  const categories: Category[] = [];
  let orderIndex = 0;

  // Add favorite category at the top
  categories.push({
    id: 'fav',
    name: '★ Mes Favoris',
    type: 'live',
    count: 0,
    is_hidden: false,
    custom_order: orderIndex++,
    icon: 'Star',
  });

  // 1. LIVE CATEGORIES in order of appearance in stream lineup
  for (const catId of liveCategoryOrderFromStreams) {
    const catName = liveCategoryMap.get(catId) || (catId === 'other' ? 'Autres Chaînes' : `Bouquet ${catId}`);
    categories.push({
      id: `grp_${catId}`,
      name: catName,
      type: 'live',
      count: liveCategoryCounts.get(catId) || 0,
      is_hidden: false,
      custom_order: orderIndex++,
      icon: detectCategoryIcon(catName),
    });
  }

  // Add any remaining live categories that did not have streams in rawLiveStreams
  for (const rawCat of rawLiveCategories) {
    if (!rawCat || rawCat.category_id === undefined || rawCat.category_id === null) continue;
    const catIdStr = String(rawCat.category_id).trim();
    if (!seenLiveCatIds.has(catIdStr)) {
      seenLiveCatIds.add(catIdStr);
      const catName = rawCat.category_name ? String(rawCat.category_name).trim() : `Bouquet ${catIdStr}`;
      categories.push({
        id: `grp_${catIdStr}`,
        name: catName,
        type: 'live',
        count: liveCategoryCounts.get(catIdStr) || 0,
        is_hidden: false,
        custom_order: orderIndex++,
        icon: detectCategoryIcon(catName),
      });
    }
  }

  // 2. VOD (FILMS) CATEGORIES
  let vodOrderIndex = 10000;
  for (const catId of vodCategoryOrderFromStreams) {
    const catName = vodCategoryMap.get(catId) || 'Films';
    categories.push({
      id: `grp_${catId}`,
      name: catName,
      type: 'vod',
      count: vodCategoryCounts.get(catId) || 0,
      is_hidden: false,
      custom_order: vodOrderIndex++,
      icon: 'Film',
    });
  }

  // Add any remaining VOD categories from rawVodCategories
  for (const rawCat of rawVodCategories) {
    if (!rawCat || rawCat.category_id === undefined || rawCat.category_id === null) continue;
    const catIdStr = String(rawCat.category_id).trim();
    if (!seenVodCatIds.has(catIdStr)) {
      seenVodCatIds.add(catIdStr);
      const catName = rawCat.category_name ? String(rawCat.category_name).trim() : `Films ${catIdStr}`;
      categories.push({
        id: `grp_${catIdStr}`,
        name: catName,
        type: 'vod',
        count: vodCategoryCounts.get(catIdStr) || 0,
        is_hidden: false,
        custom_order: vodOrderIndex++,
        icon: 'Film',
      });
    }
  }

  // 3. SERIES CATEGORIES
  let seriesOrderIndex = 20000;
  for (const rawCat of rawSeriesCategories) {
    if (!rawCat || rawCat.category_id === undefined || rawCat.category_id === null) continue;
    const catIdStr = String(rawCat.category_id).trim();
    const catName = rawCat.category_name ? String(rawCat.category_name).trim() : `Séries ${catIdStr}`;
    categories.push({
      id: `grp_${catIdStr}`,
      name: catName,
      type: 'series',
      count: 0,
      is_hidden: false,
      custom_order: seriesOrderIndex++,
      icon: 'Film',
    });
  }

  const playlist: PlaylistConfig = {
    id: playlistId,
    name: playlistName,
    type: 'xtream',
    server_url: server,
    username: params.username.trim(),
    password: params.password.trim(),
    status: 'active',
    channel_count: channels.length,
    last_sync_at: new Date().toISOString(),
  };

  return { playlist, categories, channels };
}

export interface M3USyncParams {
  m3uUrl: string;
  name?: string;
  onProgress?: (step: string) => void;
}

export async function parseM3UPlaylist(params: M3USyncParams): Promise<{
  playlist: PlaylistConfig;
  categories: Category[];
  channels: Channel[];
}> {
  const { onProgress } = params;
  const m3uUrl = params.m3uUrl.trim();
  const playlistName = params.name?.trim() || 'Ma Playlist M3U';

  onProgress?.('Étape 1/3 : Téléchargement du fichier de playlist M3U...');

  let content = '';
  try {
    content = await fetchHttp(m3uUrl, 'text');
  } catch (err: any) {
    throw new Error(`Impossible de télécharger la playlist M3U : ${err.message}`);
  }

  if (!content || !content.includes('#EXTINF')) {
    throw new Error('Le fichier téléchargé n’est pas une playlist M3U valide (balise #EXTINF introuvable).');
  }

  onProgress?.('Étape 2/3 : Analyse des chaînes, films et séries...');

  const lines = content.split(/\r?\n/);
  const channels: Channel[] = [];
  const categoryCounts = new Map<string, number>();
  const categoryTypeMap = new Map<string, 'live' | 'vod' | 'series'>();
  const groupOrder: { id: string; name: string }[] = [];
  const seenGroupIds = new Set<string>();

  let currentExtInf: {
    name: string;
    logo?: string;
    group: string;
    epgId?: string;
  } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith('#EXTINF:')) {
      const logo = extractAttribute(line, 'tvg-logo');
      const group = extractAttribute(line, 'group-title') || 'Général';
      const epgId = extractAttribute(line, 'tvg-id') || undefined;

      const commaIdx = line.indexOf(',');
      const chName = commaIdx !== -1 && commaIdx < line.length - 1
        ? line.slice(commaIdx + 1).trim()
        : (extractAttribute(line, 'tvg-name') || `Chaîne ${channels.length + 1}`);

      currentExtInf = {
        name: chName,
        logo,
        group,
        epgId,
      };
    } else if (!line.startsWith('#') && currentExtInf) {
      const streamUrl = line;
      const groupName = currentExtInf.group;
      const streamType = detectStreamType(currentExtInf.name, groupName, streamUrl);
      const groupId = 'grp_' + groupName.toLowerCase().replace(/[^a-z0-9]/g, '_');

      if (!seenGroupIds.has(groupId)) {
        seenGroupIds.add(groupId);
        groupOrder.push({ id: groupId, name: groupName });
        categoryTypeMap.set(groupId, streamType);
      } else {
        // If already seen, upgrade category type if series or vod is predominant
        const existingType = categoryTypeMap.get(groupId);
        if (existingType === 'live' && (streamType === 'vod' || streamType === 'series')) {
          categoryTypeMap.set(groupId, streamType);
        }
      }

      categoryCounts.set(groupId, (categoryCounts.get(groupId) || 0) + 1);

      channels.push({
        id: `ch_m3u_${channels.length + 1}`,
        num: channels.length + 1,
        name: currentExtInf.name,
        logo: currentExtInf.logo || '',
        stream_url: streamUrl,
        stream_type: streamType,
        group_id: groupId,
        group_name: groupName,
        epg_id: currentExtInf.epgId,
        is_favorite: false,
        is_hidden: false,
        custom_order: channels.length + 1, // Strict M3U appearance order
        resolution: detectResolution(currentExtInf.name),
      });

      currentExtInf = null;
    }
  }

  if (channels.length === 0) {
    throw new Error('Aucun flux vidéo exploitable n’a pu être extrait de ce lien M3U.');
  }

  onProgress?.(`Étape 3/3 : Préparation de ${channels.length} chaînes, films et séries...`);

  // Build Categories in exact order of appearance in M3U file
  const categories: Category[] = [];
  let orderIndex = 0;

  categories.push({
    id: 'fav',
    name: '★ Mes Favoris',
    type: 'live',
    count: 0,
    is_hidden: false,
    custom_order: orderIndex++,
    icon: 'Star',
  });

  for (const grp of groupOrder) {
    const grpType = categoryTypeMap.get(grp.id) || 'live';
    categories.push({
      id: grp.id,
      name: grp.name,
      type: grpType,
      count: categoryCounts.get(grp.id) || 0,
      is_hidden: false,
      custom_order: orderIndex++,
      icon: detectCategoryIcon(grp.name),
    });
  }

  const playlist: PlaylistConfig = {
    id: 'pl_m3u_' + Date.now(),
    name: playlistName,
    type: 'm3u',
    server_url: m3uUrl,
    m3u_url: m3uUrl,
    status: 'active',
    channel_count: channels.length,
    last_sync_at: new Date().toISOString(),
  };

  return { playlist, categories, channels };
}
