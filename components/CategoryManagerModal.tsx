'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Category } from '@/types/iptv';
import {
  X,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  RotateCcw,
  Search,
  Tv,
  Film,
  Clapperboard,
  Sliders,
  Check,
} from 'lucide-react';
import { ParentalPinModal } from './ParentalPinModal';

interface CategoryManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  onUpdateCategory: (catId: string, updates: Partial<Category>) => Promise<void>;
  onReorderCategories: (reordered: Category[]) => Promise<void>;
  onResetOrder?: () => Promise<void>;
  parentalPin?: string;
  parentalEnabled?: boolean;
}

export const CategoryManagerModal: React.FC<CategoryManagerModalProps> = ({
  isOpen,
  onClose,
  categories,
  onUpdateCategory,
  onReorderCategories,
  onResetOrder,
  parentalPin = '0000',
  parentalEnabled = false,
}) => {
  const [activeTab, setActiveTab] = useState<'live' | 'vod' | 'series'>('live');
  const [searchQuery, setSearchQuery] = useState('');
  const [localCategories, setLocalCategories] = useState<Category[]>(categories);
  const [focusedIndex, setFocusedIndex] = useState<number>(0);
  const [focusedAction, setFocusedAction] = useState<'moveUp' | 'moveDown' | 'toggleHide' | 'toggleAdult'>('moveUp');

  useEffect(() => {
    setLocalCategories(categories);
  }, [categories]);

  // Filtered categories for the active section & search query
  const sectionCategories = useMemo(() => {
    return localCategories
      .filter((c) => {
        if (c.id === 'fav' || c.id.startsWith('fav_')) return false;
        if (activeTab === 'live') return !c.type || c.type === 'live';
        return c.type === activeTab;
      })
      .sort((a, b) => (a.custom_order || 0) - (b.custom_order || 0));
  }, [localCategories, activeTab]);

  const displayedCategories = useMemo(() => {
    if (!searchQuery.trim()) return sectionCategories;
    const q = searchQuery.toLowerCase();
    return sectionCategories.filter((c) => c.name.toLowerCase().includes(q));
  }, [sectionCategories, searchQuery]);

  // Move a category up or down in the custom order
  const handleMove = async (cat: Category, direction: 'up' | 'down') => {
    const list = [...sectionCategories];
    const currentIndex = list.findIndex((c) => c.id === cat.id);
    if (currentIndex === -1) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= list.length) return;

    // Swap custom_order
    const temp = list[currentIndex].custom_order;
    list[currentIndex].custom_order = list[targetIndex].custom_order;
    list[targetIndex].custom_order = temp;

    // In case custom_order was identical, normalize
    if (list[currentIndex].custom_order === list[targetIndex].custom_order) {
      list.forEach((c, idx) => {
        c.custom_order = idx;
      });
      // re-swap
      const newTemp = list[currentIndex].custom_order;
      list[currentIndex].custom_order = list[targetIndex].custom_order;
      list[targetIndex].custom_order = newTemp;
    }

    const updatedMap = new Map<string, number>();
    list.forEach((c) => updatedMap.set(c.id, c.custom_order));

    const nextAll = localCategories.map((c) => {
      if (updatedMap.has(c.id)) {
        return { ...c, custom_order: updatedMap.get(c.id)! };
      }
      return c;
    });

    setLocalCategories(nextAll);
    await onReorderCategories(nextAll);
    setFocusedIndex(targetIndex);
  };

  const handleToggleHide = async (cat: Category) => {
    const nextHidden = !cat.is_hidden;
    const nextAll = localCategories.map((c) => (c.id === cat.id ? { ...c, is_hidden: nextHidden } : c));
    setLocalCategories(nextAll);
    await onUpdateCategory(cat.id, { is_hidden: nextHidden });
  };

  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const pendingActionRef = useRef<(() => void) | null>(null);

  const requirePin = (action: () => void) => {
    if (parentalEnabled) {
      pendingActionRef.current = action;
      setIsPinModalOpen(true);
    } else {
      action();
    }
  };

  const handlePinSuccess = () => {
    setIsPinModalOpen(false);
    if (pendingActionRef.current) {
      pendingActionRef.current();
      pendingActionRef.current = null;
    }
  };

  const handleToggleAdult = async (cat: Category) => {
    requirePin(async () => {
      const nextAdult = !cat.is_adult;
      const nextAll = localCategories.map((c) => (c.id === cat.id ? { ...c, is_adult: nextAdult } : c));
      setLocalCategories(nextAll);
      await onUpdateCategory(cat.id, { is_adult: nextAdult });
    });
  };

  const [focusArea, setFocusArea] = useState<'tabs' | 'list' | 'footer'>('tabs');
  const [tabIndex, setTabIndex] = useState<number>(0); // 0: live, 1: vod, 2: series

  // Reset focus to tabs or list upon opening
  useEffect(() => {
    if (isOpen) {
      setFocusArea('tabs');
      setFocusedIndex(0);
    }
  }, [isOpen]);

  // Sync tabIndex when activeTab changes
  useEffect(() => {
    if (activeTab === 'live') setTabIndex(0);
    else if (activeTab === 'vod') setTabIndex(1);
    else if (activeTab === 'series') setTabIndex(2);
  }, [activeTab]);

  // TV Remote controls
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const isUp = e.key === 'ArrowUp' || (e as any).keyCode === 38;
      const isDown = e.key === 'ArrowDown' || (e as any).keyCode === 40;
      const isLeft = e.key === 'ArrowLeft' || (e as any).keyCode === 37;
      const isRight = e.key === 'ArrowRight' || (e as any).keyCode === 39;
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

      if (focusArea === 'tabs') {
        if (isLeft) {
          e.preventDefault();
          const nextTabIdx = Math.max(0, tabIndex - 1);
          setTabIndex(nextTabIdx);
          const tabKeys: Array<'live' | 'vod' | 'series'> = ['live', 'vod', 'series'];
          setActiveTab(tabKeys[nextTabIdx]);
          setFocusedIndex(0);
          return;
        }
        if (isRight) {
          e.preventDefault();
          const nextTabIdx = Math.min(2, tabIndex + 1);
          setTabIndex(nextTabIdx);
          const tabKeys: Array<'live' | 'vod' | 'series'> = ['live', 'vod', 'series'];
          setActiveTab(tabKeys[nextTabIdx]);
          setFocusedIndex(0);
          return;
        }
        if (isDown) {
          e.preventDefault();
          if (displayedCategories.length > 0) {
            setFocusArea('list');
            setFocusedIndex(0);
          } else {
            setFocusArea('footer');
          }
          return;
        }
      } else if (focusArea === 'list') {
        if (isUp) {
          e.preventDefault();
          if (focusedIndex > 0) {
            setFocusedIndex((prev) => prev - 1);
          } else {
            setFocusArea('tabs');
          }
          return;
        }

        if (isDown) {
          e.preventDefault();
          if (focusedIndex < displayedCategories.length - 1) {
            setFocusedIndex((prev) => prev + 1);
          } else {
            setFocusArea('footer');
          }
          return;
        }

        if (isLeft) {
          e.preventDefault();
          if (focusedAction === 'moveDown') setFocusedAction('moveUp');
          else if (focusedAction === 'toggleHide') setFocusedAction('moveDown');
          else if (focusedAction === 'toggleAdult') setFocusedAction('toggleHide');
          return;
        }

        if (isRight) {
          e.preventDefault();
          if (focusedAction === 'moveUp') setFocusedAction('moveDown');
          else if (focusedAction === 'moveDown') setFocusedAction('toggleHide');
          else if (focusedAction === 'toggleHide') setFocusedAction('toggleAdult');
          return;
        }

        if (isEnter) {
          e.preventDefault();
          const currentCat = displayedCategories[focusedIndex];
          if (!currentCat) return;

          if (focusedAction === 'moveUp') handleMove(currentCat, 'up');
          else if (focusedAction === 'moveDown') handleMove(currentCat, 'down');
          else if (focusedAction === 'toggleHide') handleToggleHide(currentCat);
          else if (focusedAction === 'toggleAdult') handleToggleAdult(currentCat);
          return;
        }
      } else if (focusArea === 'footer') {
        if (isUp) {
          e.preventDefault();
          if (displayedCategories.length > 0) {
            setFocusArea('list');
            setFocusedIndex(displayedCategories.length - 1);
          } else {
            setFocusArea('tabs');
          }
          return;
        }
        if (isEnter) {
          e.preventDefault();
          onClose();
          return;
        }
      }
    };

    if (!isPinModalOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isPinModalOpen, focusArea, tabIndex, displayedCategories, focusedIndex, focusedAction, onClose]);

  if (!isOpen) return null;

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-6 animate-in fade-in duration-150">
      <div className="w-full max-w-3xl bg-tv-surface border border-tv-border rounded-3xl shadow-2xl flex flex-col h-[90vh] overflow-hidden text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-tv-border bg-tv-card/60 flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-tv-accent/20 border border-tv-accent/30 flex items-center justify-center text-tv-accent">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white">
                Ordre & Exclusion des Bouquets
              </h2>
              <p className="text-xs text-slate-400">
                Réorganisez, masquez ou protégez vos catégories avec le code parental
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Section Tabs & Search Bar */}
        <div className="px-6 py-3 border-b border-tv-border/50 bg-black/30 flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
          <div className="flex items-center space-x-1.5 bg-tv-card p-1 rounded-xl border border-white/5">
            <button
              type="button"
              onClick={() => {
                setActiveTab('live');
                setTabIndex(0);
                setFocusedIndex(0);
              }}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                activeTab === 'live'
                  ? focusArea === 'tabs' && tabIndex === 0
                    ? 'bg-tv-focus text-white shadow-md ring-2 ring-tv-accent'
                    : 'bg-tv-focus text-white shadow-md'
                  : focusArea === 'tabs' && tabIndex === 0
                  ? 'bg-white/20 text-white ring-2 ring-tv-accent'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Tv className="w-3.5 h-3.5 text-sky-400" />
              <span>Direct TV</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('vod');
                setTabIndex(1);
                setFocusedIndex(0);
              }}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                activeTab === 'vod'
                  ? focusArea === 'tabs' && tabIndex === 1
                    ? 'bg-tv-focus text-white shadow-md ring-2 ring-tv-accent'
                    : 'bg-tv-focus text-white shadow-md'
                  : focusArea === 'tabs' && tabIndex === 1
                  ? 'bg-white/20 text-white ring-2 ring-tv-accent'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Film className="w-3.5 h-3.5 text-purple-400" />
              <span>Films VOD</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('series');
                setTabIndex(2);
                setFocusedIndex(0);
              }}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                activeTab === 'series'
                  ? focusArea === 'tabs' && tabIndex === 2
                    ? 'bg-tv-focus text-white shadow-md ring-2 ring-tv-accent'
                    : 'bg-tv-focus text-white shadow-md'
                  : focusArea === 'tabs' && tabIndex === 2
                  ? 'bg-white/20 text-white ring-2 ring-tv-accent'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Clapperboard className="w-3.5 h-3.5 text-pink-400" />
              <span>Séries</span>
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Filtrer un bouquet..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 bg-tv-card border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-tv-accent w-48"
              />
            </div>
            {onResetOrder && (
              <button
                type="button"
                onClick={onResetOrder}
                className="px-3 py-1.5 rounded-xl border border-white/10 bg-tv-card hover:bg-tv-cardHover text-slate-300 text-xs font-semibold flex items-center space-x-1.5 transition"
                title="Rétablir l'ordre d'origine de la playlist"
              >
                <RotateCcw className="w-3 h-3 text-slate-400" />
                <span>Réinitialiser</span>
              </button>
            )}
          </div>
        </div>

        {/* Categories List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-2">
          {displayedCategories.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-sm">
              Aucun bouquet trouvé dans cette section.
            </div>
          ) : (
            displayedCategories.map((cat, idx) => {
              const isRowFocused = focusArea === 'list' && focusedIndex === idx;

              return (
                <div
                  key={cat.id}
                  id={`cat-mgr-${idx}`}
                  className={`flex items-center justify-between p-3 rounded-2xl border transition ${
                    isRowFocused
                      ? 'bg-tv-card border-tv-accent ring-1 ring-tv-accent'
                      : cat.is_hidden
                      ? 'bg-black/40 border-transparent opacity-60'
                      : 'bg-tv-card/60 border-white/5 hover:bg-tv-card'
                  }`}
                >
                  {/* Category Name & Badges */}
                  <div className="flex items-center space-x-3 min-w-0 flex-1 mr-3">
                    <span className="text-xs font-mono font-bold text-slate-500 w-8 text-right flex-shrink-0">
                      #{idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center space-x-2">
                        <h4
                          className={`text-sm font-semibold truncate ${
                            cat.is_hidden ? 'line-through text-slate-500' : 'text-white'
                          }`}
                        >
                          {cat.name}
                        </h4>
                        {cat.is_adult && (
                          <span className="text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30 px-1.5 py-0.5 rounded font-black flex items-center space-x-1 flex-shrink-0">
                            <Lock className="w-2.5 h-2.5" />
                            <span>18+</span>
                          </span>
                        )}
                        {cat.is_hidden && (
                          <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-medium flex-shrink-0">
                            Masqué
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-500 font-mono">
                        {cat.count} éléments
                      </span>
                    </div>
                  </div>

                  {/* Actions: Reorder (Up/Down), Hide/Show, Adult Lock */}
                  <div className="flex items-center space-x-1.5 flex-shrink-0">
                    {/* Up */}
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => handleMove(cat, 'up')}
                      className={`p-2 rounded-xl border transition ${
                        isRowFocused && focusedAction === 'moveUp'
                          ? 'bg-tv-focus text-white ring-2 ring-tv-accent'
                          : 'bg-tv-card hover:bg-tv-cardHover text-slate-300 border-white/5 disabled:opacity-30'
                      }`}
                      title="Monter le bouquet"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>

                    {/* Down */}
                    <button
                      type="button"
                      disabled={idx === displayedCategories.length - 1}
                      onClick={() => handleMove(cat, 'down')}
                      className={`p-2 rounded-xl border transition ${
                        isRowFocused && focusedAction === 'moveDown'
                          ? 'bg-tv-focus text-white ring-2 ring-tv-accent'
                          : 'bg-tv-card hover:bg-tv-cardHover text-slate-300 border-white/5 disabled:opacity-30'
                      }`}
                      title="Descendre le bouquet"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>

                    {/* Toggle Hide */}
                    <button
                      type="button"
                      onClick={() => handleToggleHide(cat)}
                      className={`p-2 rounded-xl border transition ${
                        isRowFocused && focusedAction === 'toggleHide'
                          ? 'bg-tv-focus text-white ring-2 ring-tv-accent'
                          : cat.is_hidden
                          ? 'bg-slate-800 text-slate-500 border-white/5'
                          : 'bg-tv-card text-slate-300 hover:text-white border-white/5'
                      }`}
                      title={cat.is_hidden ? 'Réafficher ce bouquet' : 'Masquer ce bouquet de la liste'}
                    >
                      {cat.is_hidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>

                    {/* Toggle Adult Lock */}
                    <button
                      type="button"
                      onClick={() => handleToggleAdult(cat)}
                      className={`p-2 rounded-xl border transition ${
                        isRowFocused && focusedAction === 'toggleAdult'
                          ? 'bg-tv-focus text-white ring-2 ring-tv-accent'
                          : cat.is_adult
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                          : 'bg-tv-card text-slate-400 hover:text-slate-200 border-white/5'
                      }`}
                      title={cat.is_adult ? 'Retirer la protection adulte' : 'Marquer comme bouquet adulte (Contrôle parental)'}
                    >
                      {cat.is_adult ? (
                        <Lock className="w-4 h-4 fill-rose-400/20" />
                      ) : (
                        <Unlock className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info bar */}
        <div className="px-6 py-3 border-t border-tv-border/50 bg-black/40 flex items-center justify-between text-xs text-slate-400 flex-shrink-0">
          <span>
            {displayedCategories.filter((c) => !c.is_hidden).length} bouquets actifs ({displayedCategories.filter((c) => c.is_hidden).length} masqués)
          </span>
          <button
            type="button"
            onClick={onClose}
            className={`px-4 py-2 rounded-xl bg-tv-accent text-slate-950 font-bold hover:bg-sky-400 transition ${
              focusArea === 'footer' ? 'ring-4 ring-white ring-offset-2 ring-offset-black scale-105' : ''
            }`}
          >
            Terminer
          </button>
        </div>
      </div>
    </div>
      <ParentalPinModal
        isOpen={isPinModalOpen}
        onClose={() => setIsPinModalOpen(false)}
        onSuccess={handlePinSuccess}
        correctPin={parentalPin}
      />
    </>
  );
};
