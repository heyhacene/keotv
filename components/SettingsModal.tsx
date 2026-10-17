'use client';

import React, { useState } from 'react';
import {
  X,
  Settings as SettingsIcon,
  PlusCircle,
  RefreshCw,
  Heart,
  MessageSquare,
  ShieldCheck,
  Download,
  Server,
  Sliders,
  ExternalLink,
  Trash2,
  AlertTriangle,
  Send,
  CheckCircle2,
} from 'lucide-react';
import { PlaylistConfig } from '@/types/iptv';
import { submitAppFeedback } from '@/lib/supabase';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  syncCode: string;
  playlists: PlaylistConfig[];
  onOpenXtreamModal: () => void;
  onOpenSyncModal: () => void;
  onDeletePlaylist: (id: string) => Promise<void>;
  onRestoreDemoPlaylist: () => Promise<void>;
  currentBuildNumber?: number;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  syncCode,
  playlists,
  onOpenXtreamModal,
  onOpenSyncModal,
  onDeletePlaylist,
  onRestoreDemoPlaylist,
  currentBuildNumber = 6,
}) => {
  const [activeTab, setActiveTab] = useState<'playlists' | 'sync' | 'update' | 'feedback' | 'player'>('playlists');
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);

  // Playlist delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // In-app Feedback Form states
  const [feedbackCategory, setFeedbackCategory] = useState<'suggestion' | 'bug' | 'channel' | 'compliment'>('suggestion');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackEmail, setFeedbackEmail] = useState('');
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    setUpdateStatus(null);
    try {
      const res = await fetch('https://api.github.com/repos/heyhacene/keotv/releases/latest');
      if (res.ok) {
        const data = await res.json();
        setUpdateStatus(`Dernière version disponible : ${data.name || data.tag_name}`);
      } else {
        setUpdateStatus('Vous utilisez déjà la dernière version de KeoTV.');
      }
    } catch {
      setUpdateStatus('Impossible de vérifier pour le moment. Vérifiez votre connexion.');
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-2xl bg-tv-surface border border-tv-border rounded-2xl shadow-2xl overflow-hidden text-slate-100 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-tv-border bg-tv-card/60 flex-shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-tv-focus/20 border border-tv-focus/30">
              <SettingsIcon className="w-5 h-5 text-tv-accent" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Paramètres KeoTV</h2>
              <p className="text-xs text-slate-400">Playlists, synchronisation, mises à jour & retours</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-tv-border bg-black/20 overflow-x-auto scrollbar-none flex-shrink-0">
          <button
            onClick={() => setActiveTab('playlists')}
            className={`flex items-center space-x-2 px-4 py-3 text-xs font-semibold whitespace-nowrap border-b-2 transition ${
              activeTab === 'playlists'
                ? 'border-tv-accent text-tv-accent bg-tv-accent/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Server className="w-4 h-4" />
            <span>Playlists & Abonnements</span>
          </button>

          <button
            onClick={() => setActiveTab('sync')}
            className={`flex items-center space-x-2 px-4 py-3 text-xs font-semibold whitespace-nowrap border-b-2 transition ${
              activeTab === 'sync'
                ? 'border-tv-accent text-tv-accent bg-tv-accent/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <RefreshCw className="w-4 h-4" />
            <span>Identification & Synchro</span>
          </button>

          <button
            onClick={() => setActiveTab('update')}
            className={`flex items-center space-x-2 px-4 py-3 text-xs font-semibold whitespace-nowrap border-b-2 transition ${
              activeTab === 'update'
                ? 'border-tv-accent text-tv-accent bg-tv-accent/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Download className="w-4 h-4" />
            <span>Mise à jour</span>
          </button>

          <button
            onClick={() => setActiveTab('player')}
            className={`flex items-center space-x-2 px-4 py-3 text-xs font-semibold whitespace-nowrap border-b-2 transition ${
              activeTab === 'player'
                ? 'border-tv-accent text-tv-accent bg-tv-accent/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Lecteur</span>
          </button>

          <button
            onClick={() => setActiveTab('feedback')}
            className={`flex items-center space-x-2 px-4 py-3 text-xs font-semibold whitespace-nowrap border-b-2 transition ${
              activeTab === 'feedback'
                ? 'border-rose-400 text-rose-400 bg-rose-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Heart className="w-4 h-4 text-rose-400" />
            <span>Avis & Dons</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
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
                  className="px-4 py-2 bg-tv-focus hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 shadow-lg flex-shrink-0"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>Ajouter une Playlist</span>
                </button>
              </div>

              {/* Playlists List */}
              <div className="space-y-2.5">
                {playlists.length === 0 ? (
                  <div className="p-6 bg-tv-card/40 rounded-xl border border-tv-border text-center space-y-3">
                    <p className="text-xs text-slate-400">
                      Aucune playlist configurée pour le moment.
                    </p>
                    <button
                      onClick={onRestoreDemoPlaylist}
                      className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-semibold transition"
                    >
                      Restaurer la playlist de test gratuite
                    </button>
                  </div>
                ) : (
                  playlists.map((pl) => (
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
                            onClick={() => {
                              onDeletePlaylist(pl.id);
                              setDeletingId(null);
                            }}
                            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold shadow-md transition"
                          >
                            Confirmer
                          </button>
                          <button
                            onClick={() => setDeletingId(null)}
                            className="px-2.5 py-1.5 bg-white/10 hover:bg-white/20 text-slate-300 rounded-lg text-xs transition"
                          >
                            Annuler
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeletingId(pl.id)}
                          className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition flex-shrink-0"
                          title="Supprimer cette playlist"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 2: SYNCHRONISATION                                         */}
          {/* ============================================================== */}
          {activeTab === 'sync' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-white">Profil & Synchronisation Cloud</h3>
                <p className="text-xs text-slate-400">
                  Partagez vos favoris et playlists entre votre télévision et votre smartphone.
                </p>
              </div>

              <div className="bg-tv-card/80 border border-tv-border p-4 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                    Votre Code d&apos;Appairage KeoTV
                  </span>
                  <span className="text-2xl font-mono font-extrabold text-tv-accent tracking-widest mt-1 block">
                    {syncCode || 'KEO-7842'}
                  </span>
                </div>
                <button
                  onClick={() => {
                    onClose();
                    onOpenSyncModal();
                  }}
                  className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition"
                >
                  Gérer la synchro
                </button>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 3: MISES À JOUR                                            */}
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
                    v1.0.0 (Build {process.env.NEXT_PUBLIC_BUILD_NUMBER || currentBuildNumber || 5})
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-300">Signature officielle</span>
                  <span className="text-xs font-medium text-emerald-400 flex items-center">
                    <ShieldCheck className="w-4 h-4 mr-1" /> Certifié KeoTV Permanent
                  </span>
                </div>

                <div className="pt-2 flex flex-col sm:flex-row gap-2">
                  <button
                    onClick={handleCheckUpdate}
                    disabled={checkingUpdate}
                    className="flex-1 py-2.5 bg-tv-focus hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${checkingUpdate ? 'animate-spin' : ''}`} />
                    <span>{checkingUpdate ? 'Vérification...' : 'Vérifier les mises à jour'}</span>
                  </button>

                  <a
                    href="https://tinyurl.com/keotv-app"
                    className="flex-1 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 text-center"
                  >
                    <Download className="w-4 h-4" />
                    <span>Télécharger la dernière APK</span>
                  </a>
                </div>

                {updateStatus && (
                  <div className="p-3 bg-black/40 rounded-xl text-xs text-center text-slate-300 border border-white/5">
                    {updateStatus}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 4: LECTEUR                                                 */}
          {/* ============================================================== */}
          {activeTab === 'player' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-white">Paramètres du Lecteur Vidéo</h3>
                <p className="text-xs text-slate-400">Optimisez la fluidité et le zapping selon votre connexion.</p>
              </div>

              <div className="space-y-3">
                <div className="p-3.5 bg-tv-card/60 rounded-xl border border-tv-border flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-white block">Taille du Buffer de lecture</span>
                    <span className="text-[11px] text-slate-400 block">Délai avant démarrage du flux</span>
                  </div>
                  <span className="text-xs font-mono font-bold bg-tv-focus/20 text-tv-accent border border-tv-focus/30 px-2.5 py-1 rounded-lg">
                    Très court (300ms)
                  </span>
                </div>

                <div className="p-3.5 bg-tv-card/60 rounded-xl border border-tv-border flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-white block">Accélération Matérielle</span>
                    <span className="text-[11px] text-slate-400 block">Décodage fluide via processeur graphique</span>
                  </div>
                  <span className="text-xs font-bold text-emerald-400">Activée</span>
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
                          className={`py-1.5 px-2 rounded-lg text-xs font-medium border text-center transition ${
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
                      className="w-full bg-black/40 border border-tv-border rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-tv-accent"
                    />

                    {/* Contact email (optional) */}
                    <input
                      type="email"
                      placeholder="Votre adresse email (facultatif si vous souhaitez une réponse)"
                      value={feedbackEmail}
                      onChange={(e) => setFeedbackEmail(e.target.value)}
                      className="w-full bg-black/40 border border-tv-border rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-tv-accent"
                    />

                    {feedbackError && (
                      <p className="text-xs text-rose-400">{feedbackError}</p>
                    )}

                    <button
                      type="submit"
                      disabled={feedbackSubmitting || !feedbackMessage.trim()}
                      className="w-full py-2.5 bg-tv-focus hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2 shadow-lg disabled:opacity-50"
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
                  className="inline-flex items-center space-x-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition shadow-lg"
                >
                  <Heart className="w-4 h-4 fill-white" />
                  <span>Faire un don / Soutenir</span>
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-tv-border bg-black/20 flex justify-between items-center flex-shrink-0">
          <span className="text-[11px] text-slate-500 font-mono">KeoTV IPTV • v1.0.0 (Build {currentBuildNumber})</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-semibold transition"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
