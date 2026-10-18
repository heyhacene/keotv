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

// Standard IPTV Player User-Agent accepted by all IPTV providers & CDNs
const IPTV_USER_AGENT = 'IPTVSmartersPro/3.1.5 (Linux; Android 12)';

// Universal HTTP fetcher that bypasses CORS on Android TV / Mobile using Capacitor Native HTTP
export async function fetchHttp(url: string, responseType: 'json' | 'text' = 'json'): Promise<any> {
  const cleanUrl = url.trim();

  if (Capacitor.isNativePlatform()) {
    try {
      const response = await CapacitorHttp.get({
        url: cleanUrl,
        headers: {
          'User-Agent': IPTV_USER_AGENT,
          'Accept': responseType === 'json' ? 'application/json, text/plain, */*' : '*/*',
          'Connection': 'keep-alive',
        },
        responseType: responseType === 'json' ? 'json' : 'text',
        connectTimeout: 20000,
        readTimeout: 35000,
      });

      if (response.status >= 400) {
        throw new Error(`Le serveur IPTV a répondu avec le code HTTP ${response.status}`);
      }

      if (response.data !== undefined && response.data !== null) {
        if (responseType === 'json') {
          if (typeof response.data === 'string') {
            const trimmed = response.data.trim();
            if (!trimmed || trimmed === 'null') return [];
            try {
              return JSON.parse(trimmed);
            } catch {
              return response.data;
            }
          }
          return response.data;
        }
        return response.data;
      }
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

// Category classification helpers to guarantee 100% strict separation between Films and Séries
export function isSeriesCategory(name: string): boolean {
  const upper = (name || '').toUpperCase();
  return (
    upper.includes('SERIE') ||
    upper.includes('SERIES') ||
    upper.includes('SÉRIE') ||
    upper.includes('SÉRIES') ||
    upper.includes('SAISON') ||
    upper.includes('SEASON') ||
    upper.includes('EPISODE') ||
    upper.includes('ÉPISODE') ||
    upper.includes('ANIME') ||
    upper.includes('ANIMES') ||
    upper.includes('MANGA') ||
    upper.includes('DRAMA')
  );
}

export function isFilmCategory(name: string): boolean {
  const upper = (name || '').toUpperCase();
  return (
    upper.includes('FILM') ||
    upper.includes('FILMS') ||
    upper.includes('MOVIE') ||
    upper.includes('MOVIES') ||
    upper.includes('CINEMA') ||
    upper.includes('CINÉMA') ||
    upper.includes('VOD') ||
    upper.includes('SPECTACLE') ||
    upper.includes('BOX OFFICE')
  );
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

// Resolve first playable episode URL for a TV series from Xtream API
export async function resolveFirstEpisodeUrl(
  serverUrl: string,
  username: string,
  password: string,
  seriesId: string | number
): Promise<string | null> {
  let server = serverUrl.trim().replace(/\/+$/, '');
  if (!server.startsWith('http://') && !server.startsWith('https://')) {
    server = 'http://' + server;
  }
  const cleanUser = decodeURIComponent(username.trim());
  const cleanPass = decodeURIComponent(password.trim());
  const encUser = encodeURIComponent(cleanUser);
  const encPass = encodeURIComponent(cleanPass);

  const url = `${server}/player_api.php?username=${encUser}&password=${encPass}&action=get_series_info&series_id=${seriesId}`;
  try {
    const data = await fetchHttp(url, 'json');
    if (data && data.episodes) {
      const seasonKeys = Object.keys(data.episodes).sort((a, b) => Number(a) - Number(b));
      for (const sk of seasonKeys) {
        const epList = data.episodes[sk];
        if (Array.isArray(epList) && epList.length > 0) {
          const firstEp = epList[0];
          const epId = firstEp.id || firstEp.stream_id;
          const ext = firstEp.container_extension || 'mp4';
          if (epId) {
            return `${server}/series/${encUser}/${encPass}/${epId}.${ext}`;
          }
        }
      }
    }
  } catch (err) {
    console.warn('Failed to resolve series episode url:', err);
  }
  return null;
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
  const cleanUser = decodeURIComponent(params.username.trim());
  const cleanPass = decodeURIComponent(params.password.trim());
  const username = encodeURIComponent(cleanUser);
  const password = encodeURIComponent(cleanPass);
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

    // Prefix group_id with stream type to prevent any primary key collisions
    channels.push({
      id: `ch_xtream_${type}_${streamId}`,
      num: chNum,
      name: itemName,
      logo: logo ? String(logo).trim() : '',
      stream_url: streamUrl,
      stream_type: type,
      group_id: `grp_${type}_${rawCatId}`,
      group_name: catName,
      epg_id: item.epg_channel_id ? String(item.epg_channel_id).trim() : (type === 'series' ? String(streamId) : undefined),
      is_favorite: false,
      is_hidden: false,
      custom_order: chNum,
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
  const cleanUsername = decodeURIComponent(params.username.trim());
  const cleanPassword = decodeURIComponent(params.password.trim());
  const username = encodeURIComponent(cleanUsername);
  const password = encodeURIComponent(cleanPassword);
  const playlistName = params.name?.trim() || 'Abonnement Xtream';

  onProgress?.('Étape 1/3 : Connexion au serveur et vérification des accès...');

  // 1. Authenticate with Xtream player API
  const authUrl = `${server}/player_api.php?username=${username}&password=${password}`;
  let authData: any;
  try {
    authData = await fetchHttp(authUrl, 'json');
  } catch (err: any) {
    throw new Error(`Impossible de contacter le serveur Xtream (${server}) : ${err.message || 'Vérifiez l’adresse URL et votre connexion.'}`);
  }

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

  // 2. Fetch Categories (Live, VOD, Series)
  onProgress?.('Étape 2/3 : Organisation des bouquets TV, Films et Séries...');
  const catUrl = `${server}/player_api.php?username=${username}&password=${password}&action=get_live_categories`;
  let rawLiveCategories: any[] = [];
  try {
    const res = await fetchHttp(catUrl, 'json');
    rawLiveCategories = toArray(res);
  } catch (err) {
    console.warn('Could not fetch live categories directly:', err);
  }

  const vodCatUrl = `${server}/player_api.php?username=${username}&password=${password}&action=get_vod_categories`;
  let rawVodCategories: any[] = [];
  try {
    const res = await fetchHttp(vodCatUrl, 'json');
    rawVodCategories = toArray(res);
  } catch (err) {
    console.warn('Could not fetch vod categories:', err);
  }

  const seriesCatUrl = `${server}/player_api.php?username=${username}&password=${password}&action=get_series_categories`;
  let rawSeriesCategories: any[] = [];
  try {
    const res = await fetchHttp(seriesCatUrl, 'json');
    rawSeriesCategories = toArray(res);
  } catch (err) {
    console.warn('Could not fetch series categories:', err);
  }

  // 3. Classify and strictly partition categories so Films and Séries never overlap!
  const categories: Category[] = [];
  let orderIndex = 0;

  // Add Favorites category at the top of Live
  categories.push({
    id: 'fav',
    name: '★ Mes Favoris',
    type: 'live',
    count: 0,
    is_hidden: false,
    custom_order: orderIndex++,
    icon: 'Star',
  });

  // 1. LIVE CATEGORIES
  const seenLiveCatIds = new Set<string>();
  for (let i = 0; i < rawLiveCategories.length; i++) {
    const rawCat = rawLiveCategories[i];
    if (!rawCat || rawCat.category_id === undefined || rawCat.category_id === null) continue;
    const catIdStr = String(rawCat.category_id).trim();
    if (seenLiveCatIds.has(catIdStr)) continue;
    seenLiveCatIds.add(catIdStr);

    const catName = rawCat.category_name ? String(rawCat.category_name).trim() : `Bouquet ${catIdStr}`;
    categories.push({
      id: `grp_live_${catIdStr}`,
      name: catName,
      type: 'live',
      count: 0,
      is_hidden: false,
      custom_order: orderIndex++,
      icon: detectCategoryIcon(catName),
    });
  }

  // 2. VOD (FILMS) vs SÉRIES: Clean separation without duplicates
  const seenVodCatIds = new Set<string>();
  const seenSeriesCatIds = new Set<string>();
  let vodOrderIndex = 10000;
  let seriesOrderIndex = 20000;

  // Scan rawVodCategories
  for (let i = 0; i < rawVodCategories.length; i++) {
    const rawCat = rawVodCategories[i];
    if (!rawCat || rawCat.category_id === undefined || rawCat.category_id === null) continue;
    const catIdStr = String(rawCat.category_id).trim();
    const catName = rawCat.category_name ? String(rawCat.category_name).trim() : `Films ${catIdStr}`;

    if (isSeriesCategory(catName)) {
      if (!seenSeriesCatIds.has(catIdStr)) {
        seenSeriesCatIds.add(catIdStr);
        categories.push({
          id: `grp_series_${catIdStr}`,
          name: catName,
          type: 'series',
          count: 0,
          is_hidden: false,
          custom_order: seriesOrderIndex++,
          icon: 'Film',
        });
      }
    } else {
      if (!seenVodCatIds.has(catIdStr)) {
        seenVodCatIds.add(catIdStr);
        categories.push({
          id: `grp_vod_${catIdStr}`,
          name: catName,
          type: 'vod',
          count: 0,
          is_hidden: false,
          custom_order: vodOrderIndex++,
          icon: 'Film',
        });
      }
    }
  }

  // Scan rawSeriesCategories
  for (let i = 0; i < rawSeriesCategories.length; i++) {
    const rawCat = rawSeriesCategories[i];
    if (!rawCat || rawCat.category_id === undefined || rawCat.category_id === null) continue;
    const catIdStr = String(rawCat.category_id).trim();
    const catName = rawCat.category_name ? String(rawCat.category_name).trim() : `Séries ${catIdStr}`;

    if (isFilmCategory(catName) && !isSeriesCategory(catName)) {
      if (!seenVodCatIds.has(catIdStr)) {
        seenVodCatIds.add(catIdStr);
        categories.push({
          id: `grp_vod_${catIdStr}`,
          name: catName,
          type: 'vod',
          count: 0,
          is_hidden: false,
          custom_order: vodOrderIndex++,
          icon: 'Film',
        });
      }
    } else {
      if (!seenSeriesCatIds.has(catIdStr)) {
        seenSeriesCatIds.add(catIdStr);
        categories.push({
          id: `grp_series_${catIdStr}`,
          name: catName,
          type: 'series',
          count: 0,
          is_hidden: false,
          custom_order: seriesOrderIndex++,
          icon: 'Film',
        });
      }
    }
  }

  // 4. Pre-fetch the channels for the FIRST live category immediately so playback starts instantly
  onProgress?.('Étape 3/3 : Préparation du flux en direct...');
  const channels: Channel[] = [];
  const firstLiveCategory = categories.find((c) => c.type === 'live' && c.id !== 'fav');

  if (firstLiveCategory) {
    const rawCatId = firstLiveCategory.id.replace(/^grp_live_/, '');
    try {
      const firstStreams = await fetchCategoryStreamsOnDemand({
        serverUrl: server,
        username: cleanUsername,
        password: cleanPassword,
        categoryId: rawCatId,
        categoryName: firstLiveCategory.name,
        streamType: 'live',
      });
      if (firstStreams.length > 0) {
        channels.push(...firstStreams);
        firstLiveCategory.count = firstStreams.length;
      }
    } catch (err) {
      console.warn('Initial category pre-fetch fallback:', err);
    }
  }

  const playlistId = 'pl_xtream_' + Date.now();
  const playlist: PlaylistConfig = {
    id: playlistId,
    name: playlistName,
    type: 'xtream',
    server_url: server,
    username: cleanUsername,
    password: cleanPassword,
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
      let streamType: 'live' | 'vod' | 'series' = 'live';
      if (isSeriesCategory(groupName) || isSeriesCategory(currentExtInf.name)) {
        streamType = 'series';
      } else if (isFilmCategory(groupName) || isFilmCategory(currentExtInf.name)) {
        streamType = 'vod';
      } else {
        streamType = detectStreamType(currentExtInf.name, groupName, streamUrl);
      }
      const groupId = `grp_${streamType}_` + groupName.toLowerCase().replace(/[^a-z0-9]/g, '_');

      if (!seenGroupIds.has(groupId)) {
        seenGroupIds.add(groupId);
        groupOrder.push({ id: groupId, name: groupName });
        categoryTypeMap.set(groupId, streamType);
      } else {
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
