import { db } from './db';
import { Channel } from '@/types/iptv';
import {
  getAllSavedPositions,
  isResumablePosition,
  SavedPlaybackPosition,
} from './playback-positions';

/**
 * "Pour vous": 100% local recommendation engine for VOD (no data leaves the device).
 *
 * Signals:
 *  - recent playback history (SavedPlaybackPosition, with exponential time decay, half-life 30 days)
 *  - most consumed VOD genres (the provider category of each watched movie)
 *  - freshness of the provider catalog insertion date (`added`)
 * Ranking:
 *  1. movies in progress ("continue watching"), most recent first
 *  2. never-watched titles of the favourite genres, scored by affinity + freshness
 *     (+ a tiny per-day deterministic jitter so the list slowly rotates instead of staying frozen)
 */

const HALF_LIFE_DAYS = 30;
const FRESHNESS_HALF_LIFE_DAYS = 90;
const MAX_PER_GENRE = 30;
const TOP_GENRES = 6;

const VOD_URL_ID = /\/movie\/[^/]+\/[^/]+\/(\d+)(?:\.\w+)?(?:\?.*)?$/;

function vodChannelIdFromUrl(url: string): string | null {
  const m = VOD_URL_ID.exec(url);
  return m ? `ch_xtream_vod_${m[1]}` : null;
}

function decay(ageDays: number, halfLifeDays: number): number {
  return Math.exp((-Math.LN2 * Math.max(0, ageDays)) / halfLifeDays);
}

function dayJitter(id: string): number {
  const day = Math.floor(Date.now() / 86400000);
  let h = 2166136261;
  const s = `${id}|${day}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000; // 0..1
}

interface HistoryMovie {
  channelId: string;
  entry: SavedPlaybackPosition;
}

function getMovieHistory(): HistoryMovie[] {
  const map = getAllSavedPositions();
  const out: HistoryMovie[] = [];
  for (const key of Object.keys(map)) {
    if (key.startsWith('series_')) continue;
    const entry = map[key];
    if (!entry || !entry.url) continue;
    const channelId = vodChannelIdFromUrl(entry.url);
    if (channelId) out.push({ channelId, entry });
  }
  return out;
}

export interface GenreAffinity {
  groupId: string;
  score: number; // 0..1
}

/** Genre (provider category) affinity from recent playback, normalised to 0..1. */
export async function computeGenreAffinity(): Promise<GenreAffinity[]> {
  const history = getMovieHistory();
  if (history.length === 0) return [];
  const now = Date.now();
  const rows = await db.channels.bulkGet(history.map((h) => h.channelId));
  const weights = new Map<string, number>();
  history.forEach((h, i) => {
    const ch = rows[i];
    if (!ch?.group_id) return;
    const ageDays = h.entry.updatedAt ? (now - h.entry.updatedAt) / 86400000 : 60;
    const completionBoost = h.entry.completed ? 1.25 : 1;
    const w = decay(ageDays, HALF_LIFE_DAYS) * completionBoost;
    weights.set(ch.group_id, (weights.get(ch.group_id) || 0) + w);
  });
  const max = Math.max(0, ...weights.values());
  if (max <= 0) return [];
  return Array.from(weights.entries())
    .map(([groupId, w]) => ({ groupId, score: w / max }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Builds the "Pour vous" list. Returns [] when there is no usable history yet
 * (the caller then falls back to "Récemment ajoutés").
 */
export async function buildForYouVod(limit = 120): Promise<Channel[]> {
  const history = getMovieHistory();
  if (history.length === 0) return [];

  const watchedIds = new Set(history.map((h) => h.channelId));
  const affinity = await computeGenreAffinity();
  const top = affinity.slice(0, TOP_GENRES);
  const affinityByGroup = new Map(top.map((g) => [g.groupId, g.score]));

  // 1. Continue watching (in-progress movies), most recent first
  const inProgress = history
    .filter((h) => isResumablePosition(h.entry))
    .sort((a, b) => (b.entry.updatedAt || 0) - (a.entry.updatedAt || 0));
  const inProgressRows = await db.channels.bulkGet(inProgress.map((h) => h.channelId));
  const continueList: Channel[] = inProgressRows.filter(
    (c): c is Channel => Boolean(c) && !c!.is_hidden
  );
  const continueIds = new Set(continueList.map((c) => c.id));

  // 2. Never-watched titles from the favourite genres
  let scored: Channel[] = [];
  if (top.length > 0) {
    const nowSec = Date.now() / 1000;
    const candidates = await db.channels
      .where('group_id')
      .anyOf(top.map((g) => g.groupId))
      .filter(
        (c) =>
          c.stream_type === 'vod' &&
          !c.is_separator &&
          !c.is_hidden &&
          !watchedIds.has(c.id) &&
          !continueIds.has(c.id)
      )
      .toArray();

    const ranked = candidates
      .map((c) => {
        const aff = affinityByGroup.get(c.group_id) || 0;
        const fresh = c.added ? decay((nowSec - c.added) / 86400, FRESHNESS_HALF_LIFE_DAYS) : 0.2;
        const score = aff * 0.75 + fresh * 0.25 + dayJitter(c.id) * 0.08;
        return { c, score };
      })
      .sort((a, b) => b.score - a.score);

    // Diversity: never let a single genre flood the list
    const perGenre = new Map<string, number>();
    for (const { c } of ranked) {
      const n = perGenre.get(c.group_id) || 0;
      if (n >= MAX_PER_GENRE) continue;
      perGenre.set(c.group_id, n + 1);
      scored.push(c);
      if (continueList.length + scored.length >= limit) break;
    }
  }

  return [...continueList, ...scored].map((c, i) => ({ ...c, num: i + 1, custom_order: i + 1 }));
}

/** Top genre names (for UI hints such as the category subtitle). */
export async function getTopGenreNames(max = 3): Promise<string[]> {
  const aff = await computeGenreAffinity();
  if (aff.length === 0) return [];
  const ids = aff.slice(0, max).map((g) => g.groupId);
  const cats = await db.categories.bulkGet(ids);
  return cats.filter(Boolean).map((c) => c!.name);
}
