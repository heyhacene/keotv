'use client';

import React from 'react';
import { Tv, Film, Clapperboard, Star, Search, Settings, RefreshCw, RotateCcw } from 'lucide-react';
import { NavigationPane } from '@/types/iptv';

interface NavigationSidebarProps {
  activeSection: string;
  onSelectSection: (section: string) => void;
  activePane: NavigationPane;
  focusedMenuIndex: number;
  onOpenSyncModal: () => void;
  onOpenSettingsModal: () => void;
  onOpenSearchModal: () => void;
  onOpenReplayModal: () => void;
  boundaryHit?: { pane: string; boundary: 'top' | 'bottom'; time: number } | null;
}

export const NavigationSidebar: React.FC<NavigationSidebarProps> = ({
  activeSection,
  onSelectSection,
  activePane,
  focusedMenuIndex,
  onOpenSyncModal,
  onOpenSettingsModal,
  onOpenSearchModal,
  onOpenReplayModal,
  boundaryHit,
}) => {
  const [menuBounce, setMenuBounce] = React.useState<'top' | 'bottom' | null>(null);

  React.useEffect(() => {
    if (!boundaryHit || boundaryHit.pane !== 'menu') return;
    setMenuBounce(boundaryHit.boundary);
    const timer = setTimeout(() => setMenuBounce(null), 180);
    return () => clearTimeout(timer);
  }, [boundaryHit]);

  // 8 Navigation items (0..7): Direct, Replay, Films, Séries, Favoris, Recherche, Options, Synchro
  const menuItems = [
    { id: 'live', label: 'Direct', icon: Tv },
    { id: 'replay', label: 'Replay', icon: RotateCcw },
    { id: 'vod', label: 'Films', icon: Film },
    { id: 'series', label: 'Séries', icon: Clapperboard },
    { id: 'fav', label: 'Favoris', icon: Star },
    { id: 'search', label: 'Recherche', icon: Search },
  ];

  return (
    <div
      style={{
        transform:
          menuBounce === 'bottom'
            ? 'translateY(-6px)'
            : menuBounce === 'top'
            ? 'translateY(6px)'
            : 'translateY(0)',
        transition: 'transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1)',
      }}
      className={`w-16 md:w-20 border-r border-tv-border flex flex-col items-center py-2.5 justify-between transition-colors select-none overflow-y-auto no-scrollbar ${
        activePane === 'menu' ? 'bg-tv-surface' : 'bg-tv-bg'
      }`}
    >
      {/* Brand logo - non-button header to avoid confusion with the Direct button */}
      <div className="flex flex-col items-center pb-2 mb-1 border-b border-white/5 w-full px-1 flex-shrink-0 pointer-events-none">
        <span className="text-[11px] md:text-xs font-black tracking-wider bg-gradient-to-r from-sky-300 via-white to-tv-accent bg-clip-text text-transparent">
          KEOTV
        </span>
        <span className="text-[7px] font-mono font-bold tracking-widest text-sky-400/80 uppercase">
          by HO
        </span>
      </div>

      {/* Main sections (indices 0 to 5) */}
      <div className="flex flex-col space-y-1.5 w-full px-1.5 flex-shrink-0">
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
                } else if (item.id === 'replay') {
                  onOpenReplayModal();
                } else {
                  onSelectSection(item.id);
                }
              }}
              className={`w-full py-1.5 md:py-2 rounded-xl flex flex-col items-center justify-center transition-colors ${
                isFocused
                  ? 'bg-tv-focus text-white ring-2 ring-tv-accent shadow-tv-focus font-bold'
                  : isActive
                  ? 'bg-tv-card text-tv-accent border border-tv-border shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-tv-card/50'
              }`}
              title={item.label}
            >
              <Icon className="w-4 h-4 md:w-5 md:h-5 mb-0.5" />
              <span className="text-[8px] md:text-[9px] font-semibold">{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Bottom utility buttons (indices 6 and 7) */}
      <div className="flex flex-col space-y-1.5 w-full px-1.5 pt-2 border-t border-tv-border/50 flex-shrink-0 mt-2">
        {/* Settings / Options (index 6) */}
        <button
          id="menu-item-6"
          onClick={onOpenSettingsModal}
          className={`w-full py-1.5 md:py-2 rounded-xl flex flex-col items-center justify-center transition-colors ${
            activePane === 'menu' && focusedMenuIndex === 6
              ? 'bg-tv-focus text-white ring-2 ring-tv-accent shadow-tv-focus font-bold'
              : 'text-slate-400 hover:text-tv-accent hover:bg-tv-card/50'
          }`}
          title="Paramètres de l'application"
        >
          <Settings className="w-4 h-4 md:w-5 md:h-5 mb-0.5 text-tv-accent" />
          <span className="text-[8px] font-semibold">Options</span>
        </button>

        {/* Sync (index 7) */}
        <button
          id="menu-item-7"
          onClick={onOpenSyncModal}
          className={`w-full py-1.5 md:py-2 rounded-xl flex flex-col items-center justify-center transition-colors ${
            activePane === 'menu' && focusedMenuIndex === 7
              ? 'bg-tv-focus text-white ring-2 ring-emerald-400 shadow-tv-focus font-bold'
              : 'text-slate-400 hover:text-emerald-400 hover:bg-tv-card/50'
          }`}
          title="Synchroniser multi-appareils"
        >
          <RefreshCw className="w-4 h-4 md:w-5 md:h-5 mb-0.5 text-emerald-400" />
          <span className="text-[8px] font-semibold">Synchro</span>
        </button>
      </div>
    </div>
  );
};
