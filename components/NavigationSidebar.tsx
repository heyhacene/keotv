'use client';

import React from 'react';
import { Tv, Film, Clapperboard, Star, Search, Settings, RefreshCw } from 'lucide-react';
import { NavigationPane } from '@/types/iptv';

interface NavigationSidebarProps {
  activeSection: string;
  onSelectSection: (section: string) => void;
  activePane: NavigationPane;
  focusedMenuIndex: number;
  onOpenSyncModal: () => void;
  onOpenSettingsModal: () => void;
  onOpenSearchModal: () => void;
}

export const NavigationSidebar: React.FC<NavigationSidebarProps> = ({
  activeSection,
  onSelectSection,
  activePane,
  focusedMenuIndex,
  onOpenSyncModal,
  onOpenSettingsModal,
  onOpenSearchModal,
}) => {
  const menuItems = [
    { id: 'live', label: 'Direct', icon: Tv },
    { id: 'vod', label: 'Films', icon: Film },
    { id: 'series', label: 'Séries', icon: Clapperboard },
    { id: 'fav', label: 'Favoris', icon: Star },
    { id: 'search', label: 'Recherche', icon: Search },
  ];

  return (
    <div
      className={`w-16 md:w-20 border-r border-tv-border flex flex-col items-center py-4 justify-between transition-colors select-none ${
        activePane === 'menu' ? 'bg-tv-surface' : 'bg-tv-bg'
      }`}
    >
      {/* Brand logo */}
      <div className="flex flex-col items-center mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-600 to-tv-accent flex items-center justify-center shadow-lg shadow-sky-500/20">
          <Tv className="w-5 h-5 text-white" />
        </div>
        <span className="text-[10px] font-black tracking-widest text-tv-accent mt-1 uppercase">
          KeoTV
        </span>
      </div>

      {/* Main sections (indices 0 to 4) */}
      <div className="flex-1 flex flex-col space-y-2 w-full px-2">
        {menuItems.map((item, idx) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          const isFocused = activePane === 'menu' && focusedMenuIndex === idx;

          return (
            <button
              key={item.id}
              id={`menu-item-${idx}`}
              onClick={() => {
                if (item.id === 'search') {
                  onOpenSearchModal();
                } else {
                  onSelectSection(item.id);
                }
              }}
              className={`w-full py-2.5 rounded-xl flex flex-col items-center justify-center transition-all duration-150 ${
                isFocused
                  ? 'bg-tv-focus text-white ring-2 ring-tv-accent ring-offset-2 ring-offset-tv-bg shadow-tv-focus scale-105 font-bold'
                  : isActive
                  ? 'bg-tv-card text-tv-accent border border-tv-border shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-tv-card/50'
              }`}
              title={item.label}
            >
              <Icon className="w-5 h-5 mb-1" />
              <span className="text-[9px] font-semibold">{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Bottom utility buttons (indices 5 and 6) */}
      <div className="flex flex-col space-y-2 w-full px-2 pt-4 border-t border-tv-border/50">
        {/* Settings / Options (index 5) */}
        <button
          id="menu-item-5"
          onClick={onOpenSettingsModal}
          className={`w-full py-2.5 rounded-xl flex flex-col items-center justify-center transition-all duration-150 ${
            activePane === 'menu' && focusedMenuIndex === 5
              ? 'bg-tv-focus text-white ring-2 ring-tv-accent ring-offset-2 ring-offset-tv-bg shadow-tv-focus scale-105 font-bold'
              : 'text-slate-400 hover:text-tv-accent hover:bg-tv-card/50'
          }`}
          title="Paramètres de l'application"
        >
          <Settings className="w-5 h-5 mb-0.5 text-tv-accent" />
          <span className="text-[8px] font-semibold">Options</span>
        </button>

        {/* Sync (index 6) */}
        <button
          id="menu-item-6"
          onClick={onOpenSyncModal}
          className={`w-full py-2.5 rounded-xl flex flex-col items-center justify-center transition-all duration-150 ${
            activePane === 'menu' && focusedMenuIndex === 6
              ? 'bg-tv-focus text-white ring-2 ring-emerald-400 ring-offset-2 ring-offset-tv-bg shadow-tv-focus scale-105 font-bold'
              : 'text-slate-400 hover:text-emerald-400 hover:bg-tv-card/50'
          }`}
          title="Synchroniser multi-appareils"
        >
          <RefreshCw className="w-5 h-5 mb-0.5 text-emerald-400" />
          <span className="text-[8px] font-semibold">Synchro</span>
        </button>
      </div>
    </div>
  );
};
