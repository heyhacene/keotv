import { Channel } from '@/types/iptv';

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
    'adult', 'adulte', 'xxx', 'porn', 'porno', '+18', '18+', 'for adult',
    'erotic', 'erotique', 'redlight', 'playboy', 'penthouse',
    'dorcel', 'hustler', 'brazzers', 'sexy', 'sex'
  ];
  return adultKeywords.some((kw) => {
    const escaped = kw.replace('+', '\\+');
    const regex = new RegExp(`(^|[^a-z0-9])${escaped}s?([^a-z0-9]|$)`, 'i');
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

  // Unicode arrows, triangles, stars or boxes commonly used for IPTV category dividers: ▼, ▲, ▶, ◄, ═, ─, ★, etc.
  if (/^[▼▲►◄▶◀★☆■□▪▫◆◇●○•\-=*#_~|.\s/\\+]{2,}/.test(name)) return true;
  if (/[▼▲►◄▶◀★☆■□▪▫◆◇●○•\-=*#_~|.\s/\\+]{2,}$/.test(name) && (name.includes('|') || name.includes('---') || name.includes('===') || /VOD|SERIE|FILM|BOUQUET/i.test(name))) {
    return true;
  }

  // Explicit indicator in name
  if (/^[▼▲].+[▼▲]$/.test(name) || /Séparateur thématique/i.test(name)) {
    return true;
  }

  // Name consists solely of separator characters, spaces and punctuation
  if (/^[-=*#_~|.\s/\\+▼▲►◄▶◀★☆■□▪▫◆◇●○•]{3,}$/.test(name)) return true;

  // Name is surrounded by repeated dashes, equals, asterisks, brackets e.g. "--- CANAL+ ---", "=== BEIN ==="
  if (/^[-=*#_~]{2,}\s*.+\s*[-=*#_~]{2,}$/.test(name)) return true;

  // Common IPTV header prefixes: "---", "***", "===", "###", ">>>", "<<<", "|||"
  if (/^[-=*#_~|><]{3,}/.test(name)) return true;

  return false;
}

/**
 * Extracts a clean readable label from a decorative separator name
 */
export function cleanSeparatorName(name: string): string {
  if (!name) return '';
  return name.replace(/^[-=*#_~|.\s/\\<>]+|[-=*#_~|.\s/\\<>]+$/g, '').trim() || name;
}

/**
 * Checks if a channel should be excluded based on configured prefixes (case-insensitive)
 */
export function shouldExcludeChannelByPrefix(channelName: string, excludedPrefixes: string[]): boolean {
  if (!channelName || !excludedPrefixes || excludedPrefixes.length === 0) return false;
  const rawLower = channelName.trim().toLowerCase();
  const normalizedChannel = rawLower
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  return excludedPrefixes.some((p) => {
    const rawP = p.trim().toLowerCase();
    if (!rawP) return false;
    const cleanP = rawP
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    // 1. Direct prefix match
    if (rawLower.startsWith(rawP) || normalizedChannel.startsWith(cleanP)) return true;

    // 2. Direct inclusion anywhere in name (e.g. user typed "AR :" or "[FR]" or "4K")
    if (rawLower.includes(rawP) || normalizedChannel.includes(cleanP)) return true;

    // 3. Punctuation-stripped start match (e.g. prefix "FR" matches "FR: TF1" or "FR | TF1" or "[FR] TF1")
    const cleanPrefixChars = cleanP.replace(/[^a-z0-9]/g, '');
    const cleanChannelChars = normalizedChannel.replace(/^[^a-z0-9]+/, '');
    if (cleanPrefixChars.length >= 2 && cleanChannelChars.startsWith(cleanPrefixChars)) {
      return true;
    }

    return false;
  });
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
