import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Channel, Category, PlaylistConfig } from '@/types/iptv';

// Universal HTTP fetcher that bypasses CORS on Android TV / Mobile using Capacitor Native HTTP
export async function fetchHttp(url: string, responseType: 'json' | 'text' = 'json'): Promise<any> {
  const cleanUrl = url.trim();

  if (Capacitor.isNativePlatform()) {
    try {
      const response = await CapacitorHttp.get({
        url: cleanUrl,
        responseType: responseType === 'json' ? 'json' : 'text',
        connectTimeout: 20000,
        readTimeout: 45000,
      });

      if (response.status >= 400) {
        throw new Error(`Le serveur IPTV a répondu avec le code HTTP ${response.status}`);
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
  const upper = name.toUpperCase();
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
  const upper = name.toUpperCase();
  if (upper.includes('4K') || upper.includes('UHD')) return '4K';
  if (upper.includes('FHD') || upper.includes('1080')) return 'FHD';
  if (upper.includes('HD') || upper.includes('720')) return 'HD';
  if (upper.includes('SD') || upper.includes('576')) return 'SD';
  return 'HD';
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

  onProgress?.('Étape 1/3 : Connexion au serveur et vérification des accès...');

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

  // 2. Fetch live categories
  onProgress?.('Étape 2/3 : Récupération des bouquets et catégories...');
  const catUrl = `${server}/player_api.php?username=${username}&password=${password}&action=get_live_categories`;
  let rawCategories: any[] = [];
  try {
    const res = await fetchHttp(catUrl, 'json');
    rawCategories = Array.isArray(res) ? res : (typeof res === 'string' ? JSON.parse(res) : []);
  } catch (err) {
    console.warn('Could not fetch categories directly, will generate from stream groups:', err);
  }

  // 3. Fetch live streams
  onProgress?.('Étape 2/3 : Téléchargement de la liste des chaînes en direct...');
  const streamsUrl = `${server}/player_api.php?username=${username}&password=${password}&action=get_live_streams`;
  let rawStreams: any[] = [];
  try {
    const res = await fetchHttp(streamsUrl, 'json');
    rawStreams = Array.isArray(res) ? res : (typeof res === 'string' ? JSON.parse(res) : []);
  } catch (err: any) {
    throw new Error(`Erreur lors du téléchargement des chaînes : ${err.message}`);
  }

  if (!rawStreams || rawStreams.length === 0) {
    throw new Error('Le serveur Xtream n’a renvoyé aucune chaîne en direct pour cet abonnement.');
  }

  onProgress?.(`Étape 3/3 : Formatage et enregistrement local de ${rawStreams.length} chaînes...`);

  // Build category dictionary
  const categoryMap = new Map<string, string>();
  for (const c of rawCategories) {
    if (c.category_id && c.category_name) {
      categoryMap.set(String(c.category_id), String(c.category_name).trim());
    }
  }

  // Count channels per category
  const categoryCounts = new Map<string, number>();
  const channels: Channel[] = [];

  const playlistId = 'pl_xtream_' + Date.now();

  for (let i = 0; i < rawStreams.length; i++) {
    const item = rawStreams[i];
    const catId = item.category_id ? String(item.category_id) : 'other';
    const catName = categoryMap.get(catId) || 'Autres Chaînes';

    categoryCounts.set(catId, (categoryCounts.get(catId) || 0) + 1);

    const streamId = item.stream_id || item.id || i + 1;
    // Standard Xtream live stream URL (HLS / m3u8)
    const streamUrl = `${server}/live/${username}/${password}/${streamId}.m3u8`;

    channels.push({
      id: `ch_xtream_${streamId}`,
      num: i + 1,
      name: item.name ? String(item.name).trim() : `Chaîne ${i + 1}`,
      logo: item.stream_icon ? String(item.stream_icon).trim() : '',
      stream_url: streamUrl,
      stream_type: 'live',
      group_id: `grp_${catId}`,
      group_name: catName,
      epg_id: item.epg_channel_id ? String(item.epg_channel_id) : undefined,
      is_favorite: false,
      is_hidden: false,
      custom_order: i + 1,
      resolution: detectResolution(item.name || ''),
    });
  }

  // Build Category list
  const categories: Category[] = [];
  let orderIndex = 0;

  // Add favorite category if not already present
  categories.push({
    id: 'fav',
    name: '★ Mes Favoris',
    type: 'live',
    count: 0,
    is_hidden: false,
    custom_order: orderIndex++,
    icon: 'Star',
  });

  categoryCounts.forEach((count, catId) => {
    const catName = categoryMap.get(catId) || (catId === 'other' ? 'Autres Chaînes' : `Bouquet ${catId}`);
    categories.push({
      id: `grp_${catId}`,
      name: catName,
      type: 'live',
      count: count,
      is_hidden: false,
      custom_order: orderIndex++,
      icon: detectCategoryIcon(catName),
    });
  });

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

  onProgress?.('Étape 2/3 : Analyse des métadonnées et tri des chaînes...');

  const lines = content.split(/\r?\n/);
  const channels: Channel[] = [];
  const categoryCounts = new Map<string, number>();

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
      // Extract tvg-logo
      const logoMatch = line.match(/tvg-logo="([^"]*)"/i);
      const logo = logoMatch ? logoMatch[1] : '';

      // Extract group-title
      const groupMatch = line.match(/group-title="([^"]*)"/i);
      const group = groupMatch && groupMatch[1].trim() ? groupMatch[1].trim() : 'Général';

      // Extract tvg-id
      const idMatch = line.match(/tvg-id="([^"]*)"/i);
      const epgId = idMatch ? idMatch[1] : undefined;

      // Extract channel name (after last comma)
      const commaIdx = line.lastIndexOf(',');
      const chName = commaIdx !== -1 ? line.slice(commaIdx + 1).trim() : 'Chaîne ' + (channels.length + 1);

      currentExtInf = {
        name: chName,
        logo,
        group,
        epgId,
      };
    } else if (!line.startsWith('#') && currentExtInf) {
      // This line is the stream URL
      const streamUrl = line;
      const groupName = currentExtInf.group;
      const groupId = 'grp_' + groupName.toLowerCase().replace(/[^a-z0-9]/g, '_');

      categoryCounts.set(groupId, (categoryCounts.get(groupId) || 0) + 1);

      channels.push({
        id: `ch_m3u_${channels.length + 1}`,
        num: channels.length + 1,
        name: currentExtInf.name,
        logo: currentExtInf.logo || '',
        stream_url: streamUrl,
        stream_type: 'live',
        group_id: groupId,
        group_name: groupName,
        epg_id: currentExtInf.epgId,
        is_favorite: false,
        is_hidden: false,
        custom_order: channels.length + 1,
        resolution: detectResolution(currentExtInf.name),
      });

      currentExtInf = null;
    }
  }

  if (channels.length === 0) {
    throw new Error('Aucun flux vidéo exploitable n’a pu être extrait de ce lien M3U.');
  }

  onProgress?.(`Étape 3/3 : Enregistrement local de ${channels.length} chaînes...`);

  // Build Categories
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

  const processedGroups = new Set<string>();
  for (const ch of channels) {
    if (!processedGroups.has(ch.group_id)) {
      processedGroups.add(ch.group_id);
      categories.push({
        id: ch.group_id,
        name: ch.group_name,
        type: 'live',
        count: categoryCounts.get(ch.group_id) || 1,
        is_hidden: false,
        custom_order: orderIndex++,
        icon: detectCategoryIcon(ch.group_name),
      });
    }
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
