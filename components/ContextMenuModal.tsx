'use client';

import React, { useState, useEffect } from 'react';
import { Channel, Category } from '@/types/iptv';
import { Star, Play, Info, Lock, Unlock, X, EyeOff } from 'lucide-react';

interface ContextMenuModalProps {
  isOpen: boolean;
  item: Channel | null;
  category?: Category | null;
  onClose: () => void;
  onToggleFavorite?: (item: Channel) => void;
  onPlay?: (item: Channel) => void;
  onOpenDetails?: (item: Channel) => void;
  onToggleAdultCategory?: (category: Category) => void;
  onToggleHideCategory?: (category: Category) => void;
}

interface ContextOption {
  id: string;
  label: string;
  icon: any;
  color?: string;
  action: () => void;
}

export const ContextMenuModal: React.FC<ContextMenuModalProps> = ({
  isOpen,
  item,
  category,
  onClose,
  onToggleFavorite,
  onPlay,
  onOpenDetails,
  onToggleAdultCategory,
  onToggleHideCategory,
}) => {
  const [focusedIndex, setFocusedIndex] = useState<number>(0);

  const options: ContextOption[] = [];

  if (item && onToggleFavorite) {
    options.push({
      id: 'favorite',
      label: item.is_favorite ? 'Retirer des favoris' : 'Ajouter aux favoris',
      icon: Star,
      color: item.is_favorite ? 'text-amber-400 fill-amber-400' : 'text-slate-300',
      action: () => {
        onToggleFavorite(item);
        onClose();
      },
    });
  }

  if (item && onPlay) {
    options.push({
      id: 'play',
      label: item.stream_type === 'vod' || item.stream_type === 'series' ? 'Voir la fiche détaillée' : 'Regarder cette chaîne',
      icon: item.stream_type === 'vod' || item.stream_type === 'series' ? Info : Play,
      color: 'text-tv-accent',
      action: () => {
        if (item.stream_type === 'vod' || item.stream_type === 'series') {
          if (onOpenDetails) onOpenDetails(item);
          else onPlay(item);
        } else {
          onPlay(item);
        }
        onClose();
      },
    });
  }

  if (category && onToggleAdultCategory) {
    options.push({
      id: 'adult',
      label: category.is_adult ? 'Retirer la protection adulte (18+)' : 'Marquer comme bouquet adulte (18+)',
      icon: category.is_adult ? Unlock : Lock,
      color: category.is_adult ? 'text-slate-300' : 'text-rose-400',
      action: () => {
        onToggleAdultCategory(category);
        onClose();
      },
    });
  }

  if (category && onToggleHideCategory) {
    options.push({
      id: 'hide',
      label: category.is_hidden ? 'Réafficher ce bouquet' : 'Masquer / Exclure ce bouquet',
      icon: EyeOff,
      color: 'text-slate-300',
      action: () => {
        onToggleHideCategory(category);
        onClose();
      },
    });
  }

  options.push({
    id: 'close',
    label: 'Fermer',
    icon: X,
    color: 'text-slate-400',
    action: onClose,
  });

  useEffect(() => {
    if (isOpen) {
      setFocusedIndex(0);
    }
  }, [isOpen]);

  // Remote D-Pad Navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const isUp = e.key === 'ArrowUp' || (e as any).keyCode === 38;
      const isDown = e.key === 'ArrowDown' || (e as any).keyCode === 40;
      const isEnter =
        e.key === 'Enter' ||
        e.key === 'Select' ||
        (e as any).keyCode === 13 ||
        (e as any).keyCode === 23;
      const isBack =
        e.key === 'Escape' ||
        e.key === 'Backspace' ||
        (e as any).keyCode === 27 ||
        (e as any).keyCode === 4;

      if (isBack) {
        e.preventDefault();
        onClose();
        return;
      }

      if (isUp) {
        e.preventDefault();
        setFocusedIndex((prev) => (prev > 0 ? prev - 1 : options.length - 1));
        return;
      }

      if (isDown) {
        e.preventDefault();
        setFocusedIndex((prev) => (prev < options.length - 1 ? prev + 1 : 0));
        return;
      }

      if (isEnter) {
        e.preventDefault();
        const opt = options[focusedIndex];
        if (opt) opt.action();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, options, focusedIndex, onClose]);

  if (!isOpen || (!item && !category)) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-100">
      <div className="w-full max-w-sm bg-tv-surface border border-tv-border rounded-3xl p-5 shadow-2xl flex flex-col">
        {/* Header Preview */}
        <div className="flex items-center space-x-3.5 pb-4 mb-3 border-b border-tv-border/60">
          {item ? (
            <div className="w-12 h-12 rounded-xl bg-black/50 border border-white/10 flex items-center justify-center overflow-hidden flex-shrink-0">
              {item.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.logo}
                  alt=""
                  className="w-full h-full object-contain p-1"
                  onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
                />
              ) : (
                <span className="text-xs font-bold text-slate-400">{item.name.slice(0, 3)}</span>
              )}
            </div>
          ) : (
            <div className="w-12 h-12 rounded-xl bg-tv-card flex items-center justify-center text-tv-accent flex-shrink-0">
              <Lock className="w-6 h-6" />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-tv-accent">
              {item
                ? item.stream_type === 'vod'
                  ? 'Film VOD'
                  : item.stream_type === 'series'
                  ? 'Série'
                  : 'Direct TV'
                : 'Bouquet'}
            </span>
            <h3 className="text-sm font-bold text-white truncate">
              {item?.name || category?.name}
            </h3>
            {item?.group_name && (
              <p className="text-[11px] text-slate-400 truncate">{item.group_name}</p>
            )}
          </div>
        </div>

        {/* Action Buttons List */}
        <div className="flex flex-col space-y-2">
          {options.map((opt, idx) => {
            const isFocused = focusedIndex === idx;
            const Icon = opt.icon;

            return (
              <button
                key={opt.id}
                type="button"
                onClick={opt.action}
                className={`flex items-center space-x-3 px-4 py-3 rounded-2xl text-left text-sm font-semibold transition ${
                  isFocused
                    ? 'bg-tv-focus text-white ring-2 ring-tv-accent ring-offset-1 ring-offset-tv-bg shadow-lg font-bold'
                    : 'bg-tv-card/60 hover:bg-tv-cardHover text-slate-200 border border-white/5'
                }`}
              >
                <Icon className={`w-5 h-5 flex-shrink-0 ${opt.color || 'text-slate-300'}`} />
                <span className="truncate flex-1">{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
