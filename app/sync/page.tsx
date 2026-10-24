'use client';

import React, { useState, useEffect } from 'react';
import {
  Tv,
  Film,
  Clapperboard,
  Server,
  RefreshCw,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Copy,
  ExternalLink,
  ShieldCheck,
  Play,
  Clock,
  Sparkles,
} from 'lucide-react';
import { pullSyncFromCloud, pushSyncToCloud, CloudDeviceSync, WatchedItem } from '@/lib/supabase';

export default function WebSyncDashboard() {
  const [syncCode, setSyncCode] = useState<string>('');
  const [connectedData, setConnectedData] = useState<CloudDeviceSync | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form states for adding or editing Xtream playlist via web
  const [serverUrl, setServerUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [playlistName, setPlaylistName] = useState('Mon Abonnement IPTV');

  // Load sync code from query params or localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const codeFromUrl = urlParams.get('code') || urlParams.get('c');
      if (codeFromUrl) {
        setSyncCode(codeFromUrl.toUpperCase());
        handleLoadConfig(codeFromUrl.toUpperCase());
      } else {
        const saved = localStorage.getItem('keotv_web_sync_code');
        if (saved) {
          setSyncCode(saved);
          handleLoadConfig(saved);
        }
      }
    }
  }, []);

  const handleLoadConfig = async (codeToUse?: string) => {
    const code = (codeToUse || syncCode).trim().toUpperCase();
    if (!code) {
      setStatusMessage({ type: 'error', text: 'Veuillez saisir votre code de synchronisation (ex: KEO-7842)' });
      return;
    }

    setIsLoading(true);
    setStatusMessage(null);
    try {
      const data = await pullSyncFromCloud(code);
      if (data) {
        setConnectedData(data);
        if (typeof window !== 'undefined') {
          localStorage.setItem('keotv_web_sync_code', code);
        }
        if (data.playlists && data.playlists.length > 0) {
          const firstPl = data.playlists[0];
          setServerUrl(firstPl.server_url || '');
          setUsername(firstPl.username || '');
          setPassword(firstPl.password || '');
          setPlaylistName(firstPl.name || 'Mon Abonnement IPTV');
        }
        setStatusMessage({ type: 'success', text: `Appareil connecté avec succès (${code})` });
      } else {
        setStatusMessage({
          type: 'error',
          text: `Aucune configuration trouvée pour le code "${code}". Vous pouvez l'initialiser ci-dessous.`,
        });
        setConnectedData({
          sync_code: code,
          favorites: [],
          hidden_groups: [],
          hidden_channels: [],
          excluded_prefixes: [],
          watched_positions: [],
          playlists: [],
          updated_at: new Date().toISOString(),
        });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Erreur lors de la récupération' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveToCloud = async () => {
    const code = syncCode.trim().toUpperCase();
    if (!code) {
      setStatusMessage({ type: 'error', text: 'Code de synchronisation manquant' });
      return;
    }

    setIsLoading(true);
    setStatusMessage(null);

    const updatedPlaylists = [
      {
        id: 'pl_xtream_web_' + Date.now(),
        name: playlistName.trim() || 'Mon Abonnement IPTV',
        type: 'xtream',
        server_url: serverUrl.trim(),
        username: username.trim(),
        password: password.trim(),
        status: 'active',
        channel_count: 0,
        last_sync_at: new Date().toISOString(),
      },
    ];

    const payload: Partial<CloudDeviceSync> = {
      sync_code: code,
      playlists: updatedPlaylists,
      favorites: connectedData?.favorites || [],
      hidden_groups: connectedData?.hidden_groups || [],
      hidden_channels: connectedData?.hidden_channels || [],
      excluded_prefixes: connectedData?.excluded_prefixes || [],
      watched_positions: connectedData?.watched_positions || [],
      updated_at: new Date().toISOString(),
    };

    try {
      const ok = await pushSyncToCloud(code, payload);
      if (ok) {
        setConnectedData(payload as CloudDeviceSync);
        setStatusMessage({
          type: 'success',
          text: 'Configuration enregistrée ! Vos téléviseurs et smartphones recevront instantanément ces identifiants.',
        });
      } else {
        setStatusMessage({
          type: 'error',
          text: 'Enregistrement sauvegardé localement sur ce navigateur. Pensez à activer la table sur Supabase.',
        });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Erreur lors de la sauvegarde' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-sky-600 to-sky-400 flex items-center justify-center shadow-lg shadow-sky-500/20">
              <Tv className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center space-x-2">
                <span>KeoTV</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-400 border border-sky-500/30 font-semibold font-mono">
                  Cloud Portal
                </span>
              </h1>
              <p className="text-xs sm:text-sm text-slate-400">
                Configurez vos identifiants IPTV depuis n&apos;importe quel navigateur pour votre TV et mobile
              </p>
            </div>
          </div>
          <a
            href="/"
            className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold transition text-slate-300 hover:text-white"
          >
            <span>Ouvrir KeoTV Web</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* Sync Code Connection Card */}
        <div className="bg-slate-900 border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-4">
          <div className="flex items-center space-x-2 text-sky-400 font-bold text-sm uppercase tracking-wider">
            <KeyRound className="w-4 h-4" />
            <span>Code de Synchronisation Multi-Appareils</span>
          </div>
          <p className="text-xs sm:text-sm text-slate-300">
            Retrouvez ce code sur votre téléviseur ou smartphone dans le menu{' '}
            <strong className="text-white">Paramètres &gt; Identification & Synchro</strong>.
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              placeholder="Ex: KEO-4891"
              value={syncCode}
              onChange={(e) => setSyncCode(e.target.value.toUpperCase())}
              className="flex-1 bg-black/60 border border-white/10 focus:border-sky-400 text-white px-4 py-3 rounded-2xl font-mono text-lg uppercase tracking-wider focus:outline-none"
            />
            <button
              onClick={() => handleLoadConfig()}
              disabled={isLoading || !syncCode.trim()}
              className="px-6 py-3 rounded-2xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-sm flex items-center justify-center space-x-2 transition disabled:opacity-50 shadow-lg shadow-sky-500/25"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              <span>{isLoading ? 'Connexion...' : 'Charger la configuration'}</span>
            </button>
          </div>

          {statusMessage && (
            <div
              className={`p-4 rounded-2xl border text-xs sm:text-sm flex items-center space-x-3 ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
              )}
              <span>{statusMessage.text}</span>
            </div>
          )}
        </div>

        {/* Playlist Configuration Form */}
        <div className="bg-slate-900 border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="flex items-center space-x-2 text-sky-400 font-bold text-sm uppercase tracking-wider">
            <Server className="w-4 h-4" />
            <span>Identifiants de votre Abonnement IPTV (Xtream Codes)</span>
          </div>
          <p className="text-xs text-slate-400">
            Saisissez l&apos;URL de votre serveur, votre nom d&apos;utilisateur et mot de passe. Tous vos appareils connectés à ce code recevront automatiquement la playlist.
          </p>

          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Nom de l&apos;abonnement</label>
              <input
                type="text"
                placeholder="Mon Abonnement IPTV"
                value={playlistName}
                onChange={(e) => setPlaylistName(e.target.value)}
                className="w-full bg-black/60 border border-white/10 focus:border-sky-400 text-white px-4 py-2.5 rounded-xl text-sm focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                URL du Serveur IPTV (avec port)
              </label>
              <input
                type="url"
                placeholder="http://iptv-fournisseur.com:8080"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                className="w-full bg-black/60 border border-white/10 focus:border-sky-400 text-white px-4 py-2.5 rounded-xl text-sm font-mono focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Identifiant / Username</label>
                <input
                  type="text"
                  placeholder="votre_identifiant"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-black/60 border border-white/10 focus:border-sky-400 text-white px-4 py-2.5 rounded-xl text-sm font-mono focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Mot de passe / Password</label>
                <input
                  type="password"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-black/60 border border-white/10 focus:border-sky-400 text-white px-4 py-2.5 rounded-xl text-sm font-mono focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              onClick={handleSaveToCloud}
              disabled={isLoading || !serverUrl.trim() || !username.trim()}
              className="px-6 py-3 rounded-2xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-sm flex items-center space-x-2 transition disabled:opacity-50 shadow-lg shadow-sky-500/25"
            >
              <Sparkles className="w-4 h-4" />
              <span>Enregistrer & Synchroniser tous les appareils</span>
            </button>
          </div>
        </div>

        {/* Live Resume / Watched History Dashboard */}
        {connectedData && connectedData.watched_positions && connectedData.watched_positions.length > 0 && (
          <div className="bg-slate-900 border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-4">
            <div className="flex items-center space-x-2 text-purple-400 font-bold text-sm uppercase tracking-wider">
              <Clock className="w-4 h-4" />
              <span>Films & Séries en cours de visionnage ({connectedData.watched_positions.length})</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {connectedData.watched_positions.map((item, idx) => {
                const percent = item.duration > 0 ? Math.round((item.position / item.duration) * 100) : 0;
                const posMin = Math.round(item.position / 60);
                const durMin = Math.round(item.duration / 60);

                return (
                  <div
                    key={idx}
                    className="p-3.5 bg-black/50 border border-white/5 rounded-2xl flex items-center space-x-3"
                  >
                    <div className="w-10 h-14 bg-slate-800 rounded-lg flex items-center justify-center flex-shrink-0 text-slate-400 overflow-hidden">
                      {item.poster ? (
                        <img src={item.poster} alt={item.title} className="w-full h-full object-cover" />
                      ) : (
                        <Film className="w-5 h-5 text-slate-500" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-xs font-bold text-white truncate">{item.title}</h4>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {posMin} min / {durMin > 0 ? `${durMin} min` : 'N/A'} ({percent}%)
                      </p>
                      <div className="w-full bg-slate-800 rounded-full h-1 mt-1.5 overflow-hidden">
                        <div className="bg-sky-400 h-1 rounded-full" style={{ width: `${Math.min(100, percent)}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
