'use client';

import React, { useState, useEffect } from 'react';
import { Search, Clock, Wifi, Maximize2 } from 'lucide-react';

interface TopBarProps {
  currentCategoryName?: string;
  onOpenSearch?: () => void;
  onToggleFullscreen: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  currentCategoryName,
  onToggleFullscreen,
}) => {
  const [timeStr, setTimeStr] = useState('');

  useEffect(() => {
    const update = () => {
      setTimeStr(
        new Date().toLocaleTimeString('fr-FR', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="h-12 border-b border-tv-border bg-tv-surface/80 backdrop-blur-md px-6 flex items-center justify-between text-slate-200 select-none">
      <div className="flex items-center space-x-4">
        <span className="text-xs font-bold uppercase tracking-wider text-tv-accent">
          {currentCategoryName || 'En direct'}
        </span>
      </div>

      <div className="flex items-center space-x-6">
        <div className="flex items-center space-x-2 text-xs text-slate-400 font-mono">
          <Wifi className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-emerald-400 font-semibold">Connecté</span>
        </div>

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
};
