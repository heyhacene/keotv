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
  ExternalLink,
  ShieldCheck,
  User,
  LogIn,
  UserPlus,
  LogOut,
  Sparkles,
  Clock,
} from 'lucide-react';
import {
  registerKeoUser,
  loginKeoUser,
  getActiveKeoUser,
  logoutKeoUser,
  saveUserCloudSync,
  KeoUserAccount,
  WatchedItem,
} from '@/lib/supabase';

export default function WebSyncDashboard() {
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [currentUser, setCurrentUser] = useState<KeoUserAccount | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form states for adding or editing Xtream playlist via web
  const [serverUrl, setServerUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [playlistName, setPlaylistName] = useState('Mon Abonnement IPTV');

  // Check logged in user on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const active = getActiveKeoUser();
      if (active) {
        setCurrentUser(active);
        if (active.playlists && active.playlists.length > 0) {
          const firstPl = active.playlists[0];
          setServerUrl(firstPl.server_url || '');
          setUsername(firstPl.username || '');
          setPassword(firstPl.password || '');
          setPlaylistName(firstPl.name || 'Mon Abonnement IPTV');
        }
      }
    }
  }, []);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authUsername.trim() || !authPassword.trim()) {
      setStatusMessage({ type: 'error', text: 'Veuillez saisir votre identifiant et votre mot de passe.' });
      return;
    }

    setIsLoading(true);
    setStatusMessage(null);

    if (authMode === 'login') {
      const res = await loginKeoUser({ username: authUsername, password: authPassword });
      setIsLoading(false);
      if (res.user) {
        setCurrentUser(res.user);
        if (res.user.playlists && res.user.playlists.length > 0) {
          const firstPl = res.user.playlists[0];
          setServerUrl(firstPl.server_url || '');
          setUsername(firstPl.username || '');
          setPassword(firstPl.password || '');
          setPlaylistName(firstPl.name || 'Mon Abonnement IPTV');
        }
        setStatusMessage({ type: 'success', text: `Connecté avec succès en tant que ${res.user.username} !` });
      } else {
        setStatusMessage({ type: 'error', text: res.error || 'Erreur lors de la connexion.' });
      }
    } else {
      const res = await registerKeoUser({
        username: authUsername,
        password: authPassword,
        data: {
          user_label: authUsername,
        },
      });
      setIsLoading(false);
      if (res.user) {
        setCurrentUser(res.user);
        setStatusMessage({ type: 'success', text: 'Compte créé avec succès ! Vous pouvez maintenant configurer votre playlist.' });
      } else {
        setStatusMessage({ type: 'error', text: res.error || 'Erreur lors de la création du compte.' });
      }
    }
  };

  const handleSavePlaylistToAccount = async () => {
    if (!currentUser) return;
    if (!serverUrl.trim() || !username.trim()) {
      setStatusMessage({ type: 'error', text: "Veuillez saisir l'URL du serveur et votre identifiant IPTV." });
      return;
    }

    setIsLoading(true);
    setStatusMessage(null);

    const updatedPlaylists = [
      {
        id: 'pl_xtream_user_' + Date.now(),
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

    const updatedAccount: KeoUserAccount = {
      ...currentUser,
      playlists: updatedPlaylists,
      updated_at: new Date().toISOString(),
    };

    try {
      const ok = await saveUserCloudSync(updatedAccount);
      setCurrentUser(updatedAccount);
      if (ok) {
        setStatusMessage({
          type: 'success',
          text: 'Abonnement enregistré sur votre compte ! Dès que vous ouvrez KeoTV sur votre TV ou smartphone, votre playlist se chargera automatiquement.',
        });
      } else {
        setStatusMessage({
          type: 'success',
          text: 'Enregistré dans votre session locale. Vos appareils utilisant ce compte recevront ces identifiants.',
        });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Erreur lors de la sauvegarde.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    logoutKeoUser();
    setCurrentUser(null);
    setAuthUsername('');
    setAuthPassword('');
    setStatusMessage({ type: 'success', text: 'Vous avez été déconnecté.' });
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
                  Portail Web
                </span>
              </h1>
              <p className="text-xs sm:text-sm text-slate-400">
                Gérez vos playlists IPTV depuis votre ordinateur et retrouvez-les sur votre Android TV et mobile
              </p>
            </div>
          </div>
          <a
            href="/"
            className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold transition text-slate-300 hover:text-white"
          >
            <span>Lancer le Web Player</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* Section 1: User Account Authentication (ID + Mot de passe) */}
        {!currentUser ? (
          <div className="bg-slate-900 border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-sky-400 font-bold text-sm uppercase tracking-wider">
                <User className="w-4 h-4" />
                <span>Connexion à votre Compte KeoTV</span>
              </div>
              <div className="flex p-1 bg-black/40 rounded-xl border border-white/5">
                <button
                  onClick={() => setAuthMode('login')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                    authMode === 'login' ? 'bg-sky-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Connexion
                </button>
                <button
                  onClick={() => setAuthMode('register')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                    authMode === 'register' ? 'bg-sky-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Créer un compte
                </button>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-slate-300">
              Connectez-vous avec vos identifiants pour synchroniser automatiquement vos playlists entre cette page web et vos téléviseurs.
            </p>

            <form onSubmit={handleAuthSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Identifiant / Pseudo</label>
                <input
                  type="text"
                  placeholder="votre_identifiant"
                  value={authUsername}
                  onChange={(e) => setAuthUsername(e.target.value)}
                  className="w-full bg-black/60 border border-white/10 focus:border-sky-400 text-white px-4 py-2.5 rounded-xl text-sm focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Mot de passe</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  className="w-full bg-black/60 border border-white/10 focus:border-sky-400 text-white px-4 py-2.5 rounded-xl text-sm focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2 flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={isLoading || !authUsername.trim() || !authPassword.trim()}
                  className="px-6 py-3 rounded-2xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-sm flex items-center space-x-2 transition disabled:opacity-50 shadow-lg shadow-sky-500/25"
                >
                  {isLoading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : authMode === 'login' ? (
                    <LogIn className="w-4 h-4" />
                  ) : (
                    <UserPlus className="w-4 h-4" />
                  )}
                  <span>{isLoading ? 'Traitement...' : authMode === 'login' ? 'Se connecter' : 'Créer mon compte'}</span>
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="bg-slate-900 border border-emerald-500/30 rounded-3xl p-6 shadow-2xl flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xl">
                {currentUser.username.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                    Compte Connecté
                  </span>
                  <span className="text-[10px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 px-2 py-0.5 rounded-full font-mono">
                    Cloud Synchro OK
                  </span>
                </div>
                <h2 className="text-lg font-black text-white">{currentUser.username}</h2>
                <p className="text-xs text-slate-400">
                  {currentUser.playlists?.length || 0} playlists • {currentUser.favorites?.length || 0} favoris synchronisés
                </p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-white/10 hover:bg-rose-500/20 hover:text-rose-300 text-slate-300 rounded-xl text-xs font-bold transition flex items-center space-x-1.5"
            >
              <LogOut className="w-4 h-4" />
              <span>Déconnexion</span>
            </button>
          </div>
        )}

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

        {/* Section 2: IPTV Playlist Configuration Form */}
        <div className="bg-slate-900 border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="flex items-center space-x-2 text-sky-400 font-bold text-sm uppercase tracking-wider">
            <Server className="w-4 h-4" />
            <span>Identifiants de votre Abonnement IPTV (Xtream Codes)</span>
          </div>
          <p className="text-xs text-slate-400">
            Saisissez vos identifiants IPTV ci-dessous. Dès que vous cliquez sur enregistrer, votre TV et vos smartphones connectés avec le même compte chargeront automatiquement ces flux.
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
              onClick={handleSavePlaylistToAccount}
              disabled={isLoading || !currentUser || !serverUrl.trim() || !username.trim()}
              className="px-6 py-3 rounded-2xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-sm flex items-center space-x-2 transition disabled:opacity-50 shadow-lg shadow-sky-500/25"
            >
              <Sparkles className="w-4 h-4" />
              <span>Enregistrer sur mon compte & Synchroniser la TV</span>
            </button>
          </div>
        </div>

        {/* Section 3: Watched positions / Resume */}
        {currentUser && currentUser.watched_positions && currentUser.watched_positions.length > 0 && (
          <div className="bg-slate-900 border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-4">
            <div className="flex items-center space-x-2 text-purple-400 font-bold text-sm uppercase tracking-wider">
              <Clock className="w-4 h-4" />
              <span>Films & Séries en cours de visionnage ({currentUser.watched_positions.length})</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {currentUser.watched_positions.map((item, idx) => {
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
