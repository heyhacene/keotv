'use client';

import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Channel, EpgProgram } from '@/types/iptv';
import { Maximize2, Minimize2, Volume2, VolumeX, Radio, Clock, Sparkles, Square, Play, FastForward, Rewind } from 'lucide-react';
import { NativePlayer, isNativePlayerAvailable, NATIVE_PLAYER_USER_AGENT } from '@/lib/native-player';

interface LiveVideoPlayerProps {
  channel: Channel | null;
  currentEpg?: EpgProgram | null;
  nextEpg?: EpgProgram | null;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  isStopped?: boolean;
  onTogglePlayStop?: () => void;
}

export const LiveVideoPlayer: React.FC<LiveVideoPlayerProps> = ({
  channel,
  currentEpg,
  nextEpg,
  isFullscreen,
  onToggleFullscreen,
  isStopped: externalIsStopped,
  onTogglePlayStop: externalTogglePlayStop,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [internalIsStopped, setInternalIsStopped] = useState<boolean>(false);
  const isStopped = externalIsStopped !== undefined ? externalIsStopped : internalIsStopped;

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [showOsd, setShowOsd] = useState<boolean>(true);
  const [streamError, setStreamError] = useState<string | null>(null);
  const osdTimerRef = useRef<NodeJS.Timeout | null>(null);

  // On Android the stream is played by the native ExoPlayer (opened full screen), not by hls.js
  const [nativeMode, setNativeMode] = useState<boolean>(false);
  useEffect(() => {
    setNativeMode(isNativePlayerAvailable());
  }, []);

  const openNativePlayer = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!channel) return;
    NativePlayer.play({
      urls: [channel.stream_url],
      titles: [channel.name],
      index: 0,
      userAgent: NATIVE_PLAYER_USER_AGENT,
      isLive: channel.stream_type === 'live',
    }).catch((err: any) => alert(`Lecture impossible : ${err?.message || err}`));
  };

  // Stop or start stream when channel changes or isStopped changes
  useEffect(() => {
    if (nativeMode) return;
    if (!channel || !videoRef.current) return;

    if (isStopped) {
      if (hlsRef.current) {
        hlsRef.current.stopLoad();
        hlsRef.current.detachMedia();
      }
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.removeAttribute('src');
        videoRef.current.load();
      }
      setIsPlaying(false);
      return;
    }

    setStreamError(null);
    setIsPlaying(false);

    const video = videoRef.current;
    const streamUrl = channel.stream_url;

    // Reset previous HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const isDirectMp4 = streamUrl.endsWith('.mp4') || streamUrl.includes('.mp4?');

    if (Hls.isSupported() && !isDirectMp4) {
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
              if (streamUrl.endsWith('.m3u8')) {
                const tsUrl = streamUrl.replace(/\.m3u8$/, '.ts');
                console.warn('HLS network error, attempting MPEG-TS fallback:', tsUrl);
                hls.destroy();
                hlsRef.current = null;
                if (video) {
                  video.src = tsUrl;
                  video.play().catch(() => {
                    setStreamError('Flux temporairement indisponible.');
                  });
                }
              } else {
                hls.startLoad();
              }
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              console.warn('HLS fatal, fallbacking to native HTML5 video element:', data);
              hls.destroy();
              hlsRef.current = null;
              if (video) {
                video.src = streamUrl;
                video.play().catch(() => {
                  setStreamError('Flux temporairement indisponible.');
                });
              }
              break;
          }
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl') || isDirectMp4) {
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

    triggerOsd();

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [channel, isStopped, nativeMode]);

  const toggleStopPlay = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (externalTogglePlayStop) {
      externalTogglePlayStop();
    } else {
      setInternalIsStopped(!internalIsStopped);
    }
  };

  const skipTime = (delta: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (videoRef.current) {
      videoRef.current.currentTime += delta;
      triggerOsd();
    }
  };

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
        className={`w-full h-full object-contain ${isStopped ? 'hidden' : 'block'}`}
        playsInline
        autoPlay
        muted={isMuted}
      />

      {/* Native player launcher (Android TV & Mobile) */}
      {nativeMode && (
        <div
          onClick={openNativePlayer}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ' || (e as any).keyCode === 23 || (e as any).keyCode === 13) {
              e.preventDefault();
              openNativePlayer();
            }
          }}
          className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-tv-surface text-center p-4 select-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-tv-accent group"
        >
          <div className="w-14 h-14 rounded-full bg-tv-focus flex items-center justify-center mb-2 shadow-xl group-hover:scale-110 group-focus:scale-110 transition-transform">
            <Play className="w-7 h-7 text-white fill-white" />
          </div>
          <h3 className="text-sm font-bold text-white line-clamp-2">{channel?.name || 'Aucune chaîne'}</h3>
          <p className="text-[11px] text-slate-300 mt-1">
            Appuyez sur <span className="text-tv-accent font-bold">OK</span> pour regarder en plein écran
          </p>
        </div>
      )}

      {/* Stopped resting screen */}
      {isStopped && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-tv-surface text-center p-6 select-none">
          <div className="w-14 h-14 rounded-2xl bg-tv-card border border-tv-border flex items-center justify-center mb-3 text-slate-400 shadow-xl">
            <Radio className="w-7 h-7 text-tv-accent" />
          </div>
          <h3 className="text-base font-bold text-white mb-0.5">
            {channel?.name || 'Lecture arrêtée'}
          </h3>
          <p className="text-xs text-slate-400 mb-4">
            Le flux vidéo et la bande passante sont suspendus.
          </p>
          <button
            onClick={toggleStopPlay}
            className="px-5 py-2.5 bg-tv-focus hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition flex items-center space-x-2 shadow-lg scale-100 active:scale-95"
          >
            <Play className="w-4 h-4 fill-white" />
            <span>Relancer la lecture</span>
          </button>
        </div>
      )}

      {/* Stream loading / error state */}
      {!isStopped && streamError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 text-white p-6 text-center select-none">
          <Radio className="w-12 h-12 text-rose-500 mb-3 animate-pulse" />
          <p className="text-lg font-medium text-slate-200">{channel?.name}</p>
          <p className="text-sm text-rose-400 mt-1">{streamError}</p>
          <p className="text-xs text-slate-400 mt-3">Reconnexion automatique au flux en cours...</p>
        </div>
      )}

      {/* Controls Overlay (when not fullscreen) */}
      {!isFullscreen && (
        <div className="absolute top-2 right-2 flex items-center space-x-1.5 bg-black/70 backdrop-blur-md rounded-lg p-1.5 border border-white/10 z-10">
          {/* Stop / Resume Button */}
          <button
            onClick={toggleStopPlay}
            className={`p-1.5 rounded transition ${
              isStopped
                ? 'text-emerald-400 hover:bg-emerald-500/20'
                : 'text-slate-300 hover:text-rose-400 hover:bg-white/10'
            }`}
            title={isStopped ? 'Reprendre la lecture' : 'Arrêter le flux (Stop)'}
          >
            {isStopped ? (
              <Play className="w-4 h-4 fill-current" />
            ) : (
              <Square className="w-4 h-4 fill-current text-rose-400" />
            )}
          </button>

          {/* Rewind Button (VOD/Series only) */}
          {!isStopped && channel?.stream_type !== 'live' && (
            <button
              onClick={(e) => skipTime(-10, e)}
              className="p-1.5 text-slate-200 hover:text-white hover:bg-white/10 rounded transition"
              title="Reculer de 10s"
            >
              <Rewind className="w-4 h-4 text-tv-accent" />
            </button>
          )}

          {/* Fast Forward Button (VOD/Series only) */}
          {!isStopped && channel?.stream_type !== 'live' && (
            <button
              onClick={(e) => skipTime(10, e)}
              className="p-1.5 text-slate-200 hover:text-white hover:bg-white/10 rounded transition"
              title="Avancer de 10s"
            >
              <FastForward className="w-4 h-4 text-tv-accent" />
            </button>
          )}

          {/* Mute Button */}
          {!isStopped && (
            <button
              onClick={toggleMute}
              className="p-1.5 text-slate-200 hover:text-white hover:bg-white/10 rounded transition"
              title={isMuted ? 'Activer le son' : 'Couper le son'}
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
            </button>
          )}

          {/* Fullscreen Button */}
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

              {/* Rewind Button in fullscreen (VOD/Series only) */}
              {!isStopped && channel?.stream_type !== 'live' && (
                <button
                  onClick={(e) => skipTime(-10, e)}
                  className="pointer-events-auto p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white"
                  title="Reculer de 10s"
                >
                  <Rewind className="w-5 h-5 text-tv-accent" />
                </button>
              )}

              {/* Stop in fullscreen */}
              <button
                onClick={toggleStopPlay}
                className="pointer-events-auto p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white"
                title={isStopped ? 'Reprendre' : 'Arrêter (Stop)'}
              >
                {isStopped ? <Play className="w-5 h-5 fill-white" /> : <Square className="w-5 h-5 fill-rose-400 text-rose-400" />}
              </button>

              {/* Fast Forward Button in fullscreen (VOD/Series only) */}
              {!isStopped && channel?.stream_type !== 'live' && (
                <button
                  onClick={(e) => skipTime(10, e)}
                  className="pointer-events-auto p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white"
                  title="Avancer de 10s"
                >
                  <FastForward className="w-5 h-5 text-tv-accent" />
                </button>
              )}

              <button
                onClick={onToggleFullscreen}
                className="pointer-events-auto p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white"
                title="Quitter le plein écran (Retour)"
              >
                <Minimize2 className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Bottom Info Banner */}
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/95 via-black/80 to-transparent p-6 pt-16">
            <div className="max-w-6xl mx-auto flex items-end space-x-6">
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

              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-3 mb-1">
                  <h2 className="text-xl font-bold text-white truncate">
                    {currentEpg?.title || 'Programme en direct'}
                  </h2>
                  {channel?.resolution && (
                    <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs px-2 py-0.5 rounded font-medium flex items-center">
                      <Sparkles className="w-3 h-3 mr-1" />
                      {channel.resolution}
                    </span>
                  )}
                </div>

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

                <div className="text-xs text-slate-400 truncate flex items-center">
                  <span className="text-slate-500 mr-2 uppercase tracking-wide">Suivant :</span>
                  <span className="text-slate-300 font-medium">{nextEpg?.title || 'Journal de la nuit'}</span>
                </div>
              </div>

              <div className="hidden lg:flex flex-col text-right text-xs text-slate-500 space-y-1">
                <span>▲ / ▼ Zapper</span>
                <span>OK Infos</span>
                <span>Retour Guide TV</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
