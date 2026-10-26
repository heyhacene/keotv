'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Settings as SettingsIcon,
  Server,
  RefreshCw,
  Sliders,
  ShieldCheck,
  Heart,
  Download,
  PlusCircle,
  MessageSquare,
  ExternalLink,
  Trash2,
  AlertTriangle,
  Send,
  CheckCircle2,
  Radio,
  Pencil,
  Clock,
} from 'lucide-react';
import { PlaylistConfig } from '@/types/iptv';
import { submitAppFeedback, getActiveKeoUser, logoutKeoUser, KeoUserAccount } from '@/lib/supabase';
import { ParentalPinModal } from "./ParentalPinModal";
import { checkForAppUpdate, AppUpdateInfo, CURRENT_BUILD_NUMBER, DOWNLOADER_CODE, DIRECT_APK_URL } from '@/lib/update-service';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  syncCode: string;
  playlists: PlaylistConfig[];
  onOpenXtreamModal: () => void;
  onOpenSyncModal: () => void;
  onDeletePlaylist: (id: string) => Promise<void>;
  onRestoreDemoPlaylist: () => Promise<void>;
  onResyncPlaylist?: (playlist: PlaylistConfig) => Promise<void>;
  onEditPlaylist?: (playlist: PlaylistConfig) => void;
  isResyncing?: boolean;
  currentBuildNumber?: number;
  categorySort?: 'playlist' | 'alpha' | 'count';
  onCategorySortChange?: (sort: 'playlist' | 'alpha' | 'count') => void;
  channelSort?: 'playlist' | 'alpha' | 'num';
  onChannelSortChange?: (sort: 'playlist' | 'alpha' | 'num') => void;
  autoRefreshInterval?: number;
  onAutoRefreshIntervalChange?: (interval: number) => void;
  lastAutoRefreshAt?: string;
  onTriggerSilentRefresh?: () => void;
  isSilentRefreshing?: boolean;
  onOpenCategoryManager?: () => void;
  parentalPin?: string;
  onUpdateParentalPin?: (pin: string) => void;
  parentalEnabled?: boolean;
  onToggleParentalEnabled?: (enabled: boolean) => void;
  parentalHideAdult?: boolean;
  onToggleParentalHideAdult?: (hide: boolean) => void;
  showFavoritesCategory?: boolean;
  onToggleShowFavoritesCategory?: (show: boolean) => void;
  excludedPrefixes?: string[];
  onUpdateExcludedPrefixes?: (prefixes: string[]) => void;
}

const TABS: Array<{ id: 'playlists' | 'controls' | 'categories' | 'parental' | 'player' | 'sync' | 'update' | 'feedback'; label: string; icon: any }> = [
  { id: 'playlists', label: 'Playlists & Abonnements', icon: Server },
  { id: 'categories', label: 'Ordre & Bouquets', icon: Sliders },
  { id: 'parental', label: 'Contrôle Parental', icon: ShieldCheck },
  { id: 'controls', label: 'Télécommande & Zapping', icon: Radio },
  { id: 'player', label: 'Affichage & Buffer', icon: Sliders },
  { id: 'sync', label: 'Identification & Synchro', icon: RefreshCw },
  { id: 'update', label: 'Mise à jour', icon: Download },
  { id: 'feedback', label: 'Avis & Dons', icon: Heart },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  syncCode,
  playlists,
  onOpenXtreamModal,
  onOpenSyncModal,
  onDeletePlaylist,
  onRestoreDemoPlaylist,
  onResyncPlaylist,
  onEditPlaylist,
  isResyncing = false,
  currentBuildNumber = CURRENT_BUILD_NUMBER,
  categorySort = 'playlist',
  onCategorySortChange,
  channelSort = 'playlist',
  onChannelSortChange,
  autoRefreshInterval = 24,
  onAutoRefreshIntervalChange,
  lastAutoRefreshAt,
  onTriggerSilentRefresh,
  isSilentRefreshing = false,
  onOpenCategoryManager,
  parentalPin = '0000',
  onUpdateParentalPin,
  parentalEnabled = false,
  onToggleParentalEnabled,
  parentalHideAdult = false,
  onToggleParentalHideAdult,
  showFavoritesCategory = true,
  onToggleShowFavoritesCategory,
  excludedPrefixes = [],
  onUpdateExcludedPrefixes,
}) => {
  const [activeTab, setActiveTab] = useState<'playlists' | 'controls' | 'categories' | 'parental' | 'sync' | 'update' | 'feedback' | 'player'>('playlists');
  const [localPlaylists, setLocalPlaylists] = useState<PlaylistConfig[]>(playlists);

  useEffect(() => {
    setLocalPlaylists(playlists);
  }, [playlists]);

  const [editingPrefixInput, setEditingPrefixInput] = useState<string>(excludedPrefixes.join(', '));

  useEffect(() => {
    setEditingPrefixInput(excludedPrefixes.join(', '));
  }, [excludedPrefixes]);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null);

  const [editingPin, setEditingPin] = useState(parentalPin);
  const [pinSavedFeedback, setPinSavedFeedback] = useState(false);

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


  // TV Remote & Zapping configurable settings
  const [zappingMode, setZappingMode] = useState<'direct' | 'banner'>('direct');
  const [osdDuration, setOsdDuration] = useState<'2s' | '3.5s' | '5s' | 'manual'>('3.5s');
  const [okAction, setOkAction] = useState<'fullscreen' | 'preview'>('fullscreen');
  const [bufferSize, setBufferSize] = useState<'300ms' | '1000ms' | '2500ms'>('300ms');

  // Load saved preferences on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('keotv_controls_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.zappingMode) setZappingMode(parsed.zappingMode);
        if (parsed.osdDuration) setOsdDuration(parsed.osdDuration);
        if (parsed.okAction) setOkAction(parsed.okAction);
        if (parsed.bufferSize) setBufferSize(parsed.bufferSize);
      }
    } catch {
      // ignore
    }
  }, []);

  const saveControlSetting = (key: string, val: string) => {
    try {
      const current = {
        zappingMode,
        osdDuration,
        okAction,
        bufferSize,
        [key]: val,
      };
      localStorage.setItem('keotv_controls_settings', JSON.stringify(current));
    } catch {
      // ignore
    }
  };

  // Playlist delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // In-app Feedback Form states
  const [feedbackCategory, setFeedbackCategory] = useState<'suggestion' | 'bug' | 'channel' | 'compliment'>('suggestion');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackEmail, setFeedbackEmail] = useState('');
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  // TV Remote Navigation states
  const [focusArea, setFocusArea] = useState<'tabs' | 'content'>('tabs');
  const [selectedTabNavIndex, setSelectedTabNavIndex] = useState<number>(0); // 0..TABS.length-1 = tabs, TABS.length = close button
  const [contentFocusIndex, setContentFocusIndex] = useState<number>(0);
  const modalBodyRef = useRef<HTMLDivElement | null>(null);

  // Helper to fetch all focusable interactive elements inside the active tab content
  const getContentFocusableElements = useCallback((): HTMLElement[] => {
    if (!modalBodyRef.current) return [];
    return Array.from(
      modalBodyRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href]:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex="0"]'
      )
    ).filter((el) => {
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).display !== 'none';
    });
  }, []);

  // Sync visual TV focus attribute onto active content element
  useEffect(() => {
    if (!isOpen) return;
    const items = getContentFocusableElements();
    items.forEach((item, idx) => {
      if (focusArea === 'content' && idx === contentFocusIndex) {
        item.setAttribute('data-tv-focused', 'true');
        item.focus();
        item.scrollIntoView({ behavior: 'auto', block: 'nearest' });
      } else {
        item.removeAttribute('data-tv-focused');
      }
    });
  }, [isOpen, focusArea, contentFocusIndex, activeTab, getContentFocusableElements, deletingId]);

  // When opening or switching tabs, reset or align TV focus
  useEffect(() => {
    if (isOpen) {
      setFocusArea('tabs');
      setSelectedTabNavIndex(0);
      setContentFocusIndex(0);
      const timer = setTimeout(() => {
        document.getElementById('settings-tab-0')?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Spatial navigation helper: finds the best element in a given direction
  const findNextSpatialElement = useCallback(
    (direction: 'down' | 'up' | 'left' | 'right', currentIndex: number): number => {
      const items = getContentFocusableElements();
      if (items.length <= 1 || currentIndex < 0 || currentIndex >= items.length) return currentIndex;

      const currentRect = items[currentIndex].getBoundingClientRect();
      const currentCenterX = currentRect.left + currentRect.width / 2;
      const currentCenterY = currentRect.top + currentRect.height / 2;

      let bestIndex = currentIndex;
      let minDistance = Infinity;

      for (let i = 0; i < items.length; i++) {
        if (i === currentIndex) continue;
        const rect = items[i].getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const deltaY = centerY - currentCenterY;
        const deltaX = centerX - currentCenterX;

        if (direction === 'down') {
          // Must be below the current element (at least 8px below the top of current)
          if (rect.top >= currentRect.bottom - 4 || deltaY > 15) {
            // Distance with vertical priority
            const distance = Math.abs(deltaY) * 1.5 + Math.abs(deltaX);
            if (distance < minDistance) {
              minDistance = distance;
              bestIndex = i;
            }
          }
        } else if (direction === 'up') {
          // Must be above the current element
          if (rect.bottom <= currentRect.top + 4 || deltaY < -15) {
            const distance = Math.abs(deltaY) * 1.5 + Math.abs(deltaX);
            if (distance < minDistance) {
              minDistance = distance;
              bestIndex = i;
            }
          }
        } else if (direction === 'right') {
          // Must be to the right and roughly on the same row (vertical overlap)
          if (rect.left >= currentRect.right - 4 && Math.abs(deltaY) < Math.max(rect.height, currentRect.height)) {
            const distance = Math.abs(deltaX) + Math.abs(deltaY) * 2;
            if (distance < minDistance) {
              minDistance = distance;
              bestIndex = i;
            }
          }
        } else if (direction === 'left') {
          // Must be to the left and roughly on the same row
          if (rect.right <= currentRect.left + 4 && Math.abs(deltaY) < Math.max(rect.height, currentRect.height)) {
            const distance = Math.abs(deltaX) + Math.abs(deltaY) * 2;
            if (distance < minDistance) {
              minDistance = distance;
              bestIndex = i;
            }
          }
        }
      }

      return bestIndex;
    },
    [getContentFocusableElements]
  );

  // Dedicated TV Remote D-Pad Navigation inside the Settings Modal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isPinModalOpen) return;
      const keyCode = (e as any).keyCode || 0;
      const key = e.key || '';

      const isEnter =
        key === 'Enter' ||
        key === 'Select' ||
        key === 'Ok' ||
        keyCode === 13 ||
        keyCode === 23 || // Android DPAD_CENTER
        keyCode === 66;

      const isUp =
        key === 'ArrowUp' ||
        key === 'Up' ||
        keyCode === 38 ||
        keyCode === 19;   // Android DPAD_UP

      const isDown =
        key === 'ArrowDown' ||
        key === 'Down' ||
        keyCode === 40 ||
        keyCode === 20;   // Android DPAD_DOWN

      const isLeft =
        key === 'ArrowLeft' ||
        key === 'Left' ||
        keyCode === 37 ||
        keyCode === 21;   // Android DPAD_LEFT

      const isRight =
        key === 'ArrowRight' ||
        key === 'Right' ||
        keyCode === 39 ||
        keyCode === 22;   // Android DPAD_RIGHT

      const target = e.target as HTMLElement | null;
      const isInputFocused = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');

      // If user is editing text in an input or textarea, allow Backspace for deletion without closing modal
      if (e.key === 'Backspace' && isInputFocused) {
        return;
      }

      const isBack =
        key === 'Escape' ||
        (!isInputFocused && key === 'Backspace') ||
        key === 'GoBack' ||
        key === 'Back' ||
        keyCode === 27 ||
        keyCode === 4;    // Android BACK

      // Close modal or return to sidebar on remote Back
      if (isBack) {
        e.preventDefault();
        e.stopPropagation();
        if (focusArea === 'content') {
          // Return focus to vertical tabs list
          setFocusArea('tabs');
          const t = document.getElementById(`settings-tab-${selectedTabNavIndex}`);
          t?.focus();
        } else {
          onClose();
        }
        return;
      }

      // --- SECTION 1: MASTER SIDEBAR TABS (VERTICAL D-PAD ONLY FOR TABS 0..TABS.length-1) ---
      if (focusArea === 'tabs') {
        if (isUp) {
          e.preventDefault();
          setSelectedTabNavIndex((prev) => {
            const next = prev > 0 ? prev - 1 : TABS.length - 1;
            setActiveTab(TABS[next].id);
            setContentFocusIndex(0);
            const t = document.getElementById(`settings-tab-${next}`);
            t?.focus();
            t?.scrollIntoView({ behavior: 'auto', block: 'nearest' });
            return next;
          });
          return;
        }

        if (isDown) {
          e.preventDefault();
          setSelectedTabNavIndex((prev) => {
            const next = prev < TABS.length - 1 ? prev + 1 : 0;
            setActiveTab(TABS[next].id);
            setContentFocusIndex(0);
            const t = document.getElementById(`settings-tab-${next}`);
            t?.focus();
            t?.scrollIntoView({ behavior: 'auto', block: 'nearest' });
            return next;
          });
          return;
        }

        if (isRight || isEnter) {
          e.preventDefault();
          const items = getContentFocusableElements();
          if (items.length > 0) {
            setFocusArea('content');
            setContentFocusIndex(0);
            items[0].focus();
            items[0].scrollIntoView({ behavior: 'auto', block: 'nearest' });
          }
          return;
        }
      }

      // --- SECTION 2: DETAIL CONTENT AREA (TRUE 2D SPATIAL D-PAD) ---
      if (focusArea === 'content') {
        const items = getContentFocusableElements();
        if (items.length === 0) {
          if (isLeft || isUp) {
            e.preventDefault();
            setFocusArea('tabs');
            document.getElementById(`settings-tab-${selectedTabNavIndex}`)?.focus();
          }
          return;
        }

        if (isLeft) {
          e.preventDefault();
          const nextIndex = findNextSpatialElement('left', contentFocusIndex);
          if (nextIndex !== contentFocusIndex) {
            // There is another element to the left on the same row!
            setContentFocusIndex(nextIndex);
            items[nextIndex]?.focus();
            items[nextIndex]?.scrollIntoView({ behavior: 'auto', block: 'nearest' });
          } else {
            // No element to the left -> Return to master sidebar
            setFocusArea('tabs');
            const t = document.getElementById(`settings-tab-${selectedTabNavIndex}`);
            t?.focus();
          }
          return;
        }

        if (isRight) {
          e.preventDefault();
          const nextIndex = findNextSpatialElement('right', contentFocusIndex);
          if (nextIndex !== contentFocusIndex) {
            setContentFocusIndex(nextIndex);
            items[nextIndex]?.focus();
            items[nextIndex]?.scrollIntoView({ behavior: 'auto', block: 'nearest' });
          }
          return;
        }

        if (isDown) {
          e.preventDefault();
          const nextIndex = findNextSpatialElement('down', contentFocusIndex);
          if (nextIndex !== contentFocusIndex) {
            setContentFocusIndex(nextIndex);
            items[nextIndex]?.focus();
            items[nextIndex]?.scrollIntoView({ behavior: 'auto', block: 'nearest' });
          }
          return;
        }

        if (isUp) {
          e.preventDefault();
          const nextIndex = findNextSpatialElement('up', contentFocusIndex);
          if (nextIndex !== contentFocusIndex) {
            setContentFocusIndex(nextIndex);
            items[nextIndex]?.focus();
            items[nextIndex]?.scrollIntoView({ behavior: 'auto', block: 'nearest' });
          } else {
            // At the top of content -> Return to master sidebar
            setFocusArea('tabs');
            const t = document.getElementById(`settings-tab-${selectedTabNavIndex}`);
            t?.focus();
          }
          return;
        }

        if (isEnter) {
          const current = items[contentFocusIndex];
          if (current && current.tagName !== 'INPUT' && current.tagName !== 'TEXTAREA') {
            e.preventDefault();
            current.click();
          }
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [
    isOpen,
    isPinModalOpen,
    focusArea,
    selectedTabNavIndex,
    contentFocusIndex,
    getContentFocusableElements,
    findNextSpatialElement,
    onClose,
  ]);

  if (!isOpen && !isPinModalOpen) return null;

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    setUpdateStatus(null);
    try {
      const info = await checkForAppUpdate(currentBuildNumber);
      setUpdateInfo(info);
      if (info.hasUpdate) {
        setUpdateStatus(`🎉 Nouvelle version disponible : Build ${info.latestBuild} (Votre version : Build ${info.currentBuild})`);
      } else {
        setUpdateStatus(`✓ Votre application KeoTV est parfaitement à jour (Build ${info.currentBuild}).`);
      }
    } catch {
      setUpdateStatus('Impossible de vérifier pour le moment. Vérifiez votre connexion internet.');
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackMessage.trim()) return;

    setFeedbackSubmitting(true);
    setFeedbackError(null);

    const res = await submitAppFeedback({
      app_name: 'keotv',
      category: feedbackCategory,
      message: feedbackMessage,
      contact_email: feedbackEmail,
    });

    setFeedbackSubmitting(false);
    if (res.success) {
      setFeedbackSubmitted(true);
      setFeedbackMessage('');
      setTimeout(() => setFeedbackSubmitted(false), 5000);
    } else {
      setFeedbackError(res.error || "Impossible d'envoyer votre message.");
    }
  };

  if (!isOpen) return null;

  return (
    <>
    <div className={`fixed inset-0 z-50 bg-[#080c14] text-slate-100 flex flex-col w-full h-full animate-in fade-in duration-150 select-none ${isPinModalOpen ? 'hidden' : ''}`}>
      <div className="w-full h-full bg-[#080c14] text-slate-100 flex flex-col">
        {/* Full-Screen TV Header */}
        <div className="flex items-center justify-between px-8 md:px-12 py-5 border-b border-tv-border/80 bg-tv-card/80 flex-shrink-0">
          <div className="flex items-center space-x-4">
            <div className="p-3 rounded-2xl bg-tv-focus/20 border border-tv-focus/40 shadow-xl">
              <SettingsIcon className="w-7 h-7 text-tv-accent" />
            </div>
            <div>
              <div className="flex items-center space-x-3">
                <h2 className="text-xl md:text-2xl font-extrabold text-white tracking-wide">
                  Paramètres KeoTV <span className="text-sm md:text-base font-semibold text-tv-accent/90">• by HO</span>
                </h2>
                <span className="px-3 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-sky-500/15 text-tv-accent border border-sky-500/30">
                  v1.3.{currentBuildNumber} (Build {currentBuildNumber})
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">Playlists, synchronisation cloud, interface TV, contrôles parentaux & mises à jour</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-slate-300 hover:text-white transition flex items-center space-x-2 text-xs font-bold"
            title="Fermer les paramètres (Touche Retour)"
          >
            <X className="w-4 h-4" />
            <span>Fermer (Retour)</span>
          </button>
        </div>

        {/* Main Content Area: Split-Screen Master-Detail (Responsive for Mobile & TV) */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Master Navigation Bar (Horizontal on Mobile, Vertical Master Sidebar on Desktop/TV) */}
          <div className="w-full md:w-80 bg-tv-card/60 border-b md:border-b-0 md:border-r border-tv-border/80 flex flex-row md:flex-col p-2.5 md:p-4 space-x-1.5 md:space-x-0 md:space-y-1.5 overflow-x-auto md:overflow-y-auto flex-shrink-0">
            <div className="hidden md:block px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Rubriques
            </div>
            {TABS.map((tab, idx) => {
              const Icon = tab.icon;
              const isTabActive = activeTab === tab.id;
              const isTabFocused = focusArea === 'tabs' && selectedTabNavIndex === idx;

              return (
                <button
                  key={tab.id}
                  id={`settings-tab-${idx}`}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setSelectedTabNavIndex(idx);
                    setFocusArea('tabs');
                  }}
                  className={`flex items-center space-x-2 md:space-x-3.5 px-3 py-2.5 md:px-4 md:py-3.5 rounded-xl text-xs font-bold tracking-wide transition text-left flex-shrink-0 md:w-full focus:outline-none ${
                    isTabFocused
                      ? 'bg-tv-focus text-white ring-4 ring-white shadow-2xl scale-[1.02] z-10'
                      : isTabActive
                      ? 'bg-tv-accent/15 text-tv-accent border border-tv-accent/30 font-extrabold'
                      : 'text-slate-300 hover:text-white hover:bg-white/5 border border-transparent'
                  }`}
                >
                  <Icon className={`w-4 h-4 md:w-5 md:h-5 flex-shrink-0 ${isTabFocused ? 'text-white' : isTabActive ? 'text-tv-accent' : 'text-slate-400'}`} />
                  <span className="whitespace-nowrap md:truncate flex-1">{tab.label}</span>
                  {isTabActive && (
                    <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-tv-accent flex-shrink-0 animate-pulse ml-1" />
                  )}
                </button>
              );
            })}

            <div className="hidden md:block pt-4 mt-auto space-y-2">
              <button
                id={`settings-tab-${TABS.length}`}
                onClick={onClose}
                className={`w-full flex items-center justify-center space-x-2 px-4 py-3 rounded-xl text-xs font-bold transition focus:outline-none ${
                  focusArea === 'tabs' && selectedTabNavIndex === TABS.length
                    ? 'bg-rose-600 text-white ring-4 ring-white shadow-2xl scale-[1.02] z-10'
                    : 'bg-white/10 hover:bg-white/15 text-slate-300 hover:text-white'
                }`}
              >
                <X className="w-4 h-4" />
                <span>Quitter les paramètres</span>
              </button>

              <div className="p-3 bg-black/40 rounded-xl border border-white/5 text-[11px] text-slate-400 space-y-1">
                <span className="font-semibold text-slate-300 block">Navigation Télécommande :</span>
                <p>• <strong>Haut / Bas :</strong> Changer de rubrique</p>
                <p>• <strong>Droite / OK :</strong> Entrer dans les réglages</p>
                <p>• <strong>Gauche / Retour :</strong> Revenir au menu</p>
              </div>
            </div>
          </div>

          {/* Detail Pane (Settings Content) */}
          <div ref={modalBodyRef} className="flex-1 overflow-y-auto p-6 md:p-10 space-y-6">
            {/* ============================================================== */}
            {/* TAB 1: PLAYLISTS & ABONNEMENTS                                 */}
            {/* ============================================================== */}
          {activeTab === 'playlists' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-white">Gestion de vos Playlists IPTV</h3>
                  <p className="text-xs text-slate-400">
                    Ajoutez vos abonnements Xtream ou supprimez les listes inutilisées.
                  </p>
                </div>
                <button
                  onClick={() => {
                    onClose();
                    onOpenXtreamModal();
                  }}
                  className="px-4 py-2 bg-tv-focus hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 shadow-lg flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-tv-accent focus:ring-offset-2 focus:ring-offset-tv-surface"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>Ajouter une Playlist</span>
                </button>
              </div>

              {/* Playlists List */}
              <div className="space-y-2.5">
                {localPlaylists.length === 0 ? (
                  <div className="p-6 bg-tv-card/40 rounded-xl border border-tv-border text-center space-y-3">
                    <p className="text-xs text-slate-400">
                      Aucune playlist configurée pour le moment.
                    </p>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await onRestoreDemoPlaylist();
                        } catch (err) {
                          console.error('Failed to restore demo playlist:', err);
                        }
                      }}
                      className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-tv-accent focus:ring-offset-2 focus:ring-offset-tv-surface"
                    >
                      Restaurer la playlist de test gratuite
                    </button>
                  </div>
                ) : (
                  localPlaylists.map((pl) => (
                    <div
                      key={pl.id}
                      className="p-4 bg-tv-card/70 rounded-xl border border-tv-border/80 flex items-center justify-between transition hover:border-tv-border"
                    >
                      <div className="min-w-0 flex-1 mr-4">
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-bold text-white truncate">{pl.name}</span>
                          <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-sky-500/10 text-tv-accent border border-sky-500/20">
                            {pl.type}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 truncate mt-0.5">
                          {pl.channel_count > 0 ? `${pl.channel_count} chaînes chargées` : 'Flux disponibles'} •{' '}
                          {pl.server_url || 'Serveur configuré'}
                        </p>
                      </div>

                      {deletingId === pl.id ? (
                        <div className="flex items-center space-x-2 flex-shrink-0">
                          <button
                            type="button"
                            onClick={async (e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const targetId = pl.id;
                              setDeletingId(null);
                              // Optimistic UI update immediately
                              setLocalPlaylists((prev) => prev.filter((p) => p.id !== targetId));
                              try {
                                await onDeletePlaylist(targetId);
                              } catch (err) {
                                console.error('Delete playlist error:', err);
                              }
                            }}
                            className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold shadow-md transition focus:outline-none focus:ring-2 focus:ring-rose-400 focus:ring-offset-2 focus:ring-offset-tv-surface"
                          >
                            Confirmer la suppression
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setDeletingId(null);
                            }}
                            className="px-3 py-2 bg-white/10 hover:bg-white/20 text-slate-300 rounded-xl text-xs transition focus:outline-none focus:ring-2 focus:ring-tv-accent focus:ring-offset-2 focus:ring-offset-tv-surface"
                          >
                            Annuler
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-1 flex-shrink-0">
                          {onEditPlaylist && (
                            <button
                              onClick={() => onEditPlaylist(pl)}
                              className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition focus:outline-none focus:ring-2 focus:ring-tv-accent focus:ring-offset-2 focus:ring-offset-tv-surface"
                              title="Modifier les paramètres de cette playlist"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}
                          {onResyncPlaylist && (
                            <button
                              onClick={() => onResyncPlaylist(pl)}
                              disabled={isResyncing}
                              className="p-2 text-slate-400 hover:text-tv-accent hover:bg-sky-500/10 rounded-lg transition disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-tv-accent focus:ring-offset-2 focus:ring-offset-tv-surface"
                              title="Re-synchroniser et recharger les chaînes"
                            >
                              <RefreshCw className={`w-4 h-4 ${isResyncing ? 'animate-spin text-tv-accent' : ''}`} />
                            </button>
                          )}
                          <button
                            onClick={() => setDeletingId(pl.id)}
                            className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition focus:outline-none focus:ring-2 focus:ring-rose-400 focus:ring-offset-2 focus:ring-offset-tv-surface"
                            title="Supprimer cette playlist"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Section: Actualisation automatique des bouquets en arrière-plan */}
              <div className="bg-tv-card/60 border border-tv-border rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    <Clock className="w-4 h-4 text-tv-accent flex-shrink-0" />
                    <div>
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                        Actualisation automatique des bouquets
                      </h4>
                      <p className="text-[11px] text-slate-400">
                        Conserve les bouquets en mémoire pour un démarrage instantané et met à jour en arrière-plan selon l&apos;intervalle choisi.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Interval Selection Pills */}
                <div className="grid grid-cols-5 gap-2 pt-1">
                  {[
                    { label: 'Manuel', value: 0 },
                    { label: 'Toutes les 1h', value: 1 },
                    { label: 'Toutes les 5h', value: 5 },
                    { label: 'Toutes les 12h', value: 12 },
                    { label: 'Toutes les 24h', value: 24 },
                  ].map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => onAutoRefreshIntervalChange?.(item.value)}
                      className={`px-2 py-2 rounded-xl text-xs font-bold transition flex flex-col items-center justify-center space-y-1 focus:outline-none focus:ring-2 focus:ring-tv-accent focus:ring-offset-2 focus:ring-offset-tv-surface ${
                        autoRefreshInterval === item.value
                          ? 'bg-tv-focus text-white shadow-lg border border-sky-400'
                          : 'bg-tv-surface text-slate-400 hover:text-white hover:bg-white/5 border border-tv-border'
                      }`}
                    >
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-tv-border/50 text-[11px] text-slate-400">
                  <span>
                    {lastAutoRefreshAt
                      ? `Dernière actualisation : ${new Date(lastAutoRefreshAt).toLocaleString('fr-FR', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}`
                      : 'Dernière actualisation : Au démarrage ou lors du premier ajout'}
                  </span>
                  {onTriggerSilentRefresh && (
                    <button
                      type="button"
                      onClick={onTriggerSilentRefresh}
                      disabled={isSilentRefreshing}
                      className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-medium transition flex items-center space-x-1.5 focus:outline-none focus:ring-2 focus:ring-tv-accent disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSilentRefreshing ? 'animate-spin text-tv-accent' : ''}`} />
                      <span>{isSilentRefreshing ? 'Actualisation...' : 'Actualiser maintenant'}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB: ORDRE & BOUQUETS                                          */}
          {/* ============================================================== */}
          {activeTab === 'categories' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-bold text-white">Ordre & Organisation des Bouquets</h3>
                <p className="text-xs text-slate-400">
                  Personnalisez l&apos;ordre de présentation de vos bouquets, masquez les groupes indésirables ou excluez des contenus.
                </p>
              </div>

              {/* Open Category Manager Dedicated Screen */}
              <div className="bg-gradient-to-r from-tv-card to-tv-cardHover border border-tv-border p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-white flex items-center space-x-2">
                    <Sliders className="w-4 h-4 text-tv-accent" />
                    <span>Éditeur d&apos;ordre & d&apos;exclusion</span>
                  </h4>
                  <p className="text-xs text-slate-300">
                    Déplacez facilement vos bouquets vers le haut ou le bas, ou masquez-les en un clic.
                  </p>
                </div>
                {onOpenCategoryManager && (
                  <button
                    type="button"
                    onClick={() => {
                      requirePin(() => {
                        onClose();
                        onOpenCategoryManager();
                      });
                    }}
                    className="px-5 py-3 rounded-xl bg-tv-accent text-slate-950 font-black text-xs hover:bg-sky-400 transition flex items-center justify-center space-x-2 shadow-lg shadow-sky-500/20 flex-shrink-0"
                  >
                    <Sliders className="w-4 h-4" />
                    <span>Gérer les bouquets</span>
                  </button>
                )}
              </div>

              {/* Sort Preferences */}
              {onCategorySortChange && (
                <div className="bg-tv-card/60 border border-tv-border p-4 rounded-2xl space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Mode de tri par défaut des groupes
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <button
                      type="button"
                      onClick={() => onCategorySortChange('playlist')}
                      className={`p-3 rounded-xl border text-left transition ${
                        categorySort === 'playlist'
                          ? 'bg-tv-focus border-tv-accent text-white shadow-md'
                          : 'bg-black/30 border-white/5 text-slate-400 hover:text-white'
                      }`}
                    >
                      <span className="block text-xs font-bold">Ordre Playlist</span>
                      <span className="block text-[10px] text-slate-400 mt-0.5">
                        Ordre d&apos;origine de votre fournisseur
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onCategorySortChange('alpha')}
                      className={`p-3 rounded-xl border text-left transition ${
                        categorySort === 'alpha'
                          ? 'bg-tv-focus border-tv-accent text-white shadow-md'
                          : 'bg-black/30 border-white/5 text-slate-400 hover:text-white'
                      }`}
                    >
                      <span className="block text-xs font-bold">Alphabétique (A-Z)</span>
                      <span className="block text-[10px] text-slate-400 mt-0.5">
                        Classement par nom de bouquet
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onCategorySortChange('count')}
                      className={`p-3 rounded-xl border text-left transition ${
                        categorySort === 'count'
                          ? 'bg-tv-focus border-tv-accent text-white shadow-md'
                          : 'bg-black/30 border-white/5 text-slate-400 hover:text-white'
                      }`}
                    >
                      <span className="block text-xs font-bold">Par nombre de chaînes</span>
                      <span className="block text-[10px] text-slate-400 mt-0.5">
                        Les plus gros bouquets en premier
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {/* Toggle Show Favorites in Main Categories View */}
              {onToggleShowFavoritesCategory && (
                <div className="bg-tv-card/60 border border-tv-border p-4 rounded-2xl flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-white">Afficher la section Favoris</h4>
                    <p className="text-[11px] text-slate-400">
                      Inclut ou masque les rubriques de favoris en tête des listes de chaînes, films et séries.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onToggleShowFavoritesCategory(!showFavoritesCategory)}
                    className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors ${
                      showFavoritesCategory ? 'bg-tv-accent justify-end' : 'bg-slate-700 justify-start'
                    }`}
                  >
                    <div className="bg-white w-4 h-4 rounded-full shadow-md" />
                  </button>
                </div>
              )}

              {/* Exclude channels by prefix */}
              {onUpdateExcludedPrefixes && (
                <div className="bg-tv-card/60 border border-tv-border p-4 rounded-2xl space-y-3">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                      Exclusion de chaînes par préfixe
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Séparez les préfixes par des virgules (ex: <span className="font-mono text-tv-accent">FR |, AR |, VIP :, ---</span>). Toute chaîne commençant par ces préfixes sera automatiquement masquée.
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      value={editingPrefixInput}
                      onChange={(e) => setEditingPrefixInput(e.target.value)}
                      placeholder="FR |, AR |, ---, 24/7"
                      className="flex-1 bg-black/50 border border-tv-border focus:border-tv-accent text-white px-3 py-2 rounded-xl text-xs font-mono focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const parsed = editingPrefixInput
                          .split(',')
                          .map((p) => p.trim())
                          .filter((p) => p.length > 0);
                        onUpdateExcludedPrefixes(parsed);
                      }}
                      className="px-4 py-2 rounded-xl bg-tv-focus text-white text-xs font-bold hover:bg-sky-500 transition shadow-md flex-shrink-0"
                    >
                      Enregistrer
                    </button>
                  </div>
                  {excludedPrefixes.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {excludedPrefixes.map((p, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-[11px] font-mono flex items-center space-x-1"
                        >
                          <span>{p}</span>
                          <button
                            type="button"
                            onClick={() => {
                              const updated = excludedPrefixes.filter((_, i) => i !== idx);
                              onUpdateExcludedPrefixes(updated);
                            }}
                            className="hover:text-white"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB: CONTRÔLE PARENTAL                                         */}
          {/* ============================================================== */}
          {activeTab === 'parental' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-bold text-white">Contrôle Parental & Protection 18+</h3>
                <p className="text-xs text-slate-400">
                  Verrouillez l&apos;accès aux bouquets réservés aux adultes au moyen d&apos;un code PIN secret à 4 chiffres.
                </p>
              </div>

              {/* Enable / Disable Parental Lock */}
              <div className="bg-tv-card/60 border border-tv-border p-4 rounded-2xl flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-white">Verrouillage des bouquets adultes</h4>
                  <p className="text-[11px] text-slate-400">
                    Exige le code PIN pour afficher ou lancer les contenus adultes (18+, XXX).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { requirePin(() => { if (onToggleParentalEnabled) { onToggleParentalEnabled(!parentalEnabled); } }); }}
                  className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors ${
                    parentalEnabled ? 'bg-tv-accent justify-end' : 'bg-slate-700 justify-start'
                  }`}
                >
                  <div className="bg-white w-4 h-4 rounded-full shadow-md" />
                </button>
              </div>

              {/* Hide adult categories completely */}
              <div className="bg-tv-card/60 border border-tv-border p-4 rounded-2xl flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-white">Masquage total des bouquets adultes</h4>
                  <p className="text-[11px] text-slate-400">
                    Fait disparaître complètement les bouquets adultes du guide au lieu d&apos;afficher un cadenas.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { requirePin(() => { if (onToggleParentalHideAdult) { onToggleParentalHideAdult(!parentalHideAdult); } }); }}
                  className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors ${
                    parentalHideAdult ? 'bg-tv-accent justify-end' : 'bg-slate-700 justify-start'
                  }`}
                >
                  <div className="bg-white w-4 h-4 rounded-full shadow-md" />
                </button>
              </div>

              {/* PIN Code Configuration */}
              <div className="bg-tv-card/60 border border-tv-border p-4 rounded-2xl space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Code PIN de déverrouillage (4 chiffres)
                </h4>
                <div className="flex items-center space-x-3">
                  <input
                    type="password"
                    maxLength={4}
                    value={editingPin}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9]/g, '');
                      setEditingPin(val);
                      setPinSavedFeedback(false);
                    }}
                    className="w-32 bg-black/50 border border-tv-border focus:border-tv-accent text-white px-3 py-2 rounded-xl text-center font-mono text-base tracking-widest focus:outline-none"
                    placeholder="0000"
                  />
                  <button
                    type="button"
                    disabled={editingPin.length !== 4}
                    onClick={() => { requirePin(() => { if (onUpdateParentalPin) { onUpdateParentalPin(editingPin); setPinSavedFeedback(true); setTimeout(() => setPinSavedFeedback(false), 2500); } }); }}
                    className="px-4 py-2 rounded-xl bg-tv-focus text-white text-xs font-bold hover:bg-sky-500 transition disabled:opacity-40"
                  >
                    Enregistrer le PIN
                  </button>
                  {pinSavedFeedback && (
                    <span className="text-xs font-bold text-emerald-400 flex items-center space-x-1">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>PIN mis à jour !</span>
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500">
                  Le code PIN est mémorisé sur votre appareil et permet de protéger votre foyer.
                </p>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 2: TÉLÉCOMMANDE & ZAPPING                                  */}
          {/* ============================================================== */}
          {activeTab === 'controls' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-bold text-white">Télécommande & Configuration du Zapping</h3>
                <p className="text-xs text-slate-400">
                  Personnalisez le comportement des touches de votre télécommande Android TV et maîtrisez le zapping.
                </p>
              </div>

              {/* Section 1: Guide visuel des touches */}
              <div className="bg-tv-card/80 border border-tv-border rounded-xl p-4 space-y-3">
                <div className="flex items-center space-x-2 text-tv-accent">
                  <Radio className="w-4 h-4" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                    Guide des Touches Télécommande
                  </h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {/* Flèches Haut / Bas */}
                  <div className="p-3 bg-black/40 rounded-xl border border-white/5 flex items-start space-x-3">
                    <div className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold flex-shrink-0 text-sm">
                      ↕
                    </div>
                    <div>
                      <span className="text-xs font-bold text-white block">Flèches Haut & Bas</span>
                      <span className="text-[11px] text-slate-300 block mt-0.5">
                        • <strong>En plein écran :</strong> Zapping instantané vers la chaîne précédente / suivante.
                      </span>
                      <span className="text-[11px] text-slate-400 block">
                        • <strong>Sur le guide TV :</strong> Navigation fluide de haut en bas sans sauter de colonne.
                      </span>
                    </div>
                  </div>

                  {/* Flèches Gauche / Droite */}
                  <div className="p-3 bg-black/40 rounded-xl border border-white/5 flex items-start space-x-3">
                    <div className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold flex-shrink-0 text-sm">
                      ↔
                    </div>
                    <div>
                      <span className="text-xs font-bold text-white block">Flèches Gauche & Droite</span>
                      <span className="text-[11px] text-slate-300 block mt-0.5">
                        • Permet de passer du <strong>Menu</strong> (gauche) aux <strong>Groupes</strong> (centre) puis aux <strong>Chaînes</strong> (droite).
                      </span>
                    </div>
                  </div>

                  {/* Touche OK */}
                  <div className="p-3 bg-black/40 rounded-xl border border-white/5 flex items-start space-x-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold flex-shrink-0 text-xs">
                      OK
                    </div>
                    <div>
                      <span className="text-xs font-bold text-white block">Touche OK / Centre</span>
                      <span className="text-[11px] text-slate-300 block mt-0.5">
                        • <strong>Sur une chaîne :</strong> Lancer immédiatement le direct en plein écran.
                      </span>
                      <span className="text-[11px] text-slate-400 block">
                        • <strong>En plein écran :</strong> Afficher / masquer le bandeau d&apos;info (nom et numéro).
                      </span>
                    </div>
                  </div>

                  {/* Touche Retour */}
                  <div className="p-3 bg-black/40 rounded-xl border border-white/5 flex items-start space-x-3">
                    <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold flex-shrink-0 text-xs">
                      BACK
                    </div>
                    <div>
                      <span className="text-xs font-bold text-white block">Touche Retour (Back / Exit)</span>
                      <span className="text-[11px] text-slate-300 block mt-0.5">
                        • <strong>En plein écran :</strong> Quitter le plein écran et revenir au guide TV.
                      </span>
                      <span className="text-[11px] text-slate-400 block">
                        • <strong>Sur le guide :</strong> Retourne à la colonne précédente (Chaînes ➔ Groupes ➔ Menu).
                      </span>
                    </div>
                  </div>

                  {/* Touches 0 à 9 */}
                  <div className="p-3 bg-black/40 rounded-xl border border-white/5 flex items-start space-x-3">
                    <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold flex-shrink-0 text-xs">
                      0-9
                    </div>
                    <div>
                      <span className="text-xs font-bold text-white block">Touches Numériques (0 à 9)</span>
                      <span className="text-[11px] text-slate-300 block mt-0.5">
                        • Tapez directement le numéro de votre chaîne (ex: 1 pour TF1, 12 pour NRJ12).
                      </span>
                    </div>
                  </div>

                  {/* Touche Jaune / F */}
                  <div className="p-3 bg-black/40 rounded-xl border border-white/5 flex items-start space-x-3">
                    <div className="w-8 h-8 rounded-lg bg-yellow-500/20 text-yellow-400 flex items-center justify-center font-bold flex-shrink-0 text-xs">
                      ★
                    </div>
                    <div>
                      <span className="text-xs font-bold text-white block">Touche Jaune (ou touche F)</span>
                      <span className="text-[11px] text-slate-300 block mt-0.5">
                        • Ajouter ou retirer instantanément la chaîne sélectionnée de vos Favoris.
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 2: Réglages interactifs du zapping */}
              <div className="space-y-3">
                {/* Réglage 1: Mode de Zapping */}
                <div className="p-3.5 bg-tv-card/60 rounded-xl border border-tv-border space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-white block">Mode de Zapping en Plein Écran</span>
                      <span className="text-[11px] text-slate-400 block">
                        Comportement lors de l&apos;appui sur Haut / Bas pendant la lecture
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setZappingMode('direct');
                        saveControlSetting('zappingMode', 'direct');
                      }}
                      className={`py-2 px-3 rounded-lg text-xs font-semibold border transition text-left focus:outline-none focus:ring-2 focus:ring-tv-accent ${
                        zappingMode === 'direct'
                          ? 'bg-tv-focus text-white border-tv-accent shadow-sm'
                          : 'bg-black/30 border-white/5 text-slate-300 hover:bg-white/5'
                      }`}
                    >
                      <div className="font-bold">Zapping Immédiat (Défaut)</div>
                      <div className="text-[10px] opacity-80 font-normal">Change et lance la chaîne directement</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setZappingMode('banner');
                        saveControlSetting('zappingMode', 'banner');
                      }}
                      className={`py-2 px-3 rounded-lg text-xs font-semibold border transition text-left focus:outline-none focus:ring-2 focus:ring-tv-accent ${
                        zappingMode === 'banner'
                          ? 'bg-tv-focus text-white border-tv-accent shadow-sm'
                          : 'bg-black/30 border-white/5 text-slate-300 hover:bg-white/5'
                      }`}
                    >
                      <div className="font-bold">Afficher le bandeau avant</div>
                      <div className="text-[10px] opacity-80 font-normal">Le 2ème appui ou OK valide le changement</div>
                    </button>
                  </div>
                </div>

                {/* Réglage 2: Durée de l'OSD */}
                <div className="p-3.5 bg-tv-card/60 rounded-xl border border-tv-border space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-white block">Disparition automatique du bandeau (OSD)</span>
                      <span className="text-[11px] text-slate-400 block">
                        Délai avant que le nom de la chaîne ne s&apos;efface de l&apos;écran
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 pt-1">
                    {[
                      { id: '2s', label: '2 secondes' },
                      { id: '3.5s', label: '3.5s (Défaut)' },
                      { id: '5s', label: '5 secondes' },
                      { id: 'manual', label: 'Touche OK' },
                    ].map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setOsdDuration(item.id as any);
                          saveControlSetting('osdDuration', item.id);
                        }}
                        className={`py-2 px-2 rounded-lg text-xs font-semibold border transition text-center focus:outline-none focus:ring-2 focus:ring-tv-accent ${
                          osdDuration === item.id
                            ? 'bg-tv-focus text-white border-tv-accent shadow-sm'
                            : 'bg-black/30 border-white/5 text-slate-300 hover:bg-white/5'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Réglage 3: Action sur sélection chaîne */}
                <div className="p-3.5 bg-tv-card/60 rounded-xl border border-tv-border space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-white block">Action lors du choix d&apos;une chaîne</span>
                      <span className="text-[11px] text-slate-400 block">
                        Comportement lorsque vous appuyez sur OK sur une chaîne du guide
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setOkAction('fullscreen');
                        saveControlSetting('okAction', 'fullscreen');
                      }}
                      className={`py-2 px-3 rounded-lg text-xs font-semibold border transition text-left focus:outline-none focus:ring-2 focus:ring-tv-accent ${
                        okAction === 'fullscreen'
                          ? 'bg-tv-focus text-white border-tv-accent shadow-sm'
                          : 'bg-black/30 border-white/5 text-slate-300 hover:bg-white/5'
                      }`}
                    >
                      <div className="font-bold">Plein Écran Immédiat (Défaut)</div>
                      <div className="text-[10px] opacity-80 font-normal">Ouvre le flux en plein écran sans étape intermédiaire</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOkAction('preview');
                        saveControlSetting('okAction', 'preview');
                      }}
                      className={`py-2 px-3 rounded-lg text-xs font-semibold border transition text-left focus:outline-none focus:ring-2 focus:ring-tv-accent ${
                        okAction === 'preview'
                          ? 'bg-tv-focus text-white border-tv-accent shadow-sm'
                          : 'bg-black/30 border-white/5 text-slate-300 hover:bg-white/5'
                      }`}
                    >
                      <div className="font-bold">Aperçu dans le Guide</div>
                      <div className="text-[10px] opacity-80 font-normal">Démarre le flux en fond d&apos;écran sans quitter le guide</div>
                    </button>
                  </div>
                </div>

                {/* Réglage 4: Buffer de lecture */}
                <div className="p-3.5 bg-tv-card/60 rounded-xl border border-tv-border space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-white block">Taille du Buffer de Lecture Vidéo</span>
                      <span className="text-[11px] text-slate-400 block">
                        Ajustez selon la vitesse de votre réseau
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 pt-1">
                    {[
                      { id: '300ms', label: '300 ms (Fibre/Défaut)', desc: 'Zapping ultra rapide' },
                      { id: '1000ms', label: '1 000 ms (ADSL/4G)', desc: 'Équilibré' },
                      { id: '2500ms', label: '2 500 ms (Wi-Fi)', desc: 'Anti-coupures' },
                    ].map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setBufferSize(item.id as any);
                          saveControlSetting('bufferSize', item.id);
                        }}
                        className={`py-2 px-2 rounded-lg text-xs font-semibold border transition text-center focus:outline-none focus:ring-2 focus:ring-tv-accent ${
                          bufferSize === item.id
                            ? 'bg-tv-focus text-white border-tv-accent shadow-sm'
                            : 'bg-black/30 border-white/5 text-slate-300 hover:bg-white/5'
                        }`}
                      >
                        <div className="font-bold">{item.label}</div>
                        <div className="text-[10px] opacity-75">{item.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 3: SYNCHRONISATION                                         */}
          {/* ============================================================== */}
          {activeTab === 'sync' && (() => {
            const activeUser = getActiveKeoUser();
            return (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-white">Compte & Synchronisation Multi-Écrans</h3>
                  <p className="text-xs text-slate-400">
                    Connectez-vous pour synchroniser automatiquement vos abonnements, bouquets et favoris entre votre TV, mobile et le portail Web.
                  </p>
                </div>

                <div className="bg-tv-card/80 border border-tv-border p-4 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                        Statut du compte
                      </span>
                      <div className="flex items-center space-x-2 mt-1">
                        <span className={`w-2.5 h-2.5 rounded-full ${activeUser ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                        <span className="text-base font-bold text-white">
                          {activeUser ? activeUser.username : 'Non connecté'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {activeUser ? (
                        <button
                          onClick={() => {
                            logoutKeoUser();
                            onClose();
                            onOpenSyncModal();
                          }}
                          className="px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 rounded-xl text-xs font-bold transition focus:outline-none focus:ring-2 focus:ring-red-400"
                        >
                          Déconnexion
                        </button>
                      ) : null}
                      <button
                        onClick={() => {
                          onClose();
                          onOpenSyncModal();
                        }}
                        className="px-4 py-2 bg-tv-accent hover:bg-tv-accent/80 text-black rounded-xl text-xs font-extrabold transition focus:outline-none focus:ring-2 focus:ring-tv-accent focus:ring-offset-2 focus:ring-offset-tv-surface"
                      >
                        {activeUser ? 'Gérer la synchro' : 'Se connecter / Créer un compte'}
                      </button>
                    </div>
                  </div>

                  <div className="p-3 bg-black/40 rounded-xl border border-white/5 space-y-1.5">
                    <div className="text-xs font-semibold text-slate-300 flex items-center">
                      <ExternalLink className="w-3.5 h-3.5 mr-1.5 text-tv-accent" />
                      Configuration depuis votre ordinateur ou mobile
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Rendez-vous sur le portail Web de configuration (<span className="text-sky-300 font-mono">keotv.vercel.app/sync</span> ou votre domaine). Connectez-vous avec le même identifiant pour gérer et injecter vos playlists sans rien taper sur la télécommande !
                    </p>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ============================================================== */}
          {/* TAB 4: MISES À JOUR                                            */}
          {/* ============================================================== */}
          {activeTab === 'update' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-white">Mise à jour de l&apos;application</h3>
                <p className="text-xs text-slate-400">
                  Vérifiez et installez les dernières améliorations sans désinstaller l&apos;appli.
                </p>
              </div>

              <div className="bg-tv-card/80 border border-tv-border p-4 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-300">Version installée</span>
                  <span className="text-xs font-mono font-bold text-tv-accent">
                    v1.3.{currentBuildNumber} (Build {currentBuildNumber})
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-300">Signature officielle</span>
                  <span className="text-xs font-medium text-emerald-400 flex items-center">
                    <ShieldCheck className="w-4 h-4 mr-1" /> Certifié KeoTV • by HO
                  </span>
                </div>

                {updateInfo?.hasUpdate && (
                  <div className="p-3 bg-amber-500/15 border border-amber-500/40 rounded-xl space-y-2 text-center animate-fade-in">
                    <span className="text-xs font-bold text-amber-300 block">
                      🎉 Mise à jour disponible : {updateInfo.latestVersionName}
                    </span>
                    <p className="text-[11px] text-slate-300">
                      Une nouvelle version est prête. Vous pouvez l&apos;installer directement depuis Downloader.
                    </p>
                  </div>
                )}

                <div className="pt-2 flex flex-col sm:flex-row gap-2">
                  <button
                    onClick={handleCheckUpdate}
                    disabled={checkingUpdate}
                    className="flex-1 py-2.5 bg-tv-focus hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-tv-accent focus:ring-offset-2 focus:ring-offset-tv-surface"
                  >
                    <RefreshCw className={`w-4 h-4 ${checkingUpdate ? 'animate-spin' : ''}`} />
                    <span>{checkingUpdate ? 'Vérification...' : 'Vérifier les mises à jour'}</span>
                  </button>

                  <a
                    href="https://tinyurl.com/keo-apk"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 text-center focus:outline-none focus:ring-2 focus:ring-tv-accent focus:ring-offset-2 focus:ring-offset-tv-surface"
                  >
                    <Download className="w-4 h-4" />
                    <span>Télécharger l&apos;APK ({updateInfo?.hasUpdate ? `Build ${updateInfo.latestBuild}` : `Build ${currentBuildNumber}`})</span>
                  </a>
                </div>

                <div className="p-3 bg-sky-950/40 rounded-xl text-xs text-slate-300 border border-sky-500/20 space-y-1.5">
                  <p className="font-semibold text-tv-accent">📺 Installation rapide sur Android TV / Fire TV :</p>
                  <p className="text-[11px] text-slate-300">
                    Ouvrez l&apos;application <strong className="text-white">Downloader</strong> sur votre téléviseur et tapez le code court :
                  </p>
                  <div className="flex items-center justify-center space-x-2 py-1">
                    <span className="font-mono text-base sm:text-lg bg-black/60 px-4 py-1 rounded-xl text-amber-300 font-black tracking-widest border border-amber-500/30 shadow-inner">
                      4317787
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 text-center">
                    Ou l&apos;adresse URL directe : <span className="text-slate-200 font-mono">tinyurl.com/keo-apk</span>
                  </p>
                </div>

                {updateStatus && (
                  <div className={`p-3 rounded-xl text-xs text-center border ${updateInfo?.hasUpdate ? 'bg-amber-950/40 text-amber-200 border-amber-500/30' : 'bg-black/40 text-slate-300 border-white/5'}`}>
                    {updateStatus}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 4: AFFICHAGE ET TRI                                        */}
          {/* ============================================================== */}
          {activeTab === 'player' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-white">Ordre d&apos;affichage & Tri des listes</h3>
                <p className="text-xs text-slate-400">
                  Configurez le classement par défaut de vos groupes et de vos chaînes.
                </p>
              </div>

              {/* Category Sort Preference */}
              <div className="p-3.5 bg-tv-card/60 rounded-xl border border-tv-border space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-white block">Tri des Groupes / Catégories</span>
                    <span className="text-[11px] text-slate-400 block">Ordre d&apos;apparition dans le guide et le tiroir</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => onCategorySortChange?.('playlist')}
                    className={`py-2 px-2 rounded-lg text-xs font-semibold border transition text-center focus:outline-none focus:ring-2 focus:ring-tv-accent focus:ring-offset-2 focus:ring-offset-tv-surface ${
                      categorySort === 'playlist'
                        ? 'bg-tv-focus text-white border-tv-accent shadow-sm'
                        : 'bg-black/30 border-white/5 text-slate-300 hover:bg-white/5'
                    }`}
                  >
                    Ordre Playlist (Défaut)
                  </button>
                  <button
                    type="button"
                    onClick={() => onCategorySortChange?.('alpha')}
                    className={`py-2 px-2 rounded-lg text-xs font-semibold border transition text-center focus:outline-none focus:ring-2 focus:ring-tv-accent focus:ring-offset-2 focus:ring-offset-tv-surface ${
                      categorySort === 'alpha'
                        ? 'bg-tv-focus text-white border-tv-accent shadow-sm'
                        : 'bg-black/30 border-white/5 text-slate-300 hover:bg-white/5'
                    }`}
                  >
                    Alphabétique (A - Z)
                  </button>
                  <button
                    type="button"
                    onClick={() => onCategorySortChange?.('count')}
                    className={`py-2 px-2 rounded-lg text-xs font-semibold border transition text-center focus:outline-none focus:ring-2 focus:ring-tv-accent focus:ring-offset-2 focus:ring-offset-tv-surface ${
                      categorySort === 'count'
                        ? 'bg-tv-focus text-white border-tv-accent shadow-sm'
                        : 'bg-black/30 border-white/5 text-slate-300 hover:bg-white/5'
                    }`}
                  >
                    Par Nbr de Chaînes
                  </button>
                </div>
              </div>

              {/* Channel Sort Preference */}
              <div className="p-3.5 bg-tv-card/60 rounded-xl border border-tv-border space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-white block">Tri des Chaînes & Flux</span>
                    <span className="text-[11px] text-slate-400 block">Classement au sein de chaque bouquet</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => onChannelSortChange?.('playlist')}
                    className={`py-2 px-2 rounded-lg text-xs font-semibold border transition text-center focus:outline-none focus:ring-2 focus:ring-tv-accent focus:ring-offset-2 focus:ring-offset-tv-surface ${
                      channelSort === 'playlist'
                        ? 'bg-tv-focus text-white border-tv-accent shadow-sm'
                        : 'bg-black/30 border-white/5 text-slate-300 hover:bg-white/5'
                    }`}
                  >
                    Ordre Playlist (Défaut)
                  </button>
                  <button
                    type="button"
                    onClick={() => onChannelSortChange?.('alpha')}
                    className={`py-2 px-2 rounded-lg text-xs font-semibold border transition text-center focus:outline-none focus:ring-2 focus:ring-tv-accent focus:ring-offset-2 focus:ring-offset-tv-surface ${
                      channelSort === 'alpha'
                        ? 'bg-tv-focus text-white border-tv-accent shadow-sm'
                        : 'bg-black/30 border-white/5 text-slate-300 hover:bg-white/5'
                    }`}
                  >
                    Alphabétique (A - Z)
                  </button>
                  <button
                    type="button"
                    onClick={() => onChannelSortChange?.('num')}
                    className={`py-2 px-2 rounded-lg text-xs font-semibold border transition text-center focus:outline-none focus:ring-2 focus:ring-tv-accent focus:ring-offset-2 focus:ring-offset-tv-surface ${
                      channelSort === 'num'
                        ? 'bg-tv-focus text-white border-tv-accent shadow-sm'
                        : 'bg-black/30 border-white/5 text-slate-300 hover:bg-white/5'
                    }`}
                  >
                    Par N° de Chaîne
                  </button>
                </div>
              </div>

              {/* Section: Paramètres du Lecteur Vidéo & Buffer */}
              <div>
                <h3 className="text-sm font-bold text-white mt-4">Paramètres du Lecteur Vidéo & Tampon</h3>
                <p className="text-xs text-slate-400">Optimisez la fluidité et le zapping selon votre connexion.</p>
              </div>

              <div className="space-y-3">
                {/* Réglage interactif de la taille du Buffer */}
                <div className="p-3.5 bg-tv-card/60 rounded-xl border border-tv-border space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-white block">Taille du Buffer de lecture</span>
                      <span className="text-[11px] text-slate-400 block">Délai avant démarrage du flux (anti-coupures)</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 pt-1">
                    {[
                      { id: '300ms', label: '300 ms (Fibre/Défaut)', desc: 'Zapping ultra rapide' },
                      { id: '1000ms', label: '1 000 ms (ADSL/4G)', desc: 'Équilibré' },
                      { id: '2500ms', label: '2 500 ms (Wi-Fi)', desc: 'Anti-coupures' },
                    ].map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setBufferSize(item.id as any);
                          saveControlSetting('bufferSize', item.id);
                        }}
                        className={`py-2 px-2 rounded-lg text-xs font-semibold border transition text-center focus:outline-none focus:ring-2 focus:ring-tv-accent ${
                          bufferSize === item.id
                            ? 'bg-tv-focus text-white border-tv-accent shadow-sm'
                            : 'bg-black/30 border-white/5 text-slate-300 hover:bg-white/5'
                        }`}
                      >
                        <div className="font-bold">{item.label}</div>
                        <div className="text-[10px] opacity-75">{item.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Accélération matérielle */}
                <div className="p-3.5 bg-tv-card/60 rounded-xl border border-tv-border flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-white block">Accélération Matérielle GPU</span>
                    <span className="text-[11px] text-slate-400 block">Décodage fluide via processeur graphique TV</span>
                  </div>
                  <span className="text-xs font-bold px-3 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg">
                    ✓ Activée
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 5: FORMULAIRE DE FEEDBACK & DONS                          */}
          {/* ============================================================== */}
          {activeTab === 'feedback' && (
            <div className="space-y-5">
              {/* Formulaire de Feedback In-App */}
              <div className="p-4 bg-tv-card/80 border border-tv-border rounded-xl space-y-4">
                <div className="flex items-center space-x-2 text-tv-accent">
                  <MessageSquare className="w-5 h-5" />
                  <h3 className="text-sm font-bold text-white">Envoyer un retour ou signaler un bug</h3>
                </div>
                <p className="text-xs text-slate-400">
                  Votre message est transmis directement à l&apos;équipe sans ouvrir votre boîte mail.
                </p>

                {feedbackSubmitted ? (
                  <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center text-xs text-emerald-300 flex items-center justify-center space-x-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    <span>Merci beaucoup ! Votre retour a bien été transmis.</span>
                  </div>
                ) : (
                  <form onSubmit={handleFeedbackSubmit} className="space-y-3">
                    {/* Category Selector */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { id: 'suggestion', label: '💡 Idée' },
                        { id: 'bug', label: '🐞 Bug' },
                        { id: 'channel', label: '📺 Chaîne' },
                        { id: 'compliment', label: '❤️ Autre' },
                      ].map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setFeedbackCategory(item.id as any)}
                          className={`py-1.5 px-2 rounded-lg text-xs font-medium border text-center transition focus:outline-none focus:ring-2 focus:ring-tv-accent focus:ring-offset-2 focus:ring-offset-tv-surface ${
                            feedbackCategory === item.id
                              ? 'bg-tv-focus border-tv-accent text-white font-bold'
                              : 'bg-black/30 border-tv-border text-slate-400 hover:text-white'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>

                    {/* Message textarea */}
                    <textarea
                      rows={3}
                      required
                      placeholder="Décrivez votre suggestion ou le souci rencontré..."
                      value={feedbackMessage}
                      onChange={(e) => setFeedbackMessage(e.target.value)}
                      className="w-full bg-black/40 border border-tv-border rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-tv-accent focus:ring-offset-2 focus:ring-offset-tv-surface"
                    />

                    {/* Contact email (optional) */}
                    <input
                      type="email"
                      placeholder="Votre adresse email (facultatif si vous souhaitez une réponse)"
                      value={feedbackEmail}
                      onChange={(e) => setFeedbackEmail(e.target.value)}
                      className="w-full bg-black/40 border border-tv-border rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-tv-accent focus:ring-offset-2 focus:ring-offset-tv-surface"
                    />

                    {feedbackError && (
                      <p className="text-xs text-rose-400">{feedbackError}</p>
                    )}

                    <button
                      type="submit"
                      disabled={feedbackSubmitting || !feedbackMessage.trim()}
                      className="w-full py-2.5 bg-tv-focus hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2 shadow-lg disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-tv-accent focus:ring-offset-2 focus:ring-offset-tv-surface"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{feedbackSubmitting ? 'Envoi en cours...' : 'Envoyer mon message'}</span>
                    </button>
                  </form>
                )}
              </div>

              {/* Dons */}
              <div className="p-4 bg-gradient-to-tr from-rose-950/40 via-tv-card to-tv-card border border-rose-500/20 rounded-xl">
                <div className="flex items-center space-x-2 text-rose-400 mb-1">
                  <Heart className="w-4 h-4 fill-rose-500" />
                  <h4 className="text-xs font-bold text-white">Soutenir le développement</h4>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed mb-3">
                  KeoTV est entièrement gratuit et sans pub. Un don symbolique aide à maintenir les serveurs et le projet !
                </p>
                <a
                  href="https://github.com/sponsors/heyhacene"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center space-x-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition shadow-lg focus:outline-none focus:ring-2 focus:ring-rose-400 focus:ring-offset-2 focus:ring-offset-tv-surface"
                >
                  <Heart className="w-4 h-4 fill-white" />
                  <span>Faire un don / Soutenir</span>
                </a>
              </div>
            </div>
          )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-tv-border bg-black/20 flex justify-between items-center flex-shrink-0">
          <span className="text-[11px] text-slate-400 font-mono">KeoTV IPTV • <strong className="text-tv-accent">by HO</strong> • v1.3.{currentBuildNumber} (Build {currentBuildNumber})</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-tv-accent focus:ring-offset-2 focus:ring-offset-tv-surface"
          >
            Fermer
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
