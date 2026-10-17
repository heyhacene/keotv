'use client';

import React from 'react';
import { Category } from '@/types/iptv';
import { X, Star, Tv, Trophy, Film, Globe, Compass, Check } from 'lucide-react';

interface CategoryDrawerModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  selectedCategory: Category | null;
  onSelectCategory: (cat: Category, index: number) => void;
}

export const CategoryDrawerModal: React.FC<CategoryDrawerModalProps> = ({
  isOpen,
  onClose,
  categories,
  selectedCategory,
  onSelectCategory,
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-150">
      <div className="w-full sm:max-w-md bg-tv-surface border sm:border-tv-border rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden text-slate-100 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-tv-border bg-tv-card/60 flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-white">Catégories & Groupes</h2>
            <p className="text-xs text-slate-400">Choisissez un groupe de chaînes</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

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
                className={`w-full flex items-center justify-between p-3.5 rounded-xl text-left transition-all ${
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
                      {cat.count} chaînes disponibles
                    </span>
                  </div>
                </div>

                {isSelected ? (
                  <Check className="w-5 h-5 text-white flex-shrink-0" />
                ) : (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono">
                    {cat.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
