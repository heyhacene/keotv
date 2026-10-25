'use client';

import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
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
  Calendar,
  Clapperboard,
  Loader2,
  Play,
  RotateCcw,
  ChevronRight,
  ChevronLeft,
  Sparkles,
} from 'lucide-react';
import { LiveVideoPlayer } from './LiveVideoPlayer';
import {
  isSeparatorChannel,
  cleanSeparatorName,
  fetchVodInfo,
  fetchSeriesInfo,
} from '@/lib/iptv-service';
import { EPGService } from '@/lib/epg-service';
import { getMockTimelineForChannel } from '@/lib/mock-data';

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
  onOpenCatchupModal?: (channel: Channel) => void;
  onPlayCatchupProgram?: (program: EpgProgram, channel: Channel) => void;
  focusedCategoryHeaderIndex?: number;
  focusedChannelHeaderIndex?: number;
  focusedRightPanelIndex?: number;
  focusedProgramOffset?: number;
  onFocusProgramOffsetChange?: (offset: number) => void;
  isPastUnlocked?: boolean;
  onTogglePastUnlocked?: (unlocked: boolean) => void;
  onEnterEpgGrid?: (channelIndex: number, offset: number) => void;
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

function formatTimeHHMM(isoStr?: string): string {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr.slice(0, 5);
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function getProgramProgress(prog: EpgProgram): number {
  try {
    const now = Date.now();
    const s = new Date(prog.start).getTime();
    const e = new Date(prog.end).getTime();
    if (e <= s) return 50;
    if (now <= s) return 0;
    if (now >= e) return 100;
    return Math.round(((now - s) / (e - s)) * 100);
  } catch {
    return 50;
  }
}

/**
 * Organizes a channel's EPG list into relative offsets around the current live program (offset 0):
 * - offsets -3, -2, -1: past programs (Replay / Catchup)
 * - offset 0: current live program ("En direct")
 * - offsets +1, +2, +3, +4: upcoming programs ("À suivre")
 */
export function buildProgramSlotsForChannel(
  channel: Channel,
  realEpgList?: EpgProgram[]
): Record<number, EpgProgram> {
  const list =
    realEpgList && realEpgList.length > 0
      ? realEpgList
      : getMockTimelineForChannel(channel.id, channel.name);

  const nowMs = Date.now();
  let liveIdx = list.findIndex((p) => {
    const s = new Date(p.start).getTime();
    const e = new Date(p.end).getTime();
    return s <= nowMs && e > nowMs;
  });

  if (liveIdx === -1) {
    // Find closest to now
    let bestDiff = Infinity;
    list.forEach((p, idx) => {
      const s = new Date(p.start).getTime();
      const diff = Math.abs(s - nowMs);
      if (diff < bestDiff) {
        bestDiff = diff;
        liveIdx = idx;
      }
    });
  }

  if (liveIdx === -1) liveIdx = 0;

  const slots: Record<number, EpgProgram> = {};
  for (let offset = -3; offset <= 4; offset++) {
    const targetIdx = liveIdx + offset;
    if (targetIdx >= 0 && targetIdx < list.length) {
      slots[offset] = list[targetIdx];
    }
  }

  // Ensure offset 0 and +1..+3 always exist by filling from mock if server returned only 1-2 items
  if (!slots[0] || !slots[1] || !slots[-1]) {
    const fallback = getMockTimelineForChannel(channel.id, channel.name);
    const fbLiveIdx = 3; // mock timeline has 3 past, 1 current (index 3), 3 future
    for (let offset = -3; offset <= 3; offset++) {
      if (!slots[offset] && fallback[fbLiveIdx + offset]) {
        slots[offset] = fallback[fbLiveIdx + offset];
      }
    }
  }

  return slots;
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
// MEMOIZED TIVIMATE CHANNEL + HORIZONTAL PROGRAM TIMELINE ROW (LIVE TV)
// ----------------------------------------------------------------------
interface TiviMateTimelineRowProps {
  channel: Channel;
  index: number;
  isChannelFocused: boolean;
  isEpgRowFocused: boolean;
  focusedProgramOffset: number;
  visibleOffsets: number[];
  isPastUnlocked: boolean;
  isActive: boolean;
  programSlots: Record<number, EpgProgram>;
  onSelectChannel: (channel: Channel, index: number) => void;
  onSelectProgramCell: (channel: Channel, index: number, offset: number, prog?: EpgProgram) => void;
  onToggleFavorite: (channel: Channel, explicitNewState?: boolean) => void;
  onOpenContextMenu?: (channel: Channel) => void;
}

const TiviMateTimelineRow = React.memo<TiviMateTimelineRowProps>(
  ({
    channel,
    index,
    isChannelFocused,
    isEpgRowFocused,
    focusedProgramOffset,
    visibleOffsets,
    isPastUnlocked,
    isActive,
    programSlots,
    onSelectChannel,
    onSelectProgramCell,
    onToggleFavorite,
    onOpenContextMenu,
  }) => {
    const isSep = channel.is_separator ?? isSeparatorChannel(channel);
    const hasReplay = Boolean(channel.has_archive);

    if (isSep) {
      const cleanLabel = cleanSeparatorName(channel.name);
      return (
        <div
          id={`channel-item-${index}`}
          onClick={() => onSelectChannel(channel, index)}
          onContextMenu={(e) => {
            e.preventDefault();
            onOpenContextMenu?.(channel);
          }}
          className={`flex items-center justify-between px-3.5 py-1.5 mx-2 my-1 rounded-xl select-none cursor-default transition-all duration-75 ${
            isChannelFocused || isEpgRowFocused
              ? 'bg-tv-focus text-white font-bold ring-2 ring-tv-accent shadow-md'
              : 'bg-white/5 border border-white/5 text-slate-400 font-semibold'
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
        onContextMenu={(e) => {
          e.preventDefault();
          onOpenContextMenu?.(channel);
        }}
        className={`flex items-stretch mx-2 my-0.5 rounded-xl border transition-colors select-none ${
          isChannelFocused
            ? 'bg-tv-card/90 border-white/80 shadow-lg'
            : isEpgRowFocused
            ? 'bg-tv-card/80 border-tv-accent/60 shadow-md'
            : isActive
            ? 'bg-tv-card/65 border-tv-accent/40'
            : 'bg-tv-card/30 border-white/5 hover:bg-tv-card/50'
        }`}
      >
        {/* LEFT PART: CHANNEL CELL (Num + Logo + Name + Badges) */}
        <div
          onClick={() => onSelectChannel(channel, index)}
          className={`w-56 xl:w-64 flex-shrink-0 flex items-center justify-between px-3 py-2 rounded-l-xl cursor-pointer border-r border-white/5 transition-all ${
            isChannelFocused
              ? 'bg-tv-focus text-white font-bold ring-4 ring-white z-20 shadow-xl scale-[1.01]'
              : isEpgRowFocused
              ? 'bg-tv-surface/90 text-white font-bold'
              : 'text-slate-200 hover:bg-white/5'
          }`}
        >
          <div className="flex items-center space-x-2.5 min-w-0 flex-1">
            <span
              className={`text-xs font-mono font-bold w-6 text-right flex-shrink-0 ${
                isChannelFocused ? 'text-white font-black' : isActive ? 'text-tv-accent' : 'text-slate-500'
              }`}
            >
              {channel.num}
            </span>
            <div className="w-8 h-8 rounded-lg bg-black/50 border border-white/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
              {channel.logo ? (
                <img
                  src={channel.logo}
                  alt={channel.name}
                  loading="lazy"
                  className="w-full h-full object-contain p-0.5"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <span className="text-[10px] font-bold text-slate-400">{channel.name.slice(0, 3)}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center space-x-1.5">
                <h4 className="text-xs font-bold truncate text-white">{channel.name}</h4>
              </div>
              <div className="flex items-center space-x-1.5 mt-0.5">
                {channel.resolution && (
                  <span
                    className={`text-[8px] px-1 rounded font-bold font-mono ${
                      isChannelFocused
                        ? 'bg-black/30 text-white'
                        : 'bg-sky-500/15 text-tv-accent border border-sky-500/20'
                    }`}
                  >
                    {channel.resolution}
                  </span>
                )}
                {hasReplay && (
                  <span
                    className={`text-[8px] px-1 rounded font-bold uppercase tracking-wider flex items-center space-x-0.5 ${
                      isChannelFocused
                        ? 'bg-emerald-900/60 text-emerald-200 border border-emerald-300/40'
                        : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    }`}
                    title="Replay disponible"
                  >
                    <RotateCcw className="w-2.5 h-2.5 mr-0.5" />
                    <span>Replay</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Favorite Star */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(channel);
            }}
            className={`p-1 rounded-lg flex-shrink-0 ml-1 ${
              channel.is_favorite
                ? 'text-amber-400 hover:text-amber-300'
                : isChannelFocused
                ? 'text-white/60 hover:text-white'
                : 'text-slate-600 hover:text-slate-400'
            }`}
            title={channel.is_favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          >
            <Star className={`w-3.5 h-3.5 ${channel.is_favorite ? 'fill-amber-400' : ''}`} />
          </button>
        </div>

        {/* RIGHT PART: HORIZONTAL CHRONOLOGICAL PROGRAM TIMELINE CELLS */}
        <div className="flex-1 flex items-stretch overflow-hidden p-1 gap-1 bg-black/20 rounded-r-xl">
          {visibleOffsets.map((offset) => {
            const prog = programSlots[offset];
            const isCellFocused = isEpgRowFocused && focusedProgramOffset === offset;
            const isLiveProg = offset === 0;
            const isPastProg = offset < 0;
            const progress = isLiveProg && prog ? getProgramProgress(prog) : 0;

            return (
              <div
                key={offset}
                onClick={() => onSelectProgramCell(channel, index, offset, prog)}
                className={`flex-1 min-w-0 px-2.5 py-1.5 rounded-lg cursor-pointer flex flex-col justify-between transition-all relative overflow-hidden ${
                  isCellFocused
                    ? isPastProg
                      ? 'bg-emerald-600 text-white ring-4 ring-white z-20 shadow-2xl scale-[1.01] font-bold'
                      : 'bg-tv-focus text-white ring-4 ring-white z-20 shadow-2xl scale-[1.01] font-bold'
                    : isLiveProg
                    ? isChannelFocused
                      ? 'bg-sky-500/20 border border-sky-400/40 text-white'
                      : 'bg-white/[0.06] border border-white/10 text-slate-200 hover:bg-white/10'
                    : isPastProg
                    ? 'bg-emerald-950/30 border border-emerald-500/20 text-emerald-200/90 hover:bg-emerald-900/40'
                    : 'bg-white/[0.02] border border-white/5 text-slate-400 hover:bg-white/[0.06]'
                }`}
              >
                {/* Top line: Time range + status pill */}
                <div className="flex items-center justify-between text-[10px] font-mono leading-none mb-0.5">
                  <span className={isCellFocused ? 'text-white font-bold' : isLiveProg ? 'text-tv-accent font-semibold' : 'text-slate-400'}>
                    {prog ? `${formatTimeHHMM(prog.start)} - ${formatTimeHHMM(prog.end)}` : '--:--'}
                  </span>
                  {isPastProg && (
                    <span
                      className={`text-[8px] px-1 py-0.2 rounded uppercase font-sans font-black flex items-center space-x-0.5 ${
                        isCellFocused ? 'bg-black/30 text-white' : 'bg-emerald-500/20 text-emerald-300'
                      }`}
                    >
                      <RotateCcw className="w-2.5 h-2.5 mr-0.5" />
                      <span>Replay</span>
                    </span>
                  )}
                  {isLiveProg && (
                    <span
                      className={`text-[8px] px-1 py-0.2 rounded uppercase font-sans font-black ${
                        isCellFocused ? 'bg-black/30 text-white' : 'bg-sky-500/20 text-sky-300'
                      }`}
                    >
                      Direct
                    </span>
                  )}
                </div>

                {/* Program Title */}
                <div className="text-xs font-semibold truncate leading-tight">
                  {prog ? prog.title : 'Programme TV'}
                </div>

                {/* Progress bar for current live program */}
                {isLiveProg && (
                  <div className="w-full h-1 bg-black/40 rounded-full overflow-hidden mt-1">
                    <div
                      className={`h-full rounded-full ${
                        isCellFocused ? 'bg-white' : 'bg-gradient-to-r from-sky-400 to-tv-accent'
                      }`}
                      style={{ width: `${Math.max(6, progress)}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }
);
TiviMateTimelineRow.displayName = 'TiviMateTimelineRow';

// ----------------------------------------------------------------------
// MEMOIZED CHANNEL ROW FOR VOD & SERIES (WITH RIGHT DETAILS PANEL)
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
    const isSep = channel.is_separator ?? isSeparatorChannel(channel);

    if (isSep) {
      const cleanLabel = cleanSeparatorName(channel.name);
      return (
        <div
          id={`channel-item-${index}`}
          onClick={() => onSelect(channel, index)}
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
        className={`flex items-center justify-between px-3.5 py-2 mx-2 my-0.5 rounded-xl cursor-pointer border select-none outline-none ${
          isFocused
            ? 'bg-tv-focus border-white text-white font-bold ring-4 ring-white z-10 shadow-lg scale-[1.02] transition-transform duration-75'
            : isActive
            ? 'bg-tv-card border-tv-accent/50 text-slate-100'
            : 'bg-tv-card/40 border-transparent hover:bg-tv-cardHover/50 text-slate-300'
        }`}
      >
        <div className="flex items-center space-x-3 min-w-0 flex-1">
          <span
            className={`text-xs font-mono font-bold w-6 text-right flex-shrink-0 ${
              isFocused ? 'text-white font-black' : 'text-slate-500'
            }`}
          >
            {channel.num}
          </span>
          <div className="w-9 h-13 rounded-lg bg-black/40 border border-white/5 flex items-center justify-center flex-shrink-0 overflow-hidden">
            {channel.logo ? (
              <img
                src={channel.logo}
                alt={channel.name}
                loading="lazy"
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            ) : (
              <span className="text-[11px] font-bold text-slate-400">{channel.name.slice(0, 3)}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center space-x-2">
              <h4 className="text-sm font-semibold truncate text-white">{channel.name}</h4>
              {channel.resolution && (
                <span className="text-[9px] bg-sky-500/10 text-tv-accent border border-sky-500/20 px-1 rounded font-bold font-mono flex-shrink-0">
                  {channel.resolution}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 truncate mt-0.5">
              {channel.stream_type === 'vod'
                ? channel.group_name || 'Film à la demande'
                : channel.group_name || 'Série TV'}
            </p>
          </div>
        </div>

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
  }
);
ChannelRow.displayName = 'ChannelRow';

// ----------------------------------------------------------------------
// MAIN TVGUIDE COMPONENT
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
  onOpenCatchupModal,
  onPlayCatchupProgram,
  focusedCategoryHeaderIndex = 2,
  focusedChannelHeaderIndex = 0,
  focusedRightPanelIndex = 0,
  focusedProgramOffset = 0,
  onFocusProgramOffsetChange,
  isPastUnlocked = false,
  onTogglePastUnlocked,
  onEnterEpgGrid,
  activeSection = 'live',
  serverCreds,
  boundaryHit,
}) => {
  const channelListRef = useRef<HTMLDivElement | null>(null);
  const categoryListRef = useRef<HTMLDivElement | null>(null);

  // Boundary resistance bounce & floating pill indicators
  const [channelBounce, setChannelBounce] = useState<'top' | 'bottom' | null>(null);
  const [channelNotice, setChannelNotice] = useState<'top' | 'bottom' | null>(null);
  const [categoryBounce, setCategoryBounce] = useState<'top' | 'bottom' | null>(null);
  const [categoryNotice, setCategoryNotice] = useState<'top' | 'bottom' | null>(null);

  // Per-channel EPG cache populated dynamically for visible channels
  const [channelEpgMap, setChannelEpgMap] = useState<Record<string, EpgProgram[]>>({});
  const fetchedChannelIdsRef = useRef<Set<string>>(new Set());

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

  const focusedChannel = channels[focusedChannelIndex] || activeChannel;
  const isSep = isSeparatorChannel(focusedChannel);

  // Determine if we are in Live TV TiviMate Timeline Mode vs VOD/Series Mode
  const isVodOrSeriesSection =
    activeSection === 'vod' ||
    activeSection === 'series' ||
    selectedCategory?.type === 'vod' ||
    selectedCategory?.type === 'series';

  const isLiveTimelineMode = !isVodOrSeriesSection;

  // In TiviMate Live Timeline Mode: when activePane === 'epg_grid', the left Bouquets/Categories column collapses!
  const isCategoriesCollapsed = isLiveTimelineMode && activePane === 'epg_grid';

  // Rich media preview states for VOD & Séries (only used when isVodOrSeriesSection is true)
  const [mediaDetails, setMediaDetails] = useState<any | null>(null);
  const [loadingMediaDetails, setLoadingMediaDetails] = useState<boolean>(false);
  const detailsCacheRef = useRef<Map<string, any>>(new Map());
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!focusedChannel || isSep || !isVodOrSeriesSection) {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      setMediaDetails(null);
      setLoadingMediaDetails(false);
      return;
    }

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
      } catch {
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
  }, [focusedChannel, isSep, isVodOrSeriesSection, serverCreds, activeSection]);

  // INSTANT AUTO-SCROLL
  useEffect(() => {
    if (activePane === 'channels' || activePane === 'epg_grid') {
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
  const ROW_HEIGHT = 56;
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

  // Background batch-loader for real Xtream EPG of channels around focusedChannelIndex
  useEffect(() => {
    if (!isLiveTimelineMode || !serverCreds?.serverUrl || !serverCreds?.username || !serverCreds?.password) {
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      // Prioritize focused channel and its immediate neighbors (-3 to +6)
      const sliceStart = Math.max(0, focusedChannelIndex - 2);
      const sliceEnd = Math.min(channels.length, focusedChannelIndex + 6);
      const batch = channels.slice(sliceStart, sliceEnd).filter((ch) => {
        if (!ch || ch.is_separator || isSeparatorChannel(ch)) return false;
        if (fetchedChannelIdsRef.current.has(ch.id)) return false;
        return true;
      });

      for (const ch of batch) {
        if (cancelled) break;
        fetchedChannelIdsRef.current.add(ch.id);
        const streamId = ch.stream_id || (ch.id.match(/\d+$/) ? ch.id.match(/\d+$/)![0] : null);
        if (!streamId) continue;

        try {
          const programs = await EPGService.fetchXtreamFullEpg({
            serverUrl: serverCreds.serverUrl,
            username: serverCreds.username,
            password: serverCreds.password,
            streamId,
            channelId: ch.id,
          });
          if (!cancelled && programs.length > 0) {
            setChannelEpgMap((prev) => ({
              ...prev,
              [ch.id]: programs,
            }));
          }
        } catch {}
      }
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isLiveTimelineMode, focusedChannelIndex, channels, serverCreds]);

  // Compute which 3 or 4 horizontal program offsets are displayed in the timeline row
  const visibleOffsets = useMemo(() => {
    if (activePane === 'epg_grid') {
      if (isPastUnlocked || focusedProgramOffset < 0) {
        // Show past window around focusedProgramOffset, e.g. [-3, -2, -1, 0] or [-2, -1, 0, 1]
        const start = Math.max(-3, Math.min(focusedProgramOffset - 1, -2));
        return [start, start + 1, start + 2, start + 3];
      }
      if (focusedProgramOffset >= 2) {
        const start = Math.min(1, focusedProgramOffset - 1);
        return [start, start + 1, start + 2, start + 3];
      }
      return [0, 1, 2, 3];
    }
    // When in categories or channels pane (bouquets visible on the left): show [En direct (0), À suivre (+1), Plus tard (+2)]
    return [0, 1, 2];
  }, [activePane, focusedProgramOffset, isPastUnlocked]);

  // Focused channel's program slots and currently highlighted program details for the Top TiviMate Info Header
  const focusedChannelSlots = useMemo(() => {
    if (!focusedChannel || isSep) return {};
    return buildProgramSlotsForChannel(focusedChannel, channelEpgMap[focusedChannel.id]);
  }, [focusedChannel, isSep, channelEpgMap]);

  const activeDisplayedProgram: EpgProgram | null = useMemo(() => {
    if (!focusedChannel || isSep) return null;
    const offset = activePane === 'epg_grid' ? focusedProgramOffset : 0;
    return focusedChannelSlots[offset] || focusedChannelSlots[0] || currentEpg;
  }, [focusedChannel, isSep, activePane, focusedProgramOffset, focusedChannelSlots, currentEpg]);

  const handleSelectProgramCell = useCallback(
    (ch: Channel, chIdx: number, offset: number, prog?: EpgProgram) => {
      onEnterEpgGrid?.(chIdx, offset);
      if (offset < 0 && prog && onPlayCatchupProgram) {
        onPlayCatchupProgram(prog, ch);
      } else {
        onSelectChannel(ch, chIdx);
      }
    },
    [onEnterEpgGrid, onPlayCatchupProgram, onSelectChannel]
  );

  return (
    <div className="flex-1 flex overflow-hidden bg-tv-bg text-slate-100 select-none">
      {/* 1. CATEGORIES / BOUQUETS COLUMN (Automatically collapses in TiviMate EPG Timeline mode when pressing DPAD_RIGHT!) */}
      {!isCategoriesCollapsed && (
        <div
          className={`relative w-56 xl:w-64 border-r border-tv-border flex flex-col flex-shrink-0 transition-all duration-150 ${
            activePane === 'categories' || activePane === 'category_header' ? 'bg-tv-surface/90' : 'bg-tv-surface/40'
          }`}
        >
          {/* Fixed Header with Groups Count and Sort Buttons */}
          <div className="px-3 py-2.5 flex flex-col space-y-1.5 border-b border-tv-border/70 bg-tv-surface flex-shrink-0 z-10 shadow-sm">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-400 uppercase tracking-wider">
              <span className="flex items-center space-x-1.5">
                <span>Bouquets</span>
                <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-400 font-mono">
                  {categories.length}
                </span>
              </span>
              <div className="flex items-center space-x-1">
                {onOpenCategoryManager && (
                  <button
                    type="button"
                    onClick={onOpenCategoryManager}
                    className={`p-1 px-1.5 rounded-lg border text-[10px] font-bold transition flex items-center space-x-1 outline-none ${
                      activePane === 'category_header' && focusedCategoryHeaderIndex === 0
                        ? 'bg-tv-focus border-white text-white font-black ring-4 ring-white shadow-xl scale-105 z-20'
                        : 'bg-tv-card hover:bg-tv-cardHover border-tv-border text-slate-300 hover:text-white'
                    }`}
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
                    className={`p-1 px-1.5 rounded-lg border text-[10px] font-bold transition flex items-center space-x-1 outline-none ${
                      activePane === 'category_header' && focusedCategoryHeaderIndex === 1
                        ? 'bg-tv-focus border-white text-white font-black ring-4 ring-white shadow-xl scale-105 z-20'
                        : 'bg-tv-card hover:bg-tv-cardHover border-tv-border text-slate-300 hover:text-white'
                    }`}
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
                  className={`flex-1 py-1 rounded font-semibold text-center transition outline-none ${
                    activePane === 'category_header' && focusedCategoryHeaderIndex === 2
                      ? 'bg-tv-focus text-white ring-4 ring-white shadow-xl scale-105 z-20 font-black'
                      : categorySort === 'playlist'
                      ? 'bg-tv-focus text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Playlist
                </button>
                <button
                  type="button"
                  onClick={() => onCategorySortChange('alpha')}
                  className={`flex-1 py-1 rounded font-semibold text-center transition outline-none ${
                    activePane === 'category_header' && focusedCategoryHeaderIndex === 3
                      ? 'bg-tv-focus text-white ring-4 ring-white shadow-xl scale-105 z-20 font-black'
                      : categorySort === 'alpha'
                      ? 'bg-tv-focus text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  A-Z
                </button>
                <button
                  type="button"
                  onClick={() => onCategorySortChange('count')}
                  className={`flex-1 py-1 rounded font-semibold text-center transition outline-none ${
                    activePane === 'category_header' && focusedCategoryHeaderIndex === 4
                      ? 'bg-tv-focus text-white ring-4 ring-white shadow-xl scale-105 z-20 font-black'
                      : categorySort === 'count'
                      ? 'bg-tv-focus text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
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
      )}

      {/* 2. CENTER COLUMN: TIVIMATE FULL-WIDTH CHANNELS + HORIZONTAL PROGRAM TIMELINE (OR VOD/SERIES LIST) */}
      <div
        className={`relative flex-1 min-w-[320px] flex flex-col overflow-hidden ${
          isVodOrSeriesSection ? 'border-r border-tv-border' : ''
        } ${
          activePane === 'channels' || activePane === 'epg_grid' || activePane === 'channel_header'
            ? 'bg-tv-bg'
            : 'bg-tv-bg/85'
        }`}
      >
        {/* A. TIVIMATE TOP PROGRAM INFO DECK (Shown in Live TV mode, replaces the old right-side panel!) */}
        {isLiveTimelineMode && (
          <div className="px-4 py-3 bg-gradient-to-r from-tv-surface via-tv-surface/95 to-slate-900/90 border-b border-tv-border flex items-center justify-between gap-4 flex-shrink-0 shadow-md">
            {/* Left: Selected Channel & Focused Program Details */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center flex-wrap gap-2 mb-1">
                {focusedChannel && (
                  <span className="text-xs font-mono font-black text-tv-accent bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 rounded-md">
                    #{focusedChannel.num} {focusedChannel.name}
                  </span>
                )}

                {activePane === 'epg_grid' && focusedProgramOffset < 0 ? (
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center space-x-1">
                    <RotateCcw className="w-3 h-3 mr-1" />
                    <span>Programme Passé • Appuyez sur OK pour lancer le Replay</span>
                  </span>
                ) : activePane === 'epg_grid' && focusedProgramOffset > 0 ? (
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    À venir sur cette chaîne
                  </span>
                ) : (
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-sky-500/20 text-sky-300 border border-sky-500/30 flex items-center space-x-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-ping mr-1" />
                    <span>En Direct</span>
                  </span>
                )}

                {activeDisplayedProgram && (
                  <span className="text-xs font-mono text-slate-300 flex items-center space-x-1">
                    <Clock className="w-3.5 h-3.5 text-tv-accent mr-1" />
                    <span>
                      {formatTimeHHMM(activeDisplayedProgram.start)} - {formatTimeHHMM(activeDisplayedProgram.end)}
                    </span>
                    <span className="text-slate-500">({activeDisplayedProgram.duration_min} min)</span>
                  </span>
                )}
              </div>

              <h2 className="text-base xl:text-lg font-black text-white truncate">
                {isSep
                  ? cleanSeparatorName(focusedChannel?.name || 'Section')
                  : activeDisplayedProgram?.title || focusedChannel?.name || 'Sélectionnez une chaîne'}
              </h2>

              <p className="text-xs text-slate-300 line-clamp-2 mt-0.5 leading-relaxed">
                {isSep
                  ? 'Séparateur thématique de bouquet.'
                  : activeDisplayedProgram?.description ||
                    'Naviguez à droite (▶) pour explorer la ligne chronologique des programmes de cette chaîne.'}
              </p>
            </div>

            {/* Right: Quick Action Buttons & Mini Status */}
            <div className="flex items-center space-x-2 flex-shrink-0">
              {activePane === 'epg_grid' && !isPastUnlocked && (
                <button
                  type="button"
                  onClick={() => {
                    onTogglePastUnlocked?.(true);
                    onFocusProgramOffsetChange?.(-1);
                  }}
                  className="px-3 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center space-x-1.5 transition shadow"
                  title="Maintenez Flèche Gauche enfoncée pour débloquer les programmes passés"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>◀ Maintenir Gauche : Programmes passés</span>
                </button>
              )}

              {focusedChannel && Boolean(focusedChannel.has_archive) && onOpenCatchupModal && (
                <button
                  type="button"
                  onClick={() => onOpenCatchupModal(focusedChannel)}
                  className="px-3 py-2 rounded-xl bg-tv-card hover:bg-tv-cardHover border border-tv-border text-slate-200 text-xs font-bold flex items-center space-x-1.5 transition"
                  title="Ouvrir la grille Replay 7 jours complète"
                >
                  <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="hidden lg:inline">Replay 7j</span>
                </button>
              )}

              {focusedChannel && !isSep && (
                <button
                  type="button"
                  onClick={() => onSelectChannel(focusedChannel, focusedChannelIndex)}
                  className="px-3.5 py-2 rounded-xl bg-tv-focus hover:bg-sky-500 text-white text-xs font-black flex items-center space-x-1.5 shadow-lg transition"
                >
                  <Play className="w-3.5 h-3.5 fill-white" />
                  <span>Direct (OK)</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* B. SUB-HEADER: Bouquet Name, Channel Sort & Timeline Column Headers */}
        <div className="px-3 py-2 flex items-center justify-between border-b border-tv-border/70 bg-tv-surface/60 flex-shrink-0 z-10">
          <div className="flex items-center space-x-2 min-w-0">
            {isCategoriesCollapsed && (
              <button
                type="button"
                onClick={() => {
                  onTogglePastUnlocked?.(false);
                  onFocusProgramOffsetChange?.(0);
                }}
                className="px-2 py-1 rounded-lg bg-tv-card hover:bg-tv-cardHover border border-tv-border text-[11px] font-bold text-tv-accent flex items-center space-x-1"
                title="Réafficher les bouquets (Flèche Gauche)"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Bouquets</span>
              </button>
            )}
            <div className="min-w-0">
              <span className="truncate block text-xs font-bold text-slate-200 uppercase tracking-wider">
                {selectedCategory?.name || 'Chaînes en direct'}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                {channels.length}{' '}
                {selectedCategory?.type === 'series'
                  ? 'séries'
                  : selectedCategory?.type === 'vod'
                  ? 'films'
                  : 'chaînes'}
                {isLiveTimelineMode &&
                  (activePane === 'epg_grid'
                    ? isPastUnlocked
                      ? ' • Mode Replay & Passé débloqué (◀ / ▶)'
                      : ' • Mode Ligne Chronologique (▶ Futur • Maintenir ◀ Passé)'
                    : ' • Appuyez sur ▶ Droite pour parcourir les programmes')}
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-2 flex-shrink-0">
            {onChannelSortChange && (
              <div className="flex items-center space-x-1 bg-black/40 p-0.5 rounded-md border border-white/5 text-[10px]">
                <button
                  type="button"
                  onClick={() => onChannelSortChange('playlist')}
                  className={`px-2 py-1 rounded font-semibold transition outline-none ${
                    activePane === 'channel_header' && focusedChannelHeaderIndex === 0
                      ? 'bg-tv-focus text-white ring-4 ring-white shadow-xl scale-105 z-20 font-black'
                      : channelSort === 'playlist'
                      ? 'bg-tv-focus text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Playlist
                </button>
                <button
                  type="button"
                  onClick={() => onChannelSortChange('alpha')}
                  className={`px-2 py-1 rounded font-semibold transition outline-none ${
                    activePane === 'channel_header' && focusedChannelHeaderIndex === 1
                      ? 'bg-tv-focus text-white ring-4 ring-white shadow-xl scale-105 z-20 font-black'
                      : channelSort === 'alpha'
                      ? 'bg-tv-focus text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  A-Z
                </button>
                <button
                  type="button"
                  onClick={() => onChannelSortChange('num')}
                  className={`px-2 py-1 rounded font-semibold transition outline-none ${
                    activePane === 'channel_header' && focusedChannelHeaderIndex === 2
                      ? 'bg-tv-focus text-white ring-4 ring-white shadow-xl scale-105 z-20 font-black'
                      : channelSort === 'num'
                      ? 'bg-tv-focus text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  N°
                </button>
              </div>
            )}
          </div>
        </div>

        {/* C. SCROLLABLE CHANNELS + TIMELINE LIST */}
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
          className="flex-1 flex flex-col py-1.5 overflow-y-auto overflow-x-hidden"
        >
          {channels.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-slate-500">
              {selectedCategory?.id.startsWith('fav') ? (
                <>
                  <Star className="w-10 h-10 mb-2 text-amber-400/50" />
                  <p className="text-sm text-slate-300 font-medium">Aucun favori dans cette catégorie.</p>
                  <p className="text-xs text-slate-500 mt-1 max-w-xs text-center">
                    Maintenez OK sur une chaîne ou cliquez sur l&apos;étoile pour l&apos;ajouter à vos favoris.
                  </p>
                </>
              ) : (
                <>
                  <Radio className="w-10 h-10 mb-2 opacity-50" />
                  <p className="text-sm">Aucune chaîne dans ce bouquet.</p>
                </>
              )}
            </div>
          ) : (
            <div className="flex flex-col">
              {topSpacerHeight > 0 && <div style={{ height: topSpacerHeight }} className="flex-shrink-0" />}
              {visibleChannels.map((ch, relIdx) => {
                const realIdx = startIndex + relIdx;
                const isChannelFocused = activePane === 'channels' && focusedChannelIndex === realIdx;
                const isEpgRowFocused = activePane === 'epg_grid' && focusedChannelIndex === realIdx;
                const isActive = activeChannel?.id === ch.id;

                if (isLiveTimelineMode) {
                  const slots = buildProgramSlotsForChannel(ch, channelEpgMap[ch.id]);
                  return (
                    <TiviMateTimelineRow
                      key={ch.id}
                      channel={ch}
                      index={realIdx}
                      isChannelFocused={isChannelFocused}
                      isEpgRowFocused={isEpgRowFocused}
                      focusedProgramOffset={focusedProgramOffset}
                      visibleOffsets={visibleOffsets}
                      isPastUnlocked={isPastUnlocked}
                      isActive={isActive}
                      programSlots={slots}
                      onSelectChannel={onSelectChannel}
                      onSelectProgramCell={handleSelectProgramCell}
                      onToggleFavorite={onToggleFavorite}
                      onOpenContextMenu={onOpenContextMenu}
                    />
                  );
                }

                return (
                  <ChannelRow
                    key={ch.id}
                    channel={ch}
                    index={realIdx}
                    isFocused={isChannelFocused}
                    isActive={isActive}
                    onSelect={onSelectChannel}
                    onToggleFavorite={onToggleFavorite}
                    onOpenContextMenu={onOpenContextMenu}
                  />
                );
              })}
              {bottomSpacerHeight > 0 && <div style={{ height: bottomSpacerHeight }} className="flex-shrink-0" />}
            </div>
          )}
        </div>

        {channelNotice && (
          <div
            className={`absolute ${
              channelNotice === 'bottom' ? 'bottom-10' : 'top-24'
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

        {/* D. BOTTOM TIVIMATE REMOTE NAVIGATION BAR */}
        {channels.length > 0 && (
          <div className="px-4 py-1.5 bg-tv-surface/95 border-t border-tv-border/70 flex items-center justify-between text-[11px] text-slate-300 flex-shrink-0">
            <div className="flex items-center space-x-4 truncate">
              <span>
                <strong className="text-white font-mono bg-white/10 px-1.5 py-0.5 rounded">OK</strong>{' '}
                {activePane === 'epg_grid' && focusedProgramOffset < 0 ? 'Lancer le Replay' : 'Regarder'}
              </span>
              {isLiveTimelineMode && activePane !== 'epg_grid' && (
                <span>
                  <strong className="text-tv-accent font-mono bg-sky-500/15 px-1.5 py-0.5 rounded">▶ Droite</strong>{' '}
                  Parcourir la ligne des programmes (masque les bouquets)
                </span>
              )}
              {isLiveTimelineMode && activePane === 'epg_grid' && (
                <>
                  <span>
                    <strong className="text-tv-accent font-mono bg-sky-500/15 px-1.5 py-0.5 rounded">▶ Droite</strong>{' '}
                    Programmes futurs
                  </span>
                  <span>
                    <strong className="text-emerald-400 font-mono bg-emerald-500/15 px-1.5 py-0.5 rounded">
                      Maintenir ◀ Gauche
                    </strong>{' '}
                    Débloquer les programmes passés (Replay)
                  </span>
                </>
              )}
              <span>
                <strong className="text-amber-400 font-mono bg-amber-500/15 px-1.5 py-0.5 rounded">Menu / Info</strong>{' '}
                Options & Favoris
              </span>
            </div>
            <span className="font-mono text-[10px] text-slate-400 hidden xl:inline">
              {activePane === 'epg_grid' ? '◀ Retour Chaînes & Bouquets' : '◀ Bouquets'}
            </span>
          </div>
        )}
      </div>

      {/* 3. RIGHT COLUMN: ONLY SHOWN FOR VOD (FILMS) & SERIES! (Completely removed for Live TV as requested!) */}
      {isVodOrSeriesSection && (
        <div
          className={`w-80 xl:w-96 flex flex-col p-4 overflow-y-auto flex-shrink-0 border-l transition-colors ${
            activePane === 'right_panel'
              ? 'bg-tv-surface/95 border-tv-accent/60'
              : 'bg-tv-surface/60 border-tv-border'
          }`}
        >
          <div className="flex-1 flex flex-col space-y-3">
            {/* Poster / Backdrop */}
            <div className="relative w-full aspect-[16/10] rounded-2xl overflow-hidden bg-black/60 border border-tv-border shadow-2xl flex-shrink-0 group">
              {mediaDetails?.cover || focusedChannel?.logo ? (
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

              {focusedChannel && (
                <button
                  type="button"
                  onClick={() => onToggleFavorite(focusedChannel)}
                  className="absolute top-2.5 right-2.5 p-1.5 rounded-full bg-black/60 hover:bg-black/90 text-amber-400 border border-white/10 transition shadow-lg"
                >
                  <Star className={`w-4 h-4 ${focusedChannel.is_favorite ? 'fill-amber-400' : ''}`} />
                </button>
              )}
            </div>

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
            </div>

            <div className="flex-1 bg-tv-card/60 p-3 rounded-xl border border-tv-border/60 overflow-y-auto">
              {loadingMediaDetails ? (
                <div className="flex items-center space-x-2 text-xs text-slate-400 py-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-tv-accent" />
                  <span>Chargement des détails...</span>
                </div>
              ) : mediaDetails?.plot ? (
                <p className="text-xs leading-relaxed text-slate-300">{mediaDetails.plot}</p>
              ) : (
                <p className="text-xs leading-relaxed text-slate-500 italic">
                  Aucun résumé disponible pour ce titre.
                </p>
              )}
            </div>

            {focusedChannel && (
              <button
                type="button"
                onClick={() => onSelectChannel(focusedChannel, focusedChannelIndex)}
                className={`w-full py-2.5 rounded-xl text-xs font-bold transition shadow-lg flex items-center justify-center space-x-2 mt-auto outline-none ${
                  activePane === 'right_panel' && focusedRightPanelIndex === 0
                    ? 'bg-tv-focus text-white ring-4 ring-white scale-[1.02] shadow-2xl font-black'
                    : 'bg-tv-focus hover:bg-sky-500 text-white'
                }`}
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
        </div>
      )}
    </div>
  );
};

