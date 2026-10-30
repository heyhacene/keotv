'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Mail,
  KeyRound,
  LogIn,
  UserPlus,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  QrCode,
  LogOut,
  Sparkles,
  Eye,
  EyeOff,
  Clock,
} from 'lucide-react';
import {
  registerKeoUser,
  loginKeoUser,
  getActiveKeoUser,
  fetchLatestKeoUser,
  logoutKeoUser,
  saveUserCloudSync,
  resetPasswordForEmail,
  KeoUserAccount,
  WatchedItem,
} from '@/lib/supabase';
import { PlaylistConfig } from '@/types/iptv';
import { getAllSavedPositions } from '@/lib/playback-positions';

interface SyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyAccountSync: (account: KeoUserAccount) => Promise<void>;
  currentPlaylists: PlaylistConfig[];
  currentFavorites: string[];
}

export const SyncModal: React.FC<SyncModalProps> = ({
  isOpen,
  onClose,
  onApplyAccountSync,
  currentPlaylists,
  currentFavorites,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [activeUser, setActiveUser] = useState<KeoUserAccount | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [showPassword, setShowPassword] = useState(false);
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const modalContainerRef = useRef<HTMLDivElement | null>(null);

  // Focusable elements helper
  const getFocusableElements = useCallback((): HTMLElement[] => {
    if (!modalContainerRef.current) return [];
    return Array.from(
      modalContainerRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), a[href]:not([disabled]), [tabindex="0"]'
      )
    ).filter((el) => el.offsetParent !== null);
  }, []);

  // Check currently active logged in user and initialize focus
  useEffect(() => {
    if (isOpen) {
      const user = getActiveKeoUser();
      setActiveUser(user);
      setStatusMessage(null);
      setTimeout(() => {
        const els = getFocusableElements();
        if (els.length > 0) {
          if (emailInputRef.current) {
            emailInputRef.current.focus();
          } else {
            els[0].focus();
          }
        }
      }, 150);
    }
  }, [isOpen, getFocusableElements]);

  const [focusIndex, setFocusIndex] = useState<number>(0);

  // Sync visual TV focus attribute onto active element
  useEffect(() => {
    if (!isOpen) return;
    const els = getFocusableElements();
    els.forEach((el, idx) => {
      if (idx === focusIndex) {
        el.setAttribute('data-tv-focused', 'true');
        el.focus();
        el.scrollIntoView({ block: 'nearest', behavior: 'auto' });
      } else {
        el.removeAttribute('data-tv-focused');
      }
    });
  }, [isOpen, focusIndex, getFocusableElements, mode, activeUser]);

  // Spatial navigation helper for SyncModal
  const findNextSyncElement = useCallback(
    (direction: 'down' | 'up' | 'left' | 'right', currentIndex: number): number => {
      const items = getFocusableElements();
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
          if (rect.top >= currentRect.bottom - 4 || deltaY > 15) {
            const distance = Math.abs(deltaY) * 1.5 + Math.abs(deltaX);
            if (distance < minDistance) {
              minDistance = distance;
              bestIndex = i;
            }
          }
        } else if (direction === 'up') {
          if (rect.bottom <= currentRect.top + 4 || deltaY < -15) {
            const distance = Math.abs(deltaY) * 1.5 + Math.abs(deltaX);
            if (distance < minDistance) {
              minDistance = distance;
              bestIndex = i;
            }
          }
        } else if (direction === 'right') {
          if (rect.left >= currentRect.right - 4 && Math.abs(deltaY) < Math.max(rect.height, currentRect.height)) {
            const distance = Math.abs(deltaX) + Math.abs(deltaY) * 2;
            if (distance < minDistance) {
              minDistance = distance;
              bestIndex = i;
            }
          }
        } else if (direction === 'left') {
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
    [getFocusableElements]
  );

  // Full TV Remote D-Pad Navigation inside SyncModal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const keyCode = (e as any).keyCode || 0;
      const key = e.key || '';

      const isEnter =
        key === 'Enter' ||
        key === 'Select' ||
        key === 'Ok' ||
        keyCode === 13 ||
        keyCode === 23 || // DPAD_CENTER
        keyCode === 66;

      const isUp =
        key === 'ArrowUp' ||
        key === 'Up' ||
        keyCode === 38 ||
        keyCode === 19;   // DPAD_UP

      const isDown =
        key === 'ArrowDown' ||
        key === 'Down' ||
        keyCode === 40 ||
        keyCode === 20;   // DPAD_DOWN

      const isLeft =
        key === 'ArrowLeft' ||
        key === 'Left' ||
        keyCode === 37 ||
        keyCode === 21;   // DPAD_LEFT

      const isRight =
        key === 'ArrowRight' ||
        key === 'Right' ||
        keyCode === 39 ||
        keyCode === 22;   // DPAD_RIGHT

      const target = e.target as HTMLElement | null;
      const isInputFocused = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');

      // If user is editing text in an input and presses Backspace, do NOT close modal
      if (e.key === 'Backspace' && isInputFocused) {
        return;
      }

      const isBack =
        key === 'Escape' ||
        (!isInputFocused && key === 'Backspace') ||
        key === 'GoBack' ||
        key === 'Back' ||
        keyCode === 27 ||
        keyCode === 4;

      if (isBack) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }

      const els = getFocusableElements();
      if (els.length === 0) return;

      const currentIdx = target ? els.indexOf(target) : focusIndex;
      const validCurrent = currentIdx >= 0 ? currentIdx : 0;

      if (isDown) {
        e.preventDefault();
        const next = findNextSyncElement('down', validCurrent);
        if (next !== validCurrent) {
          setFocusIndex(next);
        } else if (validCurrent < els.length - 1) {
          setFocusIndex(validCurrent + 1);
        }
        return;
      }

      if (isUp) {
        e.preventDefault();
        const prev = findNextSyncElement('up', validCurrent);
        if (prev !== validCurrent) {
          setFocusIndex(prev);
        } else if (validCurrent > 0) {
          setFocusIndex(validCurrent - 1);
        }
        return;
      }

      if (isRight && !isInputFocused) {
        e.preventDefault();
        const rightNext = findNextSyncElement('right', validCurrent);
        if (rightNext !== validCurrent) {
          setFocusIndex(rightNext);
        }
        return;
      }

      if (isLeft && !isInputFocused) {
        e.preventDefault();
        const leftPrev = findNextSyncElement('left', validCurrent);
        if (leftPrev !== validCurrent) {
          setFocusIndex(leftPrev);
        }
        return;
      }

      if (isEnter && target && target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        target.click();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose, getFocusableElements, findNextSyncElement, focusIndex]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setStatusMessage({ type: 'error', text: 'Veuillez saisir votre identifiant (ou email) et votre mot de passe.' });
      return;
    }

    setIsLoading(true);
    setStatusMessage(null);

    if (mode === 'login') {
      const res = await loginKeoUser({ identifier: email, password });
      setIsLoading(false);
      if (res.user) {
        setActiveUser(res.user);
        setStatusMessage({ type: 'success', text: `Connecté avec succès ! Rapatriement de vos playlists et réglages...` });
        await onApplyAccountSync(res.user);
        setTimeout(() => onClose(), 1200);
      } else {
        setStatusMessage({ type: 'error', text: res.error || 'Erreur lors de la connexion.' });
      }
    } else {
      // Register new account with local current playlists, favorites & playback resume positions
      const localPositions = getAllSavedPositions();
      const watchedList: WatchedItem[] = Object.values(localPositions)
        .filter((p) => p && (p.positionMs > 10000 || p.completed))
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
        .slice(0, 50)
        .map((p) => ({
          id: p.url,
          url: p.url,
          title: p.title || 'Programme VOD',
          position: Math.round(p.positionMs / 1000),
          duration: Math.round(p.durationMs / 1000),
          positionMs: p.positionMs,
          durationMs: p.durationMs,
          updatedAt: p.updatedAt || Date.now(),
          updated_at: new Date(p.updatedAt || Date.now()).toISOString(),
          stream_type: p.seriesId ? ('series' as const) : ('vod' as const),
          completed: Boolean(p.completed),
          seriesId: p.seriesId,
          episodeIndex: p.episodeIndex,
        }));

      const res = await registerKeoUser({
        identifier: email,
        password,
        data: {
          user_label: email.split('@')[0],
          playlists: currentPlaylists,
          favorites: currentFavorites,
          watched_positions: watchedList,
        },
      });
      setIsLoading(false);
      if (res.user) {
        setActiveUser(res.user);
        setStatusMessage({ type: 'success', text: 'Compte créé et playlists sauvegardées sur votre compte !' });
        await onApplyAccountSync(res.user);
        setTimeout(() => onClose(), 1200);
      } else {
        setStatusMessage({ type: 'error', text: res.error || 'Erreur lors de la création du compte.' });
      }
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim() || !email.includes('@')) {
      setStatusMessage({ type: 'error', text: 'Veuillez saisir votre adresse email pour réinitialiser le mot de passe.' });
      return;
    }
    setIsLoading(true);
    setStatusMessage(null);
    const res = await resetPasswordForEmail(email);
    setIsLoading(false);
    if (res.success) {
      setStatusMessage({ type: 'success', text: 'Un lien de réinitialisation sécurisé a été envoyé à votre adresse email.' });
    } else {
      setStatusMessage({ type: 'error', text: res.error || 'Erreur lors de la demande.' });
    }
  };

  const handlePullFromCloud = async () => {
    if (!activeUser) return;
    setIsLoading(true);
    setStatusMessage(null);
    try {
      const freshUser = await fetchLatestKeoUser(activeUser.email);
      if (freshUser) {
        setActiveUser(freshUser);
        await onApplyAccountSync(freshUser);
        setStatusMessage({
          type: 'success',
          text: `Configuration à jour ! ${freshUser.playlists?.length || 0} playlist(s), favoris et reprises VOD récupérés du Cloud.`,
        });
      } else {
        setStatusMessage({ type: 'error', text: 'Impossible de récupérer les données du serveur.' });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Erreur lors de la synchronisation.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualSyncNow = async () => {
    if (!activeUser) return;
    setIsLoading(true);
    setStatusMessage(null);
    try {
      const localPositions = getAllSavedPositions();
      const watchedList: WatchedItem[] = Object.values(localPositions)
        .filter((p) => p && (p.positionMs > 10000 || p.completed))
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
        .slice(0, 50)
        .map((p) => ({
          id: p.url,
          url: p.url,
          title: p.title || 'Programme VOD',
          position: Math.round(p.positionMs / 1000),
          duration: Math.round(p.durationMs / 1000),
          positionMs: p.positionMs,
          durationMs: p.durationMs,
          updatedAt: p.updatedAt || Date.now(),
          updated_at: new Date(p.updatedAt || Date.now()).toISOString(),
          stream_type: p.seriesId ? ('series' as const) : ('vod' as const),
          completed: Boolean(p.completed),
          seriesId: p.seriesId,
          episodeIndex: p.episodeIndex,
        }));

      // Push current playlists, favorites & playback resume positions to user account
      const updated: KeoUserAccount = {
        ...activeUser,
        playlists: currentPlaylists,
        favorites: currentFavorites,
        watched_positions: watchedList,
      };
      await saveUserCloudSync(updated);
      setActiveUser(updated);
      setStatusMessage({ type: 'success', text: 'Sauvegarde Cloud synchronisée (Playlists, Favoris & Reprises VOD).' });
    } catch {
      setStatusMessage({ type: 'error', text: 'Erreur lors de la sauvegarde.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    await logoutKeoUser();
    setActiveUser(null);
    setEmail('');
    setPassword('');
    setStatusMessage({ type: 'success', text: 'Vous avez été déconnecté.' });
  };

  // Fixed public web portal URL for easy keyboard configuration from phone/PC
  const portalUrl = 'https://keotv.vercel.app/sync';
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(portalUrl)}&margin=6&color=38-189-248&bgcolor=8-12-20`;

  return (
    <div
      ref={modalContainerRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-fade-in select-none"
    >
      <div className="relative w-full max-w-2xl bg-tv-bg border border-tv-border rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-tv-border flex items-center justify-between bg-black/40 flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-sky-500 to-emerald-400 flex items-center justify-center shadow-lg shadow-sky-500/20">
              <ShieldCheck className="w-5 h-5 text-slate-950 font-bold" />
            </div>
            <div>
              <h2 className="text-base font-black text-white flex items-center space-x-2">
                <span>Compte & Synchronisation Cloud</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono font-bold">
                  Multi-Appareils
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Retrouvez vos playlists, réglages et reprises VOD sur tous vos écrans
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar flex-1">
          {activeUser ? (
            /* Logged in state */
            <div className="space-y-4">
              <div className="bg-tv-card/80 border border-emerald-500/30 p-4 rounded-2xl flex items-center justify-between">
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-lg">
                    {(activeUser.user_label || activeUser.email).slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider block">
                      Connecté au compte
                    </span>
                    <h3 className="text-sm font-bold text-white truncate">{activeUser.user_label || activeUser.email}</h3>
                    <p className="text-[11px] text-slate-400">
                      {activeUser.playlists?.length || 0} playlists • {activeUser.favorites?.length || 0} favoris • {activeUser.watched_positions?.length || 0} reprises VOD
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleLogout}
                  className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-rose-500/20 hover:text-rose-300 text-slate-400 text-xs font-bold transition flex items-center space-x-1.5 flex-shrink-0"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Déconnexion</span>
                </button>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={handlePullFromCloud}
                  disabled={isLoading}
                  className="p-3.5 rounded-2xl bg-tv-card hover:bg-sky-500/20 border border-tv-border hover:border-sky-400/50 text-left transition flex items-start space-x-3 disabled:opacity-50"
                >
                  <div className="w-8 h-8 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white">Rapatrier depuis le Cloud</h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Télécharge vos playlists, réglages et reprises enregistrés depuis le portail web
                    </p>
                  </div>
                </button>

                <button
                  onClick={handleManualSyncNow}
                  disabled={isLoading}
                  className="p-3.5 rounded-2xl bg-tv-card hover:bg-emerald-500/20 border border-tv-border hover:border-emerald-400/50 text-left transition flex items-start space-x-3 disabled:opacity-50"
                >
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white">Sauvegarder cet appareil</h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Envoie vos playlists, favoris et reprises de cet écran vers votre Cloud
                    </p>
                  </div>
                </button>
              </div>
            </div>
          ) : (
            /* Logged out: Login / Register Form */
            <div className="space-y-4">
              {/* Tab Switcher */}
              <div className="flex p-1 bg-black/40 rounded-2xl border border-tv-border">
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2 ${
                    mode === 'login'
                      ? 'bg-tv-accent text-slate-950 shadow-md font-black'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Connexion avec Email</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMode('register')}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2 ${
                    mode === 'register'
                      ? 'bg-tv-accent text-slate-950 shadow-md font-black'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Créer un compte</span>
                </button>
              </div>

              <p className="text-xs text-slate-300">
                {mode === 'login'
                  ? 'Connectez-vous pour retrouver vos playlists, vos favoris et vos reprises de films/séries à la même seconde.'
                  : 'Créez votre compte KeoTV gratuit pour sauvegarder instantanément votre configuration IPTV.'}
              </p>

              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Identifiant ou Adresse Email
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      ref={emailInputRef}
                      type="text"
                      autoCapitalize="none"
                      autoCorrect="off"
                      placeholder="Votre identifiant (ex: hacene) ou email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-tv-card border border-tv-border rounded-xl pl-9 pr-3 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-tv-accent"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-300">
                      Mot de passe
                    </label>
                    {mode === 'login' && (
                      <button
                        type="button"
                        onClick={handleForgotPassword}
                        className="text-[11px] text-tv-accent hover:underline transition"
                      >
                        Mot de passe oublié ?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-tv-card border border-tv-border rounded-xl pl-9 pr-10 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-tv-accent"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition p-1"
                      title={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading || !email.trim() || !password.trim()}
                  className="w-full py-3 bg-tv-accent text-slate-950 font-black rounded-xl text-xs hover:bg-sky-400 shadow-lg shadow-sky-500/20 transition flex items-center justify-center space-x-2 disabled:opacity-50"
                >
                  {isLoading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : mode === 'login' ? (
                    <LogIn className="w-4 h-4" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  <span>
                    {isLoading
                      ? 'Traitement...'
                      : mode === 'login'
                      ? 'Se connecter et charger mes playlists'
                      : 'Créer mon compte et sauvegarder'}
                  </span>
                </button>
              </form>
            </div>
          )}

          {statusMessage && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-center space-x-2.5 ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
              )}
              <span>{statusMessage.text}</span>
            </div>
          )}

          {/* Web Portal Link Info Card with QR Code */}
          <div className="bg-black/40 border border-white/5 p-4 rounded-2xl space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-300 font-bold">
              <span className="flex items-center space-x-1.5 text-tv-accent">
                <QrCode className="w-4 h-4 text-sky-400" />
                <span>Portail de configuration Web & Mobile</span>
              </span>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-4 bg-tv-card/60 p-3 rounded-2xl border border-white/10">
              {/* QR Code image for smartphone scanning */}
              <div className="w-28 h-28 bg-[#080c14] p-1.5 rounded-xl border border-sky-500/30 shadow-lg flex-shrink-0 flex items-center justify-center">
                <img
                  src={qrCodeUrl}
                  alt="QR Code Portail KeoTV"
                  className="w-full h-full object-contain rounded-lg"
                  loading="lazy"
                />
              </div>

              <div className="flex-1 space-y-1.5 min-w-0 text-center sm:text-left">
                <p className="text-[11px] text-slate-300 font-medium">
                  Scannez ce QR Code avec l&apos;appareil photo de votre smartphone pour ouvrir le portail sans rien taper :
                </p>
                <div className="p-2 bg-black/50 rounded-xl border border-white/10 flex items-center justify-between text-[11px] font-mono text-white">
                  <span className="truncate text-sky-300 font-bold">{portalUrl}</span>
                  <a
                    href={portalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-2.5 py-1 bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 rounded-lg text-[10px] font-bold transition ml-2 flex-shrink-0"
                  >
                    Ouvrir
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-tv-border bg-black/40 flex justify-end flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
