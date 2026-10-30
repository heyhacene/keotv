import { Channel, Category, EpgProgram } from '@/types/iptv';

export const INITIAL_CATEGORIES: Category[] = [
  { id: 'fav', name: '★ Mes Favoris', type: 'live', count: 0, is_hidden: false, custom_order: 0, icon: 'Star' },
  { id: 'france_direct', name: '🇫🇷 France Direct', type: 'live', count: 7, is_hidden: false, custom_order: 1, icon: 'Tv' },
  { id: 'sport', name: '⚽ Sport', type: 'live', count: 1, is_hidden: false, custom_order: 2, icon: 'Trophy' },
  { id: 'regions', name: '📍 Régions', type: 'live', count: 1, is_hidden: false, custom_order: 3, icon: 'Globe' },
  { id: 'films_vod', name: '🎬 Films VOD', type: 'vod', count: 3, is_hidden: false, custom_order: 4, icon: 'Film' },
  { id: 'series_vod', name: '🎞️ Séries VOD', type: 'series', count: 4, is_hidden: false, custom_order: 5, icon: 'Clapperboard' },
];

export const INITIAL_CHANNELS: Channel[] = [
  // ================= 1. FRANCE DIRECT (LIVE) =================
  {
    id: 'ch_bfm',
    num: 1,
    name: 'BFM TV HD',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/e/e2/BFM_TV_logo_2017.svg',
    stream_url: 'https://live-cdn-stream-euw1.bfmtv.bct.nextradiotv.com/master.m3u8',
    stream_type: 'live',
    group_id: 'france_direct',
    group_name: 'France Direct',
    epg_id: 'BFMTV.fr',
    is_favorite: true,
    is_hidden: false,
    custom_order: 1,
    resolution: 'FHD',
  },
  {
    id: 'ch_arte',
    num: 2,
    name: 'Arte Français HD',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/2/23/Logo_ARTE_2017.svg',
    stream_url: 'https://artesimulcast.akamaized.net/hls/live/2031003/artelive_fr/master_v720.m3u8',
    stream_type: 'live',
    group_id: 'france_direct',
    group_name: 'France Direct',
    epg_id: 'Arte.fr',
    is_favorite: true,
    is_hidden: false,
    custom_order: 2,
    resolution: 'HD',
  },
  {
    id: 'ch_cstar',
    num: 3,
    name: 'CStar Direct',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/cstar-fr.png',
    stream_url: 'https://raw.githubusercontent.com/Paradise-91/ParaTV/refs/heads/main/streams/canalplus/cstar-dm.m3u8',
    stream_type: 'live',
    group_id: 'france_direct',
    group_name: 'France Direct',
    epg_id: 'CStar.fr',
    is_favorite: false,
    is_hidden: false,
    custom_order: 3,
    resolution: 'HD',
  },
  {
    id: 'ch_bfmbiz',
    num: 4,
    name: 'BFM Business HD',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/bfm-business-fr.png',
    stream_url: 'https://live-cdn-stream-euw1.bfmb.bct.nextradiotv.com/master.m3u8',
    stream_type: 'live',
    group_id: 'france_direct',
    group_name: 'France Direct',
    epg_id: 'BFMBusiness.fr',
    is_favorite: false,
    is_hidden: false,
    custom_order: 4,
    resolution: 'HD',
  },
  {
    id: 'ch_euronews',
    num: 5,
    name: 'Euronews Français',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/euronews-fr.png',
    stream_url: 'https://cdn-euronews.akamaized.net/live/eds/euronews-fr/25026/index.m3u8',
    stream_type: 'live',
    group_id: 'france_direct',
    group_name: 'France Direct',
    epg_id: 'EuronewsFrench.fr',
    is_favorite: false,
    is_hidden: false,
    custom_order: 5,
    resolution: 'HD',
  },
  {
    id: 'ch_africanews',
    num: 6,
    name: 'Africanews Français',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/africanews-fr.png',
    stream_url: 'https://cdn-euronews.akamaized.net/live/eds/africanews-fr/25050/index.m3u8',
    stream_type: 'live',
    group_id: 'france_direct',
    group_name: 'France Direct',
    epg_id: 'AfricanewsFrench.fr',
    is_favorite: false,
    is_hidden: false,
    custom_order: 6,
    resolution: 'HD',
  },
  {
    id: 'ch_20min',
    num: 7,
    name: '20 Minutes TV',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/4/4b/20_Minutes_TV_logo_2023.svg',
    stream_url: 'https://live-20minutestv.digiteka.com/1961167769/index.m3u8',
    stream_type: 'live',
    group_id: 'france_direct',
    group_name: 'France Direct',
    epg_id: '20MinutesTV.fr',
    is_favorite: false,
    is_hidden: false,
    custom_order: 7,
    resolution: 'HD',
  },

  // ================= 2. SPORT (LIVE) =================
  {
    id: 'ch_equidia',
    num: 8,
    name: 'Equidia Direct',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/equidia-fr.png',
    stream_url: 'https://raw.githubusercontent.com/Paradise-91/ParaTV/main/streams/equidia/live2.m3u8',
    stream_type: 'live',
    group_id: 'sport',
    group_name: 'Sport',
    epg_id: 'Equidia.fr',
    is_favorite: false,
    is_hidden: false,
    custom_order: 8,
    resolution: 'HD',
  },

  // ================= 3. RÉGIONS (LIVE) =================
  {
    id: 'ch_cannes',
    num: 9,
    name: 'Cannes Lérins TV HD',
    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/cannes-lerins-tv-fr.png',
    stream_url: 'https://vdo2.pro-fhi.net:3628/live/uppodsfqlive.m3u8',
    stream_type: 'live',
    group_id: 'regions',
    group_name: 'Régions',
    epg_id: 'CannesLerinsTV.fr',
    is_favorite: false,
    is_hidden: false,
    custom_order: 9,
    resolution: 'HD',
  },

  // ================= 4. FILMS VOD =================
  {
    id: 'vod_bbb',
    num: 10,
    name: 'Big Buck Bunny (Court-métrage)',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/c/c5/Big_buck_bunny_poster_big.jpg',
    stream_url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    stream_type: 'vod',
    group_id: 'films_vod',
    group_name: 'Films VOD',
    epg_id: 'vod_bbb',
    is_favorite: true,
    is_hidden: false,
    custom_order: 10,
    resolution: 'FHD',
  },
  {
    id: 'vod_tos',
    num: 11,
    name: 'Tears of Steel (Science-Fiction)',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/0/01/Tears_of_Steel_poster.jpg',
    stream_url: 'https://test-streams.mux.dev/tos_ismc/main.m3u8',
    stream_type: 'vod',
    group_id: 'films_vod',
    group_name: 'Films VOD',
    epg_id: 'vod_tos',
    is_favorite: false,
    is_hidden: false,
    custom_order: 11,
    resolution: '4K',
  },
  {
    id: 'vod_elephants',
    num: 12,
    name: 'Elephants Dream (Animation 3D)',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e8/Elephants_Dream_poster.jpg/440px-Elephants_Dream_poster.jpg',
    stream_url: 'https://cdn.theoplayer.com/video/elephants-dream/playlist.m3u8',
    stream_type: 'vod',
    group_id: 'films_vod',
    group_name: 'Films VOD',
    epg_id: 'vod_elephants',
    is_favorite: false,
    is_hidden: false,
    custom_order: 12,
    resolution: 'HD',
  },

  // ================= 5. SÉRIES VOD =================
  {
    id: 'series_cosmos_e01',
    num: 13,
    name: 'Cosmos Laundromat S01 E01 - First Cycle',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/Cosmos_Laundromat_-_First_Cycle_-_Official_Blender_Foundation_release.webm/page1-500px-Cosmos_Laundromat_-_First_Cycle_-_Official_Blender_Foundation_release.webm.jpg',
    stream_url: 'https://test-streams.mux.dev/test_001/stream.m3u8',
    stream_type: 'series',
    group_id: 'series_vod',
    group_name: 'Séries VOD',
    epg_id: 'series_cosmos_e01',
    is_favorite: false,
    is_hidden: false,
    custom_order: 13,
    resolution: 'FHD',
  },
  {
    id: 'series_cosmos_e02',
    num: 14,
    name: 'Cosmos Laundromat S01 E02 - Second Cycle',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/Cosmos_Laundromat_-_First_Cycle_-_Official_Blender_Foundation_release.webm/page1-500px-Cosmos_Laundromat_-_First_Cycle_-_Official_Blender_Foundation_release.webm.jpg',
    stream_url: 'https://test-streams.mux.dev/pts_shift/master.m3u8',
    stream_type: 'series',
    group_id: 'series_vod',
    group_name: 'Séries VOD',
    epg_id: 'series_cosmos_e02',
    is_favorite: false,
    is_hidden: false,
    custom_order: 14,
    resolution: 'FHD',
  },
  {
    id: 'series_bipbop_e01',
    num: 15,
    name: 'BipBop S01 E01 - Épisode Pilote',
    logo: 'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?w=500&auto=format&fit=crop&q=60',
    stream_url: 'https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_16x9/bipbop_16x9_variant.m3u8',
    stream_type: 'series',
    group_id: 'series_vod',
    group_name: 'Séries VOD',
    epg_id: 'series_bipbop_e01',
    is_favorite: false,
    is_hidden: false,
    custom_order: 15,
    resolution: 'HD',
  },
  {
    id: 'series_bipbop_e02',
    num: 16,
    name: 'BipBop S01 E02 - Épisode Deux',
    logo: 'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?w=500&auto=format&fit=crop&q=60',
    stream_url: 'https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_4x3/bipbop_4x3_variant.m3u8',
    stream_type: 'series',
    group_id: 'series_vod',
    group_name: 'Séries VOD',
    epg_id: 'series_bipbop_e02',
    is_favorite: false,
    is_hidden: false,
    custom_order: 16,
    resolution: 'SD',
  },
];

// Helper to generate dynamic mock EPG based on channel id and current time
export function getMockEpgForChannel(channelId: string): { current: EpgProgram; next: EpgProgram } {
  const now = new Date();
  const currentStart = new Date(now.getTime() - 25 * 60 * 1000);
  const currentEnd = new Date(now.getTime() + 65 * 60 * 1000);
  const nextEnd = new Date(currentEnd.getTime() + 90 * 60 * 1000);

  const programsMap: Record<string, { currentTitle: string; currentDesc: string; nextTitle: string; cat: string }> = {
    ch_bfm: {
      currentTitle: 'Le Live BFM & Actualités',
      currentDesc: 'Décryptage de l\'actualité en temps réel avec les reporters et éditorialistes de BFM TV.',
      nextTitle: 'BFM Story - Les Grands Débats',
      cat: 'Information / Direct',
    },
    ch_arte: {
      currentTitle: 'Les Mystères du Système Solaire',
      currentDesc: 'Une odyssée spectaculaire en haute définition à travers les anneaux de Saturne et les lunes glacées.',
      nextTitle: 'Le Dessous des Cartes',
      cat: 'Documentaire / Découverte',
    },
    ch_cstar: {
      currentTitle: 'Top Streaming Français & International',
      currentDesc: 'Le classement officiel des morceaux les plus écoutés de la semaine avec tous les clips vidéo en continu.',
      nextTitle: 'Story Series : Making Of',
      cat: 'Musique & Culture',
    },
    ch_bfmbiz: {
      currentTitle: 'Good Morning Business',
      currentDesc: 'La matinale économique de référence pour tout comprendre aux marchés et aux entreprises.',
      nextTitle: 'Les Experts Économie',
      cat: 'Économie & Finance',
    },
    ch_euronews: {
      currentTitle: 'Euronews Soir & Analyse Géopolitique',
      currentDesc: 'L\'actualité européenne et mondiale vue par les rédactions multilingues d\'Euronews.',
      nextTitle: 'No Comment - Les Images du Jour',
      cat: 'International',
    },
    ch_africanews: {
      currentTitle: 'The Morning Call - Actualités Panafricaines',
      currentDesc: 'Le tour complet du continent africain : business, politique, climat et innovation culturelle.',
      nextTitle: 'Inspire Africa',
      cat: 'Actualités Panafricaines',
    },
    ch_equidia: {
      currentTitle: 'Courses Hippiques en Direct & Pronostics',
      currentDesc: 'En direct des hippodromes majeurs : arrivées, rapports officiels et analyses d\'experts.',
      nextTitle: 'Le Grand Débrief Courses',
      cat: 'Sport & Hippisme',
    },
    ch_20min: {
      currentTitle: '20 Minutes Info & Société',
      currentDesc: 'L\'actualité locale et nationale condensée avec les journalistes de la rédaction 20 Minutes.',
      nextTitle: 'Culture Pop & Tendances Web',
      cat: 'Société & Lifestyle',
    },
    ch_cannes: {
      currentTitle: 'L\'Édition Azuréenne & Littoral',
      currentDesc: 'Reportages au cœur du bassin cannois, du littoral méditerranéen et des événements culturels.',
      nextTitle: 'Cinéma & Festival Spécial',
      cat: 'Régions & Patrimoine',
    },
    vod_bbb: {
      currentTitle: 'Big Buck Bunny (Court-métrage HD)',
      currentDesc: 'Animation classique open-source créée par la Blender Foundation avec un grand lapin bienveillant.',
      nextTitle: 'Bonus : Les coulisses de l\'animation 3D',
      cat: 'Animation & Famille',
    },
    vod_tos: {
      currentTitle: 'Tears of Steel (Science-Fiction 4K)',
      currentDesc: 'Film de science-fiction dystopique dans un futur cyberpunk à Amsterdam avec des effets visuels de pointe.',
      nextTitle: 'Making of Visual Effects',
      cat: 'Science-Fiction',
    },
    vod_elephants: {
      currentTitle: 'Elephants Dream (Film 3D)',
      currentDesc: 'Premier film d\'animation ouvert explorant une immense machine cybernétique surréaliste.',
      nextTitle: 'Documentaire : Open Source Cinema',
      cat: 'Court-métrage / 3D',
    },
    series_cosmos_e01: {
      currentTitle: 'Cosmos Laundromat - Épisode 1 : First Cycle',
      currentDesc: 'Sur une île isolée, un mouton mélancolique nommé Franck rencontre un vendeur mystérieux aux pouvoirs magiques.',
      nextTitle: 'Cosmos Laundromat - Épisode 2',
      cat: 'Série Fantastique',
    },
    series_cosmos_e02: {
      currentTitle: 'Cosmos Laundromat - Épisode 2 : Second Cycle',
      currentDesc: 'La suite des aventures surréalistes à travers différentes dimensions cosmiques.',
      nextTitle: 'Épisode 3 à venir',
      cat: 'Série Fantastique',
    },
    series_bipbop_e01: {
      currentTitle: 'BipBop Séries - Épisode 1 (Pilote Multi-bitrate)',
      currentDesc: 'Flux test haute performance adapté au streaming adaptatif HLS avec variations de résolution.',
      nextTitle: 'BipBop Séries - Épisode 2',
      cat: 'Série Démo',
    },
    series_bipbop_e02: {
      currentTitle: 'BipBop Séries - Épisode 2 (Format Classique 4:3)',
      currentDesc: 'Second volet optimisé pour la fluidité et le test des lecteurs vidéo HLS sur tous supports.',
      nextTitle: 'Fin de la saison test',
      cat: 'Série Démo',
    },
  };

  const defaultInfo = {
    currentTitle: 'Programme en Direct HD',
    currentDesc: 'Programme diffusé en direct avec une qualité haute définition.',
    nextTitle: 'Programme à suivre',
    cat: 'Généraliste',
  };

  const info = programsMap[channelId] || defaultInfo;

  return {
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
 */
export function getSyntheticSlotForOffset(
  channelId: string,
  channelName: string | undefined,
  offset: number,
  baseStartMs?: number
): EpgProgram {
  const { current, next } = getMockEpgForChannel(channelId);
  if (offset === 0) return current;
  if (offset === 1) return next;

  const label = channelName || 'la chaîne';
  const curStartMs = baseStartMs ?? new Date(current.start).getTime();
  const nxtEndMs = new Date(next.end).getTime();

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

    return {
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
  }

  // Future offset >= 2
  const f = offset;
  const slotStartMs = nxtEndMs + (f - 2) * 60 * 60000;
  const slotEndMs = slotStartMs + 60 * 60000;
  const slotDate = new Date(slotStartMs);
  const timeStr = fastFormatHHMM(slotDate);

  return {
    id: `epg_f${f}_${channelId}`,
    channel_id: channelId,
    title: f === 2 ? `Grand Soir & Décryptage` : f === 3 ? `Programme de la Nuit` : `Programme ${timeStr} • ${label}`,
    description: `La suite de votre programmation à ${timeStr} sur ${label}.`,
    start: slotDate.toISOString(),
    end: new Date(slotEndMs).toISOString(),
    duration_min: 60,
    category: current.category,
  };
}

/**
 * Generates a lightweight default timeline (offsets -3..+3) for compatibility.
 */
export function getMockTimelineForChannel(channelId: string, channelName?: string): EpgProgram[] {
  const offsets = [-3, -2, -1, 0, 1, 2, 3];
  return offsets.map((off) => getSyntheticSlotForOffset(channelId, channelName, off));
}
