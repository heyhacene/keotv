'use client';

import React from 'react';
import { Category } from '@/types/iptv';
import { X, Star, Tv, Trophy, Film, Globe, Compass, Check, ArrowUpDown } from 'lucide-react';

interface CategoryDrawerModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  selectedCategory: Category | null;
  onSelectCategory: (cat: Category, index: number) => void;
  categorySort?: 'playlist' | 'alpha' | 'count';
  onCategorySortChange?: (sort: 'playlist' | 'alpha' | 'count') => void;
}

export const CategoryDrawerModal: React.FC<CategoryDrawerModalProps> = ({
  isOpen,
  onClose,
  categories,
  selectedCategory,
  onSelectCategory,
  categorySort = 'playlist',
  onCategorySortChange,
}) => {
  if (!isOpen) return null;

  const getCategoryIcon = (iconName?: string) => {
    switch (iconName) {
      case 'Star':
        return <Star className="w-5 h-5 text-amber-400" />;
      case 'Trophy':
        return <Trophy className="w-5 h-5 text-rose-400" />;
      case 'Film':
        return <Film className="w-5 h-5 text-purple-400" />;
      case 'Globe':
        return <Globe className="w-5 h-5 text-emerald-400" />;
      case 'Compass':
        return <Compass className="w-5 h-5 text-indigo-400" />;
      default:
        return <Tv className="w-5 h-5 text-sky-400" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 p-0 sm:p-4 animate-in fade-in duration-150">
      <div className="w-full sm:max-w-md bg-tv-surface border sm:border-tv-border rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden text-slate-100 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-tv-border bg-tv-card/60 flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-white">Catégories & Groupes</h2>
            <p className="text-xs text-slate-400">
              {categories.length} groupes disponibles
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sort Controls Bar */}
        {onCategorySortChange && (
          <div className="px-5 py-2.5 bg-black/40 border-b border-tv-border/70 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center space-x-1.5 text-xs text-slate-400 font-medium">
              <ArrowUpDown className="w-3.5 h-3.5 text-tv-accent" />
              <span>Trier par :</span>
            </div>
            <div className="flex items-center space-x-1 bg-slate-900/80 p-1 rounded-lg border border-white/5">
              <button
                onClick={() => onCategorySortChange('playlist')}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                  categorySort === 'playlist'
                    ? 'bg-tv-focus text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Ordre d'origine de la playlist"
              >
                Playlist (Défaut)
              </button>
              <button
                onClick={() => onCategorySortChange('alpha')}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                  categorySort === 'alpha'
                    ? 'bg-tv-focus text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Ordre alphabétique A à Z"
              >
                A-Z
              </button>
              <button
                onClick={() => onCategorySortChange('count')}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                  categorySort === 'count'
                    ? 'bg-tv-focus text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Nombre de chaînes décroissant"
              >
                Nbr
              </button>
            </div>
          </div>
        )}

        {/* Categories List */}
        <div className="p-3 overflow-y-auto space-y-1.5 flex-1">
          {categories.map((cat, idx) => {
            const isSelected = selectedCategory?.id === cat.id;

            return (
              <button
                key={cat.id}
                onClick={() => {
                  onSelectCategory(cat, idx);
                  onClose();
                }}
                className={`w-full flex items-center justify-between p-3.5 rounded-xl text-left transition-transform ${
                  isSelected
                    ? 'bg-tv-focus text-white font-bold shadow-lg scale-[1.01]'
                    : 'bg-tv-card/70 hover:bg-tv-cardHover text-slate-200 border border-tv-border/50'
                }`}
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="p-2 rounded-lg bg-black/30 border border-white/5 flex-shrink-0">
                    {getCategoryIcon(cat.icon)}
                  </div>
                  <div className="min-w-0">
                    <span className="text-sm font-semibold truncate block">
                      {cat.name}
                    </span>
                    <span className="text-xs text-slate-400 block">
                      {cat.count > 0 ? `${cat.count} chaînes disponibles` : 'Disponible'}
                    </span>
                  </div>
                </div>

                {isSelected ? (
                  <Check className="w-5 h-5 text-white flex-shrink-0" />
                ) : cat.count > 0 ? (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono">
                    {cat.count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
