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
  CheckCircle2,
  Tv,
  Film,
  Server,
  Sliders,
  ExternalLink,
} from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  syncCode: string;
  onOpenXtreamModal: () => void;
  onOpenSyncModal: () => void;
  currentBuildNumber?: number;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  syncCode,
  onOpenXtreamModal,
  onOpenSyncModal,
  currentBuildNumber = 4,
}) => {
  const [activeTab, setActiveTab] = useState<'playlists' | 'sync' | 'update' | 'feedback' | 'player'>('playlists');
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);

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
              <p className="text-xs text-slate-400">Playlists, synchronisation, mises à jour & dons</p>
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
            <span>Dons & Avis</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* TAB 1: PLAYLISTS */}
          {activeTab === 'playlists' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">Gestion des abonnements IPTV</h3>
                  <p className="text-xs text-slate-400">
                    Connectez vos identifiants Xtream Codes ou votre fichier M3U personnel.
                  </p>
                </div>
                <button
                  onClick={() => {
                    onClose();
                    onOpenXtreamModal();
                  }}
                  className="px-4 py-2 bg-tv-focus hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition flex items-center space-x-1.5 shadow-lg"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>Ajouter une Playlist</span>
                </button>
              </div>

              <div className="p-4 bg-tv-card/60 rounded-xl border border-tv-border/80">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-300">Playlist active : Démo Technique Gratuite</span>
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded font-mono">
                    Active
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Cette playlist par défaut contient des flux web légaux de démonstration. Pour regarder vos vraies chaînes TF1, M6, Canal+, beIN, séries et films en 4K, cliquez sur &laquo; Ajouter une Playlist &raquo; avec votre abonnement Xtream.
                </p>
              </div>
            </div>
          )}

          {/* TAB 2: SYNCHRONISATION */}
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

          {/* TAB 3: MISES À JOUR */}
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
                    v1.0.0 (Build {currentBuildNumber})
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-300">Signature officielle</span>
                  <span className="text-xs font-medium text-emerald-400 flex items-center">
                    <ShieldCheck className="w-4 h-4 mr-1" /> Certifié KeoTV
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
                    href="https://github.com/heyhacene/keotv/releases/latest"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 text-center"
                  >
                    <ExternalLink className="w-4 h-4" />
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

          {/* TAB 4: LECTEUR */}
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

          {/* TAB 5: DONS & FEEDBACK */}
          {activeTab === 'feedback' && (
            <div className="space-y-4">
              <div className="p-4 bg-gradient-to-tr from-rose-950/40 via-tv-card to-tv-card border border-rose-500/20 rounded-2xl">
                <div className="flex items-center space-x-2 text-rose-400 mb-2">
                  <Heart className="w-5 h-5 fill-rose-500" />
                  <h3 className="text-sm font-bold text-white">Soutenir le projet KeoTV</h3>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  KeoTV est développé avec passion de façon indépendante, gratuite et sans publicité intrusive. Si vous appréciez l&apos;application, un don symbolique aide grandement à financer les serveurs de synchronisation et les futures fonctionnalités !
                </p>
                <div className="mt-4 flex space-x-3">
                  <a
                    href="https://github.com/sponsors/heyhacene"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition flex items-center space-x-1.5 shadow-lg"
                  >
                    <Heart className="w-4 h-4 fill-white" />
                    <span>Faire un don / Soutenir</span>
                  </a>
                </div>
              </div>

              <div className="p-4 bg-tv-card/60 rounded-xl border border-tv-border">
                <div className="flex items-center space-x-2 text-tv-accent mb-1">
                  <MessageSquare className="w-4 h-4" />
                  <h4 className="text-xs font-bold text-white">Vos retours & suggestions</h4>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed mb-3">
                  Une idée d&apos;amélioration ou un problème rencontré ? Écrivez-nous directement pour les prochaines versions.
                </p>
                <a
                  href="https://github.com/heyhacene/keotv/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center space-x-1.5 text-xs text-tv-accent hover:underline font-semibold"
                >
                  <span>Ouvrir une suggestion ou un rapport</span>
                  <ExternalLink className="w-3.5 h-3.5" />
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
