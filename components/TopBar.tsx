'use client';

import React, { useState, useEffect } from 'react';
import { Clock, Maximize2, User } from 'lucide-react';

interface TopBarProps {
  currentCategoryName?: string;
  onOpenSearch?: () => void;
  onToggleFullscreen: () => void;
  onOpenSyncModal?: () => void;
  activeUserLabel?: string | null;
}

export const TopBar: React.FC<TopBarProps> = React.memo(({
  currentCategoryName,
  onToggleFullscreen,
  onOpenSyncModal,
  activeUserLabel,
}) => {
  const [timeStr, setTimeStr] = useState('');

  useEffect(() => {
    const update = () => {
      setTimeStr(
        new Date().toLocaleTimeString('fr-FR', {
          hour: '2-digit',
          minute: '2-digit',
        })
      );
    };
    update();
    const timer = setInterval(update, 15000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="h-11 border-b border-tv-border bg-[#0b1018] px-6 flex items-center justify-between text-slate-200 select-none flex-shrink-0">
      <div className="flex items-center space-x-3">
        <span className="text-xs font-bold uppercase tracking-wider text-tv-accent">
          {currentCategoryName || 'En direct'}
        </span>
        <span className="text-[10px] font-mono text-slate-500 hidden sm:inline">• by HO</span>
      </div>

      <div className="flex items-center space-x-4">
        {/* User Account / Cloud Sync Pill (Interactive button, replaces unclickable fake icon) */}
        {onOpenSyncModal && (
          <button
            onClick={onOpenSyncModal}
            className="flex items-center space-x-1.5 text-xs font-medium px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 transition"
            title="Gérer votre compte et la synchronisation multi-appareils"
          >
            <User className="w-3.5 h-3.5 text-tv-accent" />
            <span className="max-w-[120px] truncate">{activeUserLabel || 'Connexion'}</span>
            {activeUserLabel && <span className="w-2 h-2 rounded-full bg-emerald-400 ml-0.5" />}
          </button>
        )}

        <div className="flex items-center space-x-1.5 text-xs text-slate-300 font-mono bg-black/40 px-2.5 py-1 rounded-lg border border-white/5">
          <Clock className="w-3.5 h-3.5 text-tv-accent" />
          <span>{timeStr}</span>
        </div>

        <button
          onClick={onToggleFullscreen}
          className="p-1.5 hover:bg-white/10 rounded-lg text-slate-300 hover:text-white transition"
          title="Plein écran (Entrée)"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
});
TopBar.displayName = 'TopBar';
