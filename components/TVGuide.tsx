'use client';

import React, { useEffect, useRef } from 'react';
import { Channel, Category, EpgProgram, NavigationPane } from '@/types/iptv';
import { Star, Tv, Trophy, Film, Globe, Compass, Sparkles, Clock, Radio, Info } from 'lucide-react';
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
  onSelectCategory: (cat: Category, index: number) => void;
  onSelectChannel: (channel: Channel, index: number) => void;
  onToggleFavorite: (channel: Channel) => void;
  onOpenSyncModal: () => void;
  onOpenXtreamModal: () => void;
  onToggleFullscreen: () => void;
  isStopped?: boolean;
  onTogglePlayStop?: () => void;
}

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
}) => {
  const channelListRef = useRef<HTMLDivElement | null>(null);
  const categoryListRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll focused channel into view
  useEffect(() => {
    if (activePane === 'channels' && channelListRef.current) {
      const activeElement = channelListRef.current.children[focusedChannelIndex] as HTMLElement;
      if (activeElement) {
        activeElement.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
        });
      }
    }
  }, [focusedChannelIndex, activePane]);

  // Auto-scroll focused category into view
  useEffect(() => {
    if (activePane === 'categories' && categoryListRef.current) {
      const activeElement = categoryListRef.current.children[focusedCategoryIndex] as HTMLElement;
      if (activeElement) {
        activeElement.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
        });
      }
    }
  }, [focusedCategoryIndex, activePane]);

  const getCategoryIcon = (iconName?: string) => {
    switch (iconName) {
      case 'Star':
        return <Star className="w-4 h-4 text-amber-400" />;
      case 'Trophy':
        return <Trophy className="w-4 h-4 text-rose-400" />;
      case 'Film':
        return <Film className="w-4 h-4 text-purple-400" />;
      case 'Globe':
        return <Globe className="w-4 h-4 text-emerald-400" />;
      case 'Compass':
        return <Compass className="w-4 h-4 text-indigo-400" />;
      default:
        return <Tv className="w-4 h-4 text-sky-400" />;
    }
  };

  return (
    <div className="flex-1 flex overflow-hidden bg-tv-bg text-slate-100 select-none">
      {/* 1. CATEGORIES COLUMN */}
      <div
        ref={categoryListRef}
        className={`w-52 xl:w-60 border-r border-tv-border flex flex-col py-3 overflow-y-auto overflow-x-hidden flex-shrink-0 transition-colors ${
          activePane === 'categories' ? 'bg-tv-surface/90' : 'bg-tv-surface/40'
        }`}
      >
        <div className="px-4 pb-2 mb-1 flex items-center justify-between text-xs font-semibold text-slate-400 uppercase tracking-wider">
          <span>Groupes</span>
          <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-400">
            {categories.length}
          </span>
        </div>

        {categories.map((cat, idx) => {
          const isFocused = activePane === 'categories' && focusedCategoryIndex === idx;
          const isSelected = selectedCategory?.id === cat.id;

          return (
            <button
              key={cat.id}
              onClick={() => onSelectCategory(cat, idx)}
              className={`flex items-center justify-between px-3 py-2.5 mx-2 my-0.5 rounded-lg text-left text-sm transition-all duration-150 ${
                isFocused
                  ? 'bg-tv-focus text-white font-semibold shadow-tv-focus scale-[1.02]'
                  : isSelected
                  ? 'bg-tv-card text-tv-accent font-medium border border-tv-border'
                  : 'text-slate-300 hover:bg-tv-cardHover/70'
              }`}
            >
              <div className="flex items-center space-x-2.5 min-w-0">
                {getCategoryIcon(cat.icon)}
                <span className="truncate">{cat.name}</span>
              </div>
              <span
                className={`text-[11px] px-1.5 py-0.5 rounded-full font-mono ${
                  isFocused ? 'bg-black/30 text-white' : 'bg-slate-800/80 text-slate-400'
                }`}
              >
                {cat.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* 2. CHANNELS LIST COLUMN */}
      <div
        ref={channelListRef}
        className={`flex-1 min-w-[280px] border-r border-tv-border flex flex-col py-3 overflow-y-auto overflow-x-hidden transition-colors ${
          activePane === 'channels' ? 'bg-tv-bg' : 'bg-tv-bg/80'
        }`}
      >
        <div className="px-4 pb-2 mb-1 flex items-center justify-between text-xs font-semibold text-slate-400 uppercase tracking-wider">
          <span className="truncate">{selectedCategory?.name || 'Chaînes en direct'}</span>
          <span className="text-[11px] text-slate-500 font-mono ml-2 flex-shrink-0">
            {channels.length} chaînes
          </span>
        </div>

        {channels.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-slate-500">
            <Radio className="w-10 h-10 mb-2 opacity-50" />
            <p className="text-sm">Aucune chaîne dans ce groupe.</p>
          </div>
        ) : (
          channels.map((ch, idx) => {
            const isFocused = activePane === 'channels' && focusedChannelIndex === idx;
            const isActive = activeChannel?.id === ch.id;

            return (
              <div
                key={ch.id}
                onClick={() => onSelectChannel(ch, idx)}
                className={`group flex items-center justify-between px-3.5 py-2.5 mx-2.5 my-0.5 rounded-xl cursor-pointer transition-all duration-150 border ${
                  isFocused
                    ? 'bg-tv-cardHover border-tv-accent text-white shadow-tv-focus scale-[1.01]'
                    : isActive
                    ? 'bg-tv-card border-tv-accent/50 text-slate-100'
                    : 'bg-tv-card/40 border-transparent hover:bg-tv-cardHover/50 text-slate-300'
                }`}
              >
                {/* Number & Logo & Info */}
                <div className="flex items-center space-x-3 min-w-0 flex-1">
                  <span
                    className={`text-xs font-mono font-bold w-6 text-right flex-shrink-0 ${
                      isFocused ? 'text-tv-accent' : 'text-slate-500'
                    }`}
                  >
                    {ch.num}
                  </span>

                  <div className="w-8 h-8 rounded-lg bg-black/40 border border-white/5 flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] font-bold text-slate-300">
                      {ch.name.slice(0, 3)}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center space-x-2">
                      <h4 className="text-sm font-semibold truncate leading-tight">
                        {ch.name}
                      </h4>
                      {ch.resolution && (
                        <span className="text-[10px] bg-sky-500/10 text-tv-accent border border-sky-500/20 px-1 rounded font-mono font-bold flex-shrink-0">
                          {ch.resolution}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 truncate mt-0.5">
                      {ch.id === 'ch_tf1'
                        ? 'Le Journal de 20h & Météo'
                        : ch.id === 'ch_cplus'
                        ? 'Oppenheimer (2023) - Exclusivité 4K'
                        : ch.id === 'ch_beinsport1'
                        ? 'UEFA Champions League : Match en Direct'
                        : 'Programme en direct HD'}
                    </p>
                  </div>
                </div>

                {/* Favorite Star */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavorite(ch);
                  }}
                  className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${
                    ch.is_favorite
                      ? 'text-amber-400 hover:text-amber-300'
                      : 'text-slate-600 hover:text-slate-400 opacity-0 group-hover:opacity-100'
                  }`}
                  title={ch.is_favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                >
                  <Star className={`w-4 h-4 ${ch.is_favorite ? 'fill-amber-400' : ''}`} />
                </button>
              </div>
            );
          })
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
