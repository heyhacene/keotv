'use client';

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { ArrowLeft, Loader2, Play, RotateCcw, CheckCircle2, Clock, AlertCircle, ChevronDown, ChevronRight, Film, Volume2, MessageSquare, Star } from 'lucide-react';
import { Channel } from '@/types/iptv';
import { fetchSeriesInfo, SeriesDetails, SeriesEpisode } from '@/lib/iptv-service';
import { NativePlayer, isNativePlayerAvailable, NATIVE_PLAYER_USER_AGENT } from '@/lib/native-player';
import { db } from '@/lib/db';
import {
  PlaybackPositionsMap,
  getAllSavedPositions,
  isResumablePosition,
  getProgressPercent,
  formatResumeTime,
  formatRemainingTime,
} from '@/lib/playback-positions';

export interface SeriesEpisodePlayOptions {
  startPositionMs?: number;
  forceRestart?: boolean;
}

interface SeriesDetailModalProps {
  series: Channel | null;
  serverUrl: string;
  username: string;
  password: string;
  onClose: () => void;
  onPlayEpisode?: (episode: SeriesEpisode, allEpisodes: SeriesEpisode[], audioPref?: string, subPref?: string, options?: SeriesEpisodePlayOptions) => void;
  onToggleFavorite?: (series: Channel, explicitNewState?: boolean) => void;
}

type FocusedSection = 'back' | 'fav' | 'resume' | 'restart' | 'audio' | 'sub' | 'seasons' | 'episodes';

// Full page for a series: seasons (collapsible) and all episodes with full TV remote navigation
export const SeriesDetailModal: React.FC<SeriesDetailModalProps> = ({
  series,
  serverUrl,
  username,
  password,
  onClose,
  onPlayEpisode,
  onToggleFavorite,
}) => {
  const [details, setDetails] = useState<SeriesDetails | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [openSeason, setOpenSeason] = useState<number | null>(null);
  const [isFavorite, setIsFavorite] = useState<boolean>(Boolean(series?.is_favorite));
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [positionsMap, setPositionsMap] = useState<PlaybackPositionsMap>({});

  // Persistent audio & subtitle choices per series
  const seriesKey = String(series?.id || series?.name || '');
  const [seriesAudio, setSeriesAudio] = useState<'vf' | 'vo'>('vf');
  const [seriesSub, setSeriesSub] = useState<'off' | 'fr' | 'en'>('off');

  // TV Remote Navigation states
  const [focusedSection, setFocusedSection] = useState<FocusedSection>('episodes');
  const [focusedAudioChoice, setFocusedAudioChoice] = useState<'vf' | 'vo'>('vf');
  const [focusedSubChoice, setFocusedSubChoice] = useState<'off' | 'fr' | 'en'>('off');
  const [focusedSeasonIndex, setFocusedSeasonIndex] = useState<number>(0);
  const [focusedEpisodeIndex, setFocusedEpisodeIndex] = useState<number>(0);

  const refreshPositions = useCallback(() => {
    setPositionsMap({ ...getAllSavedPositions() });
  }, []);

  useEffect(() => {
    refreshPositions();
    const onPosUpdated = () => refreshPositions();
    window.addEventListener('keotv-positions-updated', onPosUpdated);
    window.addEventListener('focus', onPosUpdated);
    return () => {
      window.removeEventListener('keotv-positions-updated', onPosUpdated);
      window.removeEventListener('focus', onPosUpdated);
    };
  }, [refreshPositions]);

  // Compute the active resume target (either an in-progress episode, or the next episode after a completed one)
  const resumeTarget = useMemo(() => {
    if (!details || details.seasons.length === 0) return null;
    const allWithSeason: Array<{ ep: SeriesEpisode; seasonNum: number; sIdx: number; epIdx: number }> = [];
    details.seasons.forEach((s, sIdx) => {
      s.episodes.forEach((ep, epIdx) => {
        allWithSeason.push({ ep, seasonNum: s.season, sIdx, epIdx });
      });
    });

    // 1. Check the most recently watched episode for this series
    let latestIdx = -1;
    let latestUpdatedAt = 0;
    allWithSeason.forEach((item, idx) => {
      const saved = positionsMap[item.ep.url];
      if (saved && (saved.updatedAt || 0) >= latestUpdatedAt && (saved.positionMs > 15000 || saved.completed)) {
        latestUpdatedAt = saved.updatedAt || 1;
        latestIdx = idx;
      }
    });

    if (latestIdx >= 0) {
      const current = allWithSeason[latestIdx];
      const saved = positionsMap[current.ep.url];
      if (saved && isResumablePosition(saved)) {
        return {
          mode: 'resume' as const,
          ep: current.ep,
          seasonNum: current.seasonNum,
          sIdx: current.sIdx,
          epIdx: current.epIdx,
          saved,
        };
      }
      if (saved && saved.completed && latestIdx + 1 < allWithSeason.length) {
        const nextItem = allWithSeason[latestIdx + 1];
        return {
          mode: 'next' as const,
          ep: nextItem.ep,
          seasonNum: nextItem.seasonNum,
          sIdx: nextItem.sIdx,
          epIdx: nextItem.epIdx,
          saved: null,
        };
      }
    }
    return null;
  }, [details, positionsMap]);

  // Load saved series language preferences
  useEffect(() => {
    if (!seriesKey) return;
    try {
      const savedAudio = localStorage.getItem(`keotv_series_audio_${seriesKey}`);
      if (savedAudio === 'vo' || savedAudio === 'vf') {
        setSeriesAudio(savedAudio);
        setFocusedAudioChoice(savedAudio);
      }

      const savedSub = localStorage.getItem(`keotv_series_sub_${seriesKey}`);
      if (savedSub === 'fr' || savedSub === 'en' || savedSub === 'off') {
        setSeriesSub(savedSub);
        setFocusedSubChoice(savedSub);
      }
    } catch {
      // ignore
    }
  }, [seriesKey]);

  const saveAudioPref = (val: 'vf' | 'vo') => {
    setSeriesAudio(val);
    setFocusedAudioChoice(val);
    try {
      localStorage.setItem(`keotv_series_audio_${seriesKey}`, val);
    } catch {
      // ignore
    }
  };

  const saveSubPref = (val: 'off' | 'fr' | 'en') => {
    setSeriesSub(val);
    setFocusedSubChoice(val);
    try {
      localStorage.setItem(`keotv_series_sub_${seriesKey}`, val);
    } catch {
      // ignore
    }
  };

  const handleToggleFavorite = async () => {
    if (!series) return;
    const nextState = !isFavorite;
    setIsFavorite(nextState);

    setToastMessage(nextState ? '⭐ Enregistré dans vos favoris !' : 'Retiré de vos favoris.');
    setTimeout(() => {
      setToastMessage(null);
    }, 2500);

    if (onToggleFavorite) {
      onToggleFavorite(series, nextState);
    }
  };

  useEffect(() => {
    if (!series) return;
    let cancelled = false;
    setDetails(null);
    setError(null);
    setToastMessage(null);
    setLoading(true);

    db.channels.get(series.id).then((ch) => {
      if (!cancelled) {
        setIsFavorite(Boolean(ch ? ch.is_favorite : series.is_favorite));
      }
    }).catch(() => {
      if (!cancelled) setIsFavorite(Boolean(series.is_favorite));
    });

    const seriesId = series.epg_id || series.id.replace(/^ch_xtream_(?:series_)?/, '');
    if (serverUrl && username && password && !series.id.startsWith('ch_m3u_')) {
      fetchSeriesInfo(serverUrl, username, password, seriesId)
        .then((d) => {
          if (cancelled) return;
          setDetails(d);
          if (d.seasons.length > 0) {
            const currentPosMap = getAllSavedPositions();
            // Auto-open the season of the last watched episode if available
            let targetSIdx = 0;
            let targetEpIdx = 0;
            let hasSavedResume = false;
            let latestTime = 0;
            d.seasons.forEach((s, sIdx) => {
              s.episodes.forEach((ep, epIdx) => {
                const sv = currentPosMap[ep.url];
                if (sv && (sv.updatedAt || 0) >= latestTime && (sv.positionMs > 15000 || sv.completed)) {
                  latestTime = sv.updatedAt || 1;
                  targetSIdx = sIdx;
                  targetEpIdx = epIdx;
                  hasSavedResume = true;
                }
              });
            });
            setOpenSeason(d.seasons[targetSIdx].season);
            setFocusedSeasonIndex(targetSIdx);
            setFocusedEpisodeIndex(targetEpIdx);
            setFocusedSection(hasSavedResume ? 'resume' : 'episodes');
          }
          if (d.seasons.length === 0) setError('Aucun épisode disponible pour cette série sur ce serveur.');
        })
        .catch((err: any) => {
          if (cancelled) return;
          console.warn('Series info fetch failed, fallback to standalone series item:', err);
          createFallbackDetails();
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    } else {
      createFallbackDetails();
      setLoading(false);
    }

    function createFallbackDetails() {
      if (!series) return;
      const sNum = 1;
      const epNum = 1;
      setDetails({
        name: series.name,
        cover: series.logo,
        plot: 'Épisode disponible dans votre sélection.',
        genre: 'Série',
        rating: '8.0',
        audioLanguages: ['Français (VF)'],
        subtitles: [],
        seasons: [
          {
            season: sNum,
            name: `Saison ${sNum}`,
            episodes: [
              {
                id: Number(series.epg_id) || 1,
                episodeNum: epNum,
                title: series.name,
                url: series.stream_url,
                duration: '45 min',
                plot: series.name,
                image: series.logo,
              },
            ],
          },
        ],
      });
      setOpenSeason(sNum);
      setFocusedSeasonIndex(0);
      setFocusedEpisodeIndex(0);
      setFocusedSection('episodes');
    }

    return () => {
      cancelled = true;
    };
  }, [series, serverUrl, username, password]);

  const playEpisode = useCallback(async (episode: SeriesEpisode, options?: SeriesEpisodePlayOptions) => {
    if (!details || !series) return;
    const all = details.seasons.flatMap((s) => s.episodes.map((ep) => ({ ...ep, season: ep.season ?? s.season })));
    const index = Math.max(0, all.findIndex((e) => e.id === episode.id));
    const savedEpPos = positionsMap[episode.url];
    const startPositionMs =
      options?.forceRestart
        ? 0
        : options?.startPositionMs !== undefined
        ? options.startPositionMs
        : isResumablePosition(savedEpPos)
        ? savedEpPos!.positionMs
        : 0;
    const forceRestart = Boolean(options?.forceRestart);

    if (onPlayEpisode) {
      onPlayEpisode(episode, all, seriesAudio, seriesSub, { startPositionMs, forceRestart });
      return;
    }

    if (isNativePlayerAvailable()) {
      try {
        await NativePlayer.play({
          urls: all.map((e) => e.url),
          titles: all.map((e) => `${series.name} — S${String(e.season || 1).padStart(2, '0')}E${String(e.episodeNum).padStart(2, '0')} ${e.title}`),
          index,
          userAgent: NATIVE_PLAYER_USER_AGENT,
          isLive: false,
          seriesId: seriesKey,
          preferredAudio: seriesAudio,
          preferredSubtitle: seriesSub,
          startPositionMs,
          forceRestart,
        });
      } catch (err: any) {
        alert(`Lecture impossible : ${err?.message || err}`);
      }
      return;
    }

    alert('La lecture des épisodes nécessite l’application Android KeoTV.');
  }, [details, series, onPlayEpisode, seriesAudio, seriesSub, seriesKey, positionsMap]);

  // Active season & current episode list
  const activeSeasonData = details?.seasons.find((s) => s.season === openSeason);
  const currentEpisodes = activeSeasonData?.episodes || [];

  // Smooth scroll helper
  const scrollToFocusedElement = (elementId: string) => {
    setTimeout(() => {
      const el = document.getElementById(elementId);
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 40);
  };

  // ==============================================================
  // FULL TV REMOTE CONTROL D-PAD ENGINE FOR SERIES DETAIL
  // ==============================================================
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isUp = e.key === 'ArrowUp' || (e as any).keyCode === 38;
      const isDown = e.key === 'ArrowDown' || (e as any).keyCode === 40;
      const isLeft = e.key === 'ArrowLeft' || (e as any).keyCode === 37;
      const isRight = e.key === 'ArrowRight' || (e as any).keyCode === 39;
      const isEnter =
        e.key === 'Enter' ||
        e.key === 'Select' ||
        (e as any).keyCode === 13 ||
        (e as any).keyCode === 23;
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
        return;
      }

      if (!details || details.seasons.length === 0) {
        if (isEnter && focusedSection === 'back') {
          e.preventDefault();
          onClose();
        }
        return;
      }

      // 1. SECTION: BACK BUTTON
      if (focusedSection === 'back') {
        if (isEnter) {
          e.preventDefault();
          onClose();
          return;
        }
        if (isRight) {
          e.preventDefault();
          setFocusedSection('fav');
          scrollToFocusedElement('series-btn-fav');
          return;
        }
        if (isDown) {
          e.preventDefault();
          if (resumeTarget) {
            setFocusedSection('resume');
            scrollToFocusedElement('series-btn-resume');
          } else {
            setFocusedSection('audio');
            scrollToFocusedElement('series-pref-audio');
          }
          return;
        }
        return;
      }

      // 1B. SECTION: FAVORITE BUTTON
      if (focusedSection === 'fav') {
        if (isLeft) {
          e.preventDefault();
          setFocusedSection('back');
          scrollToFocusedElement('series-btn-back');
          return;
        }
        if (isDown) {
          e.preventDefault();
          if (resumeTarget) {
            setFocusedSection('resume');
            scrollToFocusedElement('series-btn-resume');
          } else {
            setFocusedSection('audio');
            scrollToFocusedElement('series-pref-audio');
          }
          return;
        }
        if (isEnter) {
          e.preventDefault();
          handleToggleFavorite();
          return;
        }
        return;
      }

      // 1C. SECTION: RESUME BUTTON
      if (focusedSection === 'resume') {
        if (isUp) {
          e.preventDefault();
          setFocusedSection('back');
          scrollToFocusedElement('series-btn-back');
          return;
        }
        if (isRight) {
          e.preventDefault();
          if (resumeTarget?.mode === 'resume') {
            setFocusedSection('restart');
            scrollToFocusedElement('series-btn-restart');
          } else {
            setFocusedSection('fav');
            scrollToFocusedElement('series-btn-fav');
          }
          return;
        }
        if (isDown) {
          e.preventDefault();
          setFocusedSection('audio');
          scrollToFocusedElement('series-pref-audio');
          return;
        }
        if (isEnter) {
          e.preventDefault();
          if (resumeTarget) {
            playEpisode(
              resumeTarget.ep,
              resumeTarget.mode === 'resume' && resumeTarget.saved
                ? { startPositionMs: resumeTarget.saved.positionMs, forceRestart: false }
                : { startPositionMs: 0, forceRestart: false }
            );
          }
          return;
        }
        return;
      }

      // 1D. SECTION: RESTART EPISODE BUTTON
      if (focusedSection === 'restart') {
        if (isUp) {
          e.preventDefault();
          setFocusedSection('back');
          scrollToFocusedElement('series-btn-back');
          return;
        }
        if (isLeft) {
          e.preventDefault();
          setFocusedSection('resume');
          scrollToFocusedElement('series-btn-resume');
          return;
        }
        if (isRight) {
          e.preventDefault();
          setFocusedSection('fav');
          scrollToFocusedElement('series-btn-fav');
          return;
        }
        if (isDown) {
          e.preventDefault();
          setFocusedSection('audio');
          scrollToFocusedElement('series-pref-audio');
          return;
        }
        if (isEnter) {
          e.preventDefault();
          if (resumeTarget) {
            playEpisode(resumeTarget.ep, { startPositionMs: 0, forceRestart: true });
          }
          return;
        }
        return;
      }

      // 2. SECTION: AUDIO PREFERENCE
      if (focusedSection === 'audio') {
        if (isUp) {
          e.preventDefault();
          if (resumeTarget) {
            setFocusedSection('resume');
            scrollToFocusedElement('series-btn-resume');
          } else {
            setFocusedSection('fav');
            scrollToFocusedElement('series-btn-fav');
          }
          return;
        }
        if (isLeft) {
          e.preventDefault();
          saveAudioPref('vf');
          return;
        }
        if (isRight) {
          e.preventDefault();
          if (focusedAudioChoice === 'vf') {
            saveAudioPref('vo');
          } else {
            setFocusedSection('sub');
            scrollToFocusedElement('series-pref-sub');
          }
          return;
        }
        if (isDown) {
          e.preventDefault();
          if (currentEpisodes.length > 0) {
            setFocusedSection('episodes');
            setFocusedEpisodeIndex(0);
            scrollToFocusedElement('series-ep-0');
          } else {
            setFocusedSection('seasons');
            setFocusedSeasonIndex(0);
            scrollToFocusedElement('series-season-0');
          }
          return;
        }
        if (isEnter) {
          e.preventDefault();
          saveAudioPref(focusedAudioChoice === 'vf' ? 'vo' : 'vf');
          return;
        }
        return;
      }

      // 3. SECTION: SUBTITLES PREFERENCE
      if (focusedSection === 'sub') {
        if (isUp) {
          e.preventDefault();
          setFocusedSection('back');
          scrollToFocusedElement('series-btn-back');
          return;
        }
        if (isLeft) {
          e.preventDefault();
          if (focusedSubChoice === 'en') {
            saveSubPref('fr');
          } else if (focusedSubChoice === 'fr') {
            saveSubPref('off');
          } else {
            setFocusedSection('audio');
            scrollToFocusedElement('series-pref-audio');
          }
          return;
        }
        if (isRight) {
          e.preventDefault();
          if (focusedSubChoice === 'off') {
            saveSubPref('fr');
          } else if (focusedSubChoice === 'fr') {
            saveSubPref('en');
          }
          return;
        }
        if (isDown) {
          e.preventDefault();
          if (currentEpisodes.length > 0) {
            setFocusedSection('episodes');
            setFocusedEpisodeIndex(0);
            scrollToFocusedElement('series-ep-0');
          } else {
            setFocusedSection('seasons');
            setFocusedSeasonIndex(0);
            scrollToFocusedElement('series-season-0');
          }
          return;
        }
        if (isEnter) {
          e.preventDefault();
          const next = focusedSubChoice === 'off' ? 'fr' : (focusedSubChoice === 'fr' ? 'en' : 'off');
          saveSubPref(next);
          return;
        }
        return;
      }

      // 4. SECTION: SEASONS HEADERS
      if (focusedSection === 'seasons') {
        if (isUp) {
          e.preventDefault();
          if (focusedSeasonIndex > 0) {
            const nextIdx = focusedSeasonIndex - 1;
            setFocusedSeasonIndex(nextIdx);
            scrollToFocusedElement(`series-season-${nextIdx}`);
          } else {
            setFocusedSection('audio');
            scrollToFocusedElement('series-pref-audio');
          }
          return;
        }

        if (isDown) {
          e.preventDefault();
          const currentSeasonObj = details.seasons[focusedSeasonIndex];
          // If this season is open and has episodes, move directly into its episodes!
          if (openSeason === currentSeasonObj?.season && currentSeasonObj.episodes.length > 0) {
            setFocusedSection('episodes');
            setFocusedEpisodeIndex(0);
            scrollToFocusedElement('series-ep-0');
          } else if (focusedSeasonIndex < details.seasons.length - 1) {
            const nextIdx = focusedSeasonIndex + 1;
            setFocusedSeasonIndex(nextIdx);
            scrollToFocusedElement(`series-season-${nextIdx}`);
          }
          return;
        }

        if (isEnter) {
          e.preventDefault();
          const currentSeasonObj = details.seasons[focusedSeasonIndex];
          if (currentSeasonObj) {
            const isOpen = openSeason === currentSeasonObj.season;
            setOpenSeason(isOpen ? null : currentSeasonObj.season);
          }
          return;
        }
        return;
      }

      // 5. SECTION: EPISODES
      if (focusedSection === 'episodes') {
        if (isUp) {
          e.preventDefault();
          if (focusedEpisodeIndex > 0) {
            const nextIdx = focusedEpisodeIndex - 1;
            setFocusedEpisodeIndex(nextIdx);
            scrollToFocusedElement(`series-ep-${nextIdx}`);
          } else {
            // At first episode: move back up to season header
            setFocusedSection('seasons');
            scrollToFocusedElement(`series-season-${focusedSeasonIndex}`);
          }
          return;
        }

        if (isDown) {
          e.preventDefault();
          if (focusedEpisodeIndex < currentEpisodes.length - 1) {
            const nextIdx = focusedEpisodeIndex + 1;
            setFocusedEpisodeIndex(nextIdx);
            scrollToFocusedElement(`series-ep-${nextIdx}`);
          } else {
            // At last episode: move down to next season header if available
            if (focusedSeasonIndex < details.seasons.length - 1) {
              const nextSeasonIdx = focusedSeasonIndex + 1;
              setFocusedSection('seasons');
              setFocusedSeasonIndex(nextSeasonIdx);
              scrollToFocusedElement(`series-season-${nextSeasonIdx}`);
            }
          }
          return;
        }

        if (isEnter) {
          e.preventDefault();
          const ep = currentEpisodes[focusedEpisodeIndex];
          if (ep) {
            playEpisode(ep);
          }
          return;
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    details,
    focusedSection,
    focusedAudioChoice,
    focusedSubChoice,
    focusedSeasonIndex,
    focusedEpisodeIndex,
    openSeason,
    currentEpisodes,
    resumeTarget,
    onClose,
    playEpisode,
  ]);

  if (!series) return null;

  const cover = details?.cover || series.logo;

  return (
    <div className="fixed inset-0 z-[60] bg-tv-bg flex flex-col animate-fade-in select-none">
      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-amber-500/95 text-slate-950 font-black px-5 py-2.5 rounded-2xl shadow-2xl flex items-center space-x-2 border border-amber-300 animate-in fade-in slide-in-from-top-4 pointer-events-none">
          <Star className="w-4 h-4 fill-slate-950 text-slate-950" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center space-x-3 px-4 py-3 bg-tv-surface border-b border-tv-border flex-shrink-0">
        <button
          id="series-btn-back"
          onClick={onClose}
          className={`p-2.5 rounded-xl transition flex items-center space-x-2 border shadow-sm focus:outline-none ${
            focusedSection === 'back'
              ? 'bg-tv-focus text-white border-tv-accent ring-2 ring-tv-accent ring-offset-2 ring-offset-tv-surface scale-105'
              : 'bg-tv-card hover:bg-tv-cardHover text-slate-200 hover:text-white border-tv-border'
          }`}
          title="Retour aux séries"
        >
          <ArrowLeft className="w-5 h-5 text-tv-accent" />
          <span className="text-xs font-semibold">Retour</span>
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
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-xl sm:text-2xl font-black text-white">{series.name}</h3>

                {/* Favorite Toggle Button */}
                <button
                  id="series-btn-fav"
                  type="button"
                  onClick={handleToggleFavorite}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center space-x-2 transition select-none flex-shrink-0 ${
                    isFavorite
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-lg shadow-amber-500/10'
                      : 'bg-tv-card text-slate-300 hover:text-white border border-tv-border'
                  } ${
                    focusedSection === 'fav'
                      ? 'ring-4 ring-amber-400 ring-offset-2 ring-offset-tv-bg scale-105 shadow-2xl shadow-amber-400/40 text-white'
                      : ''
                  }`}
                >
                  <Star className={`w-4 h-4 ${isFavorite ? 'fill-amber-400 text-amber-400' : 'text-slate-400'}`} />
                  <span>{isFavorite ? 'Dans vos favoris' : 'Ajouter aux favoris'}</span>
                </button>
              </div>
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

              {/* Prominent Series Resume / Next Episode Hero Bar (Netflix / Prime Video standard) */}
              {resumeTarget && (
                <div className="mt-3.5 p-3 rounded-2xl bg-sky-950/40 border border-sky-500/40 space-y-2 shadow-lg">
                  {resumeTarget.mode === 'resume' && resumeTarget.saved && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span className="text-sky-300 flex items-center space-x-1.5">
                          <Clock className="w-3.5 h-3.5 text-sky-400" />
                          <span>
                            S{String(resumeTarget.seasonNum).padStart(2, '0')}E{String(resumeTarget.ep.episodeNum).padStart(2, '0')} en cours ({getProgressPercent(resumeTarget.saved)}%)
                          </span>
                        </span>
                        <span className="text-slate-400 font-mono text-[11px]">
                          {formatRemainingTime(resumeTarget.saved)}
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-slate-800/90 overflow-hidden border border-white/10">
                        <div
                          className="h-full bg-gradient-to-r from-tv-accent to-sky-400 rounded-full transition-all duration-300"
                          style={{ width: `${getProgressPercent(resumeTarget.saved)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2.5 pt-0.5">
                    <button
                      id="series-btn-resume"
                      type="button"
                      onClick={() =>
                        playEpisode(
                          resumeTarget.ep,
                          resumeTarget.mode === 'resume' && resumeTarget.saved
                            ? { startPositionMs: resumeTarget.saved.positionMs, forceRestart: false }
                            : { startPositionMs: 0, forceRestart: false }
                        )
                      }
                      className={`px-5 py-2.5 rounded-xl bg-gradient-to-r from-tv-accent to-sky-500 text-slate-950 font-black text-xs sm:text-sm flex items-center space-x-2 shadow-lg transition focus:outline-none ${
                        focusedSection === 'resume'
                          ? 'ring-4 ring-tv-accent ring-offset-2 ring-offset-tv-bg scale-[1.03] shadow-2xl shadow-sky-400/50'
                          : 'hover:scale-[1.02]'
                      }`}
                    >
                      <Play className="w-4 h-4 fill-slate-950" />
                      <span>
                        {resumeTarget.mode === 'resume' && resumeTarget.saved
                          ? `Reprendre S${String(resumeTarget.seasonNum).padStart(2, '0')}E${String(resumeTarget.ep.episodeNum).padStart(2, '0')} à ${formatResumeTime(resumeTarget.saved.positionMs)}`
                          : `Lancer la suite : S${String(resumeTarget.seasonNum).padStart(2, '0')}E${String(resumeTarget.ep.episodeNum).padStart(2, '0')} — ${resumeTarget.ep.title}`}
                      </span>
                    </button>

                    {resumeTarget.mode === 'resume' && (
                      <button
                        id="series-btn-restart"
                        type="button"
                        onClick={() => playEpisode(resumeTarget.ep, { startPositionMs: 0, forceRestart: true })}
                        className={`px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center space-x-1.5 transition select-none bg-tv-card text-slate-200 hover:text-white border border-tv-border focus:outline-none ${
                          focusedSection === 'restart'
                            ? 'ring-4 ring-sky-400 ring-offset-2 ring-offset-tv-bg scale-[1.03] shadow-2xl shadow-sky-400/40 bg-tv-focus text-white border-tv-accent'
                            : ''
                        }`}
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-sky-400" />
                        <span>Recommencer l&apos;épisode</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Series Audio & Subtitles Preference Selector with remote focus */}
              <div className="mt-3.5 p-3 rounded-xl bg-black/40 border border-white/10 space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div id="series-pref-audio" className="flex items-center space-x-2">
                    <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5 flex-shrink-0">
                      <Volume2 className="w-3.5 h-3.5 text-tv-accent" />
                      <span>Audio :</span>
                    </span>
                    <div className="flex items-center space-x-1.5">
                      <button
                        onClick={() => saveAudioPref('vf')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
                          seriesAudio === 'vf'
                            ? 'bg-tv-focus text-white border-tv-accent shadow-sm'
                            : 'bg-tv-card/60 text-slate-400 border-white/5 hover:text-white'
                        } ${
                          focusedSection === 'audio' && focusedAudioChoice === 'vf'
                            ? 'ring-2 ring-tv-accent scale-105 shadow-lg'
                            : ''
                        }`}
                      >
                        Français (VF)
                      </button>
                      <button
                        onClick={() => saveAudioPref('vo')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
                          seriesAudio === 'vo'
                            ? 'bg-tv-focus text-white border-tv-accent shadow-sm'
                            : 'bg-tv-card/60 text-slate-400 border-white/5 hover:text-white'
                        } ${
                          focusedSection === 'audio' && focusedAudioChoice === 'vo'
                            ? 'ring-2 ring-tv-accent scale-105 shadow-lg'
                            : ''
                        }`}
                      >
                        Version Originale (VO)
                      </button>
                    </div>
                  </div>

                  <div id="series-pref-sub" className="flex items-center space-x-2">
                    <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5 flex-shrink-0">
                      <MessageSquare className="w-3.5 h-3.5 text-purple-400" />
                      <span>Sous-titres :</span>
                    </span>
                    <div className="flex items-center space-x-1.5">
                      <button
                        onClick={() => saveSubPref('off')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
                          seriesSub === 'off'
                            ? 'bg-tv-focus text-white border-tv-accent shadow-sm'
                            : 'bg-tv-card/60 text-slate-400 border-white/5 hover:text-white'
                        } ${
                          focusedSection === 'sub' && focusedSubChoice === 'off'
                            ? 'ring-2 ring-purple-400 scale-105 shadow-lg'
                            : ''
                        }`}
                      >
                        Sans
                      </button>
                      <button
                        onClick={() => saveSubPref('fr')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
                          seriesSub === 'fr'
                            ? 'bg-purple-600 text-white border-purple-400 shadow-sm'
                            : 'bg-tv-card/60 text-slate-400 border-white/5 hover:text-white'
                        } ${
                          focusedSection === 'sub' && focusedSubChoice === 'fr'
                            ? 'ring-2 ring-purple-400 scale-105 shadow-lg'
                            : ''
                        }`}
                      >
                        Français (FR)
                      </button>
                      <button
                        onClick={() => saveSubPref('en')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
                          seriesSub === 'en'
                            ? 'bg-purple-600 text-white border-purple-400 shadow-sm'
                            : 'bg-tv-card/60 text-slate-400 border-white/5 hover:text-white'
                        } ${
                          focusedSection === 'sub' && focusedSubChoice === 'en'
                            ? 'ring-2 ring-purple-400 scale-105 shadow-lg'
                            : ''
                        }`}
                      >
                        Anglais (EN)
                      </button>
                    </div>
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 italic">
                  ✓ Vos choix de langue et sous-titres sont mémorisés pour cette série uniquement et appliqués à tous ses épisodes.
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

        {/* Seasons Accordion & Episodes */}
        {details && details.seasons.length > 0 && (
          <div className="px-4 sm:px-6 py-6 space-y-3 max-w-5xl mx-auto">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Saisons & Épisodes ({details.seasons.reduce((acc, s) => acc + s.episodes.length, 0)} épisodes au total)
            </h4>
            {details.seasons.map((season, sIdx) => {
              const isOpen = openSeason === season.season;
              const isSeasonFocused = focusedSection === 'seasons' && focusedSeasonIndex === sIdx;

              return (
                <div
                  key={season.season}
                  id={`series-season-${sIdx}`}
                  className={`rounded-2xl border bg-tv-card/60 backdrop-blur-sm overflow-hidden shadow-lg transition ${
                    isSeasonFocused
                      ? 'border-tv-accent ring-2 ring-tv-accent ring-offset-2 ring-offset-tv-bg scale-[1.01]'
                      : 'border-tv-border'
                  }`}
                >
                  <button
                    onClick={() => {
                      setOpenSeason(isOpen ? null : season.season);
                      setFocusedSection('seasons');
                      setFocusedSeasonIndex(sIdx);
                    }}
                    className={`w-full flex items-center justify-between p-4 text-left transition focus:outline-none ${
                      isSeasonFocused ? 'bg-tv-focus/25' : 'hover:bg-tv-cardHover'
                    }`}
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
                      {season.episodes.map((ep, epIdx) => {
                        const isEpisodeFocused =
                          focusedSection === 'episodes' &&
                          openSeason === season.season &&
                          focusedEpisodeIndex === epIdx;

                        const epSaved = positionsMap[ep.url];
                        const epResumable = isResumablePosition(epSaved);
                        const epCompleted = Boolean(epSaved?.completed);
                        const epPercent = getProgressPercent(epSaved);

                        return (
                          <div
                            key={ep.id}
                            id={`series-ep-${epIdx}`}
                            onClick={() => {
                              setFocusedSection('episodes');
                              setFocusedEpisodeIndex(epIdx);
                              playEpisode(ep);
                            }}
                            className={`w-full flex items-center space-x-3 sm:space-x-4 p-3.5 sm:p-4 text-left cursor-pointer transition focus:outline-none ${
                              isEpisodeFocused
                                ? 'bg-tv-focus text-white ring-2 ring-tv-accent ring-offset-2 ring-offset-tv-bg scale-[1.01] shadow-xl shadow-sky-500/20'
                                : 'hover:bg-tv-cardHover text-slate-200'
                            }`}
                          >
                            <span
                              className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow transition ${
                                isEpisodeFocused
                                  ? 'bg-tv-accent text-slate-950 scale-105'
                                  : epCompleted
                                  ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/40'
                                  : 'bg-tv-focus/80 text-white'
                              }`}
                            >
                              {epCompleted && !isEpisodeFocused ? (
                                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                              ) : (
                                <Play className={`w-4 h-4 ml-0.5 ${isEpisodeFocused ? 'fill-slate-950 text-slate-950' : 'fill-white text-white'}`} />
                              )}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs sm:text-sm font-bold truncate">
                                  Épisode {ep.episodeNum} : {ep.title}
                                </span>
                                {ep.duration && (
                                  <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded font-mono text-slate-300">
                                    {ep.duration}
                                  </span>
                                )}
                                {epResumable && epSaved && (
                                  <span
                                    className={`text-[10px] px-2 py-0.5 rounded-md font-bold flex items-center space-x-1 ${
                                      isEpisodeFocused
                                        ? 'bg-slate-950/50 text-sky-200 border border-white/20'
                                        : 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                                    }`}
                                  >
                                    <Clock className="w-3 h-3" />
                                    <span>Reprendre à {formatResumeTime(epSaved.positionMs)}</span>
                                  </span>
                                )}
                                {epCompleted && (
                                  <span
                                    className={`text-[10px] px-2 py-0.5 rounded-md font-bold flex items-center space-x-1 ${
                                      isEpisodeFocused
                                        ? 'bg-slate-950/50 text-emerald-200 border border-white/20'
                                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                    }`}
                                  >
                                    <CheckCircle2 className="w-3 h-3" />
                                    <span>Déjà vu</span>
                                  </span>
                                )}
                              </div>
                              {ep.plot && (
                                <p className={`text-[11px] mt-1 line-clamp-2 leading-tight ${isEpisodeFocused ? 'text-slate-100' : 'text-slate-400'}`}>
                                  {ep.plot}
                                </p>
                              )}
                              {epResumable && (
                                <div className="mt-2 w-full max-w-xs h-1.5 rounded-full bg-black/40 overflow-hidden border border-white/10">
                                  <div
                                    className={`h-full rounded-full ${isEpisodeFocused ? 'bg-white' : 'bg-sky-400'}`}
                                    style={{ width: `${epPercent}%` }}
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
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
