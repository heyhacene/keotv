'use client';

import React, { useState, useEffect } from 'react';
import {
  Tv,
  Server,
  KeyRound,
  User,
  Link as LinkIcon,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Sparkles,
  LogIn,
  UserPlus,
  LogOut,
  Film,
  Clock,
  Send,
} from 'lucide-react';
import {
  KeoUserAccount,
  loginKeoUser,
  registerKeoUser,
  saveUserCloudSync,
  getActiveKeoUser,
  logoutKeoUser,
  resetPasswordForEmail,
} from '@/lib/supabase';

export default function WebSyncDashboard() {
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const [showPlaylistPassword, setShowPlaylistPassword] = useState(false);
  const [currentUser, setCurrentUser] = useState<KeoUserAccount | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form states for adding or editing Xtream/M3U playlist via web
  const [playlistType, setPlaylistType] = useState<'xtream' | 'm3u'>('xtream');
  const [serverUrl, setServerUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [m3uUrl, setM3uUrl] = useState('');
  const [playlistName, setPlaylistName] = useState('Mon Abonnement IPTV');

  // Check logged in user on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const active = getActiveKeoUser();
      if (active) {
        setCurrentUser(active);
        if (active.playlists && active.playlists.length > 0) {
          const firstPl = active.playlists[0];
          setPlaylistType(firstPl.type || 'xtream');
          setServerUrl(firstPl.server_url || '');
          setUsername(firstPl.username || '');
          setPassword(firstPl.password || '');
          setM3uUrl(firstPl.m3u_url || '');
          setPlaylistName(firstPl.name || 'Mon Abonnement IPTV');
        }
      }
    }
  }, []);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail.trim() || !authPassword.trim()) {
      setStatusMessage({ type: 'error', text: 'Veuillez saisir votre identifiant ou email et votre mot de passe.' });
      return;
    }

    setIsLoading(true);
    setStatusMessage(null);

    if (authMode === 'login') {
      const res = await loginKeoUser({ identifier: authEmail, password: authPassword });
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
        setStatusMessage({ type: 'success', text: `Connecté avec succès en tant que ${res.user.user_label || res.user.email || res.user.username} !` });
      } else {
        setStatusMessage({ type: 'error', text: res.error || 'Erreur lors de la connexion.' });
      }
    } else {
      const res = await registerKeoUser({
        identifier: authEmail,
        password: authPassword,
        data: {
          user_label: authEmail.split('@')[0],
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

  const handleForgotPassword = async () => {
    if (!authEmail.trim() || !authEmail.includes('@')) {
      setStatusMessage({ type: 'error', text: 'Veuillez saisir votre adresse email pour réinitialiser le mot de passe.' });
      return;
    }
    setIsLoading(true);
    setStatusMessage(null);
    const res = await resetPasswordForEmail(authEmail);
    setIsLoading(false);
    if (res.success) {
      setStatusMessage({ type: 'success', text: 'Un lien de réinitialisation sécurisé a été envoyé à votre adresse email.' });
    } else {
      setStatusMessage({ type: 'error', text: res.error || 'Erreur lors de la demande.' });
    }
  };

  const handleSavePlaylistToAccount = async () => {
    if (!currentUser) return;
    if (playlistType === 'xtream') {
      if (!serverUrl.trim() || !username.trim()) {
        setStatusMessage({ type: 'error', text: "Veuillez saisir l'URL du serveur et votre identifiant IPTV." });
        return;
      }
    } else {
      if (!m3uUrl.trim()) {
        setStatusMessage({ type: 'error', text: "Veuillez saisir le lien ou l'URL de votre fichier M3U." });
        return;
      }
    }

    setIsLoading(true);
    setStatusMessage(null);

    const updatedPlaylists = [
      {
        id: 'pl_user_' + Date.now(),
        name: playlistName.trim() || (playlistType === 'xtream' ? 'Mon Abonnement Xtream' : 'Ma Playlist M3U'),
        type: playlistType,
        server_url: playlistType === 'xtream' ? serverUrl.trim() : m3uUrl.trim(),
        username: playlistType === 'xtream' ? username.trim() : '',
        password: playlistType === 'xtream' ? password.trim() : '',
        m3u_url: playlistType === 'm3u' ? m3uUrl.trim() : '',
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
          text: 'Playlist enregistrée sur votre compte ! Vos téléviseurs et smartphones connectés recevront ces paramètres immédiatement.',
        });
      } else {
        setStatusMessage({
          type: 'success',
          text: 'Enregistré dans votre session locale.',
        });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Erreur lors de la sauvegarde.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleInjectDemoPlaylist = async () => {
    if (!currentUser) {
      setStatusMessage({ type: 'error', text: 'Veuillez vous connecter avant d’ajouter la playlist de test.' });
      return;
    }

    setIsLoading(true);
    setStatusMessage(null);

    const demoUrl = typeof window !== 'undefined'
      ? `${window.location.origin}/playlist-demo.m3u`
      : 'https://raw.githubusercontent.com/heyhacene/keotv/main/public/playlist-demo.m3u';

    const updatedPlaylists = [
      {
        id: 'pl_demo_test_' + Date.now(),
        name: '📺 Chaînes Françaises & VODs (Test M3U)',
        type: 'm3u' as const,
        server_url: demoUrl,
        m3u_url: demoUrl,
        username: '',
        password: '',
        status: 'active' as const,
        channel_count: 12,
        last_sync_at: new Date().toISOString(),
      },
    ];

    const updatedAccount: KeoUserAccount = {
      ...currentUser,
      playlists: updatedPlaylists,
      updated_at: new Date().toISOString(),
    };

    try {
      await saveUserCloudSync(updatedAccount);
      setCurrentUser(updatedAccount);
      setPlaylistType('m3u');
      setM3uUrl(demoUrl);
      setPlaylistName('📺 Chaînes Françaises & VODs (Test M3U)');
      setStatusMessage({
        type: 'success',
        text: 'Playlist démo France (BFM, Arte, CStar, Euronews, Films & Séries - sans CNews) injectée sur votre compte avec succès !',
      });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Erreur lors de l’injection.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    await logoutKeoUser();
    setCurrentUser(null);
    setAuthEmail('');
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
          <div className="flex items-center space-x-2">
            <a
              href="https://tinyurl.com/keo-apk"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-tv-accent hover:bg-tv-accent/80 text-black text-xs font-black transition shadow-lg shadow-tv-accent/20"
            >
              <Tv className="w-4 h-4" />
              <span>Télécharger l&apos;APK Android (Code Downloader : 4317787)</span>
            </a>
          </div>
        </div>

        {/* Section 1: User Account Authentication (Email + Mot de passe Supabase) */}
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
              Connectez-vous avec votre adresse email pour sauvegarder vos playlists, réglages et reprises de lecture VOD en toute sécurité.
            </p>

            <form onSubmit={handleAuthSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Identifiant ou Email</label>
                <input
                  type="text"
                  autoCapitalize="none"
                  autoCorrect="off"
                  placeholder="Votre identifiant (ex: hacene) ou email"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  className="w-full bg-black/60 border border-white/10 focus:border-sky-400 text-white px-4 py-2.5 rounded-xl text-sm focus:outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-300">Mot de passe</label>
                  {authMode === 'login' && (
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      className="text-[11px] text-sky-400 hover:text-sky-300 transition"
                    >
                      Mot de passe oublié ?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    type={showAuthPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    className="w-full bg-black/60 border border-white/10 focus:border-sky-400 text-white px-4 py-2.5 pr-10 rounded-xl text-sm focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAuthPassword(!showAuthPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    {showAuthPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="sm:col-span-2 flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={isLoading || !authEmail.trim() || !authPassword.trim()}
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
          <div className="bg-slate-900 border border-emerald-500/30 rounded-3xl p-6 shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center space-x-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xl flex-shrink-0">
                {(currentUser.user_label || currentUser.email).slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                    Compte Connecté
                  </span>
                  <span className="text-[10px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 px-2 py-0.5 rounded-full font-mono">
                    Cloud Synchronisé
                  </span>
                </div>
                <h2 className="text-lg font-black text-white">{currentUser.user_label || currentUser.email}</h2>
                <p className="text-xs text-slate-400">
                  {currentUser.playlists?.length || 0} playlist(s) enregistrée(s) • {currentUser.favorites?.length || 0} favoris • {currentUser.watched_positions?.length || 0} reprise(s) VOD
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
              <button
                onClick={handleInjectDemoPlaylist}
                disabled={isLoading}
                className="px-4 py-2.5 bg-gradient-to-r from-amber-500/20 to-yellow-500/20 border border-amber-500/30 hover:border-amber-400 text-amber-300 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 shadow-sm"
                title="Ajouter la playlist démo France (BFM, Arte, CStar, Euronews, Films & Séries - sans CNews)"
              >
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>Charger la Playlist Démo France</span>
              </button>
              <button
                onClick={handleLogout}
                className="px-4 py-2.5 bg-white/10 hover:bg-rose-500/20 hover:text-rose-300 text-slate-300 rounded-xl text-xs font-bold transition flex items-center space-x-1.5"
              >
                <LogOut className="w-4 h-4" />
                <span>Déconnexion</span>
              </button>
            </div>
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-2 text-sky-400 font-bold text-sm uppercase tracking-wider">
              <Server className="w-4 h-4" />
              <span>Gestion de vos Abonnements & Playlists</span>
            </div>

            {/* Type Switcher: Xtream vs M3U */}
            <div className="flex p-1 bg-black/40 rounded-xl border border-white/5">
              <button
                type="button"
                onClick={() => setPlaylistType('xtream')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 ${
                  playlistType === 'xtream' ? 'bg-sky-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Server className="w-3.5 h-3.5" />
                <span>Xtream Codes</span>
              </button>
              <button
                type="button"
                onClick={() => setPlaylistType('m3u')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 ${
                  playlistType === 'm3u' ? 'bg-sky-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                <LinkIcon className="w-3.5 h-3.5" />
                <span>Lien M3U</span>
              </button>
            </div>
          </div>

          <p className="text-xs text-slate-400">
            Saisissez vos paramètres IPTV ci-dessous. Dès que vous enregistrez, ils sont synchronisés dans votre Cloud. Sur votre TV ou smartphone, il vous suffira de vous connecter ou de cliquer sur « Rapatrier » pour les récupérer sans saisir un seul mot de passe à la télécommande !
          </p>

          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Nom de la playlist / Fournisseur</label>
              <input
                type="text"
                placeholder="Ex: Mon Abonnement IPTV"
                value={playlistName}
                onChange={(e) => setPlaylistName(e.target.value)}
                className="w-full bg-black/60 border border-white/10 focus:border-sky-400 text-white px-4 py-2.5 rounded-xl text-sm focus:outline-none"
              />
            </div>

            {playlistType === 'xtream' ? (
              <>
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
                    <div className="relative">
                      <input
                        type={showPlaylistPassword ? 'text' : 'password'}
                        placeholder="••••••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full bg-black/60 border border-white/10 focus:border-sky-400 text-white px-4 py-2.5 pr-10 rounded-xl text-sm font-mono focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPlaylistPassword(!showPlaylistPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                      >
                        {showPlaylistPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Lien ou URL du fichier M3U / M3U8
                </label>
                <input
                  type="url"
                  placeholder="https://mon-fournisseur.com/get.php?username=...&type=m3u_plus"
                  value={m3uUrl}
                  onChange={(e) => setM3uUrl(e.target.value)}
                  className="w-full bg-black/60 border border-white/10 focus:border-sky-400 text-white px-4 py-2.5 rounded-xl text-sm font-mono focus:outline-none"
                />
              </div>
            )}
          </div>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-white/10 pt-4">
            <button
              type="button"
              onClick={handleInjectDemoPlaylist}
              className="text-xs text-amber-400 hover:text-amber-300 flex items-center space-x-1.5 underline underline-offset-4"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Tester avec la playlist générique (12 chaînes françaises & VODs)</span>
            </button>

            <button
              onClick={handleSavePlaylistToAccount}
              disabled={
                isLoading ||
                !currentUser ||
                (playlistType === 'xtream' && (!serverUrl.trim() || !username.trim())) ||
                (playlistType === 'm3u' && !m3uUrl.trim())
              }
              className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-sm flex items-center justify-center space-x-2 transition disabled:opacity-50 shadow-lg shadow-sky-500/25"
            >
              <Sparkles className="w-4 h-4" />
              <span>Enregistrer dans mon compte Cloud</span>
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
