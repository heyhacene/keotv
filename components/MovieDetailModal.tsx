'use client';

import React, { useEffect, useState, useRef } from 'react';
import { ArrowLeft, Loader2, Play, AlertCircle, Film, Volume2, MessageSquare, Star, Clock, Calendar, User, Clapperboard } from 'lucide-react';
import { Channel } from '@/types/iptv';
import {
import {
  fetchVodInfo,
  fetchActorFilmography,
  fetchActorPhoto,
  matchMoviesInPlaylist,
  MovieDetails,
} from '@/lib/iptv-service';
import { db } from '@/lib/db';

interface MovieDetailModalProps {
  movie: Channel | null;
  serverUrl: string;
  username: string;
  password: string;
  onClose: () => void;
  onPlay: (movie: Channel) => void;
  onSelectAnotherMovie?: (movie: Channel) => void;
}

export const MovieDetailModal: React.FC<MovieDetailModalProps> = ({
  movie,
  serverUrl,
  username,
  password,
  onClose,
  onPlay,
  onSelectAnotherMovie,
}) => {
  const [details, setDetails] = useState<MovieDetails | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Actor photos state: map of actor name -> photo URL
  const [actorPhotos, setActorPhotos] = useState<Record<string, string>>({});

  // Actor filmography in playlist state
  const [selectedActor, setSelectedActor] = useState<string | null>(null);
  const [loadingActorFilms, setLoadingActorFilms] = useState<boolean>(false);
  const [actorPlaylistFilms, setActorPlaylistFilms] = useState<Channel[]>([]);
  const [searchedActor, setSearchedActor] = useState<string | null>(null);

  // TV Remote Navigation states
  const [focusedSection, setFocusedSection] = useState<'back' | 'play' | 'actors' | 'films'>('play');
  const [focusedActorIndex, setFocusedActorIndex] = useState<number>(0);
  const [focusedFilmIndex, setFocusedFilmIndex] = useState<number>(0);

  const playButtonRef = useRef<HTMLButtonElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Load movie details on open
  useEffect(() => {
    if (!movie) return;
    let cancelled = false;
    setDetails(null);
    setError(null);
    setSelectedActor(null);
    setActorPlaylistFilms([]);
    setSearchedActor(null);
    setActorPhotos({});
    setFocusedSection('play');
    setFocusedActorIndex(0);
    setFocusedFilmIndex(0);
    setLoading(true);

    const vodId = movie.epg_id || movie.id.replace(/^ch_xtream_(?:vod_)?/, '');
    fetchVodInfo(serverUrl, username, password, vodId, movie)
      .then((d) => {
        if (cancelled) return;
        setDetails(d);

        // Fetch actor photos in background
        if (d.actors && d.actors.length > 0) {
          d.actors.slice(0, 16).forEach((actor) => {
            fetchActorPhoto(actor).then((url) => {
              if (!cancelled && url) {
                setActorPhotos((prev) => ({ ...prev, [actor]: url }));
              }
            });
          });
        }
      })
      .catch((err: any) => {
        if (cancelled) return;
        console.warn('Could not fetch complete VOD info, using channel fallback:', err);
        setDetails({
          id: movie.id,
          streamId: vodId,
          name: movie.name,
          cover: movie.logo,
          actors: [],
          audioLanguages: ['Français (VF)'],
          subtitles: [],
          streamUrl: movie.stream_url,
        });
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setTimeout(() => {
            playButtonRef.current?.focus();
          }, 150);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [movie, serverUrl, username, password]);

  // When an actor is clicked: query filmography + match against local Dexie playlist
  const handleActorClick = async (actor: string) => {
    if (selectedActor === actor && actorPlaylistFilms.length > 0) {
      setFocusedSection('films');
      setFocusedFilmIndex(0);
      return;
    }
    setSelectedActor(actor);
    setLoadingActorFilms(true);
    setActorPlaylistFilms([]);
    setSearchedActor(actor);
    setFocusedSection('films');
    setFocusedFilmIndex(0);

    try {
      const [actorFilms, allVod] = await Promise.all([
        fetchActorFilmography(actor),
        db.channels.where('stream_type').equals('vod').toArray(),
      ]);

      const matched = matchMoviesInPlaylist(actor, actorFilms, allVod);
      const filtered = matched.filter((m) => m.id !== movie?.id);
      setActorPlaylistFilms(filtered);
    } catch (err) {
      console.warn('Error loading actor films in playlist:', err);
      setActorPlaylistFilms([]);
    } finally {
      setLoadingActorFilms(false);
    }
  };

  // Dedicated TV Remote Navigation handler for the movie sheet
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const keyCode = (e as any).keyCode || 0;
      const key = e.key || '';

      const isEnter =
        key === 'Enter' ||
        key === 'Select' ||
        key === 'Ok' ||
        keyCode === 13 ||
        keyCode === 23 || // DPAD_CENTER
        keyCode === 66;

      const isUp = key === 'ArrowUp' || keyCode === 38 || keyCode === 19;
      const isDown = key === 'ArrowDown' || keyCode === 40 || keyCode === 20;
      const isLeft = key === 'ArrowLeft' || keyCode === 37 || keyCode === 21;
      const isRight = key === 'ArrowRight' || keyCode === 39 || keyCode === 22;
      const isBack = key === 'Escape' || key === 'Backspace' || keyCode === 27 || keyCode === 4;

      if (isBack) {
        e.preventDefault();
        if (focusedSection === 'films' || (selectedActor && actorPlaylistFilms.length > 0)) {
          setSelectedActor(null);
          setFocusedSection('actors');
          return;
        }
        if (focusedSection === 'actors') {
          setFocusedSection('play');
          playButtonRef.current?.focus();
          scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
        onClose();
        return;
      }

      // SECTION 0: Header Back button
      if (focusedSection === 'back') {
        if (isDown) {
          e.preventDefault();
          setFocusedSection('play');
          playButtonRef.current?.focus();
          return;
        }
        if (isEnter) {
          e.preventDefault();
          onClose();
          return;
        }
      }

      // SECTION 1: Play button
      if (focusedSection === 'play') {
        if (isUp) {
          e.preventDefault();
          setFocusedSection('back');
          document.getElementById('movie-detail-back')?.focus();
          return;
        }
        if (isDown) {
          e.preventDefault();
          if (details?.actors && details.actors.length > 0) {
            setFocusedSection('actors');
            const target = document.getElementById(`actor-chip-${focusedActorIndex}`) || document.getElementById('actor-chip-0');
            target?.focus();
            target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          return;
        }
        if (isEnter) {
          e.preventDefault();
          if (movie) onPlay(movie);
          return;
        }
      }

      // SECTION 2: Actors list
      if (focusedSection === 'actors') {
        const actorCount = details?.actors?.length || 0;

        if (isUp) {
          e.preventDefault();
          setFocusedSection('play');
          playButtonRef.current?.focus();
          scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }

        if (isLeft) {
          e.preventDefault();
          setFocusedActorIndex((prev) => {
            const next = Math.max(0, prev - 1);
            const target = document.getElementById(`actor-chip-${next}`);
            target?.focus();
            target?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            return next;
          });
          return;
        }

        if (isRight) {
          e.preventDefault();
          setFocusedActorIndex((prev) => {
            const next = Math.min(actorCount - 1, prev + 1);
            const target = document.getElementById(`actor-chip-${next}`);
            target?.focus();
            target?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            return next;
          });
          return;
        }

        if (isDown) {
          e.preventDefault();
          if (actorPlaylistFilms.length > 0) {
            setFocusedSection('films');
            setFocusedFilmIndex(0);
            const target = document.getElementById('actor-film-0');
            target?.focus();
            target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          return;
        }

        if (isEnter) {
          e.preventDefault();
          if (details?.actors && details.actors[focusedActorIndex]) {
            handleActorClick(details.actors[focusedActorIndex]);
          }
          return;
        }
      }

      // SECTION 3: Actor playlist films grid
      if (focusedSection === 'films') {
        const filmCount = actorPlaylistFilms.length;

        if (isUp) {
          e.preventDefault();
          if (focusedFilmIndex < 4) {
            setFocusedSection('actors');
            const target = document.getElementById(`actor-chip-${focusedActorIndex}`);
            target?.focus();
            target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } else {
            setFocusedFilmIndex((prev) => {
              const next = Math.max(0, prev - 4);
              const target = document.getElementById(`actor-film-${next}`);
              target?.focus();
              target?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              return next;
            });
          }
          return;
        }

        if (isDown) {
          e.preventDefault();
          setFocusedFilmIndex((prev) => {
            const next = Math.min(filmCount - 1, prev + 4);
            const target = document.getElementById(`actor-film-${next}`);
            target?.focus();
            target?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            return next;
          });
          return;
        }

        if (isLeft) {
          e.preventDefault();
          setFocusedFilmIndex((prev) => {
            const next = Math.max(0, prev - 1);
            const target = document.getElementById(`actor-film-${next}`);
            target?.focus();
            target?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            return next;
          });
          return;
        }

        if (isRight) {
          e.preventDefault();
          setFocusedFilmIndex((prev) => {
            const next = Math.min(filmCount - 1, prev + 1);
            const target = document.getElementById(`actor-film-${next}`);
            target?.focus();
            target?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            return next;
          });
          return;
        }

        if (isEnter) {
          e.preventDefault();
          const targetItem = actorPlaylistFilms[focusedFilmIndex];
          if (targetItem) {
            if (onSelectAnotherMovie) {
              onSelectAnotherMovie(targetItem);
            } else {
              onPlay(targetItem);
            }
          }
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    focusedSection,
    focusedActorIndex,
    focusedFilmIndex,
    details?.actors,
    actorPlaylistFilms,
    selectedActor,
    movie,
    onClose,
    onPlay,
    onSelectAnotherMovie,
  ]);

  if (!movie) return null;

  const cover = details?.cover || movie.logo;
  const backdrop = details?.backdrop || cover;

  return (
    <div className="fixed inset-0 z-[60] bg-tv-bg flex flex-col animate-fade-in select-none">
      {/* Top Header */}
      <div className="flex items-center space-x-3 px-4 py-3 bg-tv-surface/90 backdrop-blur-md border-b border-tv-border flex-shrink-0 z-20">
        <button
          id="movie-detail-back"
          onClick={onClose}
          className={`p-2 rounded-xl transition flex items-center space-x-2 border shadow-sm focus:outline-none ${
            focusedSection === 'back'
              ? 'bg-tv-focus text-white border-tv-accent ring-2 ring-tv-accent scale-105'
              : 'bg-tv-card hover:bg-tv-cardHover text-slate-200 hover:text-white border-tv-border'
          }`}
          title="Retour au catalogue des films"
        >
          <ArrowLeft className="w-5 h-5 text-tv-accent" />
          <span className="text-xs font-semibold hidden sm:inline">Retour aux films</span>
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm sm:text-base font-bold text-white truncate">{details?.name || movie.name}</h2>
          <span className="text-[11px] text-slate-400">Fiche détaillée du Film</span>
        </div>
      </div>

      {/* Main Content Area */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto relative">
        {/* Backdrop Background Image with Gradients */}
        {backdrop && (
          <div className="absolute top-0 left-0 right-0 h-96 sm:h-[480px] overflow-hidden pointer-events-none opacity-25">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={backdrop}
              alt=""
              className="w-full h-full object-cover filter blur-sm scale-105"
              onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-tv-bg/40 via-tv-bg/85 to-tv-bg" />
          </div>
        )}

        <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
          {/* Main Info Hero Section */}
          <div className="flex flex-col sm:flex-row gap-6 items-start">
            {/* Poster */}
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cover}
                alt={details?.name || movie.name}
                className="w-36 h-52 sm:w-48 sm:h-72 object-cover rounded-2xl bg-tv-card border-2 border-tv-border shadow-2xl flex-shrink-0 mx-auto sm:mx-0 ring-1 ring-white/10"
                onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
              />
            ) : (
              <div className="w-36 h-52 sm:w-48 sm:h-72 rounded-2xl bg-tv-card border border-tv-border flex items-center justify-center flex-shrink-0 mx-auto sm:mx-0 shadow-2xl">
                <Film className="w-12 h-12 text-slate-600" />
              </div>
            )}

            {/* Title & Metadata */}
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-tight">
                  {details?.name || movie.name}
                </h1>
                {details?.originalName && details.originalName !== details.name && (
                  <p className="text-xs text-slate-400 mt-0.5 italic">Titre original : {details.originalName}</p>
                )}
              </div>

              {/* Badges Row */}
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-200">
                {details?.rating && (
                  <span className="bg-amber-500/20 text-amber-300 px-3 py-1 rounded-xl border border-amber-500/30 font-bold flex items-center space-x-1 shadow-sm">
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    <span>{details.rating} / 10 IMDb</span>
                  </span>
                )}
                {details?.year && (
                  <span className="bg-tv-card px-2.5 py-1 rounded-xl border border-tv-border font-medium flex items-center space-x-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>{details.year}</span>
                  </span>
                )}
                {details?.duration && (
                  <span className="bg-tv-card px-2.5 py-1 rounded-xl border border-tv-border font-medium flex items-center space-x-1">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>{details.duration}</span>
                  </span>
                )}
                {details?.genre && (
                  <span className="bg-tv-card px-2.5 py-1 rounded-xl border border-tv-border font-medium text-slate-300">
                    {details.genre}
                  </span>
                )}
              </div>

              {/* Audio & Subtitles Badges */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {details?.audioLanguages && details.audioLanguages.length > 0 && (
                  <span className="bg-emerald-500/15 text-emerald-300 px-2.5 py-1 rounded-xl border border-emerald-500/30 font-medium flex items-center space-x-1.5 shadow-sm">
                    <Volume2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                    <span>Audio : {details.audioLanguages.join(', ')}</span>
                  </span>
                )}
                {details?.subtitles && details.subtitles.length > 0 && (
                  <span className="bg-purple-500/15 text-purple-300 px-2.5 py-1 rounded-xl border border-purple-500/30 font-medium flex items-center space-x-1.5 shadow-sm">
                    <MessageSquare className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                    <span>Sous-titres : {details.subtitles.join(', ')}</span>
                  </span>
                )}
              </div>

              {/* Director */}
              {details?.director && (
                <p className="text-xs text-slate-300 flex items-center space-x-1.5 pt-1">
                  <Clapperboard className="w-3.5 h-3.5 text-tv-accent flex-shrink-0" />
                  <span>Réalisé par <strong className="text-white">{details.director}</strong></span>
                </p>
              )}

              {/* Action Buttons: Prominent "Lecture" Button */}
              <div className="pt-2 flex flex-wrap items-center gap-3">
                <button
                  id="movie-detail-play"
                  ref={playButtonRef}
                  onClick={() => onPlay(movie)}
                  className={`px-6 py-3.5 rounded-2xl bg-gradient-to-r from-tv-accent to-sky-500 text-slate-950 font-black text-sm sm:text-base flex items-center space-x-2.5 shadow-xl transition focus:outline-none ${
                    focusedSection === 'play'
                      ? 'ring-4 ring-tv-accent ring-offset-2 ring-offset-tv-bg scale-[1.03] shadow-2xl shadow-sky-400/50'
                      : 'shadow-tv-accent/30 hover:scale-[1.02]'
                  }`}
                >
                  <Play className="w-5 h-5 fill-slate-950" />
                  <span>Lancer le film</span>
                </button>
              </div>

              {/* Synopsis */}
              {details?.plot && (
                <div className="pt-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Synopsis</h3>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-3xl">
                    {details.plot}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Loading details state */}
          {loading && (
            <div className="py-6 flex items-center justify-center space-x-2 text-slate-400 text-xs">
              <Loader2 className="w-4 h-4 animate-spin text-tv-accent" />
              <span>Chargement des métadonnées enrichies...</span>
            </div>
          )}

          {/* Actors / Cast Section */}
          {details?.actors && details.actors.length > 0 && (
            <div className="pt-4 border-t border-tv-border/60 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center space-x-2">
                  <User className="w-4 h-4 text-tv-accent" />
                  <span>Distribution & Acteurs ({details.actors.length})</span>
                </h3>
                <span className="text-[11px] text-slate-400">
                  Sélectionnez un acteur pour voir ses films dans votre playlist
                </span>
              </div>

              {/* Actor Chips with Round Portraits */}
              <div className="flex flex-wrap gap-2">
                {details.actors.map((actor, idx) => {
                  const isSelected = selectedActor === actor;
                  const isFocused = focusedSection === 'actors' && focusedActorIndex === idx;
                  const photoUrl = actorPhotos[actor];

                  return (
                    <button
                      key={actor}
                      id={`actor-chip-${idx}`}
                      onClick={() => {
                        setFocusedSection('actors');
                        setFocusedActorIndex(idx);
                        handleActorClick(actor);
                      }}
                      className={`px-3 py-1.5 rounded-full text-xs transition border flex items-center space-x-2 focus:outline-none ${
                        isFocused
                          ? 'bg-tv-focus text-white border-tv-accent ring-2 ring-tv-accent ring-offset-2 ring-offset-tv-bg scale-105 font-bold shadow-lg shadow-sky-500/30'
                          : isSelected
                          ? 'bg-tv-accent text-slate-950 border-tv-accent shadow-md shadow-tv-accent/30 font-bold'
                          : 'bg-tv-card hover:bg-tv-cardHover text-slate-200 border-tv-border hover:border-slate-500 font-medium'
                      }`}
                    >
                      {photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={photoUrl}
                          alt={actor}
                          className="w-6 h-6 rounded-full object-cover ring-1 ring-white/30 flex-shrink-0"
                          onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
                        />
                      ) : (
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${isFocused || isSelected ? 'bg-black/30' : 'bg-slate-800'}`}>
                          <User className={`w-3.5 h-3.5 ${isFocused ? 'text-white' : isSelected ? 'text-slate-950' : 'text-slate-400'}`} />
                        </div>
                      )}
                      <span>{actor}</span>
                    </button>
                  );
                })}
              </div>

              {/* Filmography in playlist for selected actor */}
              {selectedActor && (
                <div className="mt-4 p-4 rounded-2xl bg-tv-card/80 border border-tv-border space-y-3 animate-fade-in shadow-xl">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs sm:text-sm font-bold text-white flex items-center space-x-2">
                      <Film className="w-4 h-4 text-tv-accent" />
                      <span>
                        Films avec <strong className="text-tv-accent">{searchedActor}</strong> dans votre playlist :
                      </span>
                    </h4>
                    <button
                      onClick={() => {
                        setSelectedActor(null);
                        setFocusedSection('actors');
                      }}
                      className="text-[11px] text-slate-400 hover:text-white underline"
                    >
                      Masquer
                    </button>
                  </div>

                  {loadingActorFilms && (
                    <div className="py-6 flex flex-col items-center justify-center space-y-2 text-center">
                      <Loader2 className="w-6 h-6 animate-spin text-tv-accent" />
                      <p className="text-xs text-slate-300 font-medium">
                        Recherche des films de {selectedActor} dans votre playlist...
                      </p>
                    </div>
                  )}

                  {!loadingActorFilms && actorPlaylistFilms.length === 0 && (
                    <p className="text-xs text-slate-400 italic py-2">
                      Aucun autre film avec {searchedActor} n’a été trouvé dans votre playlist actuelle.
                    </p>
                  )}

                  {!loadingActorFilms && actorPlaylistFilms.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 pt-1">
                      {actorPlaylistFilms.map((item, idx) => {
                        const isFocused = focusedSection === 'films' && focusedFilmIndex === idx;

                        return (
                          <div
                            key={item.id}
                            id={`actor-film-${idx}`}
                            onClick={() => {
                              if (onSelectAnotherMovie) {
                                onSelectAnotherMovie(item);
                              } else {
                                onPlay(item);
                              }
                            }}
                            className={`group p-2 rounded-xl transition cursor-pointer flex flex-col space-y-1.5 border focus:outline-none ${
                              isFocused
                                ? 'bg-tv-focus text-white border-tv-accent ring-2 ring-tv-accent ring-offset-2 ring-offset-tv-bg scale-[1.03] shadow-xl shadow-sky-500/30'
                                : 'bg-tv-surface hover:bg-tv-cardHover border-tv-border hover:border-tv-accent'
                            }`}
                            tabIndex={0}
                          >
                            <div className="w-full aspect-[2/3] rounded-lg bg-tv-bg border border-tv-border overflow-hidden relative">
                              {item.logo ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={item.logo}
                                  alt={item.name}
                                  className="w-full h-full object-cover group-hover:scale-105 transition"
                                  onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Film className="w-6 h-6 text-slate-600" />
                                </div>
                              )}
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                                <div className="w-9 h-9 rounded-full bg-tv-accent flex items-center justify-center shadow-lg">
                                  <Play className="w-4 h-4 fill-slate-950 text-slate-950 ml-0.5" />
                                </div>
                              </div>
                            </div>
                            <p className="text-[11px] font-semibold text-slate-200 group-hover:text-white truncate">
                              {item.name}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
