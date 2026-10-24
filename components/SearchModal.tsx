'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Search, X, Film, Clapperboard, Tv, Play, Loader2, Star } from 'lucide-react';
import { Channel } from '@/types/iptv';
import { db } from '@/lib/db';
import { searchXtreamCatalog } from '@/lib/iptv-service';
import { ContextMenuModal } from './ContextMenuModal';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectChannel: (channel: Channel) => void;
  onSelectMovie: (channel: Channel) => void;
  onSelectSeries: (channel: Channel) => void;
  onToggleFavorite?: (channel: Channel, explicitNewState?: boolean) => void;
  serverCreds?: { serverUrl: string; username: string; password: string } | null;
}

type SearchFilterType = 'all' | 'vod' | 'series' | 'live';

interface CachedItem {
  channel: Channel;
  nameNorm: string;
}

export const SearchModal: React.FC<SearchModalProps> = ({
  isOpen,
  onClose,
  onSelectChannel,
  onSelectMovie,
  onSelectSeries,
  onToggleFavorite,
  serverCreds,
}) => {
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<SearchFilterType>('all');
  const [results, setResults] = useState<Channel[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isRemoteSearching, setIsRemoteSearching] = useState(false);
  const [contextMenuItem, setContextMenuItem] = useState<Channel | null>(null);

  // Cached index for sub-10ms instantaneous search without disk I/O on every keystroke
  const cachedIndexRef = useRef<CachedItem[] | null>(null);

  // TV Remote navigation states
  const [focusArea, setFocusArea] = useState<'input' | 'filters' | 'results'>('input');
  const [focusedFilterIndex, setFocusedFilterIndex] = useState<number>(0);
  const [focusedResultIndex, setFocusedResultIndex] = useState<number>(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);

  const FILTERS: { id: SearchFilterType; label: string; icon: any }[] = [
    { id: 'all', label: 'Tous', icon: Search },
    { id: 'vod', label: 'Films', icon: Film },
    { id: 'series', label: 'Séries', icon: Clapperboard },
    { id: 'live', label: 'Direct TV', icon: Tv },
  ];

  // Load index into memory once when modal opens
  useEffect(() => {
    if (isOpen) {
      setFocusArea('input');
      setTimeout(() => inputRef.current?.focus(), 80);

      if (!cachedIndexRef.current) {
        db.channels.toArray().then((all) => {
          cachedIndexRef.current = all.map((c) => ({
            channel: c,
            nameNorm: (c.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
          }));
        }).catch((err) => {
          console.warn('Failed to pre-index channels for search:', err);
        });
      }
    } else {
      setQuery('');
      setResults([]);
      setContextMenuItem(null);
      cachedIndexRef.current = null; // Reclaim RAM for low-memory TV boxes
    }
  }, [isOpen]);

  // Fast instant local search (0ms) + non-blocking background remote search
  useEffect(() => {
    if (!isOpen) return;
    const trimmed = query.trim().toLowerCase();
    if (!trimmed || trimmed.length < 2) {
      setResults([]);
      setIsSearching(false);
      setIsRemoteSearching(false);
      return;
    }

    const normalized = trimmed.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // 1. INSTANT LOCAL SEARCH (0ms delay)
    let pool = cachedIndexRef.current;
    if (pool) {
      const matched: Channel[] = [];
      for (let i = 0; i < pool.length; i++) {
        if (pool[i].nameNorm.includes(normalized)) {
          matched.push(pool[i].channel);
          if (matched.length >= 80) break;
        }
      }
      setResults(matched);
      setFocusedResultIndex(0);
      setIsSearching(false);
    } else {
      setIsSearching(true);
      db.channels.toArray().then((all) => {
        pool = all.map((c) => ({
          channel: c,
          nameNorm: (c.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
        }));
        cachedIndexRef.current = pool;
        const matched: Channel[] = [];
        for (let i = 0; i < pool.length; i++) {
          if (pool[i].nameNorm.includes(normalized)) {
            matched.push(pool[i].channel);
            if (matched.length >= 80) break;
          }
        }
        setResults(matched);
        setFocusedResultIndex(0);
        setIsSearching(false);
      }).catch(() => setIsSearching(false));
    }

    // 2. BACKGROUND REMOTE CATALOG QUERY (Non-blocking, max 3.5s timeout)
    if (!serverCreds?.serverUrl || !serverCreds.username || !serverCreds.password) {
      return;
    }

    let cancelled = false;
    const remoteTimer = setTimeout(async () => {
      setIsRemoteSearching(true);
      try {
        const remoteMatches = await searchXtreamCatalog({
          serverUrl: serverCreds.serverUrl,
          username: serverCreds.username,
          password: serverCreds.password,
          query: trimmed,
        });

        if (!cancelled && remoteMatches.length > 0) {
          setResults((prev) => {
            const seen = new Set(prev.map((p) => p.id));
            const newItems: Channel[] = [];
            for (const rm of remoteMatches) {
              if (!seen.has(rm.id)) {
                seen.add(rm.id);
                newItems.push(rm);
              }
            }
            if (newItems.length === 0) return prev;
            // Save newly discovered items to local database for instant future lookups
            db.channels.bulkPut(newItems).catch(() => {});
            if (cachedIndexRef.current) {
              for (const ni of newItems) {
                cachedIndexRef.current.push({
                  channel: ni,
                  nameNorm: (ni.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
                });
              }
            }
            return [...prev, ...newItems];
          });
        }
      } catch (err) {
        console.warn('Background remote search notice:', err);
      } finally {
        if (!cancelled) setIsRemoteSearching(false);
      }
    }, 280);

    return () => {
      cancelled = true;
      clearTimeout(remoteTimer);
    };
  }, [query, isOpen, serverCreds]);

  // Filtered results according to active tab
  const filteredResults = useMemo(() => {
    if (activeFilter === 'all') return results;
    if (activeFilter === 'vod') {
      return results.filter((c) => c.type === 'vod' || c.stream_type === 'vod');
    }
    if (activeFilter === 'series') {
      return results.filter((c) => c.type === 'series' || c.stream_type === 'series');
    }
    if (activeFilter === 'live') {
      return results.filter(
        (c) => (c.type === 'live' || c.stream_type === 'live') || (!c.type && !c.stream_type)
      );
    }
    return results;
  }, [results, activeFilter]);

  // Counts per type
  const counts = useMemo(() => {
    const vodCount = results.filter((c) => c.type === 'vod' || c.stream_type === 'vod').length;
    const seriesCount = results.filter((c) => c.type === 'series' || c.stream_type === 'series').length;
    const liveCount = results.filter(
      (c) => (c.type === 'live' || c.stream_type === 'live') || (!c.type && !c.stream_type)
    ).length;
    return { all: results.length, vod: vodCount, series: seriesCount, live: liveCount };
  }, [results]);

  const handleSelectItem = useCallback((item: Channel) => {
    onClose();
    if (item.type === 'vod' || item.stream_type === 'vod') {
      onSelectMovie(item);
    } else if (item.type === 'series' || item.stream_type === 'series') {
      onSelectSeries(item);
    } else {
      onSelectChannel(item);
    }
  }, [onClose, onSelectMovie, onSelectSeries, onSelectChannel]);

  const handleToggleFavFromSearch = async (item: Channel) => {
    const nextState = !item.is_favorite;
    await db.channels.update(item.id, { is_favorite: nextState });

    // Update in memory cache and results
    setResults((prev) =>
      prev.map((c) => (c.id === item.id ? { ...c, is_favorite: nextState } : c))
    );
    if (cachedIndexRef.current) {
      cachedIndexRef.current.forEach((entry) => {
        if (entry.channel.id === item.id) {
          entry.channel.is_favorite = nextState;
        }
      });
    }

    if (onToggleFavorite) {
      onToggleFavorite(item, nextState);
    }
  };

  // TV Remote navigation handler
  useEffect(() => {
    if (!isOpen || contextMenuItem) return;

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
      const target = e.target as HTMLElement | null;
      const isInputFocused = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');

      // If user is editing text in search input, allow Backspace for deletion without closing modal
      if (e.key === 'Backspace' && isInputFocused) {
        return;
      }

      const isBack =
        e.key === 'Escape' ||
        (!isInputFocused && e.key === 'Backspace') ||
        e.key === 'GoBack' ||
        e.key === 'Back' ||
        (e as any).keyCode === 27 ||
        (e as any).keyCode === 4;
      const isMenu = e.key === 'Menu' || (e as any).keyCode === 82;

      // Menu button on remote opens context menu on currently focused result
      if (isMenu && focusArea === 'results' && filteredResults[focusedResultIndex]) {
        e.preventDefault();
        setContextMenuItem(filteredResults[focusedResultIndex]);
        return;
      }

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
              el?.scrollIntoView({ behavior: 'auto', block: 'nearest' });
            }, 30);
          }
          return;
        }
        return;
      }

      // In results grid
      if (focusArea === 'results') {
        const cols = 4;
        if (isUp) {
          e.preventDefault();
          if (focusedResultIndex - cols >= 0) {
            const next = focusedResultIndex - cols;
            setFocusedResultIndex(next);
            document.getElementById(`search-result-${next}`)?.scrollIntoView({ behavior: 'auto', block: 'nearest' });
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
            document.getElementById(`search-result-${next}`)?.scrollIntoView({ behavior: 'auto', block: 'nearest' });
          }
          return;
        }
        if (isLeft) {
          e.preventDefault();
          if (focusedResultIndex > 0) {
            const next = focusedResultIndex - 1;
            setFocusedResultIndex(next);
            document.getElementById(`search-result-${next}`)?.scrollIntoView({ behavior: 'auto', block: 'nearest' });
          }
          return;
        }
        if (isRight) {
          e.preventDefault();
          if (focusedResultIndex < filteredResults.length - 1) {
            const next = focusedResultIndex + 1;
            setFocusedResultIndex(next);
            document.getElementById(`search-result-${next}`)?.scrollIntoView({ behavior: 'auto', block: 'nearest' });
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
  }, [isOpen, focusArea, focusedFilterIndex, focusedResultIndex, filteredResults, FILTERS, contextMenuItem, onClose, handleSelectItem]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-6 animate-in fade-in duration-100">
      <div className="w-full max-w-5xl bg-tv-surface border border-tv-border rounded-3xl shadow-2xl flex flex-col h-[90vh] overflow-hidden text-slate-100">
        {/* Search Header */}
        <div className="p-4 sm:p-6 border-b border-tv-border bg-tv-card/60 flex items-center space-x-3 flex-shrink-0">
          <div className="relative flex-1">
            <Search className="w-5 h-5 text-tv-accent absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher une chaîne, un film, une série..."
              className="w-full bg-black/60 border-2 border-tv-border focus:border-tv-accent text-white pl-12 pr-10 py-3.5 rounded-2xl text-base sm:text-lg font-medium placeholder-slate-500 focus:outline-none transition shadow-inner"
            />
            {isRemoteSearching && (
              <div className="absolute right-12 top-1/2 -translate-y-1/2 flex items-center space-x-1.5 text-xs text-tv-accent font-medium pointer-events-none">
                <Loader2 className="w-4 h-4 animate-spin text-tv-accent" />
              </div>
            )}
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  inputRef.current?.focus();
                }}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-3 rounded-2xl text-slate-400 hover:text-white hover:bg-white/10 transition border border-white/5"
            title="Fermer"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Filter Pills Bar */}
        <div className="px-6 py-2.5 border-b border-tv-border/50 bg-black/30 flex items-center space-x-2 overflow-x-auto flex-shrink-0">
          {FILTERS.map((f, idx) => {
            const Icon = f.icon;
            const count = counts[f.id];
            const isActive = activeFilter === f.id;
            const isFocused = focusArea === 'filters' && focusedFilterIndex === idx;

            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setActiveFilter(f.id)}
                className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex-shrink-0 border ${
                  isActive
                    ? 'bg-tv-focus text-white border-tv-accent shadow-md'
                    : 'bg-tv-card/60 text-slate-300 border-white/5 hover:text-white hover:bg-tv-card'
                } ${
                  isFocused
                    ? 'ring-2 ring-tv-accent ring-offset-2 ring-offset-tv-bg scale-105'
                    : ''
                }`}
              >
                <Icon className="w-3.5 h-3.5 text-tv-accent" />
                <span>{f.label}</span>
                {query.length >= 2 && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                      isActive ? 'bg-black/30 text-white' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Results Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {/* Initial State: Prompt to Search */}
          {query.length < 2 && (
            <div className="py-24 flex flex-col items-center justify-center text-center space-y-3 max-w-sm mx-auto">
              <div className="w-16 h-16 rounded-2xl bg-tv-card border border-tv-border flex items-center justify-center text-tv-accent shadow-lg">
                <Search className="w-8 h-8" />
              </div>
              <h4 className="text-base font-bold text-white">Moteur de recherche instantané</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Tapez le nom d&apos;un film, d&apos;une série ou d&apos;une chaîne.
                Appuyez sur la touche <strong className="text-white">Menu</strong> de votre télécommande pour ajouter directement aux favoris.
              </p>
            </div>
          )}

          {/* Empty state or searching state when no results yet */}
          {query.length >= 2 && filteredResults.length === 0 && (
            <div className="py-20 flex flex-col items-center justify-center text-center space-y-3 max-w-sm mx-auto">
              {isSearching || isRemoteSearching ? (
                <>
                  <Loader2 className="w-8 h-8 animate-spin text-tv-accent" />
                  <p className="text-xs text-slate-400">Recherche dans vos bouquets & catalogue distant...</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-slate-300">Aucun résultat trouvé pour « {query} »</p>
                  <p className="text-xs text-slate-400">Vérifiez l&apos;orthographe ou essayez un mot plus court.</p>
                </>
              )}
            </div>
          )}

          {/* Grid of Results (Displayed immediately with 0ms delay!) */}
          {filteredResults.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
              {filteredResults.map((item, idx) => {
                const isFocused = focusArea === 'results' && focusedResultIndex === idx;
                const isVod = item.type === 'vod' || item.stream_type === 'vod';
                const isSeries = item.type === 'series' || item.stream_type === 'series';

                return (
                  <div
                    key={item.id}
                    id={`search-result-${idx}`}
                    onClick={() => handleSelectItem(item)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenuItem(item);
                    }}
                    className={`group rounded-2xl p-2.5 transition cursor-pointer flex flex-col space-y-2 border focus:outline-none select-none relative ${
                      isFocused
                        ? 'bg-tv-focus text-white border-tv-accent ring-2 ring-tv-accent ring-offset-2 ring-offset-tv-bg shadow-xl'
                        : 'bg-tv-card/80 hover:bg-tv-cardHover border-tv-border hover:border-tv-accent'
                    }`}
                  >
                    <div className="w-full aspect-[2/3] rounded-xl bg-black/40 border border-tv-border overflow-hidden relative flex items-center justify-center">
                      {item.logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.logo}
                          alt={item.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-150"
                          onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
                        />
                      ) : isVod ? (
                        <Film className="w-10 h-10 text-slate-600" />
                      ) : isSeries ? (
                        <Clapperboard className="w-10 h-10 text-slate-600" />
                      ) : (
                        <Tv className="w-10 h-10 text-slate-600" />
                      )}

                      {/* Type Badge */}
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

                      {/* Favorite indicator */}
                      {item.is_favorite && (
                        <div className="absolute top-2 right-2 bg-black/70 p-1 rounded-full border border-amber-400/50 shadow">
                          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <h4 className="text-xs sm:text-sm font-semibold truncate text-white leading-tight">
                        {item.name}
                      </h4>
                      {item.group_name && (
                        <p className="text-[10px] text-slate-400 truncate mt-0.5">
                          {item.group_name}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Context Menu for item from search (allows favoriting directly) */}
      <ContextMenuModal
        isOpen={Boolean(contextMenuItem)}
        item={contextMenuItem}
        onClose={() => setContextMenuItem(null)}
        onToggleFavorite={handleToggleFavFromSearch}
        onPlay={(item) => handleSelectItem(item)}
      />
    </div>
  );
};
