'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Search, X, Film, Clapperboard, Tv, Play, Loader2 } from 'lucide-react';
import { Channel } from '@/types/iptv';
import { db } from '@/lib/db';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectChannel: (channel: Channel) => void;
  onSelectMovie: (channel: Channel) => void;
  onSelectSeries: (channel: Channel) => void;
}

type SearchFilterType = 'all' | 'vod' | 'series' | 'live';

export const SearchModal: React.FC<SearchModalProps> = ({
  isOpen,
  onClose,
  onSelectChannel,
  onSelectMovie,
  onSelectSeries,
}) => {
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<SearchFilterType>('all');
  const [results, setResults] = useState<Channel[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // TV Remote navigation states
  const [focusArea, setFocusArea] = useState<'input' | 'filters' | 'results'>('input');
  const [focusedFilterIndex, setFocusedFilterIndex] = useState<number>(0);
  const [focusedResultIndex, setFocusedResultIndex] = useState<number>(0);

  const inputRef = useRef<HTMLInputElement>(null);

  const FILTERS: { id: SearchFilterType; label: string; icon: any }[] = [
    { id: 'all', label: 'Tous', icon: Search },
    { id: 'vod', label: 'Films', icon: Film },
    { id: 'series', label: 'Séries', icon: Clapperboard },
    { id: 'live', label: 'Direct TV', icon: Tv },
  ];

  // Auto focus input on open
  useEffect(() => {
    if (isOpen) {
      setFocusArea('input');
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery('');
      setResults([]);
    }
  }, [isOpen]);

  // Fast, debounced, accent-insensitive search in IndexedDB
  useEffect(() => {
    if (!isOpen) return;
    const trimmed = query.trim().toLowerCase();
    if (!trimmed || trimmed.length < 2) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    let cancelled = false;

    const timer = setTimeout(async () => {
      try {
        const normalized = trimmed.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const allChannels = await db.channels.toArray();
        if (cancelled) return;

        const matched = allChannels.filter((c) => {
          const nameNorm = (c.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          return nameNorm.includes(normalized);
        });

        // Limit results to 60 for ultra-fast rendering on TV
        setResults(matched.slice(0, 60));
        setFocusedResultIndex(0);
      } catch (err) {
        console.warn('Search query error:', err);
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, isOpen]);

  // Filtered results according to active tab
  const filteredResults = useMemo(() => {
    if (activeFilter === 'all') return results;
    if (activeFilter === 'vod') return results.filter((c) => c.type === 'vod');
    if (activeFilter === 'series') return results.filter((c) => c.type === 'series');
    if (activeFilter === 'live') return results.filter((c) => c.type === 'live' || !c.type);
    return results;
  }, [results, activeFilter]);

  // Counts per type
  const counts = useMemo(() => {
    const vodCount = results.filter((c) => c.type === 'vod').length;
    const seriesCount = results.filter((c) => c.type === 'series').length;
    const liveCount = results.filter((c) => c.type === 'live' || !c.type).length;
    return { all: results.length, vod: vodCount, series: seriesCount, live: liveCount };
  }, [results]);

  const handleSelectItem = useCallback((item: Channel) => {
    onClose();
    if (item.type === 'vod') {
      onSelectMovie(item);
    } else if (item.type === 'series') {
      onSelectSeries(item);
    } else {
      onSelectChannel(item);
    }
  }, [onClose, onSelectMovie, onSelectSeries, onSelectChannel]);

  // TV Remote navigation handler
  useEffect(() => {
    if (!isOpen) return;

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

      // In input field
      if (focusArea === 'input') {
        if (isDown) {
          e.preventDefault();
          inputRef.current?.blur();
          setFocusArea('filters');
          setFocusedFilterIndex(0);
          return;
        }
        return;
      }

      // In filter pills
      if (focusArea === 'filters') {
        if (isUp) {
          e.preventDefault();
          setFocusArea('input');
          inputRef.current?.focus();
          return;
        }
        if (isLeft) {
          e.preventDefault();
          setFocusedFilterIndex((prev) => (prev > 0 ? prev - 1 : FILTERS.length - 1));
          return;
        }
        if (isRight) {
          e.preventDefault();
          setFocusedFilterIndex((prev) => (prev < FILTERS.length - 1 ? prev + 1 : 0));
          return;
        }
        if (isEnter) {
          e.preventDefault();
          setActiveFilter(FILTERS[focusedFilterIndex].id);
          return;
        }
        if (isDown) {
          e.preventDefault();
          if (filteredResults.length > 0) {
            setFocusArea('results');
            setFocusedResultIndex(0);
            setTimeout(() => {
              const el = document.getElementById('search-result-0');
              el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 30);
          }
          return;
        }
        return;
      }

      // In results grid (columns = 4 to 6)
      if (focusArea === 'results') {
        const cols = 4; // grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5
        if (isUp) {
          e.preventDefault();
          if (focusedResultIndex - cols >= 0) {
            const next = focusedResultIndex - cols;
            setFocusedResultIndex(next);
            document.getElementById(`search-result-${next}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          } else {
            setFocusArea('filters');
          }
          return;
        }
        if (isDown) {
          e.preventDefault();
          if (focusedResultIndex + cols < filteredResults.length) {
            const next = focusedResultIndex + cols;
            setFocusedResultIndex(next);
            document.getElementById(`search-result-${next}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
          return;
        }
        if (isLeft) {
          e.preventDefault();
          if (focusedResultIndex > 0) {
            const next = focusedResultIndex - 1;
            setFocusedResultIndex(next);
            document.getElementById(`search-result-${next}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
          return;
        }
        if (isRight) {
          e.preventDefault();
          if (focusedResultIndex < filteredResults.length - 1) {
            const next = focusedResultIndex + 1;
            setFocusedResultIndex(next);
            document.getElementById(`search-result-${next}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
          return;
        }
        if (isEnter) {
          e.preventDefault();
          const target = filteredResults[focusedResultIndex];
          if (target) {
            handleSelectItem(target);
          }
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, focusArea, focusedFilterIndex, focusedResultIndex, filteredResults, FILTERS, onClose, handleSelectItem]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] bg-tv-bg flex flex-col animate-fade-in select-none">
      {/* Top Search Bar Header */}
      <div className="p-4 bg-tv-surface border-b border-tv-border flex items-center space-x-3 flex-shrink-0">
        <div className="flex-1 relative flex items-center">
          <Search className="w-5 h-5 text-tv-accent absolute left-4 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocusArea('input')}
            placeholder="Rechercher une chaîne, un film, une série..."
            className={`w-full bg-tv-card text-white placeholder-slate-400 pl-12 pr-10 py-3.5 rounded-2xl border text-sm sm:text-base font-medium shadow-inner transition focus:outline-none ${
              focusArea === 'input'
                ? 'border-tv-accent ring-2 ring-tv-accent ring-offset-2 ring-offset-tv-surface'
                : 'border-tv-border'
            }`}
          />
          {query && (
            <button
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="absolute right-3 p-1.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition"
              title="Effacer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <button
          onClick={onClose}
          className="p-3 bg-tv-card hover:bg-tv-cardHover border border-tv-border rounded-2xl text-slate-300 hover:text-white transition flex items-center space-x-1.5 focus:outline-none"
          title="Fermer la recherche"
        >
          <X className="w-5 h-5 text-tv-accent" />
          <span className="text-xs font-bold hidden sm:inline">Fermer</span>
        </button>
      </div>

      {/* Filter Category Pills */}
      <div className="px-4 py-2.5 bg-tv-surface/40 border-b border-tv-border flex items-center space-x-2 overflow-x-auto flex-shrink-0">
        {FILTERS.map((f, idx) => {
          const Icon = f.icon;
          const isSelected = activeFilter === f.id;
          const isFocused = focusArea === 'filters' && focusedFilterIndex === idx;
          const count = counts[f.id] || 0;

          return (
            <button
              key={f.id}
              onClick={() => {
                setActiveFilter(f.id);
                setFocusedFilterIndex(idx);
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-2 transition border ${
                isFocused
                  ? 'bg-tv-focus text-white border-tv-accent ring-2 ring-tv-accent ring-offset-2 ring-offset-tv-bg scale-105 shadow-md'
                  : isSelected
                  ? 'bg-tv-card text-tv-accent border-tv-accent shadow-sm'
                  : 'bg-tv-card/60 text-slate-400 hover:text-white border-white/5'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{f.label}</span>
              {results.length > 0 && (
                <span className="text-[10px] bg-black/40 px-1.5 py-0.2 rounded-full font-mono text-slate-300 border border-white/5">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Results View */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {/* Loading Spinner */}
        {isSearching && (
          <div className="py-20 flex flex-col items-center justify-center space-y-3 text-center">
            <Loader2 className="w-8 h-8 text-tv-accent animate-spin" />
            <p className="text-xs text-slate-400 font-medium">Recherche instantanée dans votre playlist...</p>
          </div>
        )}

        {/* Empty state: prompt to search */}
        {!isSearching && !query && (
          <div className="py-24 flex flex-col items-center justify-center text-center space-y-3 max-w-sm mx-auto">
            <div className="w-16 h-16 rounded-2xl bg-tv-card border border-tv-border flex items-center justify-center text-tv-accent shadow-lg">
              <Search className="w-8 h-8" />
            </div>
            <h4 className="text-base font-bold text-white">Moteur de recherche KeoTV</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Tapez le nom d&apos;un film, d&apos;une série ou d&apos;une chaîne pour y accéder instantanément.
            </p>
          </div>
        )}

        {/* Empty state: No results found */}
        {!isSearching && query.length >= 2 && filteredResults.length === 0 && (
          <div className="py-20 flex flex-col items-center justify-center text-center space-y-2 max-w-sm mx-auto">
            <p className="text-sm font-semibold text-slate-300">Aucun résultat trouvé pour « {query} »</p>
            <p className="text-xs text-slate-400">Vérifiez l&apos;orthographe ou essayez un mot plus court.</p>
          </div>
        )}

        {/* Grid of Results */}
        {!isSearching && filteredResults.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
            {filteredResults.map((item, idx) => {
              const isFocused = focusArea === 'results' && focusedResultIndex === idx;
              const isVod = item.type === 'vod';
              const isSeries = item.type === 'series';

              return (
                <div
                  key={item.id}
                  id={`search-result-${idx}`}
                  onClick={() => handleSelectItem(item)}
                  className={`group rounded-2xl p-2.5 transition cursor-pointer flex flex-col space-y-2 border focus:outline-none ${
                    isFocused
                      ? 'bg-tv-focus text-white border-tv-accent ring-2 ring-tv-accent ring-offset-2 ring-offset-tv-bg scale-[1.03] shadow-xl shadow-sky-500/30'
                      : 'bg-tv-card/80 hover:bg-tv-cardHover border-tv-border hover:border-tv-accent'
                  }`}
                >
                  <div className="w-full aspect-[2/3] rounded-xl bg-black/40 border border-tv-border overflow-hidden relative flex items-center justify-center">
                    {item.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.logo}
                        alt={item.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-200"
                        onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
                      />
                    ) : isVod ? (
                      <Film className="w-10 h-10 text-slate-600" />
                    ) : isSeries ? (
                      <Clapperboard className="w-10 h-10 text-slate-600" />
                    ) : (
                      <Tv className="w-10 h-10 text-slate-600" />
                    )}

                    {/* Badge */}
                    <div className="absolute top-2 left-2">
                      <span
                        className={`text-[9px] font-black px-2 py-0.5 rounded-md border uppercase shadow-md ${
                          isVod
                            ? 'bg-amber-500/90 text-black border-amber-400'
                            : isSeries
                            ? 'bg-purple-600/90 text-white border-purple-400'
                            : 'bg-sky-500/90 text-black border-sky-400'
                        }`}
                      >
                        {isVod ? 'Film' : isSeries ? 'Série' : 'Direct'}
                      </span>
                    </div>

                    {/* Hover play icon */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                      <div className="w-10 h-10 rounded-full bg-tv-accent flex items-center justify-center shadow-lg">
                        <Play className="w-4 h-4 fill-slate-950 text-slate-950 ml-0.5" />
                      </div>
                    </div>
                  </div>

                  <div className="min-w-0">
                    <p className="text-xs font-bold truncate group-hover:text-tv-accent transition">
                      {item.name}
                    </p>
                    <p className="text-[10px] text-slate-400 truncate">
                      {item.group_id ? item.group_id.replace(/^g_xtream_(?:live_|vod_|series_)?/, '') : ''}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
