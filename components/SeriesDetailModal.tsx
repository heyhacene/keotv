'use client';

import React, { useEffect, useState } from 'react';
import { ArrowLeft, Loader2, Play, AlertCircle, ChevronDown, ChevronRight, Film, Volume2, MessageSquare } from 'lucide-react';
import { Channel } from '@/types/iptv';
import { fetchSeriesInfo, SeriesDetails, SeriesEpisode } from '@/lib/iptv-service';
import { NativePlayer, isNativePlayerAvailable, NATIVE_PLAYER_USER_AGENT } from '@/lib/native-player';

interface SeriesDetailModalProps {
  series: Channel | null;
  serverUrl: string;
  username: string;
  password: string;
  onClose: () => void;
  onPlayEpisode?: (episode: SeriesEpisode, allEpisodes: SeriesEpisode[], audioPref?: string, subPref?: string) => void;
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

  // Persistent audio & subtitle choices per series
  const seriesKey = series?.id || series?.name || '';
  const [seriesAudio, setSeriesAudio] = useState<'vf' | 'vo'>('vf');
  const [seriesSub, setSeriesSub] = useState<'off' | 'fr' | 'en'>('off');

  // Load saved series language preferences
  useEffect(() => {
    if (!seriesKey) return;
    try {
      const savedAudio = localStorage.getItem(`keotv_series_audio_${seriesKey}`);
      if (savedAudio === 'vo' || savedAudio === 'vf') setSeriesAudio(savedAudio);

      const savedSub = localStorage.getItem(`keotv_series_sub_${seriesKey}`);
      if (savedSub === 'fr' || savedSub === 'en' || savedSub === 'off') setSeriesSub(savedSub);
    } catch {
      // ignore
    }
  }, [seriesKey]);

  const saveAudioPref = (val: 'vf' | 'vo') => {
    setSeriesAudio(val);
    try {
      localStorage.setItem(`keotv_series_audio_${seriesKey}`, val);
    } catch {
      // ignore
    }
  };

  const saveSubPref = (val: 'off' | 'fr' | 'en') => {
    setSeriesSub(val);
    try {
      localStorage.setItem(`keotv_series_sub_${seriesKey}`, val);
    } catch {
      // ignore
    }
  };

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
      onPlayEpisode(episode, all, seriesAudio, seriesSub);
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
          seriesId: seriesKey,
          preferredAudio: seriesAudio,
          preferredSubtitle: seriesSub,
        });
      } catch (err: any) {
        alert(`Lecture impossible : ${err?.message || err}`);
      }
      return;
    }

    alert('La lecture des épisodes nécessite l’application Android KeoTV.');
  };

  // Remote control Back key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isBack =
        e.key === 'Escape' ||
        e.key === 'Backspace' ||
        e.key === 'GoBack' ||
        e.key === 'Back' ||
        (e as any).keyCode === 27 ||
        (e as any).keyCode === 4;

      if (isBack) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const cover = details?.cover || series.logo;

  return (
    <div className="fixed inset-0 z-[60] bg-tv-bg flex flex-col">
      {/* Header */}
      <div className="flex items-center space-x-3 px-4 py-3 bg-tv-surface border-b border-tv-border flex-shrink-0">
        <button
          onClick={onClose}
          className="p-2 rounded-xl bg-tv-card hover:bg-tv-cardHover text-slate-200 hover:text-white transition flex items-center space-x-2 border border-tv-border shadow-sm focus:outline-none focus:ring-2 focus:ring-tv-accent focus:ring-offset-2 focus:ring-offset-tv-surface"
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
                {details?.audioLanguages && details.audioLanguages.length > 0 && (
                  <span className="bg-emerald-500/15 text-emerald-300 px-2.5 py-0.5 rounded-lg border border-emerald-500/30 font-medium flex items-center space-x-1">
                    <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Audio : {details.audioLanguages.join(', ')}</span>
                  </span>
                )}
                {details?.subtitles && details.subtitles.length > 0 && (
                  <span className="bg-purple-500/15 text-purple-300 px-2.5 py-0.5 rounded-lg border border-purple-500/30 font-medium flex items-center space-x-1">
                    <MessageSquare className="w-3.5 h-3.5 text-purple-400" />
                    <span>Sous-titres : {details.subtitles.join(', ')}</span>
                  </span>
                )}
              </div>
              {details?.plot && (
                <p className="text-xs sm:text-sm text-slate-300 mt-3 leading-relaxed line-clamp-4 sm:line-clamp-6">
                  {details.plot}
                </p>
              )}

              {/* Series Audio & Subtitles Preference Selector */}
              <div className="mt-3.5 p-3 rounded-xl bg-black/40 border border-white/10 space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex items-center space-x-2">
                    <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5 flex-shrink-0">
                      <Volume2 className="w-3.5 h-3.5 text-tv-accent" />
                      <span>Audio :</span>
                    </span>
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => saveAudioPref('vf')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition border ${
                          seriesAudio === 'vf'
                            ? 'bg-tv-focus text-white border-tv-accent shadow-sm'
                            : 'bg-tv-card/60 text-slate-400 border-white/5 hover:text-white'
                        }`}
                      >
                        Français (VF)
                      </button>
                      <button
                        onClick={() => saveAudioPref('vo')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition border ${
                          seriesAudio === 'vo'
                            ? 'bg-tv-focus text-white border-tv-accent shadow-sm'
                            : 'bg-tv-card/60 text-slate-400 border-white/5 hover:text-white'
                        }`}
                      >
                        Version Originale (VO)
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5 flex-shrink-0">
                      <MessageSquare className="w-3.5 h-3.5 text-purple-400" />
                      <span>Sous-titres :</span>
                    </span>
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => saveSubPref('off')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition border ${
                          seriesSub === 'off'
                            ? 'bg-tv-focus text-white border-tv-accent shadow-sm'
                            : 'bg-tv-card/60 text-slate-400 border-white/5 hover:text-white'
                        }`}
                      >
                        Sans
                      </button>
                      <button
                        onClick={() => saveSubPref('fr')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition border ${
                          seriesSub === 'fr'
                            ? 'bg-purple-600 text-white border-purple-400 shadow-sm'
                            : 'bg-tv-card/60 text-slate-400 border-white/5 hover:text-white'
                        }`}
                      >
                        Français (FR)
                      </button>
                      <button
                        onClick={() => saveSubPref('en')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition border ${
                          seriesSub === 'en'
                            ? 'bg-purple-600 text-white border-purple-400 shadow-sm'
                            : 'bg-tv-card/60 text-slate-400 border-white/5 hover:text-white'
                        }`}
                      >
                        Anglais (EN)
                      </button>
                    </div>
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 italic">
                  ✓ Vos choix de langue et sous-titres sont mémorisés spécifiquement pour cette série et appliqués automatiquement à tous ses épisodes.
                </p>
              </div>
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
                    className="w-full flex items-center justify-between p-4 text-left hover:bg-tv-cardHover transition focus:outline-none focus:ring-2 focus:ring-tv-accent focus:ring-offset-2 focus:ring-offset-tv-bg"
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
                          className="w-full flex items-center space-x-3 sm:space-x-4 p-3.5 sm:p-4 text-left hover:bg-tv-focus/20 transition group focus:outline-none focus:ring-2 focus:ring-tv-accent focus:ring-offset-2 focus:ring-offset-tv-bg"
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
