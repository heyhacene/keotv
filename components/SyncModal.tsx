'use client';

import React, { useState } from 'react';
import { X, RefreshCw, Smartphone, Tv, Copy, Check, Cloud, ArrowRight, ShieldCheck } from 'lucide-react';

interface SyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSyncCode: string;
  onApplySyncCode: (code: string) => Promise<boolean>;
  onForceSync: () => Promise<void>;
}

export const SyncModal: React.FC<SyncModalProps> = ({
  isOpen,
  onClose,
  currentSyncCode,
  onApplySyncCode,
  onForceSync,
}) => {
  const [inputCode, setInputCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const isBack =
        e.key === 'Escape' ||
        e.key === 'Backspace' ||
        e.key === 'GoBack' ||
        e.key === 'Back' ||
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

  const handleCopy = () => {
    navigator.clipboard.writeText(currentSyncCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputCode.trim()) return;
    setIsSyncing(true);
    setStatusMessage(null);

    const success = await onApplySyncCode(inputCode.trim());
    setIsSyncing(false);
    if (success) {
      setStatusMessage('✓ Synchronisation réussie avec cet appareil !');
      setTimeout(() => {
        onClose();
      }, 1500);
    } else {
      setStatusMessage('Code introuvable ou erreur de connexion.');
    }
  };

  const handleTriggerSync = async () => {
    setIsSyncing(true);
    await onForceSync();
    setIsSyncing(false);
    setStatusMessage('✓ Sauvegarde envoyée sur le Cloud.');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-tv-surface border border-tv-border rounded-2xl shadow-2xl overflow-hidden text-slate-100 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-tv-border bg-tv-card/50">
          <div className="flex items-center space-x-2.5">
            <RefreshCw className="w-5 h-5 text-tv-accent" />
            <h2 className="text-base font-bold text-white">Synchronisation Multi-Appareils</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition focus:outline-none focus:ring-2 focus:ring-tv-accent focus:ring-offset-2 focus:ring-offset-tv-surface"
            title="Fermer (Retour)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Card 1: Your Device Code */}
          <div className="bg-tv-card/80 border border-tv-border p-4 rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Code de votre profil KeoTV
              </span>
              <span className="text-[11px] text-emerald-400 flex items-center">
                <ShieldCheck className="w-3.5 h-3.5 mr-1" /> Cloud Actif
              </span>
            </div>

            <div className="flex items-center justify-between bg-black/40 p-3 rounded-lg border border-white/5">
              <span className="text-2xl font-mono font-extrabold tracking-widest text-tv-accent">
                {currentSyncCode || 'KEO-7842'}
              </span>
              <button
                onClick={handleCopy}
                className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-semibold text-white flex items-center space-x-1.5 transition focus:outline-none focus:ring-2 focus:ring-tv-accent focus:ring-offset-2 focus:ring-offset-tv-surface"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copié !' : 'Copier'}</span>
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Entrez ce code court sur votre autre TV ou sur votre smartphone pour retrouver instantanément vos favoris et playlists.
            </p>
          </div>

          {/* Card 2: Link another device */}
          <form onSubmit={handleApply} className="space-y-3">
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Lier un autre appareil
            </label>
            <div className="flex space-x-2">
              <input
                ref={inputRef}
                type="text"
                placeholder="Ex: KEO-9123"
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                className="flex-1 bg-tv-card border border-tv-border rounded-xl px-3.5 py-2.5 text-sm font-mono tracking-wider text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-tv-accent focus:ring-offset-2 focus:ring-offset-tv-surface"
              />
              <button
                type="submit"
                disabled={isSyncing || !inputCode.trim()}
                className="px-4 py-2.5 bg-tv-focus hover:bg-sky-500 text-white font-bold rounded-xl text-xs shadow-lg transition flex items-center space-x-1.5 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-tv-accent focus:ring-offset-2 focus:ring-offset-tv-surface"
              >
                <span>Synchroniser</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>

          {statusMessage && (
            <div className="p-3 bg-tv-card border border-tv-accent/30 rounded-xl text-center text-xs font-medium text-tv-accent">
              {statusMessage}
            </div>
          )}

          {/* Visual Device Pair info */}
          <div className="flex items-center justify-center space-x-6 py-2 text-slate-400 text-xs">
            <div className="flex flex-col items-center">
              <Tv className="w-6 h-6 text-sky-400 mb-1" />
              <span>Android TV</span>
            </div>
            <RefreshCw className="w-4 h-4 text-slate-600 animate-spin" style={{ animationDuration: '6s' }} />
            <div className="flex flex-col items-center">
              <Smartphone className="w-6 h-6 text-purple-400 mb-1" />
              <span>Téléphone</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-tv-border bg-black/20 flex justify-between items-center">
          <button
            onClick={handleTriggerSync}
            disabled={isSyncing}
            className="text-xs text-slate-400 hover:text-white flex items-center space-x-1 transition"
          >
            <Cloud className="w-3.5 h-3.5 text-tv-accent mr-1" />
            <span>Forcer la sauvegarde</span>
          </button>
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
