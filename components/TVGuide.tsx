'use client';

import React, { useEffect, useRef, useMemo, useState } from 'react';
import { Channel, Category, EpgProgram, NavigationPane } from '@/types/iptv';
import {
  Star,
  Tv,
  Trophy,
  Film,
  Globe,
  Compass,
  Clock,
  Radio,
  Info,
  Search,
  Lock,
  Sliders,
  Layers,
  Bookmark,
  Calendar,
  User,
  Clapperboard,
  Loader2,
  Play,
} from 'lucide-react';
import { LiveVideoPlayer } from './LiveVideoPlayer';
import {
  isSeparatorChannel,
  cleanSeparatorName,
  fetchVodInfo,
  fetchSeriesInfo,
} from '@/lib/iptv-service';

interface TVGuideProps {
  categories: Category[];
  channels: Channel[];
  selectedCategory: Category | null;
  focusedCategoryIndex: number;
  focusedChannelIndex: number;
  activeChannel: Channel | null;
  currentEpg: EpgProgram | null;
  nextEpg: EpgProgram | null;
  activePane: NavigationPane;
  onSelectCategory: (cat: Category, index: number, switchPane?: boolean) => void;
  onSelectChannel: (channel: Channel, index: number) => void;
  onToggleFavorite: (channel: Channel, explicitNewState?: boolean) => void;
  onOpenSyncModal: () => void;
  onOpenXtreamModal: () => void;
  onToggleFullscreen: () => void;
  isStopped?: boolean;
  onTogglePlayStop?: () => void;
  categorySort?: 'playlist' | 'alpha' | 'count';
  onCategorySortChange?: (sort: 'playlist' | 'alpha' | 'count') => void;
  channelSort?: 'playlist' | 'alpha' | 'num';
  onChannelSortChange?: (sort: 'playlist' | 'alpha' | 'num') => void;
  onOpenSearch?: () => void;
  onOpenContextMenu?: (channel: Channel) => void;
  onOpenCategoryManager?: () => void;
  activeSection?: 'live' | 'vod' | 'series' | 'fav';
  serverCreds?: { serverUrl: string; username: string; password: string } | null;
  boundaryHit?: { pane: string; boundary: 'top' | 'bottom'; time: number } | null;
}

// Helper for category icons
function renderCategoryIcon(iconName?: string, isAdult?: boolean) {
  if (isAdult || iconName === 'Lock') {
    return <Lock className="w-4 h-4 text-rose-400 flex-shrink-0" />;
  }
  switch (iconName) {
    case 'Star':
      return <Star className="w-4 h-4 text-amber-400 flex-shrink-0" />;
    case 'Clapperboard':
      return <Clapperboard className="w-4 h-4 text-amber-400 flex-shrink-0" />;
    case 'Film':
      return <Film className="w-4 h-4 text-purple-400 flex-shrink-0" />;
    case 'Trophy':
      return <Trophy className="w-4 h-4 text-rose-400 flex-shrink-0" />;
    case 'Globe':
      return <Globe className="w-4 h-4 text-emerald-400 flex-shrink-0" />;
    case 'Compass':
      return <Compass className="w-4 h-4 text-indigo-400 flex-shrink-0" />;
    default:
      return <Tv className="w-4 h-4 text-sky-400 flex-shrink-0" />;
  }
}

// ----------------------------------------------------------------------
// MEMOIZED CATEGORY ROW: ZERO RE-RENDERS FOR UNTOUCHED CATEGORIES
// ----------------------------------------------------------------------
interface CategoryRowProps {
  category: Category;
  index: number;
  isFocused: boolean;
  isSelected: boolean;
  onSelect: (cat: Category, index: number) => void;
}

const CategoryRow = React.memo<CategoryRowProps>(
  ({ category, index, isFocused, isSelected, onSelect }) => {
    return (
      <button
        type="button"
        id={`category-item-${index}`}
        onClick={() => onSelect(category, index)}
        className={`flex items-center justify-between px-3 py-2.5 mx-2 my-0.5 rounded-xl text-left text-sm border cursor-pointer select-none outline-none ${
          isFocused
            ? 'bg-tv-focus border-white text-white font-black ring-4 ring-white z-10 shadow-lg scale-[1.02] transition-transform duration-75'
            : isSelected
            ? 'bg-tv-card/90 text-tv-accent font-bold border-l-4 border-tv-accent pl-2.5 shadow-sm'
            : 'text-slate-300 hover:bg-tv-cardHover/70 border-transparent hover:text-white'
        }`}
      >
        <div className="flex items-center space-x-2.5 min-w-0">
          {renderCategoryIcon(category.icon, category.is_adult)}
          <span className="truncate">{category.name}</span>
          {category.is_adult && (
            <span className="text-[9px] bg-rose-500/20 text-rose-300 border border-rose-500/30 px-1 py-0.2 rounded font-black flex-shrink-0">
              18+
            </span>
          )}
        </div>
        <span
          className={`text-[11px] px-1.5 py-0.5 rounded-full font-mono flex-shrink-0 ${
            isFocused
              ? 'bg-black/30 text-white font-bold'
              : isSelected
              ? 'bg-tv-accent/20 text-tv-accent font-bold'
              : 'bg-slate-800/80 text-slate-400'
          }`}
        >
          {category.count}
        </span>
      </button>
    );
  },
  (prev, next) => {
    return (
      prev.isFocused === next.isFocused &&
      prev.isSelected === next.isSelected &&
      prev.category.id === next.category.id &&
      prev.category.count === next.category.count &&
      prev.category.name === next.category.name &&
      prev.category.is_adult === next.category.is_adult
    );
  }
);
CategoryRow.displayName = 'CategoryRow';

// ----------------------------------------------------------------------
// MEMOIZED CHANNEL ROW: 60 FPS INSTANT HIGHLIGHT ON REMOTE DPAD
// ----------------------------------------------------------------------
interface ChannelRowProps {
  channel: Channel;
  index: number;
  isFocused: boolean;
  isActive: boolean;
  onSelect: (channel: Channel, index: number) => void;
  onToggleFavorite: (channel: Channel, explicitNewState?: boolean) => void;
  onOpenContextMenu?: (channel: Channel) => void;
}

const ChannelRow = React.memo<ChannelRowProps>(
  ({ channel, index, isFocused, isActive, onSelect, onToggleFavorite, onOpenContextMenu }) => {
    const pressTimerRef = useRef<NodeJS.Timeout | null>(null);

    const handlePressStart = () => {
      if (!onOpenContextMenu) return;
      pressTimerRef.current = setTimeout(() => {
        onOpenContextMenu(channel);
      }, 500);
    };

    const handlePressEnd = () => {
      if (pressTimerRef.current) {
        clearTimeout(pressTimerRef.current);
        pressTimerRef.current = null;
      }
    };

    const isSep = channel.is_separator ?? isSeparatorChannel(channel);

    if (isSep) {
      const cleanLabel = cleanSeparatorName(channel.name);
      return (
        <div
          id={`channel-item-${index}`}
          onClick={() => onSelect(channel, index)}
          onContextMenu={(e) => {
            e.preventDefault();
            onOpenContextMenu?.(channel);
          }}
          className={`flex items-center justify-between px-3.5 py-1.5 mx-2 my-1 rounded-xl select-none cursor-default transition-all duration-75 ${
            isFocused
              ? 'bg-tv-focus text-white font-bold ring-2 ring-tv-accent shadow-md'
              : 'bg-white/5 border border-white/5 text-slate-400 font-semibold hover:bg-white/10'
          }`}
        >
          <div className="flex items-center space-x-2 truncate">
            <Layers className="w-3.5 h-3.5 text-tv-accent flex-shrink-0" />
            <span className="text-xs uppercase tracking-wider truncate font-bold">{cleanLabel}</span>
          </div>
          <span className="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-mono uppercase tracking-widest flex-shrink-0 ml-2">
            Section
          </span>
        </div>
      );
    }

    return (
      <div
        id={`channel-item-${index}`}
        onClick={() => onSelect(channel, index)}
        onContextMenu={(e) => {
          e.preventDefault();
          onOpenContextMenu?.(channel);
        }}
        onTouchStart={handlePressStart}
        onTouchEnd={handlePressEnd}
        onTouchCancel={handlePressEnd}
        onMouseDown={handlePressStart}
        onMouseUp={handlePressEnd}
        onMouseLeave={handlePressEnd}
        className={`flex items-center justify-between px-3.5 py-2 mx-2 my-0.5 rounded-xl cursor-pointer border select-none outline-none ${
          isFocused
            ? 'bg-tv-focus border-white text-white font-bold ring-4 ring-white z-10 shadow-lg scale-[1.02] transition-transform duration-75'
            : isActive
            ? 'bg-tv-card border-tv-accent/50 text-slate-100'
            : 'bg-tv-card/40 border-transparent hover:bg-tv-cardHover/50 text-slate-300'
        }`}
      >
        {/* Number, Logo & Name */}
        <div className="flex items-center space-x-3 min-w-0 flex-1">
          <span
            className={`text-xs font-mono font-bold w-6 text-right flex-shrink-0 ${
              isFocused ? 'text-white font-black' : 'text-slate-500'
            }`}
          >
            {channel.num}
          </span>
          <div
            className={`${
              channel.stream_type === 'vod' || channel.stream_type === 'series' ? 'w-9 h-13' : 'w-9 h-9'
            } rounded-lg bg-black/40 border border-white/5 flex items-center justify-center flex-shrink-0 overflow-hidden`}
          >
            {channel.logo ? (
              <img
                src={channel.logo}
                alt={channel.name}
                loading="lazy"
                className={`w-full h-full ${
                  channel.stream_type === 'vod' || channel.stream_type === 'series'
                    ? 'object-cover'
                    : 'object-contain p-1'
                }`}
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            ) : (
              <span className="text-[11px] font-bold text-slate-400">
                {channel.name.slice(0, 3)}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center space-x-2">
              <h4 className="text-sm font-semibold truncate text-white">
                {channel.name}
              </h4>
              {channel.resolution && (
                <span className="text-[9px] bg-sky-500/10 text-tv-accent border border-sky-500/20 px-1 rounded font-bold font-mono flex-shrink-0">
                  {channel.resolution}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 truncate mt-0.5">
              {channel.stream_type === 'vod'
                ? (channel.group_name || 'Film à la demande')
                : channel.stream_type === 'series'
                ? (channel.group_name || 'Série TV')
                : channel.id === 'ch_tf1'
                ? 'Le Journal de 20h & Météo'
                : channel.id === 'ch_cplus'
                ? 'Oppenheimer (2023) - Exclusivité 4K'
                : channel.id === 'ch_beinsport1'
                ? 'UEFA Champions League : Match en Direct'
                : (channel.group_name || 'Flux en direct HD')}
            </p>
          </div>
        </div>

        {/* Favorite Star */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(channel);
          }}
          className={`p-1.5 rounded-lg flex-shrink-0 ${
            channel.is_favorite
              ? 'text-amber-400 hover:text-amber-300'
              : isFocused
              ? 'text-white/60 hover:text-white'
              : 'text-slate-600 hover:text-slate-400'
          }`}
          title={channel.is_favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
        >
          <Star className={`w-4 h-4 ${channel.is_favorite ? 'fill-amber-400' : ''}`} />
        </button>
      </div>
    );
  },
  (prev, next) => {
    return (
      prev.isFocused === next.isFocused &&
      prev.isActive === next.isActive &&
      prev.channel.id === next.channel.id &&
      prev.channel.num === next.channel.num &&
      prev.channel.name === next.channel.name &&
      prev.channel.is_favorite === next.channel.is_favorite &&
      prev.channel.logo === next.channel.logo &&
      prev.channel.is_separator === next.channel.is_separator
    );
  }
);
ChannelRow.displayName = 'ChannelRow';

// ----------------------------------------------------------------------
// MAIN TVGUIDE COMPONENT WITH VIRTUALIZED WINDOWING & INSTANT SCROLL
// ----------------------------------------------------------------------
export const TVGuide: React.FC<TVGuideProps> = ({
  categories,
  channels,
  selectedCategory,
  focusedCategoryIndex,
  focusedChannelIndex,
  activeChannel,
  currentEpg,
  nextEpg,
  activePane,
  onSelectCategory,
  onSelectChannel,
  onToggleFavorite,
  onToggleFullscreen,
  isStopped,
  onTogglePlayStop,
  categorySort = 'playlist',
  onCategorySortChange,
  channelSort = 'playlist',
  onChannelSortChange,
  onOpenSearch,
  onOpenContextMenu,
  onOpenCategoryManager,
  activeSection = 'live',
  serverCreds,
  boundaryHit,
}) => {
  const channelListRef = useRef<HTMLDivElement | null>(null);
  const categoryListRef = useRef<HTMLDivElement | null>(null);

  // Boundary resistance bounce & floating pill indicators for list carousels
  const [channelBounce, setChannelBounce] = useState<'top' | 'bottom' | null>(null);
  const [channelNotice, setChannelNotice] = useState<'top' | 'bottom' | null>(null);
  const [categoryBounce, setCategoryBounce] = useState<'top' | 'bottom' | null>(null);
  const [categoryNotice, setCategoryNotice] = useState<'top' | 'bottom' | null>(null);

  useEffect(() => {
    if (!boundaryHit) return;
    if (boundaryHit.pane === 'channels') {
      setChannelBounce(boundaryHit.boundary);
      setChannelNotice(boundaryHit.boundary);
      const timerBounce = setTimeout(() => setChannelBounce(null), 180);
      const timerNotice = setTimeout(() => setChannelNotice(null), 1200);
      return () => {
        clearTimeout(timerBounce);
        clearTimeout(timerNotice);
      };
    } else if (boundaryHit.pane === 'categories') {
      setCategoryBounce(boundaryHit.boundary);
      setCategoryNotice(boundaryHit.boundary);
      const timerBounce = setTimeout(() => setCategoryBounce(null), 180);
      const timerNotice = setTimeout(() => setCategoryNotice(null), 1200);
      return () => {
        clearTimeout(timerBounce);
        clearTimeout(timerNotice);
      };
    }
  }, [boundaryHit]);

  useEffect(() => {
    setChannelNotice(null);
    setChannelBounce(null);
  }, [focusedChannelIndex]);

  useEffect(() => {
    setCategoryNotice(null);
    setCategoryBounce(null);
  }, [focusedCategoryIndex]);

  // Rich media preview states for VOD & Séries
  const [mediaDetails, setMediaDetails] = useState<any | null>(null);
  const [loadingMediaDetails, setLoadingMediaDetails] = useState<boolean>(false);
  const detailsCacheRef = useRef<Map<string, any>>(new Map());
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const focusedChannel = channels[focusedChannelIndex] || activeChannel;
  const isSep = isSeparatorChannel(focusedChannel);
  const isMediaItem =
    activeSection === 'vod' ||
    activeSection === 'series' ||
    focusedChannel?.stream_type === 'vod' ||
    focusedChannel?.stream_type === 'series';

  // Debounced media metadata fetcher: fires after staying paused on item for 1.2s
  useEffect(() => {
    if (!focusedChannel || isSep || !isMediaItem) {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      setMediaDetails(null);
      setLoadingMediaDetails(false);
      return;
    }

    // Check in-memory cache for instant display
    const cached = detailsCacheRef.current.get(focusedChannel.id);
    if (cached) {
      setMediaDetails(cached);
      setLoadingMediaDetails(false);
      return;
    }

    setMediaDetails(null);
    setLoadingMediaDetails(false);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    debounceTimerRef.current = setTimeout(async () => {
      if (!serverCreds?.serverUrl || !serverCreds?.username || !serverCreds?.password) {
        return;
      }
      setLoadingMediaDetails(true);
      try {
        let loaded: any = null;
        if (focusedChannel.stream_type === 'series' || activeSection === 'series') {
          const rawId = focusedChannel.id.replace(/^ch_xtream_series_/, '');
          const res = await fetchSeriesInfo(
            serverCreds.serverUrl,
            serverCreds.username,
            serverCreds.password,
            rawId
          );
          if (res && (res.name || res.plot || (res.seasons && res.seasons.length > 0))) {
            loaded = {
              title: res.name || focusedChannel.name,
              plot: res.plot || '',
              cover: res.cover || focusedChannel.logo,
              genre: res.genre,
              releaseDate: res.year,
              rating: res.rating,
              seasonsCount: res.seasons?.length || 0,
              type: 'series',
            };
          }
        } else {
          const rawId = focusedChannel.id.replace(/^ch_xtream_vod_/, '');
          const res = await fetchVodInfo(
            serverCreds.serverUrl,
            serverCreds.username,
            serverCreds.password,
            rawId,
            focusedChannel
          );
          if (res && (res.name || res.plot || res.director)) {
            loaded = {
              title: res.name || focusedChannel.name,
              plot: res.plot || '',
              cover: res.cover || focusedChannel.logo,
              genre: res.genre,
              releaseDate: res.year,
              rating: res.rating,
              duration: res.duration,
              cast: Array.isArray(res.actors) ? res.actors.join(', ') : '',
              director: res.director,
              type: 'vod',
            };
          }
        }

        if (!loaded) {
          loaded = {
            title: focusedChannel.name,
            plot: '',
            cover: focusedChannel.logo,
            type: focusedChannel.stream_type || 'vod',
          };
        }
        detailsCacheRef.current.set(focusedChannel.id, loaded);
        setMediaDetails(loaded);
      } catch (err) {
        console.warn('Failed to load media details in right panel:', err);
        const fallback = {
          title: focusedChannel.name,
          plot: '',
          cover: focusedChannel.logo,
          type: focusedChannel.stream_type || 'vod',
        };
        detailsCacheRef.current.set(focusedChannel.id, fallback);
        setMediaDetails(fallback);
      } finally {
        setLoadingMediaDetails(false);
      }
    }, 350);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [focusedChannel, isSep, isMediaItem, serverCreds, activeSection]);

  // INSTANT AUTO-SCROLL (behavior: 'auto' prevents the 500ms smooth animation stutter on Android TV)
  useEffect(() => {
    if (activePane === 'channels') {
      const el = document.getElementById(`channel-item-${focusedChannelIndex}`);
      if (el) {
        el.scrollIntoView({
          behavior: 'auto',
          block: 'nearest',
        });
      }
    }
  }, [focusedChannelIndex, activePane]);

  useEffect(() => {
    if (activePane === 'categories') {
      const el = document.getElementById(`category-item-${focusedCategoryIndex}`);
      if (el) {
        el.scrollIntoView({
          behavior: 'auto',
          block: 'nearest',
        });
      }
    }
  }, [focusedCategoryIndex, activePane]);

  // VIRTUALIZED WINDOWING FOR LARGE CHANNEL LISTS
  // Limits active DOM elements to at most 60 rows around the focused item for maximum performance
  const ROW_HEIGHT = 54;
  const WINDOW_PAD_TOP = 25;
  const WINDOW_PAD_BOTTOM = 35;

  const totalChannels = channels.length;
  const shouldWindow = totalChannels > 70;

  const startIndex = shouldWindow ? Math.max(0, focusedChannelIndex - WINDOW_PAD_TOP) : 0;
  const endIndex = shouldWindow ? Math.min(totalChannels, focusedChannelIndex + WINDOW_PAD_BOTTOM) : totalChannels;

  const visibleChannels = useMemo(() => {
    return shouldWindow ? channels.slice(startIndex, endIndex) : channels;
  }, [channels, shouldWindow, startIndex, endIndex]);

  const topSpacerHeight = shouldWindow ? startIndex * ROW_HEIGHT : 0;
  const bottomSpacerHeight = shouldWindow ? (totalChannels - endIndex) * ROW_HEIGHT : 0;

  return (
    <div className="flex-1 flex overflow-hidden bg-tv-bg text-slate-100 select-none">
      {/* 1. CATEGORIES COLUMN */}
      <div
        className={`relative w-56 xl:w-64 border-r border-tv-border flex flex-col flex-shrink-0 ${
          activePane === 'categories' ? 'bg-tv-surface/90' : 'bg-tv-surface/40'
        }`}
      >
        {/* Fixed Header with Groups Count and Sort Buttons */}
        <div className="px-3 py-2.5 flex flex-col space-y-1.5 border-b border-tv-border/70 bg-tv-surface flex-shrink-0 z-10 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-400 uppercase tracking-wider">
            <span className="flex items-center space-x-1.5">
              <span>Groupes</span>
              <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-400 font-mono">
                {categories.length}
              </span>
            </span>
            <div className="flex items-center space-x-1">
              {onOpenCategoryManager && (
                <button
                  type="button"
                  onClick={onOpenCategoryManager}
                  className="p-1 px-1.5 rounded-lg bg-tv-card hover:bg-tv-cardHover border border-tv-border text-slate-300 hover:text-white flex items-center space-x-1 text-[10px] font-bold focus:outline-none"
                  title="Organiser l'ordre et masquer des bouquets"
                >
                  <Sliders className="w-3 h-3 text-sky-400" />
                  <span>Ordre</span>
                </button>
              )}
              {onOpenSearch && (
                <button
                  type="button"
                  onClick={onOpenSearch}
                  className="p-1 px-1.5 rounded-lg bg-tv-card hover:bg-tv-cardHover border border-tv-border text-slate-300 hover:text-white flex items-center space-x-1 text-[10px] font-bold focus:outline-none"
                  title="Rechercher"
                >
                  <Search className="w-3 h-3 text-tv-accent" />
                  <span>Chercher</span>
                </button>
              )}
            </div>
          </div>
          {onCategorySortChange && (
            <div className="flex items-center space-x-1 bg-black/40 p-0.5 rounded-md border border-white/5 text-[10px]">
              <button
                type="button"
                onClick={() => onCategorySortChange('playlist')}
                className={`flex-1 py-1 rounded font-semibold text-center transition ${
                  categorySort === 'playlist' ? 'bg-tv-focus text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
                title="Ordre Playlist par défaut"
              >
                Playlist
              </button>
              <button
                type="button"
                onClick={() => onCategorySortChange('alpha')}
                className={`flex-1 py-1 rounded font-semibold text-center transition ${
                  categorySort === 'alpha' ? 'bg-tv-focus text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
                title="Ordre alphabétique"
              >
                A-Z
              </button>
              <button
                type="button"
                onClick={() => onCategorySortChange('count')}
                className={`flex-1 py-1 rounded font-semibold text-center transition ${
                  categorySort === 'count' ? 'bg-tv-focus text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
                title="Trier par nombre de chaînes"
              >
                Nbr
              </button>
            </div>
          )}
        </div>

        {/* Scrollable Categories List */}
        <div
          ref={categoryListRef}
          style={{
            transform:
              categoryBounce === 'bottom'
                ? 'translateY(-8px)'
                : categoryBounce === 'top'
                ? 'translateY(8px)'
                : 'translateY(0)',
            transition: 'transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1)',
          }}
          className="flex-1 flex flex-col py-2 overflow-y-auto overflow-x-hidden"
        >
          {categories.map((cat, idx) => (
            <CategoryRow
              key={cat.id}
              category={cat}
              index={idx}
              isFocused={activePane === 'categories' && focusedCategoryIndex === idx}
              isSelected={selectedCategory?.id === cat.id}
              onSelect={(c, i) => onSelectCategory(c, i, true)}
            />
          ))}
        </div>

        {/* Floating boundary indicator pill for categories */}
        {categoryNotice && (
          <div
            className={`absolute ${
              categoryNotice === 'bottom' ? 'bottom-3' : 'top-14'
            } left-2 right-2 z-30 pointer-events-none transition-all duration-200 animate-in fade-in`}
          >
            <div className="flex items-center justify-center space-x-1.5 px-2.5 py-1.5 rounded-full bg-slate-900/95 border border-sky-500/40 shadow-2xl backdrop-blur-md text-[10px] font-medium text-sky-200 text-center">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse flex-shrink-0" />
              <span className="truncate">
                {categoryNotice === 'bottom'
                  ? 'Fin de liste • Appuyez pour reprendre'
                  : 'Début de liste • Appuyez pour la fin'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 2. CHANNELS LIST COLUMN */}
      <div
        className={`relative flex-1 min-w-[280px] border-r border-tv-border flex flex-col ${
          activePane === 'channels' ? 'bg-tv-bg' : 'bg-tv-bg/80'
        }`}
      >
        {/* Fixed Header with Channel Count and Sort Options */}
        <div className="px-3 py-2.5 flex items-center justify-between border-b border-tv-border/70 bg-tv-bg flex-shrink-0 z-10 shadow-sm">
          <div className="min-w-0 flex-1 mr-2">
            <span className="truncate block text-xs font-semibold text-slate-300 uppercase tracking-wider">
              {selectedCategory?.name || 'Chaînes en direct'}
            </span>
            <span className="text-[10px] text-slate-500 font-mono">
              {channels.length}{' '}
              {selectedCategory?.type === 'series'
                ? 'séries'
                : selectedCategory?.type === 'vod'
                ? 'films'
                : 'chaînes'}
            </span>
          </div>
          {onChannelSortChange && (
            <div className="flex items-center space-x-1 bg-black/40 p-0.5 rounded-md border border-white/5 text-[10px] flex-shrink-0">
              <button
                type="button"
                onClick={() => onChannelSortChange('playlist')}
                className={`px-2 py-1 rounded font-semibold transition ${
                  channelSort === 'playlist' ? 'bg-tv-focus text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
                title="Ordre de la playlist par défaut"
              >
                Playlist
              </button>
              <button
                type="button"
                onClick={() => onChannelSortChange('alpha')}
                className={`px-2 py-1 rounded font-semibold transition ${
                  channelSort === 'alpha' ? 'bg-tv-focus text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
                title="Alphabétique A à Z"
              >
                A-Z
              </button>
              <button
                type="button"
                onClick={() => onChannelSortChange('num')}
                className={`px-2 py-1 rounded font-semibold transition ${
                  channelSort === 'num' ? 'bg-tv-focus text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
                title="Numéro de chaîne"
              >
                N°
              </button>
            </div>
          )}
        </div>

        {/* Scrollable Channels List */}
        <div
          ref={channelListRef}
          style={{
            transform:
              channelBounce === 'bottom'
                ? 'translateY(-8px)'
                : channelBounce === 'top'
                ? 'translateY(8px)'
                : 'translateY(0)',
            transition: 'transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1)',
          }}
          className="flex-1 flex flex-col py-2 overflow-y-auto overflow-x-hidden"
        >

          {channels.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-slate-500">
              {selectedCategory?.id.startsWith('fav') ? (
                <>
                  <Star className="w-10 h-10 mb-2 text-amber-400/50" />
                  <p className="text-sm text-slate-300 font-medium">Aucun favori dans cette catégorie.</p>
                  <p className="text-xs text-slate-500 mt-1 max-w-xs text-center">
                    Appuyez longuement sur un média ou cliquez sur l&apos;étoile pour l&apos;ajouter à vos favoris.
                  </p>
                </>
              ) : (
                <>
                  <Radio className="w-10 h-10 mb-2 opacity-50" />
                  <p className="text-sm">Aucune chaîne dans ce groupe.</p>
                </>
              )}
            </div>
          ) : (
            <div className="flex flex-col">
              {topSpacerHeight > 0 && (
                <div style={{ height: topSpacerHeight }} className="flex-shrink-0" />
              )}
              {visibleChannels.map((ch, relIdx) => {
                const realIdx = startIndex + relIdx;
                const isFocused = activePane === 'channels' && focusedChannelIndex === realIdx;
                const isActive = activeChannel?.id === ch.id;

                return (
                  <ChannelRow
                    key={ch.id}
                    channel={ch}
                    index={realIdx}
                    isFocused={isFocused}
                    isActive={isActive}
                    onSelect={onSelectChannel}
                    onToggleFavorite={onToggleFavorite}
                    onOpenContextMenu={onOpenContextMenu}
                  />
                );
              })}
              {bottomSpacerHeight > 0 && (
                <div style={{ height: bottomSpacerHeight }} className="flex-shrink-0" />
              )}
            </div>
          )}
        </div>

        {/* Floating boundary indicator pill for channels */}
        {channelNotice && (
          <div
            className={`absolute ${
              channelNotice === 'bottom' ? 'bottom-3' : 'top-14'
            } left-4 right-4 z-30 pointer-events-none transition-all duration-200 animate-in fade-in`}
          >
            <div className="flex items-center justify-center space-x-1.5 px-3 py-1.5 rounded-full bg-slate-900/95 border border-sky-500/40 shadow-2xl backdrop-blur-md text-[11px] font-medium text-sky-200 text-center">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse flex-shrink-0" />
              <span className="truncate">
                {channelNotice === 'bottom'
                  ? 'Fin de la liste • Appuyez à nouveau pour reprendre au début'
                  : 'Début de la liste • Appuyez à nouveau pour aller à la fin'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 3. RIGHT COLUMN: PREVIEW PLAYER & DETAILED EPG OR RICH MEDIA DETAILS */}
      <div className="w-80 xl:w-96 flex flex-col p-4 bg-tv-surface/60 overflow-y-auto flex-shrink-0 border-l border-tv-border">
        {isSep ? (
          /* SEPARATOR / SECTION DIVIDER CARD */
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-tv-focus/20 border border-tv-accent/30 flex items-center justify-center mb-4 shadow-xl">
              <Layers className="w-8 h-8 text-tv-accent" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-tv-accent bg-tv-accent/10 px-2.5 py-0.5 rounded-full border border-tv-accent/20 mb-2">
              Séparateur de Bouquet
            </span>
            <h3 className="text-lg font-black text-white leading-tight mb-2">
              {cleanSeparatorName(focusedChannel?.name || 'Séparateur')}
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed mb-6">
              Cet élément est un en-tête thématique inséré dans votre playlist. Il n'émet aucun flux vidéo.
            </p>
            <div className="w-full bg-tv-card/60 p-3 rounded-xl border border-tv-border text-[11px] text-slate-300">
              💡 <span className="font-semibold text-white">Astuce télécommande :</span> Descendez avec la flèche <span className="font-mono text-tv-accent font-bold">▼</span> pour parcourir les chaînes de ce groupe.
            </div>
          </div>
        ) : isMediaItem ? (
          /* RICH MEDIA CARD (FILMS & SÉRIES) */
          <div className="flex-1 flex flex-col space-y-3">
            {/* Poster / Backdrop */}
            <div className="relative w-full aspect-[16/10] rounded-2xl overflow-hidden bg-black/60 border border-tv-border shadow-2xl flex-shrink-0 group">
              {(mediaDetails?.cover || focusedChannel?.logo) ? (
                <img
                  src={mediaDetails?.cover || focusedChannel?.logo}
                  alt={focusedChannel?.name}
                  className="w-full h-full object-cover object-top"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-slate-900/80">
                  {activeSection === 'series' || focusedChannel?.stream_type === 'series' ? (
                    <Clapperboard className="w-12 h-12 text-slate-700" />
                  ) : (
                    <Film className="w-12 h-12 text-slate-700" />
                  )}
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-tv-bg via-transparent to-black/30 pointer-events-none" />

              {/* Type badge */}
              <div className="absolute top-2.5 left-2.5 flex items-center space-x-1.5">
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-tv-accent text-slate-950 shadow-md">
                  {activeSection === 'series' || focusedChannel?.stream_type === 'series' ? 'Série' : 'Film VOD'}
                </span>
                {focusedChannel?.resolution && (
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-black/70 text-white border border-white/20">
                    {focusedChannel.resolution}
                  </span>
                )}
              </div>

              {/* Favorite toggle badge */}
              {focusedChannel && (
                <button
                  type="button"
                  onClick={() => onToggleFavorite(focusedChannel)}
                  className="absolute top-2.5 right-2.5 p-1.5 rounded-full bg-black/60 hover:bg-black/90 text-amber-400 border border-white/10 transition shadow-lg"
                  title="Ajouter aux favoris"
                >
                  <Star className={`w-4 h-4 ${focusedChannel.is_favorite ? 'fill-amber-400' : ''}`} />
                </button>
              )}
            </div>

            {/* Title & Metadata */}
            <div>
              <h3 className="text-base font-bold text-white leading-snug line-clamp-2">
                {mediaDetails?.title || focusedChannel?.name}
              </h3>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mt-1.5">
                {mediaDetails?.releaseDate && (
                  <span className="flex items-center space-x-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-500" />
                    <span>{String(mediaDetails.releaseDate).slice(0, 4)}</span>
                  </span>
                )}
                {mediaDetails?.duration && (
                  <span className="flex items-center space-x-1 font-mono">
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    <span>{mediaDetails.duration}</span>
                  </span>
                )}
                {mediaDetails?.seasonsCount && mediaDetails.seasonsCount > 0 && (
                  <span className="font-mono text-tv-accent font-semibold">
                    {mediaDetails.seasonsCount} {mediaDetails.seasonsCount > 1 ? 'Saisons' : 'Saison'}
                  </span>
                )}
                {mediaDetails?.rating && Number(mediaDetails.rating) > 0 && (
                  <span className="flex items-center space-x-1 text-amber-400 font-bold font-mono">
                    <Star className="w-3 h-3 fill-amber-400" />
                    <span>{Number(mediaDetails.rating).toFixed(1)}/10</span>
                  </span>
                )}
              </div>

              {mediaDetails?.genre && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {String(mediaDetails.genre).split(/[,/]/).slice(0, 3).map((g, idx) => (
                    <span key={idx} className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-md font-medium">
                      {g.trim()}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Synopsis / Plot */}
            <div className="flex-1 bg-tv-card/60 p-3 rounded-xl border border-tv-border/60 overflow-y-auto">
              {loadingMediaDetails ? (
                <div className="flex items-center space-x-2 text-xs text-slate-400 py-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-tv-accent" />
                  <span>Chargement des détails...</span>
                </div>
              ) : mediaDetails?.plot ? (
                <p className="text-xs leading-relaxed text-slate-300">
                  {mediaDetails.plot}
                </p>
              ) : (
                <p className="text-xs leading-relaxed text-slate-500 italic">
                  Aucun résumé disponible pour ce titre.
                </p>
              )}

              {mediaDetails?.director && (
                <div className="mt-2.5 pt-2 border-t border-white/5 text-[11px] text-slate-400">
                  <span className="text-slate-500 font-semibold">De : </span>
                  <span className="text-slate-200">{mediaDetails.director}</span>
                </div>
              )}

              {mediaDetails?.cast && (
                <div className="mt-1 text-[11px] text-slate-400 line-clamp-2">
                  <span className="text-slate-500 font-semibold">Avec : </span>
                  <span className="text-slate-300">{mediaDetails.cast}</span>
                </div>
              )}
            </div>

            {/* Primary Action Button */}
            {focusedChannel && (
              <button
                type="button"
                onClick={() => onSelectChannel(focusedChannel, focusedChannelIndex)}
                className="w-full py-2.5 bg-tv-focus hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition shadow-lg flex items-center justify-center space-x-2 mt-auto"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>
                  {activeSection === 'series' || focusedChannel.stream_type === 'series'
                    ? 'Voir les épisodes (OK)'
                    : 'Lancer le film (OK)'}
                </span>
              </button>
            )}
          </div>
        ) : (
          /* LIVE TV PREVIEW & EPG */
          <div className="flex-1 flex flex-col space-y-3">
            {/* Live Preview Video Player */}
            <div className="w-full aspect-video rounded-xl overflow-hidden shadow-2xl border border-tv-border bg-black mb-1 flex-shrink-0">
              <LiveVideoPlayer
                channel={activeChannel}
                currentEpg={currentEpg}
                nextEpg={nextEpg}
                isFullscreen={false}
                onToggleFullscreen={onToggleFullscreen}
                isStopped={isStopped}
                onTogglePlayStop={onTogglePlayStop}
              />
            </div>

            {/* EPG Program details */}
            <div className="flex items-center space-x-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
              <Info className="w-4 h-4 text-tv-accent" />
              <span>Guide du Programme</span>
            </div>

            {currentEpg ? (
              <div className="space-y-3 flex-1 flex flex-col">
                <div>
                  <div className="flex items-center space-x-2 text-xs text-tv-accent font-semibold mb-1">
                    <span>{currentEpg.category || 'En direct'}</span>
                    {currentEpg.rating && (
                      <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded">
                        {currentEpg.rating}
                      </span>
                    )}
                  </div>
                  <h3 className="text-base font-bold text-white leading-snug">
                    {currentEpg.title}
                  </h3>
                  <div className="flex items-center space-x-2 text-xs text-slate-400 font-mono mt-1">
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    <span>
                      {new Date(currentEpg.start).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}{' '}
                      -{' '}
                      {new Date(currentEpg.end).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="text-slate-600">•</span>
                    <span>{currentEpg.duration_min} min</span>
                  </div>
                </div>

                {/* Synopsis */}
                <div className="bg-tv-card/60 p-3 rounded-xl border border-tv-border/60">
                  <p className="text-xs leading-relaxed text-slate-300 line-clamp-4">
                    {currentEpg.description}
                  </p>
                </div>

                {/* Next program */}
                {nextEpg && (
                  <div className="p-2.5 bg-tv-card/30 rounded-xl border border-tv-border/40">
                    <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-0.5">
                      À suivre
                    </div>
                    <div className="text-xs font-semibold text-slate-200 truncate">
                      {nextEpg.title}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      {new Date(nextEpg.start).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={onToggleFullscreen}
                  className="w-full py-2 bg-tv-focus hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition shadow-lg mt-auto"
                >
                  Passer en plein écran (Entrée)
                </button>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-center p-4">
                <Clock className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-xs">Sélectionnez une chaîne pour afficher les détails.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
