'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  User,
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
} from 'lucide-react';
import {
  registerKeoUser,
  loginKeoUser,
  getActiveKeoUser,
  fetchLatestKeoUser,
  logoutKeoUser,
  saveUserCloudSync,
  KeoUserAccount,
} from '@/lib/supabase';
import { PlaylistConfig } from '@/types/iptv';

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
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [activeUser, setActiveUser] = useState<KeoUserAccount | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [showPassword, setShowPassword] = useState(false);
  const usernameInputRef = useRef<HTMLInputElement | null>(null);

  // Check currently active logged in user
  useEffect(() => {
    if (isOpen) {
      const user = getActiveKeoUser();
      setActiveUser(user);
      setStatusMessage(null);
      setTimeout(() => usernameInputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  // TV Remote Back button (ensuring Backspace in text fields does not exit modal!)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      // If user is typing in an input and presses Backspace, do NOT close modal!
      const target = e.target as HTMLElement | null;
      const isInputFocused = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');

      if (e.key === 'Backspace' && isInputFocused) {
        return; // Allow native backspace deletion without closing modal
      }

      const isBack =
        e.key === 'Escape' ||
        (!isInputFocused && e.key === 'Backspace') ||
        e.key === 'GoBack' ||
        (e as any).keyCode === 27 ||
        (e as any).keyCode === 4;

      if (isBack) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setStatusMessage({ type: 'error', text: 'Veuillez saisir votre identifiant et votre mot de passe.' });
      return;
    }

    setIsLoading(true);
    setStatusMessage(null);

    if (mode === 'login') {
      const res = await loginKeoUser({ username, password });
      setIsLoading(false);
      if (res.user) {
        setActiveUser(res.user);
        setStatusMessage({ type: 'success', text: `Connecté en tant que ${res.user.username} ! Rapatriement de vos playlists...` });
        await onApplyAccountSync(res.user);
        setTimeout(() => onClose(), 1200);
      } else {
        setStatusMessage({ type: 'error', text: res.error || 'Erreur lors de la connexion.' });
      }
    } else {
      // Register new account with local current playlists & favorites pre-seeded
      const res = await registerKeoUser({
        username,
        password,
        data: {
          playlists: currentPlaylists,
          favorites: currentFavorites,
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

  const handlePullFromCloud = async () => {
    if (!activeUser) return;
    setIsLoading(true);
    setStatusMessage(null);
    try {
      const freshUser = await fetchLatestKeoUser(activeUser.username);
      if (freshUser) {
        setActiveUser(freshUser);
        await onApplyAccountSync(freshUser);
        setStatusMessage({
          type: 'success',
          text: `Configuration à jour ! ${freshUser.playlists?.length || 0} playlist(s) et favoris récupérés du Cloud.`,
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
      // Push current playlists & favorites to user account
      const updated = {
        ...activeUser,
        playlists: currentPlaylists,
        favorites: currentFavorites,
      };
      await saveUserCloudSync(updated);
      setActiveUser(updated);
      setStatusMessage({ type: 'success', text: 'Sauvegarde envoyée sur votre compte KeoTV.' });
    } catch {
      setStatusMessage({ type: 'error', text: 'Erreur lors de la sauvegarde.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    logoutKeoUser();
    setActiveUser(null);
    setUsername('');
    setPassword('');
    setStatusMessage({ type: 'success', text: 'Vous avez été déconnecté.' });
  };

  // Fixed public web portal URL for easy keyboard configuration from phone/PC
  const portalUrl = 'https://keotv.vercel.app/sync';
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(portalUrl)}&margin=6&color=38-189-248&bgcolor=8-12-20`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-tv-surface border border-tv-border rounded-3xl shadow-2xl overflow-hidden text-slate-100 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-tv-border bg-tv-card/60 flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-tv-accent/20 border border-tv-accent/30 flex items-center justify-center text-tv-accent">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-white">Compte & Synchronisation KeoTV</h2>
              <p className="text-xs text-slate-400">
                Retrouvez vos playlists, bouquets et favoris sur votre TV, mobile et navigateur
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* If already logged in */}
          {activeUser ? (
            <div className="space-y-4">
              <div className="bg-tv-card/80 border border-emerald-500/30 p-4 rounded-2xl flex items-center justify-between">
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-lg">
                    {activeUser.username.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider block">
                      Connecté au compte
                    </span>
                    <h3 className="text-sm font-bold text-white truncate">{activeUser.username}</h3>
                    <p className="text-[11px] text-slate-400">
                      {activeUser.playlists?.length || 0} playlists • {activeUser.favorites?.length || 0} favoris synchronisés
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="px-3 py-2 bg-white/10 hover:bg-rose-500/20 hover:text-rose-300 text-slate-300 rounded-xl text-xs font-semibold transition flex items-center space-x-1"
                  title="Se déconnecter"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Déconnexion</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={handlePullFromCloud}
                  disabled={isLoading}
                  className="py-3 px-4 bg-tv-focus hover:bg-sky-500 text-white font-bold rounded-xl text-xs shadow-lg transition flex items-center justify-center space-x-2 disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                  <span>{isLoading ? 'Rapatriement...' : 'Rapatrier mes playlists'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleManualSyncNow}
                  disabled={isLoading}
                  className="py-3 px-4 bg-white/10 hover:bg-white/20 text-slate-200 font-bold rounded-xl text-xs border border-white/10 transition flex items-center justify-center space-x-2 disabled:opacity-50"
                >
                  <Sparkles className="w-4 h-4 text-tv-accent" />
                  <span>Envoyer vers le Cloud</span>
                </button>
              </div>
            </div>
          ) : (
            /* Login / Register Form */
            <div className="space-y-4">
              {/* Tab Selector: Connexion vs Création de compte */}
              <div className="flex items-center p-1 bg-black/40 rounded-xl border border-white/5">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setStatusMessage(null);
                  }}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center space-x-1.5 ${
                    mode === 'login' ? 'bg-tv-focus text-white shadow-md' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Se connecter</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setStatusMessage(null);
                  }}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center space-x-1.5 ${
                    mode === 'register' ? 'bg-tv-focus text-white shadow-md' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Créer un compte</span>
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Identifiant / Pseudo
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      ref={usernameInputRef}
                      type="text"
                      placeholder="votre_pseudo"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full bg-tv-card border border-tv-border rounded-xl pl-9 pr-3 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-tv-accent"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Mot de passe
                  </label>
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
                  disabled={isLoading || !username.trim() || !password.trim()}
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
