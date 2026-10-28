'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Search, X, Film, Clapperboard, Tv, Play, Loader2, Star, Trash2 } from 'lucide-react';
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

const KEYBOARD_GRID = [
  ['A', 'B', 'C', 'D', 'E', 'F'],
  ['G', 'H', 'I', 'J', 'K', 'L'],
  ['M', 'N', 'O', 'P', 'Q', 'R'],
  ['S', 'T', 'U', 'V', 'W', 'X'],
  ['Y', 'Z', '1', '2', '3', '4'],
  ['5', '6', '7', '8', '9', '0'],
];

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

  // Cached index for sub-10ms instantaneous local search
  const cachedIndexRef = useRef<CachedItem[] | null>(null);

  // TV Remote navigation states
  const [focusArea, setFocusArea] = useState<'keyboard' | 'filters' | 'results' | 'input'>('keyboard');
  const [focusedKeyRow, setFocusedKeyRow] = useState<number>(0);
  const [focusedKeyCol, setFocusedKeyCol] = useState<number>(0);
  const [focusedFilterIndex, setFocusedFilterIndex] = useState<number>(0);
  const [focusedResultIndex, setFocusedResultIndex] = useState<number>(0);

  const inputRef = useRef<HTMLInputElement>(null);

  const FILTERS: { id: SearchFilterType; label: string; icon: any }[] = [
    { id: 'all', label: 'Tous', icon: Search },
    { id: 'vod', label: 'Films', icon: Film },
    { id: 'series', label: 'Séries', icon: Clapperboard },
    { id: 'live', label: 'Direct TV', icon: Tv },
  ];

  // Load index into memory once when modal opens
  useEffect(() => {
    if (isOpen) {
      setFocusArea('keyboard');
      setFocusedKeyRow(0);
      setFocusedKeyCol(0);

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
      cachedIndexRef.current = null;
    }
  }, [isOpen]);

  // Fast instant local search (0ms) + background remote search
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
          if (matched.length >= 100) break;
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
            if (matched.length >= 100) break;
          }
        }
        setResults(matched);
        setFocusedResultIndex(0);
        setIsSearching(false);
      }).catch(() => setIsSearching(false));
    }

    // 2. BACKGROUND REMOTE CATALOG QUERY (Non-blocking: Series, Movies & Live TV)
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

  const handleKeyPress = useCallback((val: string) => {
    if (val === 'ESPACE') {
      setQuery((prev) => prev + ' ');
    } else if (val === 'EFFACER') {
      setQuery((prev) => prev.slice(0, -1));
    } else if (val === 'VIDER') {
      setQuery('');
    } else {
      setQuery((prev) => prev + val);
    }
  }, []);

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

      // 1. In Search Input
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

      // 2. In Filter Pills
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
          setFocusArea('keyboard');
          setFocusedKeyRow(0);
          setFocusedKeyCol(0);
          return;
        }
        return;
      }

      // 3. In Virtual TV Keypad
      if (focusArea === 'keyboard') {
        if (isUp) {
          e.preventDefault();
          if (focusedKeyRow === 0) {
            setFocusArea('filters');
          } else {
            const nextRow = focusedKeyRow - 1;
            setFocusedKeyRow(nextRow);
            const maxCol = nextRow === 6 ? 2 : KEYBOARD_GRID[nextRow].length - 1;
            setFocusedKeyCol((c) => Math.min(c, maxCol));
          }
          return;
        }
        if (isDown) {
          e.preventDefault();
          if (focusedKeyRow < 6) {
            const nextRow = focusedKeyRow + 1;
            setFocusedKeyRow(nextRow);
            const maxCol = nextRow === 6 ? 2 : KEYBOARD_GRID[nextRow].length - 1;
            setFocusedKeyCol((c) => Math.min(c, maxCol));
          }
          return;
        }
        if (isLeft) {
          e.preventDefault();
          if (focusedKeyCol > 0) {
            setFocusedKeyCol((c) => c - 1);
          }
          return;
        }
        if (isRight) {
          e.preventDefault();
          const maxCol = focusedKeyRow === 6 ? 2 : KEYBOARD_GRID[focusedKeyRow].length - 1;
          if (focusedKeyCol < maxCol) {
            setFocusedKeyCol((c) => c + 1);
          } else if (filteredResults.length > 0) {
            setFocusArea('results');
            setFocusedResultIndex(0);
            setTimeout(() => {
              document.getElementById('search-result-0')?.scrollIntoView({ behavior: 'auto', block: 'nearest' });
            }, 30);
          }
          return;
        }
        if (isEnter) {
          e.preventDefault();
          if (focusedKeyRow === 6) {
            if (focusedKeyCol === 0) handleKeyPress('ESPACE');
            else if (focusedKeyCol === 1) handleKeyPress('EFFACER');
            else if (focusedKeyCol === 2) handleKeyPress('VIDER');
          } else {
            const keyChar = KEYBOARD_GRID[focusedKeyRow]?.[focusedKeyCol];
            if (keyChar) handleKeyPress(keyChar);
          }
          return;
        }
        return;
      }

      // 4. In Results Grid
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
          if (focusedResultIndex % cols === 0) {
            setFocusArea('keyboard');
          } else if (focusedResultIndex > 0) {
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
  }, [
    isOpen,
    focusArea,
    focusedKeyRow,
    focusedKeyCol,
    focusedFilterIndex,
    focusedResultIndex,
    filteredResults,
    FILTERS,
    contextMenuItem,
    onClose,
    handleSelectItem,
    handleKeyPress,
  ]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-2 sm:p-6 animate-in fade-in duration-100">
      <div className="w-full max-w-6xl bg-tv-surface border border-tv-border rounded-3xl shadow-2xl flex flex-col h-[92vh] overflow-hidden text-slate-100">
        {/* Search Header */}
        <div className="p-3 sm:p-5 border-b border-tv-border bg-tv-card/60 flex items-center space-x-3 flex-shrink-0">
          <div className="relative flex-1">
            <Search className="w-5 h-5 text-tv-accent absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onFocus={() => setFocusArea('input')}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher une chaîne, un film, une série..."
              className={`w-full bg-black/60 border-2 text-white pl-12 pr-10 py-3 rounded-2xl text-base sm:text-lg font-medium placeholder-slate-500 focus:outline-none transition shadow-inner ${
                focusArea === 'input' ? 'border-tv-accent ring-2 ring-tv-accent/50' : 'border-tv-border'
              }`}
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
                  setFocusArea('keyboard');
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
        <div className="px-5 py-2.5 border-b border-tv-border/50 bg-black/30 flex items-center space-x-2 overflow-x-auto flex-shrink-0">
          {FILTERS.map((f, idx) => {
            const Icon = f.icon;
            const count = counts[f.id];
            const isActive = activeFilter === f.id;
            const isFocused = focusArea === 'filters' && focusedFilterIndex === idx;

            return (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  setActiveFilter(f.id);
                  setFocusedFilterIndex(idx);
                }}
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

        {/* Main Body: TV Keyboard (Left) + Search Results (Right) */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* TV Virtual Keyboard Column */}
          <div className="w-full md:w-80 p-3 sm:p-4 border-b md:border-b-0 md:border-r border-tv-border bg-black/40 flex flex-col space-y-2.5 flex-shrink-0 overflow-y-auto">
            <div className="flex items-center justify-between text-xs text-slate-400 px-1">
              <span className="font-semibold text-white flex items-center space-x-1.5">
                <span>Clavier Télécommande</span>
              </span>
              <span className="text-[11px] text-sky-400 font-mono">D-Pad & OK</span>
            </div>

            {/* Alphabet & Number Grid */}
            <div className="grid grid-cols-6 gap-1.5">
              {KEYBOARD_GRID.map((row, rIdx) =>
                row.map((char, cIdx) => {
                  const isKeyFocused =
                    focusArea === 'keyboard' &&
                    focusedKeyRow === rIdx &&
                    focusedKeyCol === cIdx;
                  return (
                    <button
                      key={char}
                      type="button"
                      onClick={() => handleKeyPress(char)}
                      className={`h-11 sm:h-12 rounded-xl text-sm sm:text-base font-bold flex items-center justify-center transition border ${
                        isKeyFocused
                          ? 'bg-sky-500 text-black border-white shadow-lg ring-2 ring-sky-300 scale-105 z-10'
                          : 'bg-white/5 text-slate-200 border-white/10 hover:bg-white/15'
                      }`}
                    >
                      {char}
                    </button>
                  );
                })
              )}
            </div>

            {/* Bottom Special Keys: Space, Backspace, Clear */}
            <div className="grid grid-cols-3 gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => handleKeyPress('ESPACE')}
                className={`h-11 rounded-xl text-xs font-bold flex items-center justify-center transition border ${
                  focusArea === 'keyboard' && focusedKeyRow === 6 && focusedKeyCol === 0
                    ? 'bg-sky-500 text-black border-white shadow-lg ring-2 ring-sky-300 scale-105 z-10'
                    : 'bg-white/10 text-slate-200 border-white/10 hover:bg-white/15'
                }`}
              >
                Espace
              </button>
              <button
                type="button"
                onClick={() => handleKeyPress('EFFACER')}
                className={`h-11 rounded-xl text-xs font-bold flex items-center justify-center transition border ${
                  focusArea === 'keyboard' && focusedKeyRow === 6 && focusedKeyCol === 1
                    ? 'bg-sky-500 text-black border-white shadow-lg ring-2 ring-sky-300 scale-105 z-10'
                    : 'bg-white/10 text-slate-200 border-white/10 hover:bg-white/15'
                }`}
              >
                ⌫ Effacer
              </button>
              <button
                type="button"
                onClick={() => handleKeyPress('VIDER')}
                className={`h-11 rounded-xl text-xs font-bold flex items-center justify-center transition border ${
                  focusArea === 'keyboard' && focusedKeyRow === 6 && focusedKeyCol === 2
                    ? 'bg-rose-500 text-white border-white shadow-lg ring-2 ring-rose-300 scale-105 z-10'
                    : 'bg-rose-500/20 text-rose-300 border-rose-500/30 hover:bg-rose-500/30'
                }`}
              >
                ✕ Vider
              </button>
            </div>

            <p className="text-[11px] text-slate-500 px-1 pt-1 leading-tight">
              Flèche Droite pour basculer vers les résultats. Flèche Gauche pour revenir au clavier.
            </p>
          </div>

          {/* Results Area */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            {/* Prompt to Search */}
            {query.length < 2 && (
              <div className="py-20 flex flex-col items-center justify-center text-center space-y-3 max-w-sm mx-auto">
                <div className="w-16 h-16 rounded-2xl bg-tv-card border border-tv-border flex items-center justify-center text-tv-accent shadow-lg">
                  <Search className="w-8 h-8" />
                </div>
                <h4 className="text-base font-bold text-white">Recherche Ultra-Rapide</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Naviguez sur le clavier virtuel avec les flèches et validez avec OK.
                  Recherche instantanée dans vos 9000+ chaînes TV, films et séries !
                </p>
              </div>
            )}

            {/* Empty or Searching State */}
            {query.length >= 2 && filteredResults.length === 0 && (
              <div className="py-20 flex flex-col items-center justify-center text-center space-y-3 max-w-sm mx-auto">
                {isSearching || isRemoteSearching ? (
                  <>
                    <Loader2 className="w-8 h-8 animate-spin text-tv-accent" />
                    <p className="text-xs text-slate-400">Recherche dans vos bouquets TV et catalogue VOD...</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-slate-300">Aucun résultat trouvé pour « {query} »</p>
                    <p className="text-xs text-slate-400">Vérifiez l&apos;orthographe ou essayez un mot plus court.</p>
                  </>
                )}
              </div>
            )}

            {/* Grid of Results */}
            {filteredResults.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-3 sm:gap-4">
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
                          ? 'bg-tv-focus text-white border-tv-accent ring-2 ring-tv-accent ring-offset-2 ring-offset-tv-bg shadow-xl scale-[1.02]'
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
