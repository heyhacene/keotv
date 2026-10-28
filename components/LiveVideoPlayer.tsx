'use client';

import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Channel, EpgProgram } from '@/types/iptv';
import { Maximize2, Minimize2, Volume2, VolumeX, Radio, Clock, Sparkles, Square, Play, FastForward, Rewind, SkipBack, SkipForward } from 'lucide-react';
import { NativePlayer, isNativePlayerAvailable, NATIVE_PLAYER_USER_AGENT } from '@/lib/native-player';

interface LiveVideoPlayerProps {
  channel: Channel | null;
  playlist?: Channel[];
  currentEpg?: EpgProgram | null;
  nextEpg?: EpgProgram | null;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  isStopped?: boolean;
  onTogglePlayStop?: () => void;
  onNextChannel?: () => void;
  onPreviousChannel?: () => void;
  isModalCovering?: boolean;
  singleStreamMode?: boolean;
  channelEpgMap?: Record<string, EpgProgram[]>;
  osdTimeoutMs?: number;
}

export const LiveVideoPlayer: React.FC<LiveVideoPlayerProps> = ({
  channel,
  playlist,
  currentEpg,
  nextEpg,
  isFullscreen,
  onToggleFullscreen,
  isStopped: externalIsStopped,
  onTogglePlayStop: externalTogglePlayStop,
  onNextChannel,
  onPreviousChannel,
  isModalCovering = false,
  singleStreamMode = false,
  channelEpgMap,
  osdTimeoutMs = 5000,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [internalIsStopped, setInternalIsStopped] = useState<boolean>(false);
  const isStopped = externalIsStopped !== undefined ? externalIsStopped : internalIsStopped;

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [showOsd, setShowOsd] = useState<boolean>(true);
  const [streamError, setStreamError] = useState<string | null>(null);
  const osdTimerRef = useRef<NodeJS.Timeout | null>(null);

  const touchStartY = useRef<number | null>(null);
  const touchStartX = useRef<number | null>(null);
  const [zapNotice, setZapNotice] = useState<string | null>(null);
  const zapNoticeTimer = useRef<NodeJS.Timeout | null>(null);

  const showZapFeedback = (text: string) => {
    setZapNotice(text);
    if (zapNoticeTimer.current) clearTimeout(zapNoticeTimer.current);
    zapNoticeTimer.current = setTimeout(() => {
      setZapNotice(null);
    }, 1600);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length > 0) {
      touchStartY.current = e.touches[0].clientY;
      touchStartX.current = e.touches[0].clientX;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY.current === null || touchStartX.current === null || e.changedTouches.length === 0) return;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;

    // Vertical swipe: change channel (Swipe up = next, swipe down = prev)
    if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 35) {
      if (deltaY < 0) {
        if (onNextChannel) {
          onNextChannel();
          showZapFeedback('▲ Chaîne suivante');
        }
      } else {
        if (onPreviousChannel) {
          onPreviousChannel();
          showZapFeedback('▼ Chaîne précédente');
        }
      }
    }
    touchStartY.current = null;
    touchStartX.current = null;
  };

  // On Android, live streams inside the 16:9 mini window are rendered by the embedded native ExoPlayer!
  const [nativeMode, setNativeMode] = useState<boolean>(false);
  useEffect(() => {
    setNativeMode(isNativePlayerAvailable());
  }, []);

  const openNativePlayer = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!channel) return;

    let urls = [channel.stream_url];
    let titles = [channel.name];
    let index = 0;

    if (playlist && playlist.length > 0) {
      urls = playlist.map((c) => c.stream_url);
      titles = playlist.map((c) => c.name);
      const foundIdx = playlist.findIndex((c) => c.id === channel.id);
      index = foundIdx >= 0 ? foundIdx : 0;
    }

    const epgTitles: string[] = [];
    const epgDescs: string[] = [];
    const epgTimes: string[] = [];
    const epgNextTitles: string[] = [];
    const nowIso = new Date().toISOString();

    if (playlist && playlist.length > 0) {
      for (const ch of playlist) {
        const progs = channelEpgMap ? channelEpgMap[ch.id] : undefined;
        let cur = progs?.find((p) => p.start <= nowIso && p.end > nowIso);
        let nxt = progs?.find((p) => p.start >= (cur ? cur.end : nowIso));
        if (ch.id === channel.id && !cur && currentEpg) {
          cur = currentEpg;
          nxt = nextEpg || undefined;
        }
        let timeStr = '';
        if (cur?.start && cur?.end) {
          try {
            const s = new Date(cur.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const e = new Date(cur.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            timeStr = `${s} - ${e}`;
          } catch {}
        }
        epgTitles.push(cur?.title || '');
        epgDescs.push(cur?.description || '');
        epgTimes.push(timeStr);
        epgNextTitles.push(nxt?.title || '');
      }
    }

    NativePlayer.play({
      urls,
      titles,
      index,
      userAgent: NATIVE_PLAYER_USER_AGENT,
      isLive: channel.stream_type === 'live',
      singleStreamMode,
      currentProgramTitle: currentEpg?.title,
      currentProgramDesc: currentEpg?.description,
      currentProgramTime: curTime,
      nextProgramTitle: nextEpg?.title,
      epgTitles,
      epgDescs,
      epgTimes,
      epgNextTitles,
      osdTimeoutMs,
    }).catch((err: any) => alert(`Lecture impossible : ${err?.message || err}`));
  };

  // Embedded Native ExoPlayer Mini Preview Window (TiviMate top-left 16:9 box on Android TV)
  useEffect(() => {
    if (!nativeMode) return;

    if (!channel || !channel.stream_url || isStopped || isFullscreen || isModalCovering) {
      NativePlayer.updatePreviewRect({
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        visible: false,
      }).catch(() => {});
      return;
    }

    const syncPreview = (startNew: boolean) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 10 || rect.height <= 10) return;

      if (startNew) {
        NativePlayer.playPreview({
          url: channel.stream_url,
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
          muted: isMuted,
          userAgent: NATIVE_PLAYER_USER_AGENT,
        }).catch(() => {});
      } else {
        NativePlayer.updatePreviewRect({
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
          visible: true,
          muted: isMuted,
        }).catch(() => {});
      }
    };

    const timer = setTimeout(() => syncPreview(true), 60);

    const onResize = () => syncPreview(false);
    window.addEventListener('resize', onResize);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', onResize);
    };
  }, [nativeMode, channel?.id, channel?.stream_url, isStopped, isFullscreen, isModalCovering, isMuted]);

  // Ensure embedded native preview stops cleanly when LiveVideoPlayer unmounts (e.g. switching to VOD/Series)
  useEffect(() => {
    return () => {
      if (isNativePlayerAvailable()) {
        NativePlayer.stopPreview().catch(() => {});
      }
    };
  }, []);

  // Stop or start web HTML5/HLS stream when not running on native Android
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
    const rawUrl = channel.stream_url;
    // If Web player receives a .ts Xtream stream URL, try the .m3u8 HLS variant first so hls.js can play it
    const streamUrl = rawUrl.endsWith('.ts') ? rawUrl.replace(/\.ts$/, '.m3u8') : rawUrl;

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
                video.src = rawUrl;
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
      video.src = rawUrl;
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
    if (osdTimeoutMs === 0) return; // Permanent / manual mode: stays visible until Back or OK
    osdTimerRef.current = setTimeout(() => {
      if (isFullscreen) {
        setShowOsd(false);
      }
    }, osdTimeoutMs > 0 ? osdTimeoutMs : 5000);
  };

  // Capture DPAD & Back keys in fullscreen web player when OSD controls are visible:
  // - Back hides the OSD controls instead of exiting fullscreen!
  // - Up / Down do NOT zap channels while OSD controls are displayed!
  useEffect(() => {
    if (!isFullscreen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const keyCode = (e as any).keyCode || 0;
      const key = e.key || '';

      const isBack =
        key === 'Escape' ||
        key === 'Backspace' ||
        key === 'GoBack' ||
        key === 'Back' ||
        keyCode === 27 ||
        keyCode === 4;

      const isEnter =
        key === 'Enter' ||
        key === 'Select' ||
        key === 'Ok' ||
        keyCode === 13 ||
        keyCode === 23 ||
        keyCode === 66;

      const isUp = key === 'ArrowUp' || key === 'Up' || keyCode === 38 || keyCode === 19;
      const isDown = key === 'ArrowDown' || key === 'Down' || keyCode === 40 || keyCode === 20;
      const isLeft = key === 'ArrowLeft' || key === 'Left' || keyCode === 37 || keyCode === 21;
      const isRight = key === 'ArrowRight' || key === 'Right' || keyCode === 39 || keyCode === 22;

      if (showOsd) {
        if (isBack) {
          e.preventDefault();
          e.stopPropagation();
          if (osdTimerRef.current) clearTimeout(osdTimerRef.current);
          setShowOsd(false);
          return;
        }
        if (isUp || isDown) {
          // Block channel zapping when OSD controls are visible!
          e.preventDefault();
          e.stopPropagation();
          triggerOsd();
          return;
        }
        if (isLeft && channel?.stream_type !== 'live') {
          e.preventDefault();
          e.stopPropagation();
          skipTime(-10);
          return;
        }
        if (isRight && channel?.stream_type !== 'live') {
          e.preventDefault();
          e.stopPropagation();
          skipTime(10);
          return;
        }
        if (isEnter) {
          e.preventDefault();
          e.stopPropagation();
          if (osdTimerRef.current) clearTimeout(osdTimerRef.current);
          setShowOsd(false);
          return;
        }
      } else {
        // When OSD is hidden, pressing OK/Enter brings up the OSD controls
        if (isEnter) {
          e.preventDefault();
          e.stopPropagation();
          triggerOsd();
          return;
        }
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isFullscreen, showOsd, channel]);

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (videoRef.current) {
      videoRef.current.muted = nextMuted;
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
      ref={containerRef}
      onClick={(e) => {
        if (!isFullscreen && nativeMode) {
          openNativePlayer(e);
        } else {
          triggerOsd();
        }
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className={`relative overflow-hidden bg-black transition-transform duration-300 ${
        isFullscreen
          ? 'fixed inset-0 z-50 w-screen h-screen'
          : 'w-full h-full rounded-xl border border-tv-border shadow-2xl'
      }`}
    >
      {/* HTML5 Video element (used on Web; on Android the native ExoPlayer preview renders over this box) */}
      <video
        ref={videoRef}
        className={`w-full h-full object-contain ${isStopped || nativeMode ? 'hidden' : 'block'}`}
        playsInline
        autoPlay
        muted={isMuted}
      />

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
      {!isStopped && !nativeMode && streamError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 text-white p-6 text-center select-none">
          <Radio className="w-12 h-12 text-rose-500 mb-3 animate-pulse" />
          <p className="text-lg font-medium text-slate-200">{channel?.name}</p>
          <p className="text-sm text-rose-400 mt-1">{streamError}</p>
          <p className="text-xs text-slate-400 mt-3">Reconnexion automatique au flux en cours...</p>
        </div>
      )}

      {/* Controls Overlay (when not fullscreen and in Web mode) */}
      {!isFullscreen && !nativeMode && (
        <div className="absolute top-2 right-2 flex items-center space-x-1.5 bg-black/70 rounded-lg p-1.5 border border-white/10 z-10">
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
            <div className="flex items-center space-x-3">
              <span className="text-slate-400 text-sm font-mono flex items-center">
                <Clock className="w-4 h-4 mr-1.5 text-tv-accent" />
                {new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </span>

              {/* Previous Channel Button */}
              {onPreviousChannel && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onPreviousChannel();
                    showZapFeedback('▼ Chaîne précédente');
                  }}
                  className="pointer-events-auto p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition active:scale-95"
                  title="Chaîne précédente (Glisser bas)"
                >
                  <SkipBack className="w-5 h-5 text-tv-accent" />
                </button>
              )}

              {/* Next Channel Button */}
              {onNextChannel && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onNextChannel();
                    showZapFeedback('▲ Chaîne suivante');
                  }}
                  className="pointer-events-auto p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition active:scale-95"
                  title="Chaîne suivante (Glisser haut)"
                >
                  <SkipForward className="w-5 h-5 text-tv-accent" />
                </button>
              )}

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

              {/* Mute Button */}
              <button
                onClick={toggleMute}
                className="pointer-events-auto p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white"
                title={isMuted ? 'Activer le son' : 'Couper le son'}
              >
                {isMuted ? <VolumeX className="w-5 h-5 text-rose-400" /> : <Volume2 className="w-5 h-5 text-emerald-400" />}
              </button>

              <button
                onClick={onToggleFullscreen}
                className="pointer-events-auto p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white"
                title="Quitter le plein écran (Retour)"
              >
                <Minimize2 className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Centered Zap Feedback */}
          {zapNotice && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-40">
              <div className="bg-black/90 border border-tv-accent/50 rounded-2xl px-6 py-3 shadow-2xl flex flex-col items-center">
                <span className="text-tv-accent text-sm font-bold tracking-wider">{zapNotice}</span>
                <span className="text-white text-base font-bold mt-0.5">{channel?.name}</span>
              </div>
            </div>
          )}

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
