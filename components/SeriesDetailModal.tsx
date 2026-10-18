'use client';

import React, { useEffect, useState } from 'react';
import { ArrowLeft, Loader2, Play, AlertCircle, ChevronDown, ChevronRight, Film } from 'lucide-react';
import { Channel } from '@/types/iptv';
import { fetchSeriesInfo, SeriesDetails, SeriesEpisode } from '@/lib/iptv-service';
import { NativePlayer, isNativePlayerAvailable, NATIVE_PLAYER_USER_AGENT } from '@/lib/native-player';

interface SeriesDetailModalProps {
  series: Channel | null;
  serverUrl: string;
  username: string;
  password: string;
  onClose: () => void;
  onPlayEpisode?: (episode: SeriesEpisode, allEpisodes: SeriesEpisode[]) => void;
}

// Full page for a series: seasons (collapsible) and all episodes of each season
export const SeriesDetailModal: React.FC<SeriesDetailModalProps> = ({
  series,
  serverUrl,
  username,
  password,
  onClose,
  onPlayEpisode,
}) => {
  const [details, setDetails] = useState<SeriesDetails | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [openSeason, setOpenSeason] = useState<number | null>(null);

  useEffect(() => {
    if (!series) return;
    let cancelled = false;
    setDetails(null);
    setError(null);
    setLoading(true);

    const seriesId = series.epg_id || series.id.replace(/^ch_xtream_(?:series_)?/, '');
    fetchSeriesInfo(serverUrl, username, password, seriesId)
      .then((d) => {
        if (cancelled) return;
        setDetails(d);
        if (d.seasons.length > 0) setOpenSeason(d.seasons[0].season);
        if (d.seasons.length === 0) setError('Aucun épisode disponible pour cette série sur ce serveur.');
      })
      .catch((err: any) => {
        if (cancelled) return;
        setError(`Impossible de charger la série : ${err?.message || err}`);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [series, serverUrl, username, password]);

  if (!series) return null;

  const playEpisode = async (episode: SeriesEpisode) => {
    if (!details) return;
    // Playlist = all episodes of all seasons in order, so "next" goes on to the following episode / season
    const all = details.seasons.flatMap((s) => s.episodes);
    const index = Math.max(0, all.findIndex((e) => e.id === episode.id));

    if (onPlayEpisode) {
      onPlayEpisode(episode, all);
      return;
    }

    if (isNativePlayerAvailable()) {
      try {
        await NativePlayer.play({
          urls: all.map((e) => e.url),
          titles: all.map((e) => `${series.name} — S${String(e.season).padStart(2, '0')}E${String(e.episodeNum).padStart(2, '0')} ${e.title}`),
          index,
          userAgent: NATIVE_PLAYER_USER_AGENT,
          isLive: false,
        });
      } catch (err: any) {
        alert(`Lecture impossible : ${err?.message || err}`);
      }
      return;
    }

    alert('La lecture des épisodes nécessite l’application Android KeoTV.');
  };

  const cover = details?.cover || series.logo;

  return (
    <div className="fixed inset-0 z-[60] bg-tv-bg flex flex-col">
      {/* Header */}
      <div className="flex items-center space-x-3 px-4 py-3 bg-tv-surface border-b border-tv-border flex-shrink-0">
        <button
          onClick={onClose}
          className="p-2 rounded-xl bg-tv-card hover:bg-tv-cardHover text-slate-200 hover:text-white transition flex items-center space-x-2 border border-tv-border shadow-sm"
          title="Retour aux séries"
        >
          <ArrowLeft className="w-5 h-5 text-tv-accent" />
          <span className="text-xs font-semibold hidden sm:inline">Retour</span>
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm sm:text-base font-bold text-white truncate">{series.name}</h2>
          <span className="text-[11px] text-slate-400">Saisons et Épisodes</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Presentation Header */}
        <div className="p-4 sm:p-6 bg-gradient-to-b from-tv-surface/60 via-tv-surface/30 to-transparent border-b border-tv-border/40">
          <div className="max-w-5xl mx-auto flex flex-col sm:flex-row gap-4 sm:gap-6 items-start">
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cover}
                alt={series.name}
                className="w-28 h-40 sm:w-36 sm:h-52 object-cover rounded-2xl bg-tv-card border border-tv-border shadow-2xl flex-shrink-0 mx-auto sm:mx-0"
                onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
              />
            ) : (
              <div className="w-28 h-40 sm:w-36 sm:h-52 rounded-2xl bg-tv-card border border-tv-border flex items-center justify-center flex-shrink-0 mx-auto sm:mx-0">
                <Film className="w-10 h-10 text-slate-600" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h3 className="text-xl sm:text-2xl font-black text-white">{series.name}</h3>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300 mt-2">
                {details?.year && <span className="bg-tv-card px-2.5 py-0.5 rounded-lg border border-tv-border font-medium">{details.year}</span>}
                {details?.genre && <span className="bg-tv-card px-2.5 py-0.5 rounded-lg border border-tv-border font-medium">{details.genre}</span>}
                {details?.rating && <span className="bg-amber-500/20 text-amber-300 px-2.5 py-0.5 rounded-lg border border-amber-500/30 font-semibold">★ {details.rating}</span>}
                {details && details.seasons.length > 0 && (
                  <span className="bg-sky-500/20 text-sky-300 px-2.5 py-0.5 rounded-lg border border-sky-500/30 font-semibold">
                    {details.seasons.length} saison{details.seasons.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              {details?.plot && (
                <p className="text-xs sm:text-sm text-slate-300 mt-3 leading-relaxed line-clamp-4 sm:line-clamp-6">
                  {details.plot}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="py-16 flex flex-col items-center text-center space-y-3">
            <Loader2 className="w-9 h-9 animate-spin text-tv-accent" />
            <p className="text-sm text-slate-200 font-bold">Récupération des saisons et épisodes...</p>
            <p className="text-xs text-slate-400">Interrogation de votre serveur IPTV en cours</p>
          </div>
        )}

        {/* Error State */}
        {!loading && error && (
          <div className="py-12 px-6 max-w-md mx-auto flex flex-col items-center text-center space-y-3">
            <AlertCircle className="w-10 h-10 text-rose-400" />
            <p className="text-sm font-semibold text-rose-200">{error}</p>
          </div>
        )}

        {/* Seasons Accordion */}
        {details && details.seasons.length > 0 && (
          <div className="px-4 sm:px-6 py-6 space-y-3 max-w-5xl mx-auto">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Saisons & Épisodes ({details.seasons.reduce((acc, s) => acc + s.episodes.length, 0)} épisodes au total)
            </h4>
            {details.seasons.map((season) => {
              const isOpen = openSeason === season.season;
              return (
                <div key={season.season} className="rounded-2xl border border-tv-border bg-tv-card/60 backdrop-blur-sm overflow-hidden shadow-lg transition">
                  <button
                    onClick={() => setOpenSeason(isOpen ? null : season.season)}
                    className="w-full flex items-center justify-between p-4 text-left hover:bg-tv-cardHover transition"
                  >
                    <span className="text-sm sm:text-base font-bold text-white flex items-center space-x-2">
                      <span>{season.name}</span>
                      <span className="text-xs font-normal text-slate-400 bg-black/40 px-2 py-0.5 rounded-full border border-white/5">
                        {season.episodes.length} épisode{season.episodes.length > 1 ? 's' : ''}
                      </span>
                    </span>
                    <div className="p-1 rounded-lg bg-black/40 border border-white/5 text-slate-300">
                      {isOpen ? (
                        <ChevronDown className="w-4 h-4 text-tv-accent" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-tv-border/60 divide-y divide-tv-border/40 bg-black/25">
                      {season.episodes.map((ep) => (
                        <button
                          key={ep.id}
                          onClick={() => playEpisode(ep)}
                          className="w-full flex items-center space-x-3 sm:space-x-4 p-3.5 sm:p-4 text-left hover:bg-tv-focus/20 transition group"
                        >
                          <span className="w-10 h-10 rounded-xl bg-tv-focus/80 group-hover:bg-tv-focus group-hover:scale-105 flex items-center justify-center flex-shrink-0 shadow transition">
                            <Play className="w-4 h-4 text-white fill-white ml-0.5" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center space-x-2">
                              <span className="text-xs sm:text-sm font-bold text-white group-hover:text-tv-accent transition truncate">
                                Épisode {ep.episodeNum} : {ep.title}
                              </span>
                              {ep.duration && (
                                <span className="text-[10px] text-slate-400 bg-white/5 px-1.5 py-0.5 rounded font-mono">
                                  {ep.duration}
                                </span>
                              )}
                            </div>
                            {ep.plot && (
                              <p className="text-[11px] text-slate-400 mt-1 line-clamp-2 leading-tight">
                                {ep.plot}
                              </p>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
