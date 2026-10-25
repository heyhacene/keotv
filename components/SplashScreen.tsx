'use client';

import React from 'react';
import { CURRENT_BUILD_NUMBER } from '@/lib/update-service';

interface SplashScreenProps {
  isVisible: boolean;
  isFading: boolean;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ isVisible, isFading }) => {
  if (!isVisible) return null;

  const buildNumber =
    typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_BUILD_NUMBER
      ? process.env.NEXT_PUBLIC_BUILD_NUMBER
      : CURRENT_BUILD_NUMBER;

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#080c14] select-none transition-opacity duration-300 ease-out ${
        isFading ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <div className="flex flex-col items-center justify-center space-y-6 animate-in fade-in zoom-in-95 duration-200">
        {/* Glowing Logo Icon */}
        <div className="relative">
          {/* Ambient Glow */}
          <div className="absolute -inset-4 bg-sky-500/20 rounded-full blur-2xl animate-pulse" />

          {/* Embedded High-Resolution KeoTV SVG Logo */}
          <svg
            className="relative w-28 h-28 md:w-36 md:h-36 drop-shadow-[0_0_35px_rgba(56,189,248,0.45)]"
            viewBox="0 0 512 512"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient id="splashBgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#080c14" />
                <stop offset="60%" stopColor="#0f172a" />
                <stop offset="100%" stopColor="#03254c" />
              </linearGradient>

              <linearGradient id="splashBezelGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#2d3748" />
                <stop offset="50%" stopColor="#1a202c" />
                <stop offset="100%" stopColor="#0f172a" />
              </linearGradient>

              <linearGradient id="splashScreenGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#050811" />
                <stop offset="100%" stopColor="#020408" />
              </linearGradient>

              <linearGradient id="splashKCyanGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#67e8f9" />
                <stop offset="50%" stopColor="#38bdf8" />
                <stop offset="100%" stopColor="#0284c7" />
              </linearGradient>

              <linearGradient id="splashKPlayGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#38bdf8" />
                <stop offset="100%" stopColor="#2563eb" />
              </linearGradient>

              <radialGradient id="splashScreenGlow" cx="50%" cy="45%" r="45%">
                <stop offset="0%" stopColor="#0284c7" stopOpacity="0.32" />
                <stop offset="60%" stopColor="#0369a1" stopOpacity="0.08" />
                <stop offset="100%" stopColor="#020408" stopOpacity="0" />
              </radialGradient>

              <linearGradient id="splashGlassGloss" x1="0%" y1="0%" x2="50%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.12" />
                <stop offset="45%" stopColor="#ffffff" stopOpacity="0.02" />
                <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Base Squircle */}
            <rect width="512" height="512" rx="112" fill="url(#splashBgGrad)" />
            <rect width="508" height="508" x="2" y="2" rx="110" fill="none" stroke="#38bdf8" strokeWidth="2" strokeOpacity="0.25" />

            {/* TV Pedestal Stand */}
            <path d="M224,348 L212,398 L300,398 L288,348 Z" fill="#1e293b" />
            <rect x="160" y="398" width="192" height="14" rx="7" fill="#334155" />
            <rect x="226" y="402" width="60" height="6" rx="3" fill="#38bdf8" fillOpacity="0.7" />

            {/* TV Bezel Frame */}
            <rect x="68" y="86" width="376" height="262" rx="28" fill="url(#splashBezelGrad)" stroke="#38bdf8" strokeWidth="3" strokeOpacity="0.4" />

            {/* TV Screen Glass & Glow */}
            <rect x="80" y="98" width="352" height="238" rx="18" fill="url(#splashScreenGrad)" />
            <rect x="80" y="98" width="352" height="238" rx="18" fill="url(#splashScreenGlow)" />
            <path d="M80,98 L260,98 L110,248 L80,248 Z" fill="url(#splashGlassGloss)" />

            {/* TV Status LED */}
            <circle cx="256" cy="341" r="2.5" fill="#38bdf8" />

            {/* Glowing 'K' */}
            <g transform="translate(178, 132)">
              <g opacity="0.35">
                <rect x="10" y="10" width="34" height="150" rx="17" fill="#0284c7" />
                <polygon points="40,90 120,20 150,46 72,114" fill="#0284c7" />
                <polygon points="42,88 152,148 42,168" fill="#0284c7" />
              </g>
              <rect x="10" y="10" width="34" height="150" rx="17" fill="url(#splashKCyanGrad)" />
              <path d="M40,94 L108,30 C114,24 124,24 130,30 L136,36 C142,42 142,52 136,58 L68,122 Z" fill="url(#splashKCyanGrad)" />
              <path d="M38,82 L138,138 C148,144 148,158 138,164 L48,168 C38,168 32,160 38,150 Z" fill="url(#splashKPlayGrad)" />
              <circle cx="27" cy="27" r="6" fill="#ffffff" fillOpacity="0.7" />
            </g>
          </svg>
        </div>

        {/* Brand Text */}
        <div className="flex flex-col items-center space-y-1.5 text-center">
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-wider bg-gradient-to-r from-sky-200 via-white to-sky-400 bg-clip-text text-transparent">
            KeoTV
          </h1>
          <p className="text-[11px] text-slate-400 font-medium tracking-wide">
            Chargement de vos bouquets en mémoire...
          </p>
        </div>

        {/* Minimalist Beam Loading Line */}
        <div className="w-36 h-1 bg-slate-800/80 rounded-full overflow-hidden relative">
          <div className="absolute top-0 bottom-0 left-0 right-0 bg-gradient-to-r from-transparent via-tv-accent to-transparent animate-pulse" />
        </div>
      </div>

      {/* Build Number Watermark at the bottom */}
      <div className="absolute bottom-6 left-0 right-0 text-center pointer-events-none">
        <span className="text-[11px] font-mono font-medium text-slate-500/80 tracking-widest uppercase">
          KeoTV v1.3.{buildNumber} • Build {buildNumber}
        </span>
      </div>
    </div>
  );
};
