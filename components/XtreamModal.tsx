'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, Server, Link, Shield, CheckCircle2, AlertCircle, Loader2, Pencil, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { PlaylistConfig } from '@/types/iptv';

interface XtreamModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSavePlaylist: (
    data: {
      type: 'xtream' | 'm3u';
      name: string;
      server_url: string;
      username?: string;
      password?: string;
      m3u_url?: string;
    },
    onProgress: (step: string) => void
  ) => Promise<void>;
  initialPlaylist?: PlaylistConfig | null;
  onUpdatePlaylist?: (
    id: string,
    data: {
      type: 'xtream' | 'm3u';
      name: string;
      server_url: string;
      username?: string;
      password?: string;
      m3u_url?: string;
    },
    resync: boolean,
    onProgress: (step: string) => void
  ) => Promise<void>;
}

export const XtreamModal: React.FC<XtreamModalProps> = ({
  isOpen,
  onClose,
  onSavePlaylist,
  initialPlaylist,
  onUpdatePlaylist,
}) => {
  const isEditing = Boolean(initialPlaylist);
  const [tab, setTab] = useState<'xtream' | 'm3u'>('xtream');
  const [name, setName] = useState('');
  const [serverUrl, setServerUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [m3uUrl, setM3uUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [progressMessage, setProgressMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const [showPassword, setShowPassword] = useState(false);
  const firstInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (initialPlaylist) {
        setTab(initialPlaylist.type || 'xtream');
        setName(initialPlaylist.name || '');
        setServerUrl(initialPlaylist.server_url || '');
        setUsername(initialPlaylist.username || '');
        setPassword(initialPlaylist.password || '');
        setM3uUrl(initialPlaylist.m3u_url || (initialPlaylist.type === 'm3u' ? initialPlaylist.server_url : ''));
      } else {
        setTab('xtream');
        setName('');
        setServerUrl('');
        setUsername('');
        setPassword('');
        setM3uUrl('');
      }
      setError(null);
      setProgressMessage('');
      setTimeout(() => firstInputRef.current?.focus(), 150);
    }
  }, [isOpen, initialPlaylist]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      // If user is editing text in an input field, allow Backspace for deletion without closing modal
      const target = e.target as HTMLElement | null;
      const isInputFocused = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');

      if (e.key === 'Backspace' && isInputFocused) {
        return;
      }

      const isBack =
        e.key === 'Escape' ||
        (!isInputFocused && e.key === 'Backspace') ||
        e.key === 'GoBack' ||
        (e as any).keyCode === 27 ||
        (e as any).keyCode === 4;

      if (isBack) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleProcessSubmit = async (resync: boolean) => {
    setError(null);
    setIsLoading(true);
    setProgressMessage(resync ? 'Initialisation de la synchronisation...' : 'Enregistrement des modifications...');

    try {
      const payload = {
        type: tab,
        name: name.trim() || (tab === 'xtream' ? 'Mon Abonnement Xtream' : 'Ma Playlist M3U'),
        server_url: tab === 'xtream' ? serverUrl.trim() : m3uUrl.trim(),
        username: tab === 'xtream' ? username.trim() : undefined,
        password: tab === 'xtream' ? password.trim() : undefined,
        m3u_url: tab === 'm3u' ? m3uUrl.trim() : undefined,
      };

      if (tab === 'xtream') {
        if (!serverUrl || !username || !password) {
          throw new Error('Veuillez renseigner tous les champs Xtream (Serveur, Identifiant, Mot de passe).');
        }
      } else {
        if (!m3uUrl) {
          throw new Error('Veuillez renseigner le lien URL M3U.');
        }
      }

      if (isEditing && initialPlaylist && onUpdatePlaylist) {
        await onUpdatePlaylist(initialPlaylist.id, payload, resync, (step) => setProgressMessage(step));
      } else {
        await onSavePlaylist(payload, (step) => setProgressMessage(step));
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la configuration');
    } finally {
      setIsLoading(false);
      setProgressMessage('');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleProcessSubmit(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-lg bg-tv-surface border border-tv-border rounded-2xl shadow-2xl overflow-hidden text-slate-100 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-tv-border bg-tv-card/50">
          <div className="flex items-center space-x-2.5">
            {isEditing ? <Pencil className="w-5 h-5 text-tv-accent" /> : <Server className="w-5 h-5 text-tv-accent" />}
            <h2 className="text-base font-bold text-white">
              {isEditing ? 'Modifier les Paramètres de la Playlist' : 'Ajouter une Playlist / Abonnement'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition focus:outline-none focus:ring-2 focus:ring-tv-accent focus:ring-offset-2 focus:ring-offset-tv-surface"
            title="Fermer (Retour)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab selection */}
        <div className="flex border-b border-tv-border bg-black/20">
          <button
            type="button"
            onClick={() => setTab('xtream')}
            className={`flex-1 py-3 text-sm font-semibold border-b-2 transition focus:outline-none focus:ring-2 focus:ring-tv-accent focus:ring-offset-2 focus:ring-offset-tv-surface ${
              tab === 'xtream'
                ? 'border-tv-accent text-tv-accent bg-tv-accent/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Xtream Codes API
          </button>
          <button
            type="button"
            onClick={() => setTab('m3u')}
            className={`flex-1 py-3 text-sm font-semibold border-b-2 transition focus:outline-none focus:ring-2 focus:ring-tv-accent focus:ring-offset-2 focus:ring-offset-tv-surface ${
              tab === 'm3u'
                ? 'border-tv-accent text-tv-accent bg-tv-accent/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Lien M3U / M3U8
          </button>
        </div>

        {/* Form content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center space-x-2.5 text-xs text-rose-300">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Nom de la Playlist
            </label>
            <input
              ref={firstInputRef}
              type="text"
              placeholder="Ex: Mon Abonnement IPTV"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-tv-card border border-tv-border rounded-xl px-3.5 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-tv-accent focus:ring-offset-2 focus:ring-offset-tv-surface"
            />
          </div>

          {tab === 'xtream' ? (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  URL du Serveur (avec port)
                </label>
                <input
                  type="text"
                  placeholder="http://example.com:8080"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  className="w-full bg-tv-card border border-tv-border rounded-xl px-3.5 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-tv-accent focus:ring-1 focus:ring-tv-accent"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Identifiant (Username)
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-tv-card border border-tv-border rounded-xl px-3.5 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-tv-accent focus:ring-1 focus:ring-tv-accent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Mot de passe
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-tv-card border border-tv-border rounded-xl pl-3.5 pr-10 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-tv-accent focus:ring-1 focus:ring-tv-accent"
                      required
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
              </div>
            </>
          ) : (
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Lien URL M3U / M3U8
              </label>
              <input
                type="url"
                placeholder="https://example.com/playlist.m3u"
                value={m3uUrl}
                onChange={(e) => setM3uUrl(e.target.value)}
                className="w-full bg-tv-card border border-tv-border rounded-xl px-3.5 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-tv-accent focus:ring-1 focus:ring-tv-accent"
                required
              />
            </div>
          )}

          {isLoading && (
            <div className="p-3.5 bg-tv-focus/10 border border-tv-accent/30 rounded-xl flex items-center space-x-3 text-xs text-sky-200 animate-pulse">
              <Loader2 className="w-5 h-5 text-tv-accent animate-spin flex-shrink-0" />
              <div className="min-w-0 flex-1 font-medium">
                {progressMessage}
              </div>
            </div>
          )}

          <div className="pt-2 flex flex-wrap items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5 transition disabled:opacity-30 focus:outline-none focus:ring-2 focus:ring-tv-accent"
            >
              Annuler
            </button>
            {isEditing ? (
              <>
                <button
                  type="button"
                  onClick={() => handleProcessSubmit(false)}
                  disabled={isLoading}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-bold border border-tv-border transition flex items-center space-x-2 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-tv-accent"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Enregistrer</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleProcessSubmit(true)}
                  disabled={isLoading}
                  className="px-5 py-2.5 bg-tv-focus hover:bg-sky-500 text-white rounded-xl text-sm font-bold shadow-lg transition flex items-center space-x-2 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-tv-accent"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Synchronisation...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      <span>Enregistrer & Re-synchroniser</span>
                    </>
                  )}
                </button>
              </>
            ) : (
              <button
                type="submit"
                disabled={isLoading}
                className="px-5 py-2.5 bg-tv-focus hover:bg-sky-500 text-white rounded-xl text-sm font-bold shadow-lg transition flex items-center space-x-2 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-tv-accent"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Importation...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Enregistrer & Charger</span>
                  </>
                )}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
