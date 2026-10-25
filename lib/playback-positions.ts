export interface SavedPlaybackPosition {
  url: string;
  title?: string;
  positionMs: number;
  durationMs: number;
  completed?: boolean;
  updatedAt?: number;
  seriesId?: string;
  episodeIndex?: number;
}

export type PlaybackPositionsMap = Record<string, SavedPlaybackPosition>;

export function getAllSavedPositions(): PlaybackPositionsMap {
  if (typeof window === 'undefined') return {};
  try {
    const winMap = (window as any).__KEOTV_PLAYBACK_POSITIONS__;
    if (winMap && typeof winMap === 'object') {
      return winMap as PlaybackPositionsMap;
    }
    const raw = localStorage.getItem('keotv_playback_positions');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        (window as any).__KEOTV_PLAYBACK_POSITIONS__ = parsed;
        return parsed as PlaybackPositionsMap;
      }
    }
  } catch {}
  return {};
}

export function getSavedPositionForUrl(url?: string): SavedPlaybackPosition | null {
  if (!url) return null;
  const map = getAllSavedPositions();
  const entry = map[url];
  if (!entry || typeof entry.positionMs !== 'number') return null;
  return entry;
}

export function getSavedSeriesProgress(seriesId?: string): SavedPlaybackPosition | null {
  if (!seriesId) return null;
  const map = getAllSavedPositions();
  const entry = map[`series_${seriesId}`];
  if (!entry || typeof entry.positionMs !== 'number') return null;
  return entry;
}

export function isResumablePosition(entry?: SavedPlaybackPosition | null): boolean {
  if (!entry) return false;
  if (entry.completed) return false;
  if (entry.positionMs < 15000) return false;
  if (entry.durationMs > 0) {
    if (entry.positionMs >= entry.durationMs - 45000) return false;
    if (entry.positionMs / entry.durationMs >= 0.94) return false;
  }
  return true;
}

export function getProgressPercent(entry?: SavedPlaybackPosition | null): number {
  if (!entry || entry.durationMs <= 0) return 0;
  if (entry.completed) return 100;
  return Math.max(1, Math.min(99, Math.round((entry.positionMs / entry.durationMs) * 100)));
}

export function formatResumeTime(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}min`;
  }
  if (minutes > 0) {
    return `${minutes} min ${String(seconds).padStart(2, '0')}s`;
  }
  return `${seconds}s`;
}

export function formatRemainingTime(entry: SavedPlaybackPosition): string {
  if (!entry || entry.durationMs <= entry.positionMs) return '';
  const remSec = Math.max(0, Math.floor((entry.durationMs - entry.positionMs) / 1000));
  const hours = Math.floor(remSec / 3600);
  const minutes = Math.ceil((remSec % 3600) / 60);
  if (hours > 0) {
    return `Il reste ${hours}h ${String(minutes).padStart(2, '0')}min`;
  }
  return `Il reste ${minutes} min`;
}
