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
   * Generates a playable Timeshift / Catchup URL for past programs.
   */
  static generateCatchupUrl(params: CatchupParams): string | null {
    // 1. Xtream Codes Standard Catchup URL
    if (params.serverUrl && params.streamId && params.username && params.password) {
      const baseUrl = params.serverUrl.endsWith('/') ? params.serverUrl.slice(0, -1) : params.serverUrl;
      const startStr = Math.floor(params.startTimestamp).toString();
      const durStr = Math.max(1, Math.floor(params.durationMinutes)).toString();

      // Format standard Xtream: /timeshift/{username}/{password}/{duration_min}/{start_timestamp}/{stream_id}.ts
      return `${baseUrl}/timeshift/${encodeURIComponent(params.username)}/${encodeURIComponent(params.password)}/${durStr}/${startStr}/${params.streamId}.ts`;
    }

    // 2. M3U Catchup Template
    if (params.sourceUrl) {
      const startSec = Math.floor(params.startTimestamp);
      const endSec = startSec + Math.floor(params.durationMinutes * 60);

      if (params.catchupSource) {
        let url = params.catchupSource;
        url = url.replace(/\$\{start\}/g, startSec.toString());
        url = url.replace(/\$\{end\}/g, endSec.toString());
        url = url.replace(/\$\{timestamp\}/g, startSec.toString());
        url = url.replace(/\$\{duration\}/g, (params.durationMinutes * 60).toString());
        url = url.replace(/\$\{offset\}/g, Math.max(0, Math.floor((Date.now() / 1000) - startSec)).toString());
        return url;
      }

      if (params.catchupType === 'append' || params.catchupType === 'default') {
        const separator = params.sourceUrl.includes('?') ? '&' : '?';
        return `${params.sourceUrl}${separator}utc=${startSec}&lutc=${startSec}`;
      }

      if (params.catchupType === 'shift') {
        const nowSec = Math.floor(Date.now() / 1000);
        const shiftHours = Math.max(1, Math.floor((nowSec - startSec) / 3600));
        const separator = params.sourceUrl.includes('?') ? '&' : '?';
        return `${params.sourceUrl}${separator}utc=${shiftHours}`;
      }
    }

    return null;
  }
}
