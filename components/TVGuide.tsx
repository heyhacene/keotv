'use client';

import React, { useEffect, useRef, useMemo } from 'react';
import { Channel, Category, EpgProgram, NavigationPane } from '@/types/iptv';
import { Star, Tv, Trophy, Film, Globe, Compass, Clock, Radio, Info, Search, Lock, Sliders } from 'lucide-react';
import { LiveVideoPlayer } from './LiveVideoPlayer';

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
  onToggleFavorite: (channel: Channel) => void;
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
}

// Helper for category icons
function renderCategoryIcon(iconName?: string, isAdult?: boolean) {
  if (isAdult || iconName === 'Lock') {
    return <Lock className="w-4 h-4 text-rose-400 flex-shrink-0" />;
  }
  switch (iconName) {
    case 'Star':
      return <Star className="w-4 h-4 text-amber-400 flex-shrink-0" />;
    case 'Trophy':
      return <Trophy className="w-4 h-4 text-rose-400 flex-shrink-0" />;
    case 'Film':
      return <Film className="w-4 h-4 text-purple-400 flex-shrink-0" />;
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
        className={`flex items-center justify-between px-3 py-2.5 mx-2 my-0.5 rounded-xl text-left text-sm border cursor-pointer select-none ${
          isFocused
            ? 'bg-tv-focus border-tv-accent text-white font-black ring-2 ring-tv-accent ring-offset-1 ring-offset-tv-bg z-10'
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
  onToggleFavorite: (channel: Channel) => void;
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
        className={`flex items-center justify-between px-3.5 py-2 mx-2 my-0.5 rounded-xl cursor-pointer border select-none ${
          isFocused
            ? 'bg-tv-focus border-tv-accent text-white font-bold ring-2 ring-tv-accent ring-offset-1 ring-offset-tv-bg z-10'
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
              {channel.id === 'ch_tf1'
                ? 'Le Journal de 20h & Météo'
                : channel.id === 'ch_cplus'
                ? 'Oppenheimer (2023) - Exclusivité 4K'
                : channel.id === 'ch_beinsport1'
                ? 'UEFA Champions League : Match en Direct'
                : 'Programme en direct HD'}
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
      prev.channel.logo === next.channel.logo
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
}) => {
  const channelListRef = useRef<HTMLDivElement | null>(null);
  const categoryListRef = useRef<HTMLDivElement | null>(null);

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
        ref={categoryListRef}
        className={`w-56 xl:w-64 border-r border-tv-border flex flex-col py-2.5 overflow-y-auto overflow-x-hidden flex-shrink-0 ${
          activePane === 'categories' ? 'bg-tv-surface/90' : 'bg-tv-surface/40'
        }`}
      >
        <div className="px-3 pb-2 mb-1 flex flex-col space-y-1.5 border-b border-tv-border/50">
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
                className={`flex-1 py-0.5 rounded font-semibold text-center ${
                  categorySort === 'playlist' ? 'bg-tv-focus text-white' : 'text-slate-400 hover:text-white'
                }`}
                title="Ordre Playlist par défaut"
              >
                Playlist
              </button>
              <button
                type="button"
                onClick={() => onCategorySortChange('alpha')}
                className={`flex-1 py-0.5 rounded font-semibold text-center ${
                  categorySort === 'alpha' ? 'bg-tv-focus text-white' : 'text-slate-400 hover:text-white'
                }`}
                title="Ordre alphabétique"
              >
                A-Z
              </button>
              <button
                type="button"
                onClick={() => onCategorySortChange('count')}
                className={`flex-1 py-0.5 rounded font-semibold text-center ${
                  categorySort === 'count' ? 'bg-tv-focus text-white' : 'text-slate-400 hover:text-white'
                }`}
                title="Trier par nombre de chaînes"
              >
                Nbr
              </button>
            </div>
          )}
        </div>

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

      {/* 2. CHANNELS LIST COLUMN */}
      <div
        ref={channelListRef}
        className={`flex-1 min-w-[280px] border-r border-tv-border flex flex-col py-2.5 overflow-y-auto overflow-x-hidden ${
          activePane === 'channels' ? 'bg-tv-bg' : 'bg-tv-bg/80'
        }`}
      >
        <div className="px-3 pb-2 mb-1 flex items-center justify-between border-b border-tv-border/50">
          <div className="min-w-0 flex-1 mr-2">
            <span className="truncate block text-xs font-semibold text-slate-300 uppercase tracking-wider">
              {selectedCategory?.name || 'Chaînes en direct'}
            </span>
            <span className="text-[10px] text-slate-500 font-mono">
              {channels.length} chaînes
            </span>
          </div>
          {onChannelSortChange && (
            <div className="flex items-center space-x-1 bg-black/40 p-0.5 rounded-md border border-white/5 text-[10px] flex-shrink-0">
              <button
                type="button"
                onClick={() => onChannelSortChange('playlist')}
                className={`px-2 py-0.5 rounded font-semibold ${
                  channelSort === 'playlist' ? 'bg-tv-focus text-white' : 'text-slate-400 hover:text-white'
                }`}
                title="Ordre de la playlist par défaut"
              >
                Playlist
              </button>
              <button
                type="button"
                onClick={() => onChannelSortChange('alpha')}
                className={`px-2 py-0.5 rounded font-semibold ${
                  channelSort === 'alpha' ? 'bg-tv-focus text-white' : 'text-slate-400 hover:text-white'
                }`}
                title="Alphabétique A à Z"
              >
                A-Z
              </button>
              <button
                type="button"
                onClick={() => onChannelSortChange('num')}
                className={`px-2 py-0.5 rounded font-semibold ${
                  channelSort === 'num' ? 'bg-tv-focus text-white' : 'text-slate-400 hover:text-white'
                }`}
                title="Numéro de chaîne"
              >
                N°
              </button>
            </div>
          )}
        </div>

        {channels.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-slate-500">
            <Radio className="w-10 h-10 mb-2 opacity-50" />
            <p className="text-sm">Aucune chaîne dans ce groupe.</p>
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

      {/* 3. RIGHT COLUMN: PREVIEW PLAYER & DETAILED EPG */}
      <div className="w-80 xl:w-96 flex flex-col p-4 bg-tv-surface/60 overflow-y-auto flex-shrink-0">
        {/* Live Preview Video Player */}
        <div className="w-full aspect-video rounded-xl overflow-hidden shadow-2xl border border-tv-border bg-black mb-3 flex-shrink-0">
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
        <div className="flex items-center space-x-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
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
    </div>
  );
};
