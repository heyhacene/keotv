import { db } from './db';
import { EpgProgram } from '@/types/iptv';
import { fetchHttp, toArray } from './iptv-service';

/**
 * Service for fetching, storing, and retrieving EPG data
 * Handles Xtream Codes Short EPG and XMLTV sources.
 */
export class EPGService {
  /**
   * Fetches EPG from Xtream API for a specific stream/channel
   * action=get_short_epg&stream_id=...
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
      const url = `${baseUrl}/player_api.php?username=${encodeURIComponent(params.username)}&password=${encodeURIComponent(params.password)}&action=get_short_epg&stream_id=${params.streamId}&limit=10`;

      const res = await fetchHttp(url, 'json');
      const listings = toArray(res?.epg_listings || res);

      if (listings.length === 0) return [];

      const programs: EpgProgram[] = listings.map((item: any, idx: number) => {
        // Base64 decode title if needed
        let title = item.title || 'Programme';
        try {
          if (typeof title === 'string' && /^[A-Za-z0-9+/=]+$/.test(title) && title.length > 8) {
            title = decodeURIComponent(escape(atob(title)));
          }
        } catch {}

        let description = item.description || '';
        try {
          if (typeof description === 'string' && /^[A-Za-z0-9+/=]+$/.test(description) && description.length > 8) {
            description = decodeURIComponent(escape(atob(description)));
          }
        } catch {}

        const startIso = item.start ? new Date(item.start).toISOString() : new Date().toISOString();
        const endIso = item.end ? new Date(item.end).toISOString() : new Date(Date.now() + 3600000).toISOString();
        const durationMin = Math.max(1, Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000));

        return {
          id: `epg_${params.channelId}_${item.id || idx}_${item.start_timestamp || Date.now()}`,
          channel_id: params.channelId,
          title: title.trim(),
          description: description.trim(),
          start: startIso,
          end: endIso,
          duration_min: durationMin,
        };
      });

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
      return await db.epg_programs
        .where('channel_id')
        .equals(channelId)
        .sortBy('start');
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
}
