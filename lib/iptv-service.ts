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
  if (isAdultCategoryName(name)) {
    return 'Lock';
  }
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

// Detect adult category from name for parental control
export function isAdultCategoryName(name: string): boolean {
  if (!name) return false;
  const lower = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const adultKeywords = [
    'adult', 'adulte', 'xxx', 'porn', '+18', '18+', 'for adult',
    'erotic', 'erotique', 'hot', 'redlight', 'playboy', 'penthouse',
    'dorcel', 'hustler', 'brazzers', 'vivid', 'passion', 'sexy', 'venus'
  ];
  return adultKeywords.some((kw) => {
    const escaped = kw.replace('+', '\\+');
    const regex = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i');
    return regex.test(lower);
  });
}

/**
 * Detects whether an item in an IPTV playlist is a visual separator/header rather than a real playable channel.
 * IPTV providers commonly insert decorative entries like "--- FRANCE ---", "=== CINEMA ===", "-----------------",
 * "*** VOD 4K ***", or items with dummy URLs (empty, localhost, #) to divide categories into sub-blocks.
 */
export function isSeparatorChannel(ch?: Channel | null): boolean {
  if (!ch) return false;
  const name = (ch.name || '').trim();
  if (!name) return true;

  // Stream URL is empty, hash or dummy loopback
  const url = (ch.stream_url || '').trim().toLowerCase();
  if (!url || url === '#' || url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) {
    return true;
  }

  // Name consists solely of separator characters, spaces and punctuation
  if (/^[-=*#_~|.\s/\\+]{3,}$/.test(name)) return true;

  // Name is surrounded by repeated dashes, equals, asterisks, brackets e.g. "--- CANAL+ ---", "=== BEIN ==="
  if (/^[-=*#_~]{2,}\s*.+\s*[-=*#_~]{2,}$/.test(name)) return true;

  // Common IPTV header prefixes: "---", "***", "===", "###", ">>>", "<<<", "|||"
  if (/^[-=*#_~|]{3,}/.test(name)) return true;

  return false;
}

/**
 * Extracts a clean readable label from a decorative separator name
 */
export function cleanSeparatorName(name: string): string {
  if (!name) return '';
  return name.replace(/^[-=*#_~|.\s/\\+]+|[-=*#_~|.\s/\\+]+$/g, '').trim() || name;
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
  categoryId?: string;
  categoryName?: string;
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

// Detect audio languages and subtitles from stream title and server metadata
export function detectAudioAndSubtitles(title: string, rawInfo?: any): {
  audio: string[];
  subtitles: string[];
} {
  const audio = new Set<string>();
  const subtitles = new Set<string>();

  const upper = (title || '').toUpperCase();

  // Parse explicit fields from Xtream info if present
  if (rawInfo?.audio) {
    const rawAudio = String(rawInfo.audio);
    for (const a of rawAudio.split(/[,;\/|]/)) {
      const clean = a.trim();
      if (clean) audio.add(clean);
    }
  }
  if (rawInfo?.subtitles) {
    const rawSubs = String(rawInfo.subtitles);
    for (const s of rawSubs.split(/[,;\/|]/)) {
      const clean = s.trim();
      if (clean) subtitles.add(clean);
    }
  }

  // Detect from title flags
  if (upper.includes('VOSTFR') || upper.includes('VOST')) {
    subtitles.add('Français (VOSTFR)');
    if (audio.size === 0) audio.add('Version Originale (VO)');
  }
  if (upper.includes('MULTI')) {
    audio.add('Français (VF)');
    audio.add('Version Originale (VO)');
  }
  if (upper.includes('VF') || upper.includes('TRUEFRENCH') || upper.includes('FRENCH') || upper.includes('VFF') || upper.includes('QC')) {
    audio.add('Français (VF)');
  }
  if (upper.includes('VO') && !upper.includes('VOST')) {
    audio.add('Version Originale (VO)');
  }
  if (upper.includes('EN') || upper.includes('ENG') || upper.includes('ENGLISH')) {
    audio.add('Anglais (Audio)');
  }
  if (upper.includes('AR') || upper.includes('ARABIC')) {
    audio.add('Arabe (Audio)');
  }
  if (upper.includes('ES') || upper.includes('SPANISH')) {
    audio.add('Espagnol (Audio)');
  }

  // Sensible defaults
  if (audio.size === 0) {
    audio.add('Français (VF)');
  }
  if (subtitles.size === 0 && (upper.includes('VOSTFR') || upper.includes('MULTI'))) {
    subtitles.add('Français');
  }

  return {
    audio: Array.from(audio),
    subtitles: Array.from(subtitles),
  };
}

export interface SeriesEpisode {
  id: string;
  season: number;
  episodeNum: number;
  title: string;
  url: string;
  duration?: string;
  plot?: string;
  image?: string;
}

export interface SeriesSeason {
  season: number;
  name: string;
  episodes: SeriesEpisode[];
}

export interface SeriesDetails {
  name: string;
  cover?: string;
  plot?: string;
  genre?: string;
  year?: string;
  rating?: string;
  audioLanguages?: string[];
  subtitles?: string[];
  seasons: SeriesSeason[];
}

// Fetch a series with its seasons and episodes (get_series_info)
export async function fetchSeriesInfo(
  serverUrl: string,
  username: string,
  password: string,
  seriesId: string | number
): Promise<SeriesDetails> {
  let server = serverUrl.trim().replace(/\/+$/, '');
  if (!server.startsWith('http://') && !server.startsWith('https://')) {
    server = 'http://' + server;
  }
  const encUser = encodeURIComponent(decodeURIComponent(username.trim()));
  const encPass = encodeURIComponent(decodeURIComponent(password.trim()));
  const url = `${server}/player_api.php?username=${encUser}&password=${encPass}&action=get_series_info&series_id=${seriesId}`;

  const data = await fetchHttp(url, 'json');
  const info = data?.info || {};
  const seasonMeta = toArray<any>(data?.seasons);
  const seasons: SeriesSeason[] = [];

  // `episodes` is either { "1": [..], "2": [..] } or an array of arrays
  const rawEpisodes = data?.episodes;
  const seasonKeys: string[] = Array.isArray(rawEpisodes)
    ? rawEpisodes.map((_: any, i: number) => String(i + 1))
    : Object.keys(rawEpisodes || {});
  seasonKeys.sort((a, b) => Number(a) - Number(b));

  for (const sk of seasonKeys) {
    const list = toArray<any>(Array.isArray(rawEpisodes) ? rawEpisodes[Number(sk) - 1] : rawEpisodes[sk]);
    const episodes: SeriesEpisode[] = [];
    for (const ep of list) {
      const epId = ep?.id || ep?.stream_id;
      if (!epId) continue;
      const ext = ep.container_extension || 'mp4';
      const num = Number(ep.episode_num) || episodes.length + 1;
      episodes.push({
        id: String(epId),
        season: Number(sk),
        episodeNum: num,
        title: ep.title ? String(ep.title) : `Épisode ${num}`,
        url: `${server}/series/${encUser}/${encPass}/${epId}.${ext}`,
        duration: ep.info?.duration ? String(ep.info.duration) : undefined,
        plot: ep.info?.plot ? String(ep.info.plot) : undefined,
        image: ep.info?.movie_image ? String(ep.info.movie_image) : undefined,
      });
    }
    if (episodes.length === 0) continue;
    episodes.sort((a, b) => a.episodeNum - b.episodeNum);
    const meta = seasonMeta.find((s: any) => String(s?.season_number) === sk);
    seasons.push({
      season: Number(sk),
      name: meta?.name ? String(meta.name) : `Saison ${sk}`,
      episodes,
    });
  }

  const langInfo = detectAudioAndSubtitles(info.name || '', info);

  return {
    name: info.name ? String(info.name) : '',
    cover: info.cover ? String(info.cover) : undefined,
    plot: info.plot ? String(info.plot) : info.description ? String(info.description) : undefined,
    genre: info.genre ? String(info.genre) : undefined,
    year: info.releaseDate ? String(info.releaseDate) : info.release_date ? String(info.release_date) : undefined,
    rating: info.rating ? String(info.rating) : undefined,
    audioLanguages: langInfo.audio,
    subtitles: langInfo.subtitles,
    seasons,
  };
}

export interface MovieDetails {
  id: string;
  streamId: string;
  name: string;
  originalName?: string;
  cover?: string;
  backdrop?: string;
  plot?: string;
  genre?: string;
  year?: string;
  rating?: string;
  duration?: string;
  director?: string;
  actors: string[];
  audioLanguages: string[];
  subtitles: string[];
  streamUrl: string;
}

// Fetch complete movie details from Xtream API (get_vod_info)
export async function fetchVodInfo(
  serverUrl: string,
  username: string,
  password: string,
  vodId: string | number,
  fallbackChannel?: Channel
): Promise<MovieDetails> {
  let server = serverUrl.trim().replace(/\/+$/, '');
  if (!server.startsWith('http://') && !server.startsWith('https://')) {
    server = 'http://' + server;
  }
  const cleanUser = decodeURIComponent(username.trim());
  const cleanPass = decodeURIComponent(password.trim());
  const encUser = encodeURIComponent(cleanUser);
  const encPass = encodeURIComponent(cleanPass);

  const cleanVodId = String(vodId).replace(/^ch_xtream_(?:vod_)?/, '');
  const url = `${server}/player_api.php?username=${encUser}&password=${encPass}&action=get_vod_info&vod_id=${cleanVodId}`;

  let data: any = null;
  try {
    data = await fetchHttp(url, 'json');
  } catch (err) {
    console.warn('Failed to fetch get_vod_info from server:', err);
  }

  const info = data?.info || {};
  const movieData = data?.movie_data || {};

  // Formats duration
  let formattedDuration: string | undefined = undefined;
  if (info.duration_secs && Number(info.duration_secs) > 0) {
    const totalMin = Math.round(Number(info.duration_secs) / 60);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    formattedDuration = h > 0 ? `${h}h ${m < 10 ? '0' : ''}${m}m` : `${m} min`;
  } else if (info.episode_run_time && Number(info.episode_run_time) > 0) {
    const totalMin = Number(info.episode_run_time);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    formattedDuration = h > 0 ? `${h}h ${m < 10 ? '0' : ''}${m}m` : `${m} min`;
  } else if (info.duration) {
    formattedDuration = String(info.duration);
  }

  // Parse actors list
  const rawActors = info.actors || info.cast || '';
  const actorsList: string[] = [];
  if (typeof rawActors === 'string') {
    for (const a of rawActors.split(/[,;\/|]/)) {
      const clean = a.trim();
      if (clean && clean.length > 1 && !actorsList.includes(clean)) {
        actorsList.push(clean);
      }
    }
  } else if (Array.isArray(rawActors)) {
    for (const a of rawActors) {
      const str = typeof a === 'string' ? a.trim() : (a?.name || '').trim();
      if (str && !actorsList.includes(str)) {
        actorsList.push(str);
      }
    }
  }

  const movieName = info.name || movieData.name || fallbackChannel?.name || 'Film';
  const lang = detectAudioAndSubtitles(movieName, info);

  const ext = movieData.container_extension || 'mp4';
  const streamUrl = fallbackChannel?.stream_url || `${server}/movie/${encUser}/${encPass}/${cleanVodId}.${ext}`;

  let backdrop = '';
  if (Array.isArray(info.backdrop_path) && info.backdrop_path.length > 0) {
    backdrop = String(info.backdrop_path[0]);
  } else if (typeof info.backdrop_path === 'string') {
    backdrop = info.backdrop_path;
  }

  return {
    id: fallbackChannel?.id || `ch_xtream_vod_${cleanVodId}`,
    streamId: cleanVodId,
    name: movieName,
    originalName: info.o_name ? String(info.o_name) : undefined,
    cover: info.cover_big || info.movie_image || fallbackChannel?.logo,
    backdrop: backdrop || undefined,
    plot: info.plot || info.description || undefined,
    genre: info.genre ? String(info.genre) : undefined,
    year: info.releasedate ? String(info.releasedate).slice(0, 4) : (movieData.year ? String(movieData.year) : undefined),
    rating: info.rating ? String(info.rating).slice(0, 3) : undefined,
    duration: formattedDuration,
    director: info.director ? String(info.director) : undefined,
    actors: actorsList,
    audioLanguages: lang.audio,
    subtitles: lang.subtitles,
    streamUrl,
  };
}

// In-memory cache for actor portraits
const actorPhotoCache = new Map<string, string | null>();

export async function fetchActorPhoto(actorName: string): Promise<string | null> {
  const cleanName = actorName.trim();
  if (!cleanName || cleanName.length < 2) return null;
  if (actorPhotoCache.has(cleanName)) {
    return actorPhotoCache.get(cleanName) || null;
  }

  // Format name for Wikipedia title (spaces -> underscores)
  const wikiTitle = encodeURIComponent(cleanName.replace(/\s+/g, '_'));

  try {
    // 1. Try French Wikipedia first
    const frUrl = `https://fr.wikipedia.org/api/rest_v1/page/summary/${wikiTitle}`;
    const frData = await fetchHttp(frUrl, 'json');
    if (frData?.thumbnail?.source) {
      actorPhotoCache.set(cleanName, frData.thumbnail.source);
      return frData.thumbnail.source;
    }
  } catch {
    // fallback to English Wikipedia
  }

  try {
    // 2. Fallback to English Wikipedia
    const enUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${wikiTitle}`;
    const enData = await fetchHttp(enUrl, 'json');
    if (enData?.thumbnail?.source) {
      actorPhotoCache.set(cleanName, enData.thumbnail.source);
      return enData.thumbnail.source;
    }
  } catch {
    // ignore
  }

  actorPhotoCache.set(cleanName, null);
  return null;
}

// Helper to normalize strings for search and matching
export function normalizeMovieTitle(str: string): string {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Strips provider formatting, country prefixes, quality tags and year suffixes
 * so that "FR | Kaamelott : Premier Volet (2021) [4K MULTI]" cleans down to "kaamelott premier volet".
 */
export function extractCleanMovieTitle(raw: string): string {
  let s = (raw || '').trim();
  // Strip initial brackets e.g. [FR], [MULTI]
  s = s.replace(/^\[[^\]]*\]\s*/g, '');
  // Strip country or category prefix: "FR |", "FR -", "FR:", "EN |", "VOD |", "FILM |", "FILMS :"
  s = s.replace(/^[A-Z]{2,4}\s*[:|/-]\s*/i, '');
  s = s.replace(/^(VOD|FILM|FILMS|MULTI|HD|4K|SERIE|SERIES)\s*[:|/-]\s*/i, '');
  // Strip quality tags, brackets, and year patterns
  s = s.replace(/\[[^\]]*\]/g, ' ');
  s = s.replace(/\((19\d\d|20\d\d)\)/g, ' ');
  s = s.replace(/\b(19\d\d|20\d\d)\b/g, ' ');
  s = s.replace(/\b(4K|UHD|FHD|HD|1080p|720p|MULTI|TRUEFRENCH|VF|VOSTFR|VOST|HEVC|x264|x265)\b.*/i, ' ');
  return normalizeMovieTitle(s);
}

// In-memory cache for person filmographies (actors & directors)
const personFilmographyCache = new Map<string, string[]>();

/**
 * Fetches the official, verified filmography of an actor or director
 * using the Wikidata SPARQL API (P161 = cast member, P57 = director).
 * Returns real titles without Wikipedia article noise or false positive pages.
 */
export async function fetchPersonFilmography(
  personName: string,
  role: 'actor' | 'director' | 'both' = 'both'
): Promise<string[]> {
  const cleanName = personName.trim();
  if (!cleanName || cleanName.length < 2) return [];

  const cacheKey = `${role}:${cleanName.toLowerCase()}`;
  if (personFilmographyCache.has(cacheKey)) {
    return personFilmographyCache.get(cacheKey)!;
  }

  const titles = new Set<string>();

  // 1. Search person entity on Wikidata
  try {
    const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(cleanName)}&language=fr&type=item&format=json&limit=6`;
    const searchRes = await fetchHttp(searchUrl, 'json');
    const entities = searchRes?.search || [];

    // Find the best entity matching an actor or director
    let targetEntityId: string | null = null;
    for (const ent of entities) {
      const desc = String(ent?.description || '').toLowerCase();
      if (
        desc.includes('actor') ||
        desc.includes('acteur') ||
        desc.includes('actrice') ||
        desc.includes('director') ||
        desc.includes('réalisat') ||
        desc.includes('cinéaste') ||
        desc.includes('film') ||
        desc.includes('comédien')
      ) {
        targetEntityId = ent.id;
        break;
      }
    }

    if (!targetEntityId && entities.length > 0) {
      targetEntityId = entities[0].id;
    }

    // 2. Query SPARQL for films where this person is cast member (P161) and/or director (P57)
    if (targetEntityId) {
      let roleCondition = '';
      if (role === 'director') {
        roleCondition = `?item wdt:P57 wd:${targetEntityId} .`;
      } else if (role === 'actor') {
        roleCondition = `?item wdt:P161 wd:${targetEntityId} .`;
      } else {
        roleCondition = `{ ?item wdt:P161 wd:${targetEntityId} } UNION { ?item wdt:P57 wd:${targetEntityId} } .`;
      }

      const sparql = `SELECT DISTINCT ?itemLabel WHERE { ${roleCondition} SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". } } LIMIT 150`;
      const sparqlUrl = `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparql)}&format=json`;
      const sparqlRes = await fetchHttp(sparqlUrl, 'json');
      const bindings = sparqlRes?.results?.bindings || [];

      for (const b of bindings) {
        const raw = (b?.itemLabel?.value || '').trim();
        // Ignore raw Q-identifiers if no label exists
        if (raw && !raw.match(/^Q\d+$/)) {
          titles.add(raw);
        }
      }
    }
  } catch (err) {
    console.warn(`Wikidata SPARQL failed for ${cleanName}:`, err);
  }

  // 3. Fallback: Wikipedia French Parse if Wikidata produced few or no items
  if (titles.size < 3) {
    try {
      const wikiTitle = cleanName.replace(/\s+/g, '_');
      const frUrl = `https://fr.wikipedia.org/w/api.php?action=parse&page=Filmographie_de_${encodeURIComponent(wikiTitle)}&prop=links&format=json`;
      const frRes = await fetchHttp(frUrl, 'json');
      const links = frRes?.parse?.links || [];
      for (const l of links) {
        const name = (l['*'] || '').trim();
        // Filter out non-film encyclopedia articles
        if (
          name &&
          !name.includes(':') &&
          !name.toLowerCase().includes('catégorie') &&
          !name.toLowerCase().includes('liste') &&
          !name.toLowerCase().includes('box-office') &&
          !name.toLowerCase().includes('festival') &&
          !name.toLowerCase().includes('césar') &&
          !name.toLowerCase().includes('oscar') &&
          !name.toLowerCase().includes('presse') &&
          !name.toLowerCase().includes('journal')
        ) {
          const clean = name.replace(/\s*\([^)]*\)/g, '').trim();
          if (clean.length >= 2) {
            titles.add(clean);
          }
        }
      }
    } catch {
      // ignore fallback error
    }
  }

  const result = Array.from(titles);
  personFilmographyCache.set(cacheKey, result);
  return result;
}

// Backward-compatible alias for actor filmography
export async function fetchActorFilmography(actorName: string): Promise<string[]> {
  return fetchPersonFilmography(actorName, 'actor');
}

// Cross-reference a person's films (actor or director) with the user's VOD playlist
export function matchMoviesInPlaylist(
  personName: string,
  filmTitles: string[],
  vodChannels: Channel[]
): Channel[] {
  const normPerson = normalizeMovieTitle(personName);
  const personTokens = normPerson.split(/\s+/).filter((t) => t.length >= 3);

  const normalizedFilms = filmTitles
    .map((f) => extractCleanMovieTitle(f))
    .filter((f) => f.length >= 2);

  const matched = new Map<string, Channel>();

  for (const ch of vodChannels) {
    const chClean = extractCleanMovieTitle(ch.name);
    const chRawNorm = normalizeMovieTitle(ch.name);

    // 1. Direct match if the movie title mentions the actor/director explicitly
    if (personTokens.length >= 2 && personTokens.every((t) => chRawNorm.includes(t))) {
      matched.set(ch.id, ch);
      continue;
    }

    // 2. Match against official filmography with strict word boundaries
    for (const f of normalizedFilms) {
      if (f.length < 2) continue;

      // Exact title match (e.g. "asterix aux jeux olympiques" === "asterix aux jeux olympiques")
      if (chClean === f) {
        matched.set(ch.id, ch);
        break;
      }

      const fWords = f.split(' ');
      // Multi-word title (2+ words, e.g. "le gitan", "mort d un pourri")
      if (fWords.length >= 2 && f.length >= 5) {
        if (
          chClean.startsWith(`${f} `) ||
          chClean.endsWith(` ${f}`) ||
          chClean.includes(` ${f} `)
        ) {
          matched.set(ch.id, ch);
          break;
        }
      } else if (f.length >= 7) {
        // Single distinct word of at least 7 characters (e.g. "armaguedon", "carambolages", "inception")
        if (
          chClean === f ||
          chClean.startsWith(`${f} `) ||
          chClean.endsWith(` ${f}`) ||
          chClean.includes(` ${f} `)
        ) {
          matched.set(ch.id, ch);
          break;
        }
      }
    }
  }

  return Array.from(matched.values());
}

// Resolve ALL episodes (every season, in order) of a series so the native player can zap between them
export async function resolveSeriesEpisodes(
  serverUrl: string,
  username: string,
  password: string,
  seriesId: string | number
): Promise<{ title: string; url: string }[]> {
  let server = serverUrl.trim().replace(/\/+$/, '');
  if (!server.startsWith('http://') && !server.startsWith('https://')) {
    server = 'http://' + server;
  }
  const encUser = encodeURIComponent(decodeURIComponent(username.trim()));
  const encPass = encodeURIComponent(decodeURIComponent(password.trim()));
  const url = `${server}/player_api.php?username=${encUser}&password=${encPass}&action=get_series_info&series_id=${seriesId}`;

  const data = await fetchHttp(url, 'json');
  const result: { title: string; url: string }[] = [];
  if (data && data.episodes) {
    const seasonKeys = Object.keys(data.episodes).sort((a, b) => Number(a) - Number(b));
    for (const sk of seasonKeys) {
      const epList = toArray<any>(data.episodes[sk]);
      for (const ep of epList) {
        const epId = ep?.id || ep?.stream_id;
        if (!epId) continue;
        const ext = ep.container_extension || 'mp4';
        const epNum = ep.episode_num ?? '';
        const title = ep.title ? String(ep.title) : `Saison ${sk} - Épisode ${epNum}`;
        result.push({ title, url: `${server}/series/${encUser}/${encPass}/${epId}.${ext}` });
      }
    }
  }
  return result;
}

// Background loader: downloads every live bouquet one by one (small requests) so the full
// playlist ends up in the local database with real counts.
export async function loadAllLiveCategories(params: {
  serverUrl: string;
  username: string;
  password: string;
  categories: Category[];
  skipCategoryIds?: Set<string>;
  onCategoryLoaded: (cat: Category, channels: Channel[]) => Promise<void> | void;
  onProgress?: (done: number, total: number) => void;
  shouldAbort?: () => boolean;
}): Promise<void> {
  const liveCats = params.categories.filter(
    (c) => c.id.startsWith('grp_live_') && !(params.skipCategoryIds && params.skipCategoryIds.has(c.id))
  );
  const total = liveCats.length;
  let done = 0;
  let cursor = 0;
  const CONCURRENCY = 3;

  const worker = async () => {
    while (cursor < liveCats.length) {
      if (params.shouldAbort && params.shouldAbort()) return;
      const cat = liveCats[cursor++];
      try {
        const streams = await fetchCategoryStreamsOnDemand({
          serverUrl: params.serverUrl,
          username: params.username,
          password: params.password,
          categoryId: cat.id.replace(/^grp_live_/, ''),
          categoryName: cat.name,
          streamType: 'live',
        });
        await params.onCategoryLoaded(cat, streams);
      } catch (err) {
        console.warn('Background load failed for category', cat.id, err);
      }
      done++;
      params.onProgress?.(done, total);
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
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
  const rawCatId = params.categoryId ? String(params.categoryId).trim() : '';
  const catName = params.categoryName || 'Bouquet';
  const type = params.streamType;

  let action = 'get_live_streams';
  if (type === 'vod') action = 'get_vod_streams';
  if (type === 'series') action = 'get_series';

  let url = `${server}/player_api.php?username=${username}&password=${password}&action=${action}`;
  if (rawCatId) {
    url += `&category_id=${encodeURIComponent(rawCatId)}`;
  }

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
    const itemCatId = item.category_id ? String(item.category_id).trim() : rawCatId;

    // Prefix group_id with stream type to prevent any primary key collisions
    channels.push({
      id: `ch_xtream_${type}_${streamId}`,
      num: chNum,
      name: itemName,
      logo: logo ? String(logo).trim() : '',
      stream_url: streamUrl,
      stream_type: type,
      group_id: `grp_${type}_${itemCatId || 'all'}`,
      group_name: catName,
      epg_id: item.epg_channel_id ? String(item.epg_channel_id).trim() : (type === 'series' ? String(streamId) : undefined),
      is_favorite: false,
      is_hidden: false,
      custom_order: chNum,
      resolution: detectResolution(itemName),
      is_separator: isSeparatorChannel({ name: itemName, stream_url: streamUrl } as any),
    });
  }

  return channels;
}

// Fetch all TV series in catalog in one lightweight (~1-2MB) call
export async function fetchAllSeriesCatalog(params: {
  serverUrl: string;
  username: string;
  password: string;
}): Promise<Channel[]> {
  let server = params.serverUrl.trim().replace(/\/+$/, '');
  if (!server.startsWith('http://') && !server.startsWith('https://')) {
    server = 'http://' + server;
  }
  const cleanUser = decodeURIComponent(params.username.trim());
  const cleanPass = decodeURIComponent(params.password.trim());
  const username = encodeURIComponent(cleanUser);
  const password = encodeURIComponent(cleanPass);

  const url = `${server}/player_api.php?username=${username}&password=${password}&action=get_series`;
  const res = await fetchHttp(url, 'json');
  const items = toArray(res);
  const channels: Channel[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;
    const seriesId = item.series_id || item.id || (i + 1);
    const itemName = String(item.name || `Série ${i + 1}`).trim();
    const logo = item.cover || item.stream_icon || '';
    const catId = item.category_id ? String(item.category_id).trim() : 'all';

    channels.push({
      id: `ch_xtream_series_${seriesId}`,
      num: typeof item.num === 'number' && item.num > 0 ? item.num : i + 1,
      name: itemName,
      logo: logo ? String(logo).trim() : '',
      stream_url: `${server}/series/${username}/${password}/${seriesId}.mp4`,
      stream_type: 'series',
      group_id: `grp_series_${catId}`,
      group_name: 'Séries',
      epg_id: String(seriesId),
      is_favorite: false,
      is_hidden: false,
      custom_order: i + 1,
      resolution: detectResolution(itemName),
      is_separator: false,
    });
  }

  return channels;
}

// Background progressive loader for VOD categories (safe chunks of 2 with pauses to avoid OOM)
export async function loadAllVodCategories(params: {
  serverUrl: string;
  username: string;
  password: string;
  categories: Category[];
  skipCategoryIds?: Set<string>;
  onCategoryLoaded: (cat: Category, channels: Channel[]) => Promise<void> | void;
  onProgress?: (done: number, total: number) => void;
  shouldAbort?: () => boolean;
}): Promise<void> {
  const vodCats = params.categories.filter(
    (c) => c.id.startsWith('grp_vod_') && !(params.skipCategoryIds && params.skipCategoryIds.has(c.id))
  );
  const total = vodCats.length;
  if (total === 0) return;
  let done = 0;
  let cursor = 0;
  const CONCURRENCY = 2;

  const worker = async () => {
    while (cursor < vodCats.length) {
      if (params.shouldAbort && params.shouldAbort()) return;
      const cat = vodCats[cursor++];
      try {
        const streams = await fetchCategoryStreamsOnDemand({
          serverUrl: params.serverUrl,
          username: params.username,
          password: params.password,
          categoryId: cat.id.replace(/^grp_vod_/, ''),
          categoryName: cat.name,
          streamType: 'vod',
        });
        if (params.shouldAbort && params.shouldAbort()) return;
        await params.onCategoryLoaded(cat, streams);
      } catch (err) {
        console.warn('Background VOD load failed for category', cat.id, err);
      }
      done++;
      params.onProgress?.(done, total);
      // Small 100ms breathing room to keep Android TV UI 100% smooth
      await new Promise((r) => setTimeout(r, 100));
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
}

// Search cache for Xtream catalogs
let xtreamSeriesCache: { credKey: string; data: any[]; timestamp: number } | null = null;
let xtreamVodCache: { credKey: string; data: any[]; timestamp: number } | null = null;

export async function searchXtreamCatalog(params: {
  serverUrl: string;
  username: string;
  password: string;
  query: string;
}): Promise<Channel[]> {
  const { serverUrl, username, password, query } = params;
  const cleanQ = query.trim().toLowerCase();
  if (!cleanQ || cleanQ.length < 2) return [];

  const normQ = normalizeMovieTitle(cleanQ);
  let server = serverUrl.trim().replace(/\/+$/, '');
  if (!server.startsWith('http://') && !server.startsWith('https://')) {
    server = 'http://' + server;
  }
  const cleanUser = decodeURIComponent(username.trim());
  const cleanPass = decodeURIComponent(password.trim());
  const encUser = encodeURIComponent(cleanUser);
  const encPass = encodeURIComponent(cleanPass);
  const credKey = `${server}_${cleanUser}`;

  const results: Channel[] = [];
  const now = Date.now();

  // 1. Search in SERIES (Fast & Lightweight, max 3.5s timeout)
  try {
    let seriesList =
      xtreamSeriesCache &&
      xtreamSeriesCache.credKey === credKey &&
      now - xtreamSeriesCache.timestamp < 300000
        ? xtreamSeriesCache.data
        : null;

    if (!seriesList) {
      const fetchPromise = (async () => {
        const url = `${server}/player_api.php?username=${encUser}&password=${encPass}&action=get_series`;
        const res = await fetchHttp(url, 'json');
        return toArray(res);
      })();
      const timeoutPromise = new Promise<any[]>((_, reject) =>
        setTimeout(() => reject(new Error('Series search timeout')), 3500)
      );
      seriesList = await Promise.race([fetchPromise, timeoutPromise]);
      xtreamSeriesCache = { credKey, data: seriesList, timestamp: now };
    }

    if (Array.isArray(seriesList)) {
      for (const s of seriesList) {
        const sName = String(s.name || '').trim();
        if (normalizeMovieTitle(sName).includes(normQ)) {
          const seriesId = s.series_id || s.id;
          results.push({
            id: `ch_xtream_series_${seriesId}`,
            num: Number(s.num) || results.length + 1,
            name: sName,
            logo: s.cover || s.stream_icon || '',
            stream_url: `${server}/series/${encUser}/${encPass}/${seriesId}.mp4`,
            stream_type: 'series',
            group_id: `grp_series_${s.category_id || 'all'}`,
            group_name: 'Séries',
            epg_id: String(seriesId),
            is_favorite: false,
            is_hidden: false,
            custom_order: Number(s.num) || results.length + 1,
            resolution: detectResolution(sName),
          });
          if (results.length >= 40) break;
        }
      }
    }
  } catch (err) {
    console.warn('Series remote search notice:', err);
  }

  return results;
}

export async function getAllVodChannels(
  serverUrl: string,
  username: string,
  password: string
): Promise<Channel[]> {
  // Check local database first: avoids downloading 40MB if VODs are already in Dexie
  try {
    const localVods = await db.channels.where('stream_type').equals('vod').toArray();
    if (localVods.length > 50) {
      return localVods;
    }
  } catch {}

  let server = serverUrl.trim().replace(/\/+$/, '');
  if (!server.startsWith('http://') && !server.startsWith('https://')) {
    server = 'http://' + server;
  }
  const cleanUser = decodeURIComponent(username.trim());
  const cleanPass = decodeURIComponent(password.trim());
  const encUser = encodeURIComponent(cleanUser);
  const encPass = encodeURIComponent(cleanPass);
  const credKey = `${server}_${cleanUser}`;
  const now = Date.now();

  let vodList =
    xtreamVodCache &&
    xtreamVodCache.credKey === credKey &&
    now - xtreamVodCache.timestamp < 600000
      ? xtreamVodCache.data
      : null;

  if (!vodList) {
    try {
      const url = `${server}/player_api.php?username=${encUser}&password=${encPass}&action=get_vod_streams`;
      const res = await fetchHttp(url, 'json');
      vodList = toArray(res);
      xtreamVodCache = { credKey, data: vodList, timestamp: now };
    } catch {
      return [];
    }
  }

  return vodList.map((m: any, i: number) => {
    const streamId = m.stream_id || m.id || i + 1;
    const ext = m.container_extension || 'mp4';
    const mName = String(m.name || `Film ${i + 1}`).trim();
    return {
      id: `ch_xtream_vod_${streamId}`,
      num: Number(m.num) || i + 1,
      name: mName,
      logo: m.stream_icon || m.cover || '',
      stream_url: `${server}/movie/${encUser}/${encPass}/${streamId}.${ext}`,
      stream_type: 'vod' as const,
      group_id: `grp_vod_${m.category_id || 'all'}`,
      group_name: 'Films VOD',
      epg_id: String(streamId),
      is_favorite: false,
      is_hidden: false,
      custom_order: Number(m.num) || i + 1,
      resolution: detectResolution(mName),
    };
  });
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

  // 3. Build categories. Each category keeps the namespace of the API it came from:
  //    get_live_categories -> grp_live_<id>, get_vod_categories -> grp_vod_<id>,
  //    get_series_categories -> grp_series_<id>. The id prefix is what decides which API
  //    action is used later to fetch streams, so we NEVER re-classify by keywords.
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

  const pushCategories = (
    raw: any[],
    kind: 'live' | 'vod' | 'series',
    fallbackLabel: string,
    startOrder: number
  ) => {
    const seen = new Set<string>();
    let order = startOrder;
    for (let i = 0; i < raw.length; i++) {
      const rawCat = raw[i];
      if (!rawCat || rawCat.category_id === undefined || rawCat.category_id === null) continue;
      const catIdStr = String(rawCat.category_id).trim();
      if (seen.has(catIdStr)) continue;
      seen.add(catIdStr);
      const catName = rawCat.category_name ? String(rawCat.category_name).trim() : `${fallbackLabel} ${catIdStr}`;
      const isAdult = isAdultCategoryName(catName);
      categories.push({
        id: `grp_${kind}_${catIdStr}`,
        name: catName,
        type: kind,
        count: 0,
        is_hidden: false,
        custom_order: order++,
        icon: isAdult ? 'Lock' : kind === 'live' ? detectCategoryIcon(catName) : 'Film',
        is_adult: isAdult,
      });
    }
  };

  pushCategories(rawLiveCategories, 'live', 'Bouquet', orderIndex);
  pushCategories(rawVodCategories, 'vod', 'Films', 10000);
  pushCategories(rawSeriesCategories, 'series', 'Séries', 20000);

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
        is_separator: isSeparatorChannel({ name: currentExtInf.name, stream_url: streamUrl } as any),
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
    const isAdult = isAdultCategoryName(grp.name);
    categories.push({
      id: grp.id,
      name: grp.name,
      type: grpType,
      count: categoryCounts.get(grp.id) || 0,
      is_hidden: false,
      custom_order: orderIndex++,
      icon: isAdult ? 'Lock' : detectCategoryIcon(grp.name),
      is_adult: isAdult,
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
