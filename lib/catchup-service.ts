/**
 * Catchup & Timeshift URL generator service for KeoTV
 * Supports Xtream Codes and standard M3U Catchup patterns.
 */

export interface CatchupParams {
  streamId?: string | number;     // Xtream Stream ID
  sourceUrl?: string;             // M3U stream URL
  catchupType?: string;           // "default", "append", "shift"
  catchupSource?: string;         // Template pattern in M3U
  startTimestamp: number;         // Start Unix timestamp in seconds
  durationMinutes: number;        // Duration in minutes
  serverUrl?: string;             // Xtream server base URL
  username?: string;              // Xtream username
  password?: string;              // Xtream password
}

export class CatchupService {
  /**
   * Formats a Unix timestamp (seconds) into Xtream Codes standard `YYYY-MM-DD:HH-mm` string
   */
  static formatXtreamDate(timestampSec: number, useUtc: boolean = false): string {
    const d = new Date(timestampSec * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    if (useUtc) {
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}:${pad(d.getUTCHours())}-${pad(d.getUTCMinutes())}`;
    }
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}:${pad(d.getHours())}-${pad(d.getMinutes())}`;
  }

  /**
   * Generates a list of candidate Catchup / Timeshift URLs ordered by compatibility across Xtream & M3U panels.
   * Used by NativePlayer (ExoPlayer) and Web Player for automatic seamless fallback if the primary format 404s.
   */
  static generateCatchupFallbackUrls(params: CatchupParams): string[] {
    const urls: string[] = [];

    if (params.serverUrl && params.streamId && params.username && params.password) {
      const baseUrl = params.serverUrl.endsWith('/') ? params.serverUrl.slice(0, -1) : params.serverUrl;
      const cleanId = String(params.streamId).replace(/^ch_xtream_(?:live|vod|series)_/, '').trim();
      const startSec = Math.floor(params.startTimestamp);
      const durMin = Math.max(1, Math.floor(params.durationMinutes));
      const user = encodeURIComponent(params.username);
      const pass = encodeURIComponent(params.password);

      const dateLocal = this.formatXtreamDate(startSec, false);
      const dateUtc = this.formatXtreamDate(startSec, true);

      // 1. Standard Xtream Codes: /timeshift/{user}/{pass}/{duration}/{YYYY-MM-DD:HH-mm}/{stream_id}.ts (Local / Server Time)
      urls.push(`${baseUrl}/timeshift/${user}/${pass}/${durMin}/${dateLocal}/${cleanId}.ts`);

      // 2. Standard Xtream Codes HLS (.m3u8) with YYYY-MM-DD:HH-mm
      urls.push(`${baseUrl}/timeshift/${user}/${pass}/${durMin}/${dateLocal}/${cleanId}.m3u8`);

      // 3. UTC date variant (if server archive uses UTC clock)
      if (dateUtc !== dateLocal) {
        urls.push(`${baseUrl}/timeshift/${user}/${pass}/${durMin}/${dateUtc}/${cleanId}.ts`);
        urls.push(`${baseUrl}/timeshift/${user}/${pass}/${durMin}/${dateUtc}/${cleanId}.m3u8`);
      }

      // 4. Xtream streaming/timeshift.php endpoint
      urls.push(
        `${baseUrl}/streaming/timeshift.php?username=${user}&password=${pass}&stream=${cleanId}&start=${dateLocal}&duration=${durMin}`
      );
      if (dateUtc !== dateLocal) {
        urls.push(
          `${baseUrl}/streaming/timeshift.php?username=${user}&password=${pass}&stream=${cleanId}&start=${dateUtc}&duration=${durMin}`
        );
      }

      // 5. Unix epoch timestamp format (XUI.one / newer panels)
      urls.push(`${baseUrl}/timeshift/${user}/${pass}/${durMin}/${startSec}/${cleanId}.ts`);
      urls.push(`${baseUrl}/timeshift/${user}/${pass}/${durMin}/${startSec}/${cleanId}.m3u8`);
    }

    // M3U Catchup Template
    if (params.sourceUrl) {
      const startSec = Math.floor(params.startTimestamp);
      const endSec = startSec + Math.floor(params.durationMinutes * 60);

      if (params.catchupSource) {
        let url = params.catchupSource;
        url = url.replace(/\$\{start\}/g, startSec.toString());
        url = url.replace(/\$\{end\}/g, endSec.toString());
        url = url.replace(/\$\{timestamp\}/g, startSec.toString());
        url = url.replace(/\$\{duration\}/g, (params.durationMinutes * 60).toString());
        url = url.replace(/\$\{offset\}/g, Math.max(0, Math.floor(Date.now() / 1000 - startSec)).toString());
        urls.push(url);
      }

      const separator = params.sourceUrl.includes('?') ? '&' : '?';
      urls.push(`${params.sourceUrl}${separator}utc=${startSec}&lutc=${Math.floor(Date.now() / 1000)}`);
    }

    return Array.from(new Set(urls));
  }

  /**
   * Generates a primary playable Timeshift / Catchup URL for past programs.
   */
  static generateCatchupUrl(params: CatchupParams): string | null {
    const candidates = this.generateCatchupFallbackUrls(params);
    return candidates.length > 0 ? candidates[0] : null;
  }
}

