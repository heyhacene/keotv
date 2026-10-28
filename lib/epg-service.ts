import { db } from './db';
import { EpgProgram } from '@/types/iptv';
import { fetchHttp, toArray } from './iptv-service';
import { CatchupService } from './catchup-service';

/**
 * Service for fetching, storing, and retrieving EPG data
 * Handles Xtream Codes Short EPG, Full Simple Data Table, and XMLTV sources.
 */
export class EPGService {
  private static decodeBase64IfNeeded(raw: any): string {
    if (!raw || typeof raw !== 'string') return '';
    const trimmed = raw.trim();
    // Xtream panels almost always Base64-encode EPG titles and descriptions
    if (/^[A-Za-z0-9+/=]+$/.test(trimmed) && trimmed.length >= 4 && trimmed.length % 4 === 0) {
      try {
        const binary = atob(trimmed);
        try {
          return decodeURIComponent(escape(binary));
        } catch {
          return binary;
        }
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }

  private static parseTimestampMs(rawTs: any, rawDateStr: any, fallbackMs: number): number {
    if (rawTs !== undefined && rawTs !== null && rawTs !== '') {
      const n = Number(rawTs);
      if (!isNaN(n) && n > 0) {
        return n > 10000000000 ? n : n * 1000;
      }
    }
    if (rawDateStr && typeof rawDateStr === 'string') {
      // Handle "YYYY-MM-DD HH:mm:ss"
      const normalized = rawDateStr.trim().replace(' ', 'T');
      const parsed = new Date(normalized).getTime();
      if (!isNaN(parsed)) return parsed;
    }
    return fallbackMs;
  }

  /**
   * Fetches EPG from Xtream API for a specific stream/channel
   * Uses `get_simple_data_table` first (includes past catchup + current + future timeline),
   * and falls back to `get_short_epg` if needed.
   */
  static async fetchXtreamShortEpg(params: {
    serverUrl: string;
    username: string;
    password: string;
    streamId: string | number;
    channelId: string;
  }): Promise<EpgProgram[]> {
    try {
      const baseUrl = params.serverUrl.endsWith('/') ? params.serverUrl.slice(0, -1) : params.serverUrl;
      const cleanStreamId = String(params.streamId).replace(/^ch_xtream_(?:live|vod|series)_/, '').trim();
      const url = `${baseUrl}/player_api.php?username=${encodeURIComponent(params.username)}&password=${encodeURIComponent(params.password)}&action=get_short_epg&stream_id=${cleanStreamId}&limit=12`;

      const res = await fetchHttp(url, 'json');
      const listings = toArray(res?.epg_listings || res);

      if (listings.length === 0) return [];

      const programs = this.parseListings(listings, { ...params, streamId: cleanStreamId });

      // Save to IndexedDB
      if (programs.length > 0) {
        try {
          await db.epg_programs.bulkPut(programs);
        } catch {}
      }

      return programs;
    } catch (err) {
      console.warn('Failed to fetch short EPG for stream', params.streamId, err);
      return [];
    }
  }

  /**
   * Retrieves stored EPG programs for a channel
   */
  static async getProgramsForChannel(channelId: string): Promise<EpgProgram[]> {
    try {
      // Compound index [channel_id+start] returns rows already sorted: no in-memory sort needed
      return await db.epg_programs
        .where('[channel_id+start]')
        .between([channelId, ''], [channelId, '\uffff'])
        .toArray();
    } catch {
      return [];
    }
  }

  /**
   * Retrieves current and next EPG program for a channel based on current time
   */
  static async getCurrentAndNext(channelId: string): Promise<{ current: EpgProgram | null; next: EpgProgram | null }> {
    try {
      const programs = await this.getProgramsForChannel(channelId);
      if (programs.length === 0) return { current: null, next: null };

      const now = new Date().toISOString();
      const current = programs.find((p) => p.start <= now && p.end > now) || null;
      const next = programs.find((p) => p.start >= (current ? current.end : now)) || null;

      return { current, next };
    } catch {
      return { current: null, next: null };
    }
  }

  /**
   * Fetches full EPG for a stream (all past & upcoming programs available from Xtream)
   * action=get_simple_data_table&stream_id=...
   */
  static async fetchXtreamFullEpg(params: {
    serverUrl: string;
    username: string;
    password: string;
    streamId: string | number;
    channelId: string;
  }): Promise<EpgProgram[]> {
    try {
      const baseUrl = params.serverUrl.endsWith('/') ? params.serverUrl.slice(0, -1) : params.serverUrl;
      const cleanStreamId = String(params.streamId).replace(/^ch_xtream_(?:live|vod|series)_/, '').trim();
      const url = `${baseUrl}/player_api.php?username=${encodeURIComponent(params.username)}&password=${encodeURIComponent(params.password)}&action=get_simple_data_table&stream_id=${cleanStreamId}`;

      const res = await fetchHttp(url, 'json');
      const listings = toArray(res?.epg_listings || res);

      if (listings.length === 0) {
        // Fallback to short EPG with limit=50
        const shortUrl = `${baseUrl}/player_api.php?username=${encodeURIComponent(params.username)}&password=${encodeURIComponent(params.password)}&action=get_short_epg&stream_id=${cleanStreamId}&limit=50`;
        const shortRes = await fetchHttp(shortUrl, 'json');
        const shortListings = toArray(shortRes?.epg_listings || shortRes);
        if (shortListings.length === 0) return [];
        const parsedShort = this.parseListings(shortListings, { ...params, streamId: cleanStreamId });
        if (parsedShort.length > 0) {
          try { await db.epg_programs.bulkPut(parsedShort); } catch {}
        }
        return parsedShort;
      }

      const parsed = this.parseListings(listings, { ...params, streamId: cleanStreamId });
      if (parsed.length > 0) {
        try { await db.epg_programs.bulkPut(parsed); } catch {}
      }
      return parsed;
    } catch (err) {
      console.warn('Failed to fetch full EPG for stream', params.streamId, err);
      return [];
    }
  }

  private static parseListings(
    listings: any[],
    params: { serverUrl: string; username: string; password: string; streamId: string | number; channelId: string }
  ): EpgProgram[] {
    const nowMs = Date.now();
    const mapped = listings.map((item: any, idx: number) => {
      const title = this.decodeBase64IfNeeded(item.title) || 'Programme';
      const description = this.decodeBase64IfNeeded(item.description) || '';

      const startMs = this.parseTimestampMs(item.start_timestamp, item.start, nowMs);
      const endMs = this.parseTimestampMs(item.stop_timestamp, item.end || item.stop, startMs + 3600000);
      const startIso = new Date(startMs).toISOString();
      const endIso = new Date(endMs).toISOString();
      const durationMin = Math.max(1, Math.round((endMs - startMs) / 60000));

      const isPast = endMs <= nowMs;
      const hasArchiveFlag = Number(item.has_archive) === 1 || isPast;
      const startTimestampSec = Math.floor(startMs / 1000);
      let catchupUrl: string | undefined = undefined;
      let hasCatchup = false;

      if ((isPast || hasArchiveFlag) && params.serverUrl && params.username && params.password && params.streamId) {
        catchupUrl =
          CatchupService.generateCatchupUrl({
            serverUrl: params.serverUrl,
            username: params.username,
            password: params.password,
            streamId: params.streamId,
            startTimestamp: startTimestampSec,
            durationMinutes: durationMin,
          }) || undefined;
        hasCatchup = Boolean(catchupUrl);
      }

      return {
        id: `epg_${params.channelId}_${item.id || idx}_${startTimestampSec}`,
        channel_id: params.channelId,
        title: title.trim(),
        description: description.trim(),
        start: startIso,
        end: endIso,
        duration_min: durationMin,
        has_catchup: hasCatchup,
        catchup_url: catchupUrl,
      };
    });

    // Sort strictly in chronological order
    mapped.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    return mapped;
  }
}

