'use client';

import React, { useState } from 'react';
import { X, Server, Link, Shield, CheckCircle2, AlertCircle } from 'lucide-react';

interface XtreamModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSavePlaylist: (data: {
    type: 'xtream' | 'm3u';
    name: string;
    server_url: string;
    username?: string;
    password?: string;
    m3u_url?: string;
  }) => Promise<void>;
}

export const XtreamModal: React.FC<XtreamModalProps> = ({ isOpen, onClose, onSavePlaylist }) => {
  const [tab, setTab] = useState<'xtream' | 'm3u'>('xtream');
  const [name, setName] = useState('');
  const [serverUrl, setServerUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [m3uUrl, setM3uUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (tab === 'xtream') {
        if (!serverUrl || !username || !password) {
          throw new Error('Veuillez renseigner tous les champs Xtream.');
        }
        await onSavePlaylist({
          type: 'xtream',
          name: name.trim() || 'Mon Abonnement Xtream',
          server_url: serverUrl.trim(),
          username: username.trim(),
          password: password.trim(),
        });
      } else {
        if (!m3uUrl) {
          throw new Error('Veuillez renseigner le lien M3U.');
        }
        await onSavePlaylist({
          type: 'm3u',
          name: name.trim() || 'Ma Playlist M3U',
          server_url: m3uUrl.trim(),
          m3u_url: m3uUrl.trim(),
        });
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la configuration');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-tv-surface border border-tv-border rounded-2xl shadow-2xl overflow-hidden text-slate-100 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-tv-border bg-tv-card/50">
          <div className="flex items-center space-x-2.5">
            <Server className="w-5 h-5 text-tv-accent" />
            <h2 className="text-base font-bold text-white">Ajouter une Playlist / Abonnement</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab selection */}
        <div className="flex border-b border-tv-border bg-black/20">
          <button
            type="button"
            onClick={() => setTab('xtream')}
            className={`flex-1 py-3 text-sm font-semibold border-b-2 transition ${
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
            className={`flex-1 py-3 text-sm font-semibold border-b-2 transition ${
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
              type="text"
              placeholder="Ex: Abonnement Premium"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-tv-card border border-tv-border rounded-xl px-3.5 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-tv-accent focus:ring-1 focus:ring-tv-accent"
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
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-tv-card border border-tv-border rounded-xl px-3.5 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-tv-accent focus:ring-1 focus:ring-tv-accent"
                    required
                  />
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

          <div className="pt-2 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5 transition"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-5 py-2 bg-tv-focus hover:bg-sky-500 text-white rounded-xl text-sm font-bold shadow-lg transition flex items-center space-x-2 disabled:opacity-50"
            >
              {isLoading ? (
                <span>Connexion en cours...</span>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Enregistrer & Charger</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
