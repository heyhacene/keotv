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
  Search,
  Lock,
  Sliders,
  Layers,
  Calendar,
  Clapperboard,
  Loader2,
  Play,
  RotateCcw,
  ChevronLeft,
} from 'lucide-react';
import { LiveVideoPlayer } from './LiveVideoPlayer';
import {
  isSeparatorChannel,
  cleanSeparatorName,
  fetchVodInfo,
  fetchSeriesInfo,
} from '@/lib/iptv-service';
import { EPGService } from '@/lib/epg-service';
import { getMockTimelineForChannel, getSyntheticSlotForOffset } from '@/lib/mock-data';

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
  isModalCovering?: boolean;
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

function formatTimeHHMM(isoStr?: string | number): string {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return String(isoStr).slice(0, 5);
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function formatFrenchDayAndTime(date: Date): string {
  try {
    const dayStr = date.toLocaleDateString('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
    const timeStr = date.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${dayStr} à ${timeStr}`;
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

function getProgramRemainingMin(prog: EpgProgram): number {
  try {
    const now = Date.now();
    const s = new Date(prog.start).getTime();
    const e = new Date(prog.end).getTime();
    if (now >= s && now < e) {
      return Math.max(1, Math.round((e - now) / 60000));
    }
    return prog.duration_min || Math.max(15, Math.round((e - s) / 60000));
  } catch {
    return prog.duration_min || 45;
  }
}

/**
 * Organizes a channel's EPG list into relative offsets around the current live program (offset 0):
 * - offsets -168..-1: past programs up to 7 days back (Replay / Catchup)
 * - offset 0: current live program ("En direct")
 * - offsets +1..+48: upcoming programs up to 48 hours ahead ("À suivre")
 *
 * CRITICAL PERFORMANCE: Only computes the requested `targetOffsets` (default 4 visible slots + 0),
 * avoiding any expensive loop or Intl.DateTimeFormat calls on the Android TV main thread!
 */
export function buildProgramSlotsForChannel(
  channel: Channel,
  realEpgList?: EpgProgram[],
  targetOffsets: number[] = [0, 1, 2, 3]
): Record<number, EpgProgram> {
  const slots: Record<number, EpgProgram> = {};
  const offsetsToBuild = Array.from(new Set([0, ...targetOffsets]));

  if (!realEpgList || realEpgList.length === 0) {
    for (const offset of offsetsToBuild) {
      slots[offset] = getSyntheticSlotForOffset(channel.id, channel.name, offset);
    }
    return slots;
  }

  const nowMs = Date.now();
  let liveIdx = realEpgList.findIndex((p) => {
    const s = new Date(p.start).getTime();
    const e = new Date(p.end).getTime();
    return s <= nowMs && e > nowMs;
  });

  if (liveIdx === -1) {
    let bestDiff = Infinity;
    realEpgList.forEach((p, idx) => {
      const s = new Date(p.start).getTime();
      const diff = Math.abs(s - nowMs);
      if (diff < bestDiff) {
        bestDiff = diff;
        liveIdx = idx;
      }
    });
  }

  if (liveIdx === -1) liveIdx = 0;

  const firstReal = realEpgList[0];
  const lastReal = realEpgList[realEpgList.length - 1];
  const minRealOffset = -liveIdx;
  const maxRealOffset = realEpgList.length - 1 - liveIdx;

  const firstRealStartMs = firstReal ? new Date(firstReal.start).getTime() : nowMs;
  const lastRealEndMs = lastReal ? new Date(lastReal.end).getTime() : nowMs + 3600000;

  for (const offset of offsetsToBuild) {
    const targetIdx = liveIdx + offset;
    if (targetIdx >= 0 && targetIdx < realEpgList.length) {
      slots[offset] = realEpgList[targetIdx];
    } else if (offset < minRealOffset) {
      // Anchor synthetic past slot strictly before the earliest real EPG entry
      const extraHoursBack = minRealOffset - offset;
      const syntheticAnchorMs = firstRealStartMs + minRealOffset * 60 * 60000;
      const slot = getSyntheticSlotForOffset(channel.id, channel.name, offset, syntheticAnchorMs);
      const sMs = firstRealStartMs - extraHoursBack * 60 * 60000;
      const eMs = sMs + 60 * 60000;
      slots[offset] = {
        ...slot,
        start: new Date(sMs).toISOString(),
        end: new Date(eMs).toISOString(),
      };
    } else if (offset > maxRealOffset) {
      const extraHoursFwd = offset - maxRealOffset - 1;
      const sMs = lastRealEndMs + extraHoursFwd * 60 * 60000;
      const eMs = sMs + 60 * 60000;
      const slot = getSyntheticSlotForOffset(channel.id, channel.name, offset);
      slots[offset] = {
        ...slot,
        start: new Date(sMs).toISOString(),
        end: new Date(eMs).toISOString(),
      };
    } else {
      slots[offset] = getSyntheticSlotForOffset(channel.id, channel.name, offset);
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
            ? 'bg-tv-focus border-white text-white font-black ring-2 ring-white z-10'
            : isSelected
            ? 'bg-tv-card/90 text-tv-accent font-bold border-l-4 border-tv-accent pl-2.5'
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
// MEMOIZED TIVIMATE CHANNEL + HORIZONTAL PROGRAM TIMELINE ROW (PHOTO EXACT MATCH)
// ----------------------------------------------------------------------
interface TiviMateTimelineRowProps {
  channel: Channel;
  index: number;
  isChannelFocused: boolean;
  isEpgRowFocused: boolean;
  focusedProgramOffset: number;
  visibleOffsets: number[];
  isActive: boolean;
  programSlots: Record<number, EpgProgram>;
  onSelectChannel: (channel: Channel, index: number) => void;
  onSelectProgramCell: (channel: Channel, index: number, offset: number, prog?: EpgProgram) => void;
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
    isActive,
    programSlots,
    onSelectChannel,
    onSelectProgramCell,
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
          className={`flex items-center justify-between px-3.5 h-[44px] mx-2 my-0.5 rounded-md select-none cursor-default ${
            isChannelFocused || isEpgRowFocused
              ? 'bg-sky-500 text-white font-bold ring-2 ring-white'
              : 'bg-white/[0.04] border border-white/5 text-slate-400 font-semibold'
          }`}
        >
          <div className="flex items-center space-x-2 truncate">
            <Layers className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
            <span className="text-xs uppercase tracking-wider truncate font-bold">{cleanLabel}</span>
          </div>
          <span className="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-mono uppercase tracking-widest flex-shrink-0 ml-2">
            Section
          </span>
        </div>
      );
    }

    // Determine flex weights proportional to program duration so blocks look like TiviMate's timeline
    const getSlotWeight = (offset: number, prog?: EpgProgram) => {
      if (!prog) return 1;
      const dur = prog.duration_min || 45;
      if (offset === 0) return Math.max(2.2, Math.min(3.5, dur / 25));
      if (offset === 1) return Math.max(1.6, Math.min(2.6, dur / 30));
      return Math.max(1.1, Math.min(2.0, dur / 35));
    };

    return (
      <div
        id={`channel-item-${index}`}
        onContextMenu={(e) => {
          e.preventDefault();
          onOpenContextMenu?.(channel);
        }}
        className="flex items-stretch h-[50px] px-2 my-[2px] select-none"
      >
        {/* LEFT PART: TIVIMATE CHANNEL COLUMN (Num + Logo + Channel Name + Replay Clock / Blue Play Triangle) */}
        <div
          onClick={() => onSelectChannel(channel, index)}
          className={`w-[240px] xl:w-[270px] flex-shrink-0 flex items-center justify-between px-2.5 mr-2 rounded-md cursor-pointer ${
            isChannelFocused
              ? 'bg-slate-200 text-slate-950 font-black ring-2 ring-white z-20'
              : isEpgRowFocused
              ? 'bg-white/10 text-white font-bold'
              : 'bg-transparent text-slate-200 hover:bg-white/5'
          }`}
        >
          <div className="flex items-center space-x-2.5 min-w-0 flex-1">
            {/* Channel Number */}
            <span
              className={`text-sm font-semibold w-6 text-center flex-shrink-0 ${
                isChannelFocused
                  ? 'text-slate-950 font-black'
                  : isActive
                  ? 'text-sky-400 font-bold'
                  : 'text-slate-300'
              }`}
            >
              {channel.num}
            </span>

            {/* Channel Logo */}
            <div className="w-10 h-7 flex items-center justify-center flex-shrink-0 overflow-hidden">
              {channel.logo ? (
                <img
                  src={channel.logo}
                  alt={channel.name}
                  loading="lazy"
                  decoding="async"
                  className="max-w-full max-h-full object-contain"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <span
                  className={`text-[10px] font-bold px-1 rounded ${
                    isChannelFocused ? 'bg-slate-800 text-white' : 'bg-white/10 text-slate-300'
                  }`}
                >
                  {channel.name.slice(0, 3)}
                </span>
              )}
            </div>

            {/* Channel Name */}
            <span
              className={`text-[13px] xl:text-sm font-bold truncate ${
                isChannelFocused
                  ? 'text-slate-950'
                  : isActive
                  ? 'text-sky-400'
                  : 'text-slate-100'
              }`}
            >
              {channel.name}
            </span>
          </div>

          {/* Right status icon in channel cell: Blue Play Triangle (if active) or Replay Clock Icon (if has_archive) */}
          <div className="flex items-center space-x-1.5 flex-shrink-0 ml-1.5">
            {isActive ? (
              <Play
                className={`w-3.5 h-3.5 ${
                  isChannelFocused ? 'text-slate-950 fill-slate-950' : 'text-sky-400 fill-sky-400'
                }`}
              />
            ) : hasReplay ? (
              <RotateCcw
                className={`w-3.5 h-3.5 ${
                  isChannelFocused ? 'text-slate-800' : 'text-slate-400'
                }`}
                title="Replay disponible"
              />
            ) : null}
          </div>
        </div>

        {/* RIGHT PART: TIVIMATE HORIZONTAL PROGRAM BLOCKS */}
        <div className="flex-1 flex items-stretch gap-[4px] overflow-hidden">
          {visibleOffsets.map((offset) => {
            const prog = programSlots[offset];
            // Highlighted in light grey/white exactly like TiviMate photo when focused!
            const isCellFocused =
              (isEpgRowFocused && focusedProgramOffset === offset) ||
              (isChannelFocused && offset === 0);
            const isPastProg = offset < 0;
            const weight = getSlotWeight(offset, prog);

            return (
              <div
                key={offset}
                style={{ flex: `${weight} 1 0%` }}
                onClick={() => onSelectProgramCell(channel, index, offset, prog)}
                className={`min-w-0 px-3 flex items-center justify-between rounded-[5px] cursor-pointer relative overflow-hidden ${
                  isCellFocused
                    ? 'bg-[#d8dee9] text-slate-950 font-bold z-10'
                    : isPastProg
                    ? 'bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-100 border border-emerald-500/20'
                    : 'bg-[#1c222d]/90 hover:bg-[#252d3b] text-slate-200'
                }`}
              >
                <span
                  className={`text-[13px] xl:text-sm truncate ${
                    isCellFocused
                      ? 'text-slate-950 font-bold'
                      : prog?.title === "Pas d'information"
                      ? 'text-slate-400 font-normal'
                      : 'text-slate-100 font-medium'
                  }`}
                >
                  {prog ? prog.title : "Pas d'information"}
                </span>

                {isPastProg && (
                  <span
                    className={`ml-2 text-[9px] px-1.5 py-0.5 rounded uppercase font-mono font-bold flex items-center flex-shrink-0 ${
                      isCellFocused
                        ? 'bg-slate-900/20 text-slate-900'
                        : 'bg-emerald-500/20 text-emerald-300'
                    }`}
                  >
                    <RotateCcw className="w-2.5 h-2.5 mr-0.5" />
                    Replay
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  },
  (prev, next) => {
    if (
      prev.isChannelFocused !== next.isChannelFocused ||
      prev.isEpgRowFocused !== next.isEpgRowFocused ||
      prev.isActive !== next.isActive ||
      prev.channel.id !== next.channel.id ||
      prev.channel.is_favorite !== next.channel.is_favorite ||
      prev.index !== next.index
    ) {
      return false;
    }
    // Only re-render on focusedProgramOffset change if THIS row is the focused EPG row!
    if (next.isEpgRowFocused && prev.focusedProgramOffset !== next.focusedProgramOffset) {
      return false;
    }
    if (prev.visibleOffsets.length !== next.visibleOffsets.length) return false;
    for (let i = 0; i < next.visibleOffsets.length; i++) {
      const off = next.visibleOffsets[i];
      if (prev.visibleOffsets[i] !== off) return false;
      if (prev.programSlots[off]?.id !== next.programSlots[off]?.id) return false;
      if (prev.programSlots[off]?.title !== next.programSlots[off]?.title) return false;
    }
    return true;
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
          className={`flex items-center justify-between px-3.5 py-1.5 mx-2 my-1 rounded-xl select-none cursor-default ${
            isFocused
              ? 'bg-tv-focus text-white font-bold ring-2 ring-tv-accent'
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
            ? 'bg-tv-focus border-white text-white font-bold ring-2 ring-white z-10'
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
                decoding="async"
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
  },
  (prev, next) =>
    prev.isFocused === next.isFocused &&
    prev.isActive === next.isActive &&
    prev.index === next.index &&
    prev.channel.id === next.channel.id &&
    prev.channel.is_favorite === next.channel.is_favorite &&
    prev.channel.name === next.channel.name
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
  isModalCovering = false,
}) => {
  const channelListRef = useRef<HTMLDivElement | null>(null);
  const categoryListRef = useRef<HTMLDivElement | null>(null);

  // Live clock for TiviMate Time Ruler ("dim. 25 oct. à 12:29") and 30-min marks
  const [nowDate, setNowDate] = useState<Date>(() => new Date());
  useEffect(() => {
    const interval = setInterval(() => setNowDate(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

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
    setChannelNotice((prev) => (prev !== null ? null : prev));
    setChannelBounce((prev) => (prev !== null ? null : prev));
  }, [focusedChannelIndex]);

  useEffect(() => {
    setCategoryNotice((prev) => (prev !== null ? null : prev));
    setCategoryBounce((prev) => (prev !== null ? null : prev));
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

  // In TiviMate Live Timeline Mode: when activePane === 'epg_grid' (after pressing DPAD_RIGHT), the left Bouquets column hides!
  const isCategoriesCollapsed = isLiveTimelineMode && activePane === 'epg_grid';

  // Rich media preview states for VOD & Séries (only used when isVodOrSeriesSection is true)
  const [mediaDetails, setMediaDetails] = useState<any | null>(null);
  const [loadingMediaDetails, setLoadingMediaDetails] = useState<boolean>(false);
  const detailsCacheRef = useRef<Map<string, any>>(new Map());
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!focusedChannel || isSep || !isVodOrSeriesSection) {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      setMediaDetails((prev: any) => (prev !== null ? null : prev));
      setLoadingMediaDetails((prev) => (prev !== false ? false : prev));
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

  // ZERO-LATENCY CONTAINER-RELATIVE AUTO-SCROLL (Only mutates scrollTop when item exits visible viewport!)
  useEffect(() => {
    if (activePane === 'channels' || activePane === 'epg_grid') {
      const container = channelListRef.current;
      const el = document.getElementById(`channel-item-${focusedChannelIndex}`);
      if (container && el) {
        const cRect = container.getBoundingClientRect();
        const eRect = el.getBoundingClientRect();
        if (eRect.top < cRect.top + 4) {
          container.scrollTop -= cRect.top - eRect.top + 8;
        } else if (eRect.bottom > cRect.bottom - 4) {
          container.scrollTop += eRect.bottom - cRect.bottom + 8;
        }
      }
    }
  }, [focusedChannelIndex, activePane]);

  useEffect(() => {
    if (activePane === 'categories') {
      const container = categoryListRef.current;
      const el = document.getElementById(`category-item-${focusedCategoryIndex}`);
      if (container && el) {
        const cRect = container.getBoundingClientRect();
        const eRect = el.getBoundingClientRect();
        if (eRect.top < cRect.top + 4) {
          container.scrollTop -= cRect.top - eRect.top + 8;
        } else if (eRect.bottom > cRect.bottom - 4) {
          container.scrollTop += eRect.bottom - cRect.bottom + 8;
        }
      }
    }
  }, [focusedCategoryIndex, activePane]);

  // CHUNKED VIRTUALIZED WINDOWING FOR LARGE CHANNEL LISTS
  // Quantizing startIndex in steps of 15 means 14 out of 15 D-Pad presses mount/unmount ZERO DOM nodes!
  const ROW_HEIGHT = 54;
  const WINDOW_STEP = 15;
  const WINDOW_PAD_TOP = 20;
  const WINDOW_PAD_BOTTOM = 35;

  const totalChannels = channels.length;
  const shouldWindow = totalChannels > 60;

  const rawStart = shouldWindow ? Math.max(0, focusedChannelIndex - WINDOW_PAD_TOP) : 0;
  const startIndex = shouldWindow ? Math.floor(rawStart / WINDOW_STEP) * WINDOW_STEP : 0;
  const endIndex = shouldWindow
    ? Math.min(totalChannels, startIndex + WINDOW_PAD_TOP + WINDOW_PAD_BOTTOM)
    : totalChannels;

  const visibleChannels = useMemo(() => {
    return shouldWindow ? channels.slice(startIndex, endIndex) : channels;
  }, [channels, shouldWindow, startIndex, endIndex]);

  const topSpacerHeight = shouldWindow ? startIndex * ROW_HEIGHT : 0;
  const bottomSpacerHeight = shouldWindow ? (totalChannels - endIndex) * ROW_HEIGHT : 0;

  // Background batch-loader for real Xtream EPG of channels around focusedChannelIndex
  // Batches all updates into a SINGLE setChannelEpgMap call after 320ms idle so active navigation is never interrupted!
  useEffect(() => {
    if (!isLiveTimelineMode || !serverCreds?.serverUrl || !serverCreds?.username || !serverCreds?.password) {
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      const sliceStart = Math.max(0, focusedChannelIndex - 2);
      const sliceEnd = Math.min(channels.length, focusedChannelIndex + 6);
      const batch = channels.slice(sliceStart, sliceEnd).filter((ch) => {
        if (!ch || ch.is_separator || isSeparatorChannel(ch)) return false;
        if (fetchedChannelIdsRef.current.has(ch.id)) return false;
        return true;
      });

      if (batch.length === 0) return;
      const newEntries: Record<string, EpgProgram[]> = {};
      let hasAnyNew = false;

      for (const ch of batch) {
        if (cancelled) break;
        fetchedChannelIdsRef.current.add(ch.id);

        try {
          const cachedDb = await EPGService.getProgramsForChannel(ch.id);
          if (cachedDb && cachedDb.length > 0) {
            newEntries[ch.id] = cachedDb;
            hasAnyNew = true;
            continue;
          }
        } catch {}

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
            newEntries[ch.id] = programs;
            hasAnyNew = true;
          }
        } catch {}
      }

      if (!cancelled && hasAnyNew) {
        setChannelEpgMap((prev) => ({
          ...prev,
          ...newEntries,
        }));
      }
    }, 320);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isLiveTimelineMode, focusedChannelIndex, channels, serverCreds]);

  // Compute which 4 horizontal program offsets are displayed in the timeline row
  // Allows sliding all the way back to -168 (7 days) and forward to +48 (2 days)!
  const visibleOffsets = useMemo(() => {
    if (activePane === 'epg_grid') {
      if (focusedProgramOffset < 0) {
        const start = Math.max(-168, focusedProgramOffset);
        return [start, start + 1, start + 2, start + 3];
      }
      if (isPastUnlocked && focusedProgramOffset === 0) {
        return [-1, 0, 1, 2];
      }
      if (focusedProgramOffset >= 2) {
        const start = Math.min(45, focusedProgramOffset - 1);
        return [start, start + 1, start + 2, start + 3];
      }
      return [0, 1, 2, 3];
    }
    return [0, 1, 2, 3];
  }, [activePane, focusedProgramOffset, isPastUnlocked]);

  // Focused channel's program slots and currently highlighted program details for the Top TiviMate Info Deck
  const focusedChannelSlots = useMemo(() => {
    if (!focusedChannel || isSep) return {};
    return buildProgramSlotsForChannel(focusedChannel, channelEpgMap[focusedChannel.id], [
      0,
      focusedProgramOffset,
      ...visibleOffsets,
    ]);
  }, [focusedChannel, isSep, channelEpgMap, focusedProgramOffset, visibleOffsets]);

  // Compute the 5 half-hour marks for the TiviMate Time Ruler ("12:00  12:30  13:00  13:30  14:00")
  // and the percentage position of the vertical blue Now Line!
  const timeRulerInfo = useMemo(() => {
    const baseMs = nowDate.getTime();
    const firstVisibleOffset = visibleOffsets[0] ?? 0;
    const firstSlotProg = focusedChannelSlots[firstVisibleOffset];

    let anchorMs = baseMs;
    if (activePane === 'epg_grid' && firstVisibleOffset !== 0 && firstSlotProg?.start) {
      const parsed = new Date(firstSlotProg.start).getTime();
      if (!isNaN(parsed)) {
        anchorMs = parsed;
      } else {
        anchorMs = baseMs + firstVisibleOffset * 60 * 60 * 1000;
      }
    } else if (activePane === 'epg_grid' && firstVisibleOffset !== 0) {
      anchorMs = baseMs + firstVisibleOffset * 60 * 60 * 1000;
    }

    const d = new Date(anchorMs);
    d.setSeconds(0, 0);
    const mins = d.getMinutes();
    d.setMinutes(mins >= 30 ? 30 : 0);

    const startWindowMs = d.getTime();
    const totalWindowMs = 2 * 60 * 60 * 1000; // 2 hours span (5 marks: +0, +30, +60, +90, +120)

    const marks: string[] = [];
    for (let i = 0; i < 5; i++) {
      const markDate = new Date(startWindowMs + i * 30 * 60 * 1000);
      marks.push(
        markDate.toLocaleTimeString('fr-FR', {
          hour: '2-digit',
          minute: '2-digit',
        })
      );
    }

    const nowRatio = (baseMs - startWindowMs) / totalWindowMs;
    const nowPercent = nowRatio >= 0 && nowRatio <= 1 ? Math.round(nowRatio * 1000) / 10 : null;

    // Show the date/time of the currently focused program slot when rewinding in the past or browsing future
    const focusedProg =
      activePane === 'epg_grid' && focusedProgramOffset !== 0
        ? focusedChannelSlots[focusedProgramOffset]
        : null;
    const labelDate =
      focusedProg?.start && !isNaN(new Date(focusedProg.start).getTime())
        ? new Date(focusedProg.start)
        : nowDate;

    return {
      currentLabel: formatFrenchDayAndTime(labelDate),
      marks,
      nowPercent,
    };
  }, [nowDate, activePane, focusedProgramOffset, visibleOffsets, focusedChannelSlots]);

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

  const displayedProgProgress = activeDisplayedProgram ? getProgramProgress(activeDisplayedProgram) : 45;
  const displayedProgRemainingMin = activeDisplayedProgram ? getProgramRemainingMin(activeDisplayedProgram) : 25;

  return (
    <div className="flex-1 flex overflow-hidden bg-[#0e131a] text-slate-100 select-none">
      {/* 1. CATEGORIES / BOUQUETS COLUMN (Visible when in categories or channels; collapses on DPAD_RIGHT into epg_grid!) */}
      {!isCategoriesCollapsed && (
        <div
          className={`relative w-56 xl:w-64 border-r border-white/10 flex flex-col flex-shrink-0 transition-colors duration-100 ${
            activePane === 'categories' || activePane === 'category_header' ? 'bg-tv-surface/95' : 'bg-tv-surface/50'
          }`}
        >
          {/* Fixed Header with Groups Count and Sort Buttons */}
          <div className="px-3 py-2.5 flex flex-col space-y-1.5 border-b border-white/10 bg-tv-surface flex-shrink-0 z-10 shadow-sm">
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

      {/* 2. TIVIMATE MAIN VIEW (TOP VIDEO + INFO DECK & BOTTOM CHRONOLOGICAL EPG GRID) */}
      <div
        className={`relative flex-1 min-w-[320px] flex flex-col overflow-hidden ${
          isVodOrSeriesSection ? 'border-r border-tv-border' : ''
        }`}
      >
        {/* ===================================================================== */}
        {/* A. TIVIMATE TOP DECK (Exact match to user photo: Left PiP Video + Right Program Details) */}
        {/* ===================================================================== */}
        {isLiveTimelineMode && (
          <div className="px-5 pt-3 pb-2.5 bg-[#0e131a] flex items-start gap-6 flex-shrink-0">
            {/* 1. Left: 16:9 Rounded Mini Live Video Preview Window */}
            <div
              onClick={onToggleFullscreen}
              className="w-[270px] lg:w-[310px] xl:w-[350px] aspect-video rounded-xl overflow-hidden bg-black border border-white/15 shadow-2xl flex-shrink-0 cursor-pointer relative group"
              title="Appuyez sur OK pour passer en plein écran"
            >
              <LiveVideoPlayer
                channel={activeChannel || focusedChannel}
                currentEpg={currentEpg}
                nextEpg={nextEpg}
                isFullscreen={false}
                onToggleFullscreen={onToggleFullscreen}
                isStopped={isStopped}
                onTogglePlayStop={onTogglePlayStop}
                isModalCovering={isModalCovering}
              />
            </div>

            {/* 2. Right: Program Title, Time + Progress Bar + Remaining Mins, Bouquet Badge & 4-line Description */}
            <div className="flex-1 min-w-0 flex flex-col justify-start pt-0.5">
              {/* Row 1: Program Title + Favorite Star on far right */}
              <div className="flex items-start justify-between gap-4">
                <h2 className="text-xl xl:text-2xl font-bold text-white truncate leading-tight">
                  {isSep
                    ? cleanSeparatorName(focusedChannel?.name || 'Section')
                    : activeDisplayedProgram?.title || focusedChannel?.name || "Pas d'information"}
                </h2>

                {focusedChannel && !isSep && (
                  <button
                    type="button"
                    onClick={() => onToggleFavorite(focusedChannel)}
                    className="p-1 text-slate-300 hover:text-amber-400 transition flex-shrink-0"
                    title={focusedChannel.is_favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                  >
                    <Star
                      className={`w-5 h-5 ${
                        focusedChannel.is_favorite ? 'fill-amber-400 text-amber-400' : 'text-slate-300'
                      }`}
                    />
                  </button>
                )}
              </div>

              {/* Row 2: Time Range (11:50 - 12:50) + Progress Bar + Remaining Mins (21 min) ... Right: TV || BOUQUET */}
              <div className="flex items-center justify-between gap-4 mt-1.5 mb-2">
                <div className="flex items-center space-x-3 text-sm text-slate-300 font-medium">
                  {activeDisplayedProgram && (
                    <>
                      <span className="font-mono text-slate-200">
                        {formatTimeHHMM(activeDisplayedProgram.start)} – {formatTimeHHMM(activeDisplayedProgram.end)}
                      </span>
                      <div className="w-16 h-1 bg-white/20 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-white rounded-full"
                          style={{ width: `${Math.max(8, displayedProgProgress)}%` }}
                        />
                      </div>
                      <span className="text-slate-300">
                        {activePane === 'epg_grid' && focusedProgramOffset < 0
                          ? `Replay (${displayedProgRemainingMin} min)`
                          : `${displayedProgRemainingMin} min`}
                      </span>
                    </>
                  )}

                  {activePane === 'epg_grid' && focusedProgramOffset < 0 && (
                    <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold flex items-center space-x-1">
                      <RotateCcw className="w-3 h-3 mr-1" />
                      <span>Programme Passé • OK pour lancer le Replay</span>
                    </span>
                  )}
                </div>

                {/* Right Badge: TV || FRANCE HD */}
                <div className="flex items-center space-x-2 text-xs xl:text-sm font-bold text-slate-300 tracking-wide uppercase flex-shrink-0">
                  <span className="flex items-center space-x-1 text-slate-200">
                    <Tv className="w-3.5 h-3.5 text-sky-400 mr-1" />
                    <span>TV</span>
                  </span>
                  <span className="text-slate-500 font-black">||</span>
                  <span className="text-slate-200 truncate max-w-[220px]">
                    {selectedCategory?.name || focusedChannel?.group_name || 'FRANCE HD'}
                  </span>
                </div>
              </div>

              {/* Row 3: Multi-line Program Synopsis (3-4 lines just like TiviMate photo) */}
              <p className="text-xs xl:text-[13px] text-slate-300 line-clamp-4 leading-relaxed">
                {isSep
                  ? 'Séparateur thématique de bouquet.'
                  : activeDisplayedProgram?.description ||
                    (focusedChannel
                      ? `Diffusion en direct sur ${focusedChannel.name}. Utilisez les flèches Droite (▶) pour consulter les programmes à venir et maintenez Gauche (◀) enfoncé pour débloquer les programmes passés en Replay.`
                      : 'Sélectionnez une chaîne pour afficher le résumé du programme.')}
              </p>
            </div>
          </div>
        )}

        {/* ===================================================================== */}
        {/* B. TIVIMATE TIME RULER BAR (dim. 25 oct. à 12:29 | 12:00 12:30 13:00 13:30 14:00) */}
        {/* ===================================================================== */}
        {isLiveTimelineMode ? (
          <div className="px-2 py-1.5 border-b border-white/10 bg-[#0e131a] flex items-center flex-shrink-0 z-10">
            {/* Left above channels: Current Day & Time in sky blue + optional Bouquets back pill */}
            <div className="w-[240px] xl:w-[270px] flex-shrink-0 flex items-center justify-between px-2.5 mr-2">
              <span className="text-xs xl:text-[13px] font-bold text-sky-400 truncate">
                {timeRulerInfo.currentLabel}
              </span>
              {isCategoriesCollapsed && (
                <button
                  type="button"
                  onClick={() => {
                    onTogglePastUnlocked?.(false);
                    onFocusProgramOffsetChange?.(0);
                  }}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 text-slate-200 flex items-center space-x-0.5"
                  title="Réafficher les bouquets (Flèche Gauche)"
                >
                  <ChevronLeft className="w-3 h-3" />
                  <span>Bouquets</span>
                </button>
              )}
            </div>

            {/* Right above program blocks: 30-min interval markers */}
            <div className="flex-1 grid grid-cols-5 items-center text-xs xl:text-[13px] text-slate-300 font-medium pr-2">
              {timeRulerInfo.marks.map((mark, i) => (
                <span
                  key={i}
                  className={i === 4 ? 'text-right pr-1' : 'text-left pl-1'}
                >
                  {mark}
                </span>
              ))}
            </div>
          </div>
        ) : (
          /* Standard header for VOD / Series mode */
          <div className="px-3 py-2 flex items-center justify-between border-b border-tv-border/70 bg-tv-surface/60 flex-shrink-0 z-10">
            <div className="min-w-0">
              <span className="truncate block text-xs font-bold text-slate-200 uppercase tracking-wider">
                {selectedCategory?.name || 'Catalogue'}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                {channels.length}{' '}
                {selectedCategory?.type === 'series' ? 'séries' : 'films'}
              </span>
            </div>

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
        )}

        {/* ===================================================================== */}
        {/* C. SCROLLABLE CHANNELS + TIVIMATE TIMELINE GRID WITH VERTICAL NOW LINE */}
        {/* ===================================================================== */}
        <div className="relative flex-1 flex flex-col overflow-hidden">
          {/* Vertical Sky-Blue "Now Line" with Glowing Dot on Top (Exact match to user photo!) */}
          {isLiveTimelineMode && timeRulerInfo.nowPercent !== null && (
            <div
              className="pointer-events-none absolute top-0 bottom-0 left-[256px] xl:left-[286px] right-2 z-20 overflow-hidden"
              aria-hidden="true"
            >
              <div
                style={{ left: `${Math.min(96, Math.max(4, timeRulerInfo.nowPercent))}%` }}
                className="absolute top-0 bottom-0 w-[1.5px] bg-sky-400/75"
              >
                <div className="w-2.5 h-2.5 rounded-full bg-sky-400 shadow-[0_0_8px_#38bdf8] -ml-[4px] -mt-[2px]" />
              </div>
            </div>
          )}

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
            className="flex-1 flex flex-col py-1 overflow-y-auto overflow-x-hidden"
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
                    const slots = buildProgramSlotsForChannel(ch, channelEpgMap[ch.id], visibleOffsets);
                    return (
                      <TiviMateTimelineRow
                        key={ch.id}
                        channel={ch}
                        index={realIdx}
                        isChannelFocused={isChannelFocused}
                        isEpgRowFocused={isEpgRowFocused}
                        focusedProgramOffset={focusedProgramOffset}
                        visibleOffsets={visibleOffsets}
                        isActive={isActive}
                        programSlots={slots}
                        onSelectChannel={onSelectChannel}
                        onSelectProgramCell={handleSelectProgramCell}
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
      </div>

      {/* 3. RIGHT COLUMN: ONLY SHOWN FOR VOD (FILMS) & SERIES! */}
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
