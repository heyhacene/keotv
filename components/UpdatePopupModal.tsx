'use client';

import React, { useEffect, useState, useRef } from 'react';
import { Download, Sparkles, X, ArrowRight, ShieldCheck } from 'lucide-react';
import { AppUpdateInfo } from '@/lib/update-service';

interface UpdatePopupModalProps {
  updateInfo: AppUpdateInfo | null;
  onClose: () => void;
}

export const UpdatePopupModal: React.FC<UpdatePopupModalProps> = ({ updateInfo, onClose }) => {
  const [focusedIndex, setFocusedIndex] = useState<number>(0); // 0: Update Now, 1: Later
  const updateBtnRef = useRef<HTMLAnchorElement>(null);
  const laterBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!updateInfo || !updateInfo.hasUpdate) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const isLeft = e.key === 'ArrowLeft' || (e as any).keyCode === 37;
      const isRight = e.key === 'ArrowRight' || (e as any).keyCode === 39;
      const isUp = e.key === 'ArrowUp' || (e as any).keyCode === 38;
      const isDown = e.key === 'ArrowDown' || (e as any).keyCode === 40;
      const isEnter = e.key === 'Enter' || (e as any).keyCode === 13;
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
        return;
      }

      if (isLeft || isUp) {
        e.preventDefault();
        setFocusedIndex(0);
        return;
      }

      if (isRight || isDown) {
        e.preventDefault();
        setFocusedIndex(1);
        return;
      }

      if (isEnter) {
        e.preventDefault();
        if (focusedIndex === 0) {
          window.open(updateInfo.downloadUrl, '_blank');
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [updateInfo, focusedIndex, onClose]);

  if (!updateInfo || !updateInfo.hasUpdate) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/85 flex items-center justify-center p-4 animate-fade-in">
      <div className="relative w-full max-w-lg bg-tv-card border-2 border-tv-accent rounded-3xl shadow-2xl shadow-sky-500/20 overflow-hidden text-white flex flex-col">
        {/* Glow header banner */}
        <div className="bg-gradient-to-r from-sky-600 via-sky-500 to-indigo-600 p-5 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center shadow-inner">
              <Sparkles className="w-5 h-5 text-amber-300 animate-pulse" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-sky-100">
                Mise à jour KeoTV
              </span>
              <h3 className="text-base sm:text-lg font-black leading-tight text-white">
                Nouvelle version disponible !
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/20 text-white/80 hover:text-white transition focus:outline-none"
            title="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Version badge comparison */}
          <div className="flex items-center justify-center space-x-3 bg-black/40 border border-white/10 rounded-2xl p-3">
            <div className="text-center">
              <span className="text-[10px] text-slate-400 block font-medium">Version actuelle</span>
              <span className="text-xs font-mono font-bold text-slate-300">
                Build {updateInfo.currentBuild}
              </span>
            </div>
            <ArrowRight className="w-4 h-4 text-tv-accent flex-shrink-0" />
            <div className="text-center">
              <span className="text-[10px] text-emerald-400 block font-bold">Nouvelle version</span>
              <span className="text-sm font-mono font-black text-emerald-300">
                Build {updateInfo.latestBuild}
              </span>
            </div>
          </div>

          {/* Downloader Instructions box */}
          <div className="bg-sky-950/60 border border-sky-500/30 rounded-2xl p-4 text-center space-y-2">
            <p className="text-xs font-semibold text-slate-200">
              📺 Pour mettre à jour sur votre téléviseur Android TV / Fire TV :
            </p>
            <p className="text-[11px] text-slate-300">
              Ouvrez l&apos;application <strong className="text-white">Downloader</strong> et entrez le code court :
            </p>
            <div className="py-1">
              <span className="inline-block font-mono text-2xl font-black text-amber-300 bg-black/70 px-6 py-1.5 rounded-2xl border-2 border-amber-400 shadow-xl shadow-amber-500/20 tracking-wider">
                {updateInfo.downloaderCode}
              </span>
            </div>
            <p className="text-[10px] text-slate-400">
              La mise à jour s&apos;installe automatiquement par-dessus sans perte de vos favoris ni playlists.
            </p>
          </div>

          {/* Security guarantee */}
          <div className="flex items-center justify-center space-x-1.5 text-[11px] text-emerald-400 font-medium">
            <ShieldCheck className="w-4 h-4" />
            <span>Mise à jour officielle certifiée KeoTV</span>
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <a
              ref={updateBtnRef}
              href={updateInfo.downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => onClose()}
              className={`py-3 px-4 rounded-xl text-xs font-bold text-center flex items-center justify-center space-x-2 transition ${
                focusedIndex === 0
                  ? 'bg-tv-focus text-white ring-2 ring-tv-accent ring-offset-2 ring-offset-tv-card scale-[1.03] shadow-lg shadow-sky-500/30'
                  : 'bg-tv-focus/80 hover:bg-tv-focus text-white'
              }`}
            >
              <Download className="w-4 h-4" />
              <span>Télécharger (APK)</span>
            </a>

            <button
              ref={laterBtnRef}
              onClick={onClose}
              className={`py-3 px-4 rounded-xl text-xs font-bold text-center transition ${
                focusedIndex === 1
                  ? 'bg-tv-cardHover text-white ring-2 ring-slate-400 ring-offset-2 ring-offset-tv-card scale-[1.03] border border-white/20'
                  : 'bg-white/10 hover:bg-white/15 text-slate-300 border border-white/5'
              }`}
            >
              Plus tard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
