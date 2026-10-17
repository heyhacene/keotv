'use client';

import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Channel, EpgProgram } from '@/types/iptv';
import { Maximize2, Minimize2, Volume2, VolumeX, Radio, Clock, ShieldCheck, Sparkles } from 'lucide-react';

interface LiveVideoPlayerProps {
  channel: Channel | null;
  currentEpg?: EpgProgram | null;
  nextEpg?: EpgProgram | null;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onPreviousChannel?: () => void;
  onNextChannel?: () => void;
}

export const LiveVideoPlayer: React.FC<LiveVideoPlayerProps> = ({
  channel,
  currentEpg,
  nextEpg,
  isFullscreen,
  onToggleFullscreen,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [showOsd, setShowOsd] = useState<boolean>(true);
  const [streamError, setStreamError] = useState<string | null>(null);
  const osdTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load stream whenever channel changes
  useEffect(() => {
    if (!channel || !videoRef.current) return;
    setStreamError(null);
    setIsPlaying(false);

    const video = videoRef.current;
    const streamUrl = channel.stream_url;

    // Reset previous HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (Hls.isSupported() && (streamUrl.includes('.m3u8') || streamUrl.includes('live-apple'))) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 60,
      });
      hlsRef.current = hls;

      hls.loadSource(streamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {
          // Auto-play policy might require mute on first load
          video.muted = true;
          setIsMuted(true);
          video.play().catch((e) => console.warn('Autoplay failed:', e));
        });
        setIsPlaying(true);
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              setStreamError('Flux temporairement indisponible.');
              hls.destroy();
              break;
          }
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl') || streamUrl.includes('.mp4')) {
      video.src = streamUrl;
      video.play().catch(() => {
        video.muted = true;
        setIsMuted(true);
        video.play().catch(() => {});
      });
      setIsPlaying(true);
    } else {
      video.src = streamUrl;
      video.play().catch(() => {});
    }

    // Trigger OSD on channel change
    triggerOsd();

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [channel]);

  // Handle OSD fade out
  const triggerOsd = () => {
    setShowOsd(true);
    if (osdTimerRef.current) clearTimeout(osdTimerRef.current);
    osdTimerRef.current = setTimeout(() => {
      if (isFullscreen) {
        setShowOsd(false);
      }
    }, 4500);
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(videoRef.current.muted);
    }
  };

  // Calculate EPG progress
  const getEpgProgress = () => {
    if (!currentEpg) return 40;
    const now = Date.now();
    const start = new Date(currentEpg.start).getTime();
    const end = new Date(currentEpg.end).getTime();
    if (end <= start) return 0;
    const progress = ((now - start) / (end - start)) * 100;
    return Math.min(100, Math.max(0, Math.round(progress)));
  };

  return (
    <div
      onClick={triggerOsd}
      className={`relative overflow-hidden bg-black transition-all duration-300 ${
        isFullscreen
          ? 'fixed inset-0 z-50 w-screen h-screen'
          : 'w-full h-full rounded-xl border border-tv-border shadow-2xl'
      }`}
    >
      {/* HTML5 Video element */}
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        playsInline
        autoPlay
        muted={isMuted}
      />

      {/* Stream loading / error state */}
      {streamError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white p-6 text-center">
          <Radio className="w-12 h-12 text-rose-500 mb-3 animate-pulse" />
          <p className="text-lg font-medium text-slate-200">{channel?.name}</p>
          <p className="text-sm text-rose-400 mt-1">{streamError}</p>
          <p className="text-xs text-slate-400 mt-3">Reconnexion automatique au flux en cours...</p>
        </div>
      )}

      {/* Preview Player Overlay (when not fullscreen) */}
      {!isFullscreen && (
        <div className="absolute top-2 right-2 flex items-center space-x-1.5 bg-black/60 backdrop-blur-md rounded-lg p-1.5 border border-white/10 z-10">
          <button
            onClick={toggleMute}
            className="p-1.5 text-slate-200 hover:text-white hover:bg-white/10 rounded transition"
            title={isMuted ? 'Activer le son' : 'Couper le son'}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>
          <button
            onClick={onToggleFullscreen}
            className="p-1.5 text-slate-200 hover:text-white hover:bg-white/10 rounded transition"
            title="Plein écran (Entrée)"
          >
            <Maximize2 className="w-4 h-4 text-tv-accent" />
          </button>
        </div>
      )}

      {/* FULLSCREEN OSD (TiviMate-style overlay) */}
      {isFullscreen && (
        <div
          className={`absolute inset-0 pointer-events-none transition-opacity duration-300 ${
            showOsd ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {/* Top Bar info */}
          <div className="absolute top-0 inset-x-0 bg-gradient-to-b from-black/90 via-black/50 to-transparent p-6 flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <span className="bg-tv-focus/80 text-white text-xs font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                Direct
              </span>
              <span className="text-slate-300 text-sm font-medium">
                {channel?.group_name || 'IPTV Direct'}
              </span>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-slate-400 text-sm font-mono flex items-center">
                <Clock className="w-4 h-4 mr-1.5 text-tv-accent" />
                {new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </span>
              <button
                onClick={onToggleFullscreen}
                className="pointer-events-auto p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white"
                title="Quitter le plein écran (Retour)"
              >
                <Minimize2 className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Bottom Info Banner (TiviMate signature) */}
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/95 via-black/80 to-transparent p-6 pt-16">
            <div className="max-w-6xl mx-auto flex items-end space-x-6">
              {/* Channel Logo and Number */}
              <div className="flex items-center space-x-4 flex-shrink-0">
                <div className="text-3xl font-black text-tv-accent font-mono w-12 text-right">
                  {channel?.num || 1}
                </div>
                <div className="w-16 h-16 bg-tv-card rounded-xl border border-tv-border flex items-center justify-center p-2 shadow-lg">
                  <span className="text-sm font-bold text-slate-200 text-center line-clamp-2">
                    {channel?.name}
                  </span>
                </div>
              </div>

              {/* Program Details & Progress */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-3 mb-1">
                  <h2 className="text-xl font-bold text-white truncate">
                    {currentEpg?.title || 'Programme en direct'}
                  </h2>
                  <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs px-2 py-0.5 rounded font-medium flex items-center">
                    <Sparkles className="w-3 h-3 mr-1" />
                    {channel?.resolution || 'FHD'}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="flex items-center space-x-3 my-2">
                  <span className="text-xs text-slate-400 font-mono">
                    {currentEpg ? new Date(currentEpg.start).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '20:00'}
                  </span>
                  <div className="flex-1 h-1.5 bg-slate-700/60 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-sky-500 to-tv-accent rounded-full transition-all duration-500"
                      style={{ width: `${getEpgProgress()}%` }}
                    />
                  </div>
                  <span className="text-xs text-slate-400 font-mono">
                    {currentEpg ? new Date(currentEpg.end).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '21:30'}
                  </span>
                </div>

                {/* Next program */}
                <div className="text-xs text-slate-400 truncate flex items-center">
                  <span className="text-slate-500 mr-2 uppercase tracking-wide">Suivant :</span>
                  <span className="text-slate-300 font-medium">{nextEpg?.title || 'Journal de la nuit'}</span>
                </div>
              </div>

              {/* TV Remote Tips */}
              <div className="hidden lg:flex flex-col text-right text-xs text-slate-500 space-y-1">
                <span>▲ / ▼ Zapper de chaîne</span>
                <span>OK Infos / Pause</span>
                <span>Retour Guide TV</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
