'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Search, X, Film, Clapperboard, Tv, Loader2, Star, Mic, LucideIcon } from 'lucide-react';
import { Channel } from '@/types/iptv';
import { db, searchAllChannels } from '@/lib/db';
import { ContextMenuModal } from './ContextMenuModal';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectChannel: (channel: Channel) => void;
  onSelectMovie: (channel: Channel) => void;
  onSelectSeries: (channel: Channel) => void;
  onToggleFavorite?: (channel: Channel, explicitNewState?: boolean) => void;
  serverCreds?: { serverUrl: string; username: string; password: string } | null;
  isTvMode?: boolean;
}

type SearchFilterType = 'all' | 'vod' | 'series' | 'live';

// On-screen TV Keypad Grid (Lower-case letters, Numbers, Symbols)
const KEYBOARD_GRID = [
  ['a', 'b', 'c', 'd', 'e', 'f'],
  ['g', 'h', 'i', 'j', 'k', 'l'],
  ['m', 'n', 'o', 'p', 'q', 'r'],
  ['s', 't', 'u', 'v', 'w', 'x'],
  ['y', 'z', '0', '1', '2', '3'],
  ['4', '5', '6', '7', '8', '9'],
  ["'", "-", ".", "&", "/", "!"],
];

export const SearchModal: React.FC<SearchModalProps> = ({
  isOpen,
  onClose,
  onSelectChannel,
  onSelectMovie,
  onSelectSeries,
  onToggleFavorite,
  serverCreds,
  isTvMode,
}) => {
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<SearchFilterType>('all');
  const [results, setResults] = useState<Channel[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [contextMenuItem, setContextMenuItem] = useState<Channel | null>(null);

  // TV Remote navigation states
  const [focusArea, setFocusArea] = useState<'keyboard' | 'filters' | 'results'>('keyboard');
  const [focusedKeyRow, setFocusedKeyRow] = useState<number>(0);
  const [focusedKeyCol, setFocusedKeyCol] = useState<number>(0);
  const [focusedFilterIndex, setFocusedFilterIndex] = useState<number>(0);
  const [focusedResultIndex, setFocusedResultIndex] = useState<number>(0);

  const inputRef = useRef<HTMLInputElement>(null);

  // Detect TV vs Mobile
  const [isTvDevice, setIsTvDevice] = useState<boolean>(Boolean(isTvMode));
  useEffect(() => {
    if (isTvMode !== undefined) {
      setIsTvDevice(isTvMode);
    } else if (typeof window !== 'undefined') {
      const ua = navigator.userAgent || '';
      const isMobileDevice = /Android|iPhone|iPad|iPod|KeoTV-Mobile/i.test(ua);
      const isTvUa = /KeoTV-AndroidTV|Android TV|GoogleTV|Large Screen|AFT|BRAVIA|MiBox|SHIELD/i.test(ua);
      const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      setIsTvDevice(isTvUa || (!hasTouch && !isMobileDevice));
    }
  }, [isTvMode]);

  const FILTERS: { id: SearchFilterType; label: string; icon: LucideIcon }[] = [
    { id: 'all', label: 'Tous', icon: Search },
    { id: 'vod', label: 'Films', icon: Film },
    { id: 'series', label: 'Séries', icon: Clapperboard },
    { id: 'live', label: 'Direct TV', icon: Tv },
  ];

  // Reset states cleanly on open/close
  useEffect(() => {
    if (isOpen) {
      setFocusArea(isTvDevice ? 'keyboard' : 'results');
      setFocusedKeyRow(0);
      setFocusedKeyCol(0);
      setFocusedFilterIndex(0);
      setFocusedResultIndex(0);
      if (!isTvDevice) {
        setTimeout(() => inputRef.current?.focus(), 80);
      }
    } else {
      setQuery('');
      setResults([]);
      setContextMenuItem(null);
    }
  }, [isOpen, isTvDevice]);

  // Pre-indexed in-memory search cache (<2ms queries, 0 IndexedDB lock contention)
  const cacheRef = useRef<{
    channel: Channel;
    normName: string;
    normGroup: string;
    type: string;
  }[] | null>(null);
  const cacheLoadedAtRef = useRef<number>(0);

  // Pre-load / refresh search pool when modal opens from local Dexie database
  useEffect(() => {
    if (!isOpen) return;
    const now = Date.now();
    if (!cacheRef.current || now - cacheLoadedAtRef.current > 30000) {
      db.channels
        .toArray()
        .then((all) => {
          cacheRef.current = all.map((c) => ({
            channel: c,
            normName: (c.name || '')
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .toLowerCase(),
            normGroup: (c.group_name || '')
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .toLowerCase(),
            type: c.stream_type || c.type || 'live',
          }));
          cacheLoadedAtRef.current = Date.now();
        })
        .catch((err) => console.warn('Search pre-index load notice:', err));
    }
  }, [isOpen]);

  // Lightning-fast in-memory multi-word search (<2ms, smart ranking, channel number support)
  useEffect(() => {
    if (!isOpen) return;
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const found = await searchAllChannels(trimmed, activeFilter, 100);
        setResults(found);
        setFocusedResultIndex(0);
      } catch (err) {
        console.warn('Fast search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 25);

    return () => clearTimeout(timer);
  }, [query, isOpen, activeFilter]);

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

  const handleSelectItem = useCallback(
    (item: Channel) => {
      onClose();
      if (item.type === 'vod' || item.stream_type === 'vod') {
        onSelectMovie(item);
      } else if (item.type === 'series' || item.stream_type === 'series') {
        onSelectSeries(item);
      } else {
        onSelectChannel(item);
      }
    },
    [onClose, onSelectMovie, onSelectSeries, onSelectChannel]
  );

  const handleToggleFavFromSearch = async (item: Channel) => {
    const nextState = !item.is_favorite;
    await db.channels.update(item.id, { is_favorite: nextState });

    setResults((prev) =>
      prev.map((c) => (c.id === item.id ? { ...c, is_favorite: nextState } : c))
    );

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
      // If a native text input is currently focused by the user (e.g. mobile or TV IME), let it handle typing
      if (document.activeElement?.tagName === 'INPUT') {
        if (e.key === 'Escape') {
          onClose();
        }
        return;
      }

      // 1. Direct hardware keyboard input (USB / Bluetooth / Keyboard remote on TV)
      if (e.key && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        setQuery((prev) => prev + e.key);
        return;
      }
      if (e.key === 'Backspace') {
        e.preventDefault();
        setQuery((prev) => prev.slice(0, -1));
        return;
      }

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

      // 2. In Filter Pills
      if (focusArea === 'filters') {
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
          if (isTvDevice) {
            setFocusArea('keyboard');
            setFocusedKeyRow(0);
            setFocusedKeyCol(0);
          } else {
            setFocusArea('results');
            setFocusedResultIndex(0);
          }
          return;
        }
        return;
      }

      // 3. In Virtual TV Keypad (Rows 0-6: keys, Row 7: action buttons)
      if (focusArea === 'keyboard') {
        if (isUp) {
          e.preventDefault();
          if (focusedKeyRow === 0) {
            setFocusArea('filters');
          } else {
            const nextRow = focusedKeyRow - 1;
            const maxCol = nextRow === 7 ? 2 : KEYBOARD_GRID[nextRow].length - 1;
            const targetCol = Math.min(focusedKeyCol, maxCol);
            setFocusedKeyRow(nextRow);
            setFocusedKeyCol(targetCol);
          }
          return;
        }
        if (isDown) {
          e.preventDefault();
          if (focusedKeyRow < 7) {
            const nextRow = focusedKeyRow + 1;
            const maxCol = nextRow === 7 ? 2 : KEYBOARD_GRID[nextRow].length - 1;
            const targetCol = Math.min(focusedKeyCol, maxCol);
            setFocusedKeyRow(nextRow);
            setFocusedKeyCol(targetCol);
          }
          return;
        }
        if (isLeft) {
          e.preventDefault();
          if (focusedKeyCol > 0) {
            const targetCol = focusedKeyCol - 1;
            setFocusedKeyCol(targetCol);
          }
          return;
        }
        if (isRight) {
          e.preventDefault();
          const maxCol = focusedKeyRow === 7 ? 2 : KEYBOARD_GRID[focusedKeyRow].length - 1;
          if (focusedKeyCol < maxCol) {
            const targetCol = focusedKeyCol + 1;
            setFocusedKeyCol(targetCol);
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
          if (focusedKeyRow === 7) {
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
        const cols = isTvDevice ? 3 : 2;
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
          if (isTvDevice && focusedResultIndex % cols === 0) {
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
    isTvDevice,
    onClose,
    handleSelectItem,
    handleKeyPress,
  ]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-2 sm:p-5 animate-in fade-in duration-100">
      <div className="w-full max-w-5xl bg-tv-surface border border-tv-border rounded-3xl shadow-2xl flex flex-col h-[92vh] overflow-hidden text-slate-100">
        
        {/* Search Header Bar */}
        <div className="p-3 sm:p-4 border-b border-tv-border bg-tv-card/80 flex items-center space-x-3 flex-shrink-0">
          <div className="relative flex-1 bg-black/60 border-2 border-tv-border rounded-2xl px-4 py-2.5 flex items-center justify-between shadow-inner focus-within:border-sky-400 transition">
            <div className="flex items-center space-x-3 flex-1 overflow-hidden min-h-[32px]">
              <Search className="w-5 h-5 text-sky-400 flex-shrink-0" />
              
              {/* Native Input on Mobile (Touch) / Optional System Input on TV */}
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher une chaîne, un film, une série..."
                className="w-full bg-transparent text-white font-bold text-base sm:text-lg tracking-wide placeholder-slate-500 focus:outline-none"
                autoComplete="off"
                autoCorrect="off"
                spellCheck="false"
              />
            </div>

            <div className="flex items-center space-x-2 flex-shrink-0">
              {isSearching && (
                <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
              )}
              {isTvDevice && (
                <button
                  type="button"
                  onClick={() => inputRef.current?.focus()}
                  className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/5 transition flex items-center space-x-1 text-xs font-semibold"
                  title="Ouvrir le clavier vocal ou système"
                >
                  <Mic className="w-4 h-4 text-sky-400" />
                  <span className="hidden sm:inline text-[11px]">Vocal / IME</span>
                </button>
              )}
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    inputRef.current?.focus();
                  }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
                  title="Effacer"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-3 rounded-2xl text-slate-400 hover:text-white hover:bg-white/10 transition border border-white/5 flex-shrink-0"
            title="Fermer"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Filter Pills Bar */}
        <div className="px-5 py-2 border-b border-tv-border/50 bg-black/40 flex items-center space-x-2 overflow-x-auto flex-shrink-0">
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
                    ? 'bg-sky-500 text-black border-white shadow-md font-extrabold'
                    : 'bg-white/5 text-slate-300 border-white/5 hover:text-white hover:bg-white/10'
                } ${
                  isFocused
                    ? 'ring-2 ring-sky-400 ring-offset-2 ring-offset-tv-bg scale-105'
                    : ''
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-black' : 'text-sky-400'}`} />
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

        {/* Main Body: TV Keypad (Only on TV) + Search Results */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          
          {/* TV Virtual Keyboard Column (Displayed only in TV Mode) */}
          {isTvDevice && (
            <div className="w-full md:w-80 p-2.5 sm:p-3 border-b md:border-b-0 md:border-r border-tv-border bg-black/60 flex flex-col space-y-1 flex-shrink-0">
              <div className="flex items-center justify-between text-xs text-slate-400 px-1 mb-0.5">
                <span className="font-bold text-white text-xs">Clavier Télécommande</span>
                <span className="text-[11px] text-sky-400 font-mono font-semibold">Flèches & OK</span>
              </div>

              {/* Alphabet, Numbers & Special Characters (7 rows) */}
              <div className="grid grid-cols-6 gap-1">
                {KEYBOARD_GRID.map((row, rIdx) =>
                  row.map((char, cIdx) => {
                    const isKeyFocused =
                      focusArea === 'keyboard' &&
                      focusedKeyRow === rIdx &&
                      focusedKeyCol === cIdx;
                    return (
                      <button
                        id={`tv-key-${rIdx}-${cIdx}`}
                        key={`${rIdx}-${char}`}
                        type="button"
                        onClick={() => handleKeyPress(char)}
                        className={`h-7 sm:h-8 rounded-lg text-xs sm:text-sm font-bold flex items-center justify-center border select-none ${
                          isKeyFocused
                            ? 'bg-sky-400 text-slate-950 border-white ring-2 ring-sky-300 font-black'
                            : 'bg-white/5 text-slate-200 border-white/10 hover:bg-white/15'
                        }`}
                      >
                        {char}
                      </button>
                    );
                  })
                )}
              </div>

              {/* Action Keys (Row 7): Space, Backspace, Clear - Full width, high contrast */}
              <div className="grid grid-cols-3 gap-1 pt-1">
                <button
                  id="tv-key-7-0"
                  type="button"
                  onClick={() => handleKeyPress('ESPACE')}
                  className={`h-8 sm:h-9 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center space-x-1 border select-none ${
                    focusArea === 'keyboard' && focusedKeyRow === 7 && focusedKeyCol === 0
                      ? 'bg-sky-400 text-slate-950 border-white ring-2 ring-sky-300'
                      : 'bg-sky-500/15 text-sky-300 border-sky-500/30 hover:bg-sky-500/25'
                  }`}
                >
                  <span>␣ Espace</span>
                </button>
                <button
                  id="tv-key-7-1"
                  type="button"
                  onClick={() => handleKeyPress('EFFACER')}
                  className={`h-8 sm:h-9 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center space-x-1 border select-none ${
                    focusArea === 'keyboard' && focusedKeyRow === 7 && focusedKeyCol === 1
                      ? 'bg-amber-400 text-slate-950 border-white ring-2 ring-amber-300'
                      : 'bg-amber-500/15 text-amber-300 border-amber-500/30 hover:bg-amber-500/25'
                  }`}
                >
                  <span>⌫ Effacer</span>
                </button>
                <button
                  id="tv-key-7-2"
                  type="button"
                  onClick={() => handleKeyPress('VIDER')}
                  className={`h-8 sm:h-9 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center space-x-1 border select-none ${
                    focusArea === 'keyboard' && focusedKeyRow === 7 && focusedKeyCol === 2
                      ? 'bg-rose-500 text-white border-white ring-2 ring-rose-300'
                      : 'bg-rose-500/15 text-rose-300 border-rose-500/30 hover:bg-rose-500/25'
                  }`}
                >
                  <span>✕ Vider</span>
                </button>
              </div>

              <div className="flex items-center justify-between text-[10px] text-slate-400 px-1 pt-0.5">
                <span>▶ Droite : Résultats</span>
                <span>◀ Gauche : Clavier</span>
              </div>
            </div>
          )}

          {/* Results Area */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5">
            {/* Prompt to Search */}
            {query.length < 2 && (
              <div className="py-20 flex flex-col items-center justify-center text-center space-y-3 max-w-sm mx-auto">
                <div className="w-16 h-16 rounded-2xl bg-tv-card border border-tv-border flex items-center justify-center text-sky-400 shadow-lg">
                  <Search className="w-8 h-8" />
                </div>
                <h4 className="text-base font-bold text-white">Recherche Rapide KeoTV</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {isTvDevice
                    ? 'Utilisez le clavier virtuel ou vocal pour rechercher instantanément dans vos chaînes TV, films et séries.'
                    : 'Tapez au moins 2 lettres pour filtrer instantanément parmi vos chaînes TV, films et séries.'}
                </p>
              </div>
            )}

            {/* Empty or Searching State */}
            {query.length >= 2 && filteredResults.length === 0 && (
              <div className="py-20 flex flex-col items-center justify-center text-center space-y-3 max-w-sm mx-auto">
                {isSearching ? (
                  <>
                    <Loader2 className="w-8 h-8 animate-spin text-sky-400" />
                    <p className="text-xs text-slate-400">Recherche locale en cours...</p>
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
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-3 gap-3">
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
                          ? 'bg-sky-500/20 text-white border-sky-400 ring-2 ring-sky-400 shadow-xl scale-[1.02]'
                          : 'bg-tv-card/80 hover:bg-tv-cardHover border-tv-border hover:border-tv-accent'
                      }`}
                    >
                      <div className="w-full aspect-[16/9] rounded-xl bg-black/50 border border-tv-border overflow-hidden relative flex items-center justify-center">
                        {item.logo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.logo}
                            alt={item.name}
                            className="w-full h-full object-contain p-1"
                            onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
                          />
                        ) : isVod ? (
                          <Film className="w-8 h-8 text-slate-500" />
                        ) : isSeries ? (
                          <Clapperboard className="w-8 h-8 text-slate-500" />
                        ) : (
                          <Tv className="w-8 h-8 text-slate-500" />
                        )}

                        {/* Type Badge */}
                        <div className="absolute top-2 left-2">
                          <span
                            className={`text-[9px] font-black px-2 py-0.5 rounded-md border uppercase shadow-md ${
                              isVod
                                ? 'bg-amber-500 text-black border-amber-300'
                                : isSeries
                                ? 'bg-purple-600 text-white border-purple-400'
                                : 'bg-sky-500 text-black border-sky-300'
                            }`}
                          >
                            {isVod ? 'Film' : isSeries ? 'Série' : 'Direct'}
                          </span>
                        </div>

                        {/* Favorite indicator */}
                        {item.is_favorite && (
                          <div className="absolute top-2 right-2 bg-black/70 p-1 rounded-full border border-amber-400/50 shadow">
                            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
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
