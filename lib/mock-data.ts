import { Channel, Category, EpgProgram } from '@/types/iptv';

export const INITIAL_CATEGORIES: Category[] = [
  { id: 'fav', name: '★ Mes Favoris', type: 'live', count: 5, is_hidden: false, custom_order: 0, icon: 'Star' },
  { id: 'tnt', name: '🇫🇷 France TNT', type: 'live', count: 10, is_hidden: false, custom_order: 1, icon: 'Tv' },
  { id: 'sport', name: '⚽ Sports Direct', type: 'live', count: 6, is_hidden: false, custom_order: 2, icon: 'Trophy' },
  { id: 'cinema', name: '🎬 Cinéma & Séries', type: 'live', count: 6, is_hidden: false, custom_order: 3, icon: 'Film' },
  { id: 'news', name: '📰 Information 24/7', type: 'live', count: 5, is_hidden: false, custom_order: 4, icon: 'Globe' },
  { id: 'doc', name: '🌍 Découverte & Doc', type: 'live', count: 4, is_hidden: false, custom_order: 5, icon: 'Compass' },
];

// Test streams using verified reliable public streams
const STREAM_BFMTV = 'https://live-cdn-stream-euw1.bfmtv.bct.nextradiotv.com/master.m3u8';
const STREAM_CNEWS = 'https://raw.githubusercontent.com/Paradise-91/ParaTV/main/streams/canalplus/cnews-dm.m3u8';
const STREAM_CSTAR = 'https://raw.githubusercontent.com/Paradise-91/ParaTV/refs/heads/main/streams/canalplus/cstar-dm.m3u8';
const STREAM_EURONEWS = 'https://cdn-euronews.akamaized.net/live/eds/euronews-fr/25026/index.m3u8';
const STREAM_EQUIDIA = 'https://raw.githubusercontent.com/Paradise-91/ParaTV/main/streams/equidia/live2.m3u8';
const STREAM_MUX = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
const STREAM_SINTEL = 'https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8';

// Fallback aliases for other channels
const SAMPLE_STREAM_BBB = STREAM_MUX;
const SAMPLE_STREAM_F24 = STREAM_EURONEWS;
const SAMPLE_STREAM_BIP = STREAM_SINTEL;

export const INITIAL_CHANNELS: Channel[] = [
  // ================= 1. TNT & INFORMATION =================
  {
    id: 'ch_bfm',
    num: 1,
    name: 'BFM TV HD',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/bfm-tv-fr.png',
    stream_url: STREAM_BFMTV,
    stream_type: 'live',
    group_id: 'tnt',
    group_name: 'France TNT',
    is_favorite: true,
    is_hidden: false,
    custom_order: 1,
    resolution: 'FHD',
  },
  {
    id: 'ch_cnews',
    num: 2,
    name: 'CNews HD',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/cnews-fr.png',
    stream_url: STREAM_CNEWS,
    stream_type: 'live',
    group_id: 'tnt',
    group_name: 'France TNT',
    is_favorite: true,
    is_hidden: false,
    custom_order: 2,
    resolution: 'FHD',
  },
  {
    id: 'ch_cstar',
    num: 3,
    name: 'CStar HD',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/cstar-fr.png',
    stream_url: STREAM_CSTAR,
    stream_type: 'live',
    group_id: 'tnt',
    group_name: 'France TNT',
    is_favorite: true,
    is_hidden: false,
    custom_order: 3,
    resolution: 'HD',
  },
  {
    id: 'ch_euronews',
    num: 4,
    name: 'Euronews Français',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/euronews-fr.png',
    stream_url: STREAM_EURONEWS,
    stream_type: 'live',
    group_id: 'news',
    group_name: 'Information 24/7',
    is_favorite: false,
    is_hidden: false,
    custom_order: 4,
    resolution: 'HD',
  },
  {
    id: 'ch_equidia',
    num: 5,
    name: 'Equidia Direct HD',
    logo: '',
    stream_url: STREAM_EQUIDIA,
    stream_type: 'live',
    group_id: 'sport',
    group_name: 'Sports Direct',
    is_favorite: false,
    is_hidden: false,
    custom_order: 5,
    resolution: 'FHD',
  },
  {
    id: 'ch_mux',
    num: 6,
    name: 'Canal Test 4K MUX',
    logo: '',
    stream_url: STREAM_MUX,
    stream_type: 'live',
    group_id: 'cinema',
    group_name: 'Cinéma & Séries',
    is_favorite: false,
    is_hidden: false,
    custom_order: 6,
    resolution: '4K',
  },
  {
    id: 'ch_vod_sintel',
    num: 7,
    name: 'Sintel - Le Film (VOD)',
    logo: '',
    stream_url: STREAM_SINTEL,
    stream_type: 'vod',
    group_id: 'cinema',
    group_name: 'Cinéma & Séries',
    is_favorite: false,
    is_hidden: false,
    custom_order: 7,
    resolution: 'FHD',
  },
  {
    id: 'ch_vod_mux',
    num: 8,
    name: 'Animation Mux Demo (VOD)',
    logo: '',
    stream_url: STREAM_MUX,
    stream_type: 'vod',
    group_id: 'cinema',
    group_name: 'Cinéma & Séries',
    is_favorite: false,
    is_hidden: false,
    custom_order: 8,
    resolution: 'FHD',
  },
  {
    id: 'ch_cplus',
    num: 4,
    name: 'Canal+ HD',
    logo: '',
    stream_url: SAMPLE_STREAM_BBB,
    stream_type: 'live',
    group_id: 'tnt',
    group_name: 'France TNT',
    is_favorite: true,
    is_hidden: false,
    custom_order: 4,
    resolution: '4K',
  },
  {
    id: 'ch_fr5',
    num: 5,
    name: 'France 5',
    logo: '',
    stream_url: SAMPLE_STREAM_F24,
    stream_type: 'live',
    group_id: 'tnt',
    group_name: 'France TNT',
    is_favorite: false,
    is_hidden: false,
    custom_order: 5,
    resolution: 'HD',
  },
  {
    id: 'ch_m6',
    num: 6,
    name: 'M6 HD',
    logo: '',
    stream_url: SAMPLE_STREAM_BIP,
    stream_type: 'live',
    group_id: 'tnt',
    group_name: 'France TNT',
    is_favorite: true,
    is_hidden: false,
    custom_order: 6,
    resolution: 'FHD',
  },
  {
    id: 'ch_arte',
    num: 7,
    name: 'Arte HD',
    logo: '',
    stream_url: SAMPLE_STREAM_F24,
    stream_type: 'live',
    group_id: 'tnt',
    group_name: 'France TNT',
    is_favorite: false,
    is_hidden: false,
    custom_order: 7,
    resolution: 'FHD',
  },
  {
    id: 'ch_c8',
    num: 8,
    name: 'C8 HD',
    logo: '',
    stream_url: SAMPLE_STREAM_BBB,
    stream_type: 'live',
    group_id: 'tnt',
    group_name: 'France TNT',
    is_favorite: false,
    is_hidden: false,
    custom_order: 8,
    resolution: 'HD',
  },
  {
    id: 'ch_w9',
    num: 9,
    name: 'W9 HD',
    logo: '',
    stream_url: SAMPLE_STREAM_BIP,
    stream_type: 'live',
    group_id: 'tnt',
    group_name: 'France TNT',
    is_favorite: false,
    is_hidden: false,
    custom_order: 9,
    resolution: 'HD',
  },
  {
    id: 'ch_tmc',
    num: 10,
    name: 'TMC HD',
    logo: '',
    stream_url: SAMPLE_STREAM_BBB,
    stream_type: 'live',
    group_id: 'tnt',
    group_name: 'France TNT',
    is_favorite: false,
    is_hidden: false,
    custom_order: 10,
    resolution: 'HD',
  },

  // ================= 2. SPORTS DIRECT =================
  {
    id: 'ch_beinsport1',
    num: 21,
    name: 'beIN SPORTS 1 HD',
    logo: '',
    stream_url: SAMPLE_STREAM_BBB,
    stream_type: 'live',
    group_id: 'sport',
    group_name: 'Sports Direct',
    is_favorite: true,
    is_hidden: false,
    custom_order: 1,
    resolution: 'FHD',
  },
  {
    id: 'ch_beinsport2',
    num: 22,
    name: 'beIN SPORTS 2 HD',
    logo: '',
    stream_url: SAMPLE_STREAM_BIP,
    stream_type: 'live',
    group_id: 'sport',
    group_name: 'Sports Direct',
    is_favorite: false,
    is_hidden: false,
    custom_order: 2,
    resolution: 'FHD',
  },
  {
    id: 'ch_canalplus_sport',
    num: 23,
    name: 'Canal+ Sport 360',
    logo: '',
    stream_url: SAMPLE_STREAM_F24,
    stream_type: 'live',
    group_id: 'sport',
    group_name: 'Sports Direct',
    is_favorite: true,
    is_hidden: false,
    custom_order: 3,
    resolution: '4K',
  },
  {
    id: 'ch_canalplus_foot',
    num: 24,
    name: 'Canal+ Foot HD',
    logo: '',
    stream_url: SAMPLE_STREAM_BBB,
    stream_type: 'live',
    group_id: 'sport',
    group_name: 'Sports Direct',
    is_favorite: false,
    is_hidden: false,
    custom_order: 4,
    resolution: 'FHD',
  },
  {
    id: 'ch_eurosport1',
    num: 25,
    name: 'Eurosport 1 HD',
    logo: '',
    stream_url: SAMPLE_STREAM_BIP,
    stream_type: 'live',
    group_id: 'sport',
    group_name: 'Sports Direct',
    is_favorite: false,
    is_hidden: false,
    custom_order: 5,
    resolution: 'FHD',
  },
  {
    id: 'ch_lequipe',
    num: 26,
    name: "L'Équipe 21 HD",
    logo: '',
    stream_url: SAMPLE_STREAM_F24,
    stream_type: 'live',
    group_id: 'sport',
    group_name: 'Sports Direct',
    is_favorite: false,
    is_hidden: false,
    custom_order: 6,
    resolution: 'HD',
  },

  // ================= 3. CINÉMA & SÉRIES =================
  {
    id: 'ch_cplus_cinema',
    num: 31,
    name: 'Canal+ Cinéma(s)',
    logo: '',
    stream_url: SAMPLE_STREAM_BBB,
    stream_type: 'live',
    group_id: 'cinema',
    group_name: 'Cinéma & Séries',
    is_favorite: true,
    is_hidden: false,
    custom_order: 1,
    resolution: '4K',
  },
  {
    id: 'ch_cplus_boxoffice',
    num: 32,
    name: 'Canal+ Box Office',
    logo: '',
    stream_url: SAMPLE_STREAM_F24,
    stream_type: 'live',
    group_id: 'cinema',
    group_name: 'Cinéma & Séries',
    is_favorite: false,
    is_hidden: false,
    custom_order: 2,
    resolution: '4K',
  },
  {
    id: 'ch_cine_premier',
    num: 33,
    name: 'Ciné+ Premier HD',
    logo: '',
    stream_url: SAMPLE_STREAM_BIP,
    stream_type: 'live',
    group_id: 'cinema',
    group_name: 'Cinéma & Séries',
    is_favorite: false,
    is_hidden: false,
    custom_order: 3,
    resolution: 'FHD',
  },
  {
    id: 'ch_cine_frisson',
    num: 34,
    name: 'Ciné+ Frisson HD',
    logo: '',
    stream_url: SAMPLE_STREAM_BBB,
    stream_type: 'live',
    group_id: 'cinema',
    group_name: 'Cinéma & Séries',
    is_favorite: false,
    is_hidden: false,
    custom_order: 4,
    resolution: 'FHD',
  },
  {
    id: 'ch_cine_emotion',
    num: 35,
    name: 'Ciné+ Émotion HD',
    logo: '',
    stream_url: SAMPLE_STREAM_F24,
    stream_type: 'live',
    group_id: 'cinema',
    group_name: 'Cinéma & Séries',
    is_favorite: false,
    is_hidden: false,
    custom_order: 5,
    resolution: 'HD',
  },
  {
    id: 'ch_paramount',
    num: 36,
    name: 'Paramount Channel',
    logo: '',
    stream_url: SAMPLE_STREAM_BIP,
    stream_type: 'live',
    group_id: 'cinema',
    group_name: 'Cinéma & Séries',
    is_favorite: false,
    is_hidden: false,
    custom_order: 6,
    resolution: 'HD',
  },

  // ================= 4. INFORMATION 24/7 =================
  {
    id: 'ch_f24',
    num: 41,
    name: 'France 24 Direct',
    logo: '',
    stream_url: SAMPLE_STREAM_F24,
    stream_type: 'live',
    group_id: 'news',
    group_name: 'Information 24/7',
    is_favorite: true,
    is_hidden: false,
    custom_order: 1,
    resolution: 'FHD',
  },
  {
    id: 'ch_bfmtv',
    num: 42,
    name: 'BFM TV HD',
    logo: '',
    stream_url: SAMPLE_STREAM_BBB,
    stream_type: 'live',
    group_id: 'news',
    group_name: 'Information 24/7',
    is_favorite: false,
    is_hidden: false,
    custom_order: 2,
    resolution: 'FHD',
  },
  {
    id: 'ch_cnews',
    num: 43,
    name: 'CNEWS Direct',
    logo: '',
    stream_url: SAMPLE_STREAM_BIP,
    stream_type: 'live',
    group_id: 'news',
    group_name: 'Information 24/7',
    is_favorite: false,
    is_hidden: false,
    custom_order: 3,
    resolution: 'FHD',
  },
  {
    id: 'ch_lci',
    num: 44,
    name: 'LCI La Chaîne Info',
    logo: '',
    stream_url: SAMPLE_STREAM_F24,
    stream_type: 'live',
    group_id: 'news',
    group_name: 'Information 24/7',
    is_favorite: false,
    is_hidden: false,
    custom_order: 4,
    resolution: 'HD',
  },
  {
    id: 'ch_euronews',
    num: 45,
    name: 'Euronews Français',
    logo: '',
    stream_url: SAMPLE_STREAM_BBB,
    stream_type: 'live',
    group_id: 'news',
    group_name: 'Information 24/7',
    is_favorite: false,
    is_hidden: false,
    custom_order: 5,
    resolution: 'HD',
  },

  // ================= 5. DÉCOUVERTE & DOC =================
  {
    id: 'ch_natgeo',
    num: 51,
    name: 'National Geographic',
    logo: '',
    stream_url: SAMPLE_STREAM_BBB,
    stream_type: 'live',
    group_id: 'doc',
    group_name: 'Découverte & Doc',
    is_favorite: false,
    is_hidden: false,
    custom_order: 1,
    resolution: '4K',
  },
  {
    id: 'ch_discovery',
    num: 52,
    name: 'Discovery Channel',
    logo: '',
    stream_url: SAMPLE_STREAM_BIP,
    stream_type: 'live',
    group_id: 'doc',
    group_name: 'Découverte & Doc',
    is_favorite: false,
    is_hidden: false,
    custom_order: 2,
    resolution: 'FHD',
  },
  {
    id: 'ch_planete',
    num: 53,
    name: 'Planète+ HD',
    logo: '',
    stream_url: SAMPLE_STREAM_F24,
    stream_type: 'live',
    group_id: 'doc',
    group_name: 'Découverte & Doc',
    is_favorite: false,
    is_hidden: false,
    custom_order: 3,
    resolution: 'FHD',
  },
  {
    id: 'ch_rmc_doc',
    num: 54,
    name: 'RMC Découverte',
    logo: '',
    stream_url: SAMPLE_STREAM_BBB,
    stream_type: 'live',
    group_id: 'doc',
    group_name: 'Découverte & Doc',
    is_favorite: false,
    is_hidden: false,
    custom_order: 4,
    resolution: 'HD',
  },
];

// Module-level minute-bucketed cache so getMockEpgForChannel and getSyntheticSlotForOffset
// perform ZERO Date/ISO allocations and return stable object references during 60fps D-Pad navigation!
let cachedMinuteBucket = -1;
let mockEpgCache = new Map<string, { current: EpgProgram; next: EpgProgram }>();
let syntheticSlotCache = new Map<string, EpgProgram>();

function ensureMinuteCacheFresh(): number {
  const nowMs = Date.now();
  const bucket = Math.floor(nowMs / 60000);
  if (bucket !== cachedMinuteBucket) {
    cachedMinuteBucket = bucket;
    mockEpgCache.clear();
    syntheticSlotCache.clear();
  }
  return bucket * 60000;
}

const PROGRAMS_MAP: Record<string, { currentTitle: string; currentDesc: string; nextTitle: string; cat: string }> = {
  ch_tf1: {
    currentTitle: 'Le Journal de 20h & Météo',
    currentDesc: "Retrouvez toute l'actualité nationale et internationale présentée par la rédaction de TF1 avec des reportages exclusifs.",
    nextTitle: 'Koh-Lanta : La Tribu Maudite',
    cat: 'Information / Société',
  },
  ch_fr2: {
    currentTitle: "N'oubliez pas les paroles !",
    currentDesc: 'Jeu musical animé par Nagui où les maestros rivalisent de mémoire pour retrouver les paroles manquantes.',
    nextTitle: 'Envoyé Spécial',
    cat: 'Jeu télévisé',
  },
  ch_cplus: {
    currentTitle: 'Oppenheimer (2023) - Exclusivité 4K',
    currentDesc: 'Biographie historique réalisée par Christopher Nolan. Le projet Manhattan et la conception de la bombe atomique.',
    nextTitle: 'Late avec Alain Chabat',
    cat: 'Film / Drame',
  },
  ch_m6: {
    currentTitle: 'Zone Interdite : Immersion au cœur des urgences',
    currentDesc: 'Enquête au plus près du quotidien des urgentistes et soignants qui se battent chaque nuit pour sauver des vies.',
    nextTitle: 'Enquête Exclusive',
    cat: 'Magazine',
  },
  ch_arte: {
    currentTitle: 'Les Mystères du Système Solaire',
    currentDesc: 'Une odyssée spectaculaire en haute définition à travers les anneaux de Saturne et les lunes glacées.',
    nextTitle: 'Le dessous des cartes',
    cat: 'Documentaire',
  },
  ch_beinsport1: {
    currentTitle: 'UEFA Champions League : Match en Direct',
    currentDesc: 'Choc européen de prestige commenté en direct du stade, suivi du débriefing tactique en plateau.',
    nextTitle: 'Club Champions Débrief',
    cat: 'Football',
  },
  ch_canalplus_sport: {
    currentTitle: 'Formula 1 : Qualifications du Grand Prix',
    currentDesc: 'Séance de qualifications Q1, Q2 et Q3 pour déterminer la grille de départ.',
    nextTitle: 'Formula One Le Mag',
    cat: 'Sports mécaniques',
  },
  ch_f24: {
    currentTitle: 'Le Journal du Monde & Débat International',
    currentDesc: "Tour d'horizon complet des dossiers diplomatiques et géopolitiques avec nos correspondants sur place.",
    nextTitle: "L'Entretien de France 24",
    cat: 'Actualités',
  },
  ch_natgeo: {
    currentTitle: 'Prédateurs des Abysses Océaniques',
    currentDesc: 'Exploration sous-marine des fosses océaniques à la rencontre des espèces les plus secrètes de la planète.',
    nextTitle: 'SOS Animaux en danger',
    cat: 'Nature / Documentaire',
  },
};

const DEFAULT_EPG_INFO = {
  currentTitle: 'Émission Spéciale en Direct HD',
  currentDesc: 'Programme diffusé en direct avec le son multicanal et une qualité haute définition.',
  nextTitle: 'Film du Soir / Édition Nuit',
  cat: 'Divertissement',
};

// Helper to generate dynamic mock EPG based on channel id and current time (O(1) cached per minute)
export function getMockEpgForChannel(channelId: string): { current: EpgProgram; next: EpgProgram } {
  const anchorMs = ensureMinuteCacheFresh();
  const cached = mockEpgCache.get(channelId);
  if (cached) return cached;

  const currentStart = new Date(anchorMs - 25 * 60 * 1000);
  const currentEnd = new Date(anchorMs + 65 * 60 * 1000);
  const nextEnd = new Date(currentEnd.getTime() + 90 * 60 * 1000);

  const info = PROGRAMS_MAP[channelId] || DEFAULT_EPG_INFO;

  const entry = {
    current: {
      id: `epg_cur_${channelId}`,
      channel_id: channelId,
      title: info.currentTitle,
      description: info.currentDesc,
      start: currentStart.toISOString(),
      end: currentEnd.toISOString(),
      duration_min: 90,
      category: info.cat,
      rating: 'Tous publics',
    },
    next: {
      id: `epg_nxt_${channelId}`,
      channel_id: channelId,
      title: info.nextTitle,
      description: 'Programme à suivre sur cette chaîne.',
      start: currentEnd.toISOString(),
      end: nextEnd.toISOString(),
      duration_min: 90,
      category: info.cat,
    },
  };

  mockEpgCache.set(channelId, entry);
  return entry;
}

const FRENCH_DAYS_SHORT = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const FRENCH_MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

function fastFormatHHMM(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  return `${h < 10 ? '0' : ''}${h}:${m < 10 ? '0' : ''}${m}`;
}

function fastFormatDayShort(d: Date): string {
  return `${FRENCH_DAYS_SHORT[d.getDay()]} ${d.getDate()} ${FRENCH_MONTHS_SHORT[d.getMonth()]}`;
}

/**
 * Generates a single synthetic EPG program slot for any relative offset (-168..+48) in O(1) time
 * with zero Intl.DateTimeFormat overhead and reference-stable minute caching!
 */
export function getSyntheticSlotForOffset(
  channelId: string,
  channelName: string | undefined,
  offset: number,
  baseStartMs?: number
): EpgProgram {
  const anchorMs = ensureMinuteCacheFresh();
  const { current, next } = getMockEpgForChannel(channelId);
  if (offset === 0) return current;
  if (offset === 1) return next;

  const cacheKey = baseStartMs === undefined ? `${channelId}:${offset}` : `${channelId}:${offset}:${baseStartMs}`;
  const cachedSlot = syntheticSlotCache.get(cacheKey);
  if (cachedSlot) return cachedSlot;

  const label = channelName || 'la chaîne';
  const curStartMs = baseStartMs ?? (anchorMs - 25 * 60 * 1000);
  const nxtEndMs = anchorMs + 155 * 60 * 1000;

  if (offset < 0) {
    const i = Math.abs(offset);
    const slotStartMs = curStartMs - i * 60 * 60000;
    const slotEndMs = slotStartMs + 60 * 60000;
    const slotDate = new Date(slotStartMs);
    const timeStr = fastFormatHHMM(slotDate);
    const dayStr = fastFormatDayShort(slotDate);

    let title = `Replay ${timeStr} (${dayStr}) • ${label}`;
    if (i === 1) title = `Avant-Programme (${timeStr}) • ${label}`;
    else if (i === 2) title = `Le Grand Magazine (${timeStr}) • ${label}`;
    else if (i === 3) title = `Édition Précédente (${timeStr}) • ${label}`;

    const slot: EpgProgram = {
      id: `epg_p${i}_${channelId}`,
      channel_id: channelId,
      title,
      description: `Replay intégral du ${dayStr} à ${timeStr} sur ${label}. Appuyez sur OK pour lancer le rattrapage à cet horaire exact.`,
      start: slotDate.toISOString(),
      end: new Date(slotEndMs).toISOString(),
      duration_min: 60,
      category: current.category,
      has_catchup: true,
    };
    syntheticSlotCache.set(cacheKey, slot);
    return slot;
  }

  // Future offset >= 2
  const f = offset;
  const slotStartMs = nxtEndMs + (f - 2) * 60 * 60000;
  const slotEndMs = slotStartMs + 60 * 60000;
  const slotDate = new Date(slotStartMs);
  const timeStr = fastFormatHHMM(slotDate);

  const futureSlot: EpgProgram = {
    id: `epg_f${f}_${channelId}`,
    channel_id: channelId,
    title: f === 2 ? `Grand Soir & Décryptage` : f === 3 ? `Programme de la Nuit` : `Programme ${timeStr} • ${label}`,
    description: `La suite de votre programmation à ${timeStr} sur ${label}.`,
    start: slotDate.toISOString(),
    end: new Date(slotEndMs).toISOString(),
    duration_min: 60,
    category: current.category,
  };
  syntheticSlotCache.set(cacheKey, futureSlot);
  return futureSlot;
}

/**
 * Generates a lightweight default timeline (offsets -3..+3) for compatibility.
 */
export function getMockTimelineForChannel(channelId: string, channelName?: string): EpgProgram[] {
  const offsets = [-3, -2, -1, 0, 1, 2, 3];
  return offsets.map((off) => getSyntheticSlotForOffset(channelId, channelName, off));
}




