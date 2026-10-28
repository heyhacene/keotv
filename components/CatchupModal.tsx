'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Channel, EpgProgram } from '@/types/iptv';
import { EPGService } from '@/lib/epg-service';
import {
  Clock,
  RotateCcw,
  Play,
  Calendar,
  X,
  Radio,
  Loader2,
  ChevronRight,
  Tv,
} from 'lucide-react';

interface CatchupModalProps {
  isOpen: boolean;
  channel: Channel | null;
  serverCreds?: { serverUrl: string; username: string; password: string } | null;
  onClose: () => void;
  onPlayProgram: (program: EpgProgram, channel: Channel) => void;
}

export const CatchupModal: React.FC<CatchupModalProps> = ({
  isOpen,
  channel,
  serverCreds,
  onClose,
  onPlayProgram,
}) => {
  const [loading, setLoading] = useState(false);
  const [programs, setPrograms] = useState<EpgProgram[]>([]);
  const [selectedDay, setSelectedDay] = useState<number>(0); // 0 = Aujourd'hui, -1 = Hier, etc.
  const [focusedIndex, setFocusedIndex] = useState<number>(0);
  const [activeArea, setActiveArea] = useState<'days' | 'programs'>('programs');
  const [dayIndex, setDayIndex] = useState<number>(0);

  const programsListRef = useRef<HTMLDivElement | null>(null);

  // Generate last 7 days list
  const days = React.useMemo(() => {
    const list: Array<{ offset: number; label: string; dateStr: string }> = [];
    const now = new Date();
    for (let i = 0; i <= 6; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      let label = '';
      if (i === 0) label = "Aujourd'hui";
      else if (i === 1) label = 'Hier';
      else {
        label = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
        label = label.charAt(0).toUpperCase() + label.slice(1);
      }
      list.push({
        offset: -i,
        label,
        dateStr: d.toISOString().slice(0, 10),
      });
    }
    return list;
  }, []);

  // Fetch full EPG whenever channel opens
  useEffect(() => {
    if (!isOpen || !channel) return;
    let isCancelled = false;

    async function loadPrograms() {
      setLoading(true);
      try {
        const streamId = channel?.stream_id || (channel?.id.match(/\d+$/) ? channel?.id.match(/\d+$/)![0] : null);
        if (serverCreds && streamId) {
          const list = await EPGService.fetchXtreamFullEpg({
            serverUrl: serverCreds.serverUrl,
            username: serverCreds.username,
            password: serverCreds.password,
            streamId,
            channelId: channel.id,
          });
          if (!isCancelled) {
            setPrograms(list);
          }
        } else {
          // Local fallback from IndexedDB
          const list = await EPGService.getProgramsForChannel(channel.id);
          if (!isCancelled) {
            setPrograms(list);
          }
        }
      } catch (e) {
        console.warn('Failed to load full EPG for catchup', e);
      } finally {
        if (!isCancelled) setLoading(false);
      }
    }

    loadPrograms();
    return () => {
      isCancelled = true;
    };
  }, [isOpen, channel, serverCreds]);

  // Filter programs for the selected day
  const filteredPrograms = React.useMemo(() => {
    if (programs.length === 0) return [];
    const targetDay = days.find((d) => d.offset === selectedDay);
    if (!targetDay) return programs;

    const matched = programs.filter((p) => {
      return p.start.slice(0, 10) === targetDay.dateStr;
    });

    // If no program strictly on that day, display all programs
    return matched.length > 0 ? matched : programs;
  }, [programs, selectedDay, days]);

  // Reset program focus index when selected day changes (keep activeArea intact so user can scroll days with Up/Down)
  useEffect(() => {
    setFocusedIndex(0);
  }, [selectedDay]);

  // Spatial scroll into view
  useEffect(() => {
    if (!isOpen) return;
    if (activeArea === 'programs') {
      const el = document.getElementById(`catchup-prog-${focusedIndex}`);
      el?.scrollIntoView({ behavior: 'auto', block: 'nearest' });
    }
  }, [focusedIndex, activeArea, isOpen]);

  // TV Remote D-Pad Navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const keyCode = (e as any).keyCode || 0;
      const key = e.key || '';

      const isEnter =
        key === 'Enter' ||
        key === 'Select' ||
        key === 'Ok' ||
        keyCode === 13 ||
        keyCode === 23 || // DPAD_CENTER
        keyCode === 66;

      const isUp =
        key === 'ArrowUp' ||
        key === 'Up' ||
        keyCode === 38 ||
        keyCode === 19;

      const isDown =
        key === 'ArrowDown' ||
        key === 'Down' ||
        keyCode === 40 ||
        keyCode === 20;

      const isLeft =
        key === 'ArrowLeft' ||
        key === 'Left' ||
        keyCode === 37 ||
        keyCode === 21;

      const isRight =
        key === 'ArrowRight' ||
        key === 'Right' ||
        keyCode === 39 ||
        keyCode === 22;

      const isBack =
        key === 'Escape' ||
        key === 'Backspace' ||
        key === 'GoBack' ||
        key === 'Back' ||
        keyCode === 27 ||
        keyCode === 4;

      if (isBack) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }

      if (activeArea === 'days') {
        if (isRight) {
          e.preventDefault();
          setActiveArea('programs');
          return;
        }
        if (isDown) {
          e.preventDefault();
          const next = dayIndex < days.length - 1 ? dayIndex + 1 : 0;
          setDayIndex(next);
          setSelectedDay(days[next].offset);
          return;
        }
        if (isUp) {
          e.preventDefault();
          const prev = dayIndex > 0 ? dayIndex - 1 : days.length - 1;
          setDayIndex(prev);
          setSelectedDay(days[prev].offset);
          return;
        }
        if (isEnter) {
          e.preventDefault();
          setActiveArea('programs');
          return;
        }
      }

      if (activeArea === 'programs') {
        if (isLeft) {
          e.preventDefault();
          setActiveArea('days');
          return;
        }
        if (isDown) {
          e.preventDefault();
          if (focusedIndex < filteredPrograms.length - 1) {
            setFocusedIndex(focusedIndex + 1);
          }
          return;
        }
        if (isUp) {
          e.preventDefault();
          if (focusedIndex > 0) {
            setFocusedIndex(focusedIndex - 1);
          }
          return;
        }
        if (isEnter) {
          e.preventDefault();
          const target = filteredPrograms[focusedIndex];
          if (target && channel) {
            onPlayProgram(target, channel);
            onClose();
          }
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, activeArea, dayIndex, focusedIndex, days, filteredPrograms, channel, onPlayProgram, onClose]);

  if (!isOpen || !channel) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 md:p-8 animate-in fade-in duration-150 select-none">
      <div className="w-full max-w-4xl h-[85vh] bg-[#0c121e] border border-tv-border rounded-2xl flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-tv-card/90 border-b border-tv-border flex items-center justify-between flex-shrink-0">
          <div className="flex items-center space-x-3.5">
            <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <RotateCcw className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                  Replay & Timeshift
                </span>
                <span className="text-xs text-slate-400 font-mono">Derniers 7 jours</span>
              </div>
              <h2 className="text-lg md:text-xl font-black text-white truncate max-w-md mt-0.5">
                {channel.name}
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition"
            title="Fermer (Retour)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Split-Screen: Days on the Left, Programs on the Right */}
        <div className="flex-1 flex overflow-hidden">
          {/* Days selector column */}
          <div className="w-44 md:w-52 bg-black/40 border-r border-white/5 p-3 space-y-1 overflow-y-auto flex-shrink-0">
            <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center space-x-1.5">
              <Calendar className="w-3.5 h-3.5 text-tv-accent" />
              <span>Journées</span>
            </div>

            {days.map((d, idx) => {
              const isSelected = selectedDay === d.offset;
              const isFocused = activeArea === 'days' && dayIndex === idx;

              return (
                <button
                  key={d.offset}
                  onClick={() => {
                    setSelectedDay(d.offset);
                    setDayIndex(idx);
                    setActiveArea('programs');
                  }}
                  className={`w-full text-left px-3.5 py-3 rounded-xl text-xs font-bold transition flex items-center justify-between ${
                    isFocused
                      ? 'bg-tv-focus text-white ring-4 ring-white shadow-xl scale-[1.02] z-10'
                      : isSelected
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-black'
                      : 'text-slate-300 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <span className="truncate">{d.label}</span>
                  {isSelected && <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />}
                </button>
              );
            })}
          </div>

          {/* Programs list column */}
          <div ref={programsListRef} className="flex-1 p-4 md:p-6 overflow-y-auto space-y-2.5">
            {loading ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-3">
                <Loader2 className="w-8 h-8 animate-spin text-tv-accent" />
                <span className="text-xs">Chargement du guide et des flux de replay...</span>
              </div>
            ) : filteredPrograms.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-2 text-center p-6">
                <Clock className="w-10 h-10 text-slate-600 mb-1" />
                <h3 className="text-sm font-bold text-white">Aucun programme répertorié</h3>
                <p className="text-xs text-slate-500 max-w-sm">
                  Le guide des programmes n&apos;est pas disponible pour cette date ou votre fournisseur n&apos;a pas archivé cette journée.
                </p>
              </div>
            ) : (
              filteredPrograms.map((prog, idx) => {
                const isFocused = activeArea === 'programs' && focusedIndex === idx;
                const startTime = new Date(prog.start).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                const endTime = new Date(prog.end).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                const isPast = new Date(prog.end).getTime() < Date.now();

                return (
                  <div
                    key={prog.id}
                    id={`catchup-prog-${idx}`}
                    onClick={() => {
                      onPlayProgram(prog, channel);
                      onClose();
                    }}
                    className={`p-3.5 rounded-xl border transition cursor-pointer flex items-center justify-between ${
                      isFocused
                        ? 'bg-tv-focus text-white ring-4 ring-white shadow-2xl scale-[1.01] z-10'
                        : 'bg-tv-card/70 border-white/5 hover:bg-tv-card hover:border-tv-border'
                    }`}
                  >
                    <div className="min-w-0 flex-1 mr-4">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-mono font-bold text-tv-accent">
                          {startTime} - {endTime}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          ({prog.duration_min} min)
                        </span>
                        {isPast ? (
                          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            Replay
                          </span>
                        ) : (
                          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                            En direct
                          </span>
                        )}
                      </div>

                      <h4 className="text-sm font-bold text-white mt-1 truncate">
                        {prog.title}
                      </h4>

                      {prog.description && (
                        <p className="text-xs text-slate-400 line-clamp-2 mt-0.5">
                          {prog.description}
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 flex-shrink-0 ${
                        isFocused
                          ? 'bg-white text-slate-950 font-black shadow-md'
                          : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      }`}
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Lancer</span>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Footer info bar */}
        <div className="px-6 py-2.5 bg-black/60 border-t border-tv-border flex items-center justify-between text-[11px] text-slate-400">
          <span>💡 <strong>Télécommande :</strong> Gauche pour changer de jour, Entrée pour lancer l&apos;émission.</span>
          <span className="font-mono text-emerald-400 font-bold">KeoTV Catchup Player</span>
        </div>
      </div>
    </div>
  );
};
