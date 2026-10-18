'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { db, getSetting, setSetting } from '@/lib/db';
import { INITIAL_CATEGORIES, INITIAL_CHANNELS, getMockEpgForChannel } from '@/lib/mock-data';
import { Channel, Category, EpgProgram, NavigationPane, PlaylistConfig } from '@/types/iptv';
import { useTVNavigation } from '@/lib/use-tv-navigation';
import { NavigationSidebar } from '@/components/NavigationSidebar';
import { TopBar } from '@/components/TopBar';
import { TVGuide } from '@/components/TVGuide';
import { LiveVideoPlayer } from '@/components/LiveVideoPlayer';
import { XtreamModal } from '@/components/XtreamModal';
import { SyncModal } from '@/components/SyncModal';
import { CategoryDrawerModal } from '@/components/CategoryDrawerModal';
import { SettingsModal } from '@/components/SettingsModal';
import { SeriesDetailModal } from '@/components/SeriesDetailModal';
import { MovieDetailModal } from '@/components/MovieDetailModal';
import { SearchModal } from '@/components/SearchModal';
import { UpdatePopupModal } from '@/components/UpdatePopupModal';
import { SplashScreen } from '@/components/SplashScreen';
import { checkForAppUpdate, AppUpdateInfo } from '@/lib/update-service';
import { pushSyncToCloud, pullSyncFromCloud } from '@/lib/supabase';
import {
  syncXtreamPlaylist,
  parseM3UPlaylist,
  fetchCategoryStreamsOnDemand,
  resolveSeriesEpisodes,
  loadAllLiveCategories,
  SeriesEpisode,
} from '@/lib/iptv-service';
import { NativePlayer, isNativePlayerAvailable, NATIVE_PLAYER_USER_AGENT } from '@/lib/native-player';

import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { Star, Tv, Film, Clapperboard, Settings, RefreshCw, Trophy, Globe, Compass, ChevronDown, Layers, Sparkles, Play, Square, ArrowUpDown, AlertCircle, Loader2 } from 'lucide-react';

export default function KeoTVHome() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [playlists, setPlaylists] = useState<PlaylistConfig[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [favCount, setFavCount] = useState<number>(0);

  // Resync and channel loading recovery states
  const [isResyncing, setIsResyncing] = useState<boolean>(false);
  const [syncStatusBanner, setSyncStatusBanner] = useState<string | null>(null);

  // Android Back navigation & Double-press to exit
  const [backToastVisible, setBackToastVisible] = useState<boolean>(false);
  const lastBackPressTimeRef = useRef<number>(0);
  const hasInitRunRef = useRef<boolean>(false);

  // Sorting preferences
  const [categorySort, setCategorySort] = useState<'playlist' | 'alpha' | 'count'>('playlist');
  const [channelSort, setChannelSort] = useState<'playlist' | 'alpha' | 'num'>('playlist');

  const [activePane, setActivePane] = useState<NavigationPane>('channels');
  const [focusedCategoryIndex, setFocusedCategoryIndex] = useState<number>(0);
  const [focusedChannelIndex, setFocusedChannelIndex] = useState<number>(0);
  const [focusedMenuIndex, setFocusedMenuIndex] = useState<number>(0);

  // Layout mode: true ONLY for smartphones held strictly in vertical portrait mode
  const [isPortraitMobile, setIsPortraitMobile] = useState<boolean>(false);

  useEffect(() => {
    const updateLayoutMode = () => {
      // Android TVs and landscape tablets/monitors are always landscape (e.g. 960x540, 1280x720, 1920x1080).
      // We only switch to the single-column smartphone layout if the device is strictly in vertical portrait
      // AND has a narrow width (< 700px).
      const isPortrait = typeof window !== 'undefined' && window.innerHeight > window.innerWidth && window.innerWidth < 700;
      setIsPortraitMobile(isPortrait);
    };

    updateLayoutMode();
    window.addEventListener('resize', updateLayoutMode);
    window.addEventListener('orientationchange', updateLayoutMode);
    return () => {
      window.removeEventListener('resize', updateLayoutMode);
      window.removeEventListener('orientationchange', updateLayoutMode);
    };
  }, []);

  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isStopped, setIsStopped] = useState<boolean>(false);

  const [currentEpg, setCurrentEpg] = useState<EpgProgram | null>(null);
  const [nextEpg, setNextEpg] = useState<EpgProgram | null>(null);

  const [activeSection, setActiveSection] = useState<'live' | 'vod' | 'series' | 'fav'>('live');
  const [syncCode, setSyncCode] = useState<string>('');
  const [isLoadingCategory, setIsLoadingCategory] = useState<boolean>(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [bgLoadStatus, setBgLoadStatus] = useState<string | null>(null);
  const bgLoadTokenRef = useRef<number>(0);

  // App Launch Splash Screen states
  const [isSplashVisible, setIsSplashVisible] = useState<boolean>(true);
  const [isSplashFading, setIsSplashFading] = useState<boolean>(false);

  // Auto-refresh bouquets in background states
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(24);
  const [lastAutoRefreshAt, setLastAutoRefreshAt] = useState<string>('');
  const [isSilentRefreshing, setIsSilentRefreshing] = useState<boolean>(false);

  const [isXtreamModalOpen, setIsXtreamModalOpen] = useState(false);
  const [editingPlaylist, setEditingPlaylist] = useState<PlaylistConfig | null>(null);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [selectedSeriesForDetails, setSelectedSeriesForDetails] = useState<Channel | null>(null);
  const [seriesServerCreds, setSeriesServerCreds] = useState<{ serverUrl: string; username: string; password: string } | null>(null);
  const [selectedMovieForDetails, setSelectedMovieForDetails] = useState<Channel | null>(null);
  const [movieServerCreds, setMovieServerCreds] = useState<{ serverUrl: string; username: string; password: string } | null>(null);

  // Global Search Modal state
  const [isSearchModalOpen, setIsSearchModalOpen] = useState<boolean>(false);

  // Startup Update Check state & auto-check
  const [appUpdateInfo, setAppUpdateInfo] = useState<AppUpdateInfo | null>(null);

  useEffect(() => {
    checkForAppUpdate(24).then((info) => {
      if (info && info.hasUpdate) {
        setAppUpdateInfo(info);
      }
    });
  }, []);

  // Channel loader for the selected category from IndexedDB with multi-tier lookup & on-demand fetch
  const loadCategoryChannels = useCallback(
    async (cat: Category | null, sortMode: 'playlist' | 'alpha' | 'num' = channelSort) => {
      if (!cat) {
        setChannels([]);
        return;
      }

      setIsLoadingCategory(true);
      setCategoryError(null);
      try {
        let rawList: Channel[] = [];
        if (cat.id === 'fav') {
          rawList = await db.channels.filter((c) => Boolean(c.is_favorite)).toArray();
        } else {
          // Tier 1: exact group_id indexed match (e.g. grp_live_123, grp_vod_456, grp_series_789)
          rawList = await db.channels.where('group_id').equals(cat.id).toArray();

          // NOTE: no fuzzy fallbacks here on purpose. Matching by numeric id or by name across
          // stream types mixed Films / Séries / TV together. The group_id is the single source of truth.

          // Tier 5: ON-DEMAND FETCH FROM XTREAM SERVER (if local database has 0 items for this category)
          if (rawList.length === 0 && cat.id !== 'fav') {
            const currentPlaylists = await db.playlists.toArray();
            let activePl = currentPlaylists.find(
              (p) => p.type === 'xtream' && p.server_url && p.username && p.password
            );

            if (!activePl) {
              const savedConfig = await getSetting<any>('last_xtream_config', null);
              if (savedConfig && savedConfig.server_url && savedConfig.username && savedConfig.password) {
                activePl = savedConfig;
              }
            }

            if (activePl && activePl.server_url && activePl.username && activePl.password) {
              const cleanRawCatId = cat.id.replace(/^grp_(?:live_|vod_|series_)?/, '').trim();
              const catType: 'live' | 'vod' | 'series' = cat.id.startsWith('grp_vod_')
                ? 'vod'
                : cat.id.startsWith('grp_series_')
                ? 'series'
                : 'live';
              try {
                const onDemandStreams = await fetchCategoryStreamsOnDemand({
                  serverUrl: activePl.server_url,
                  username: activePl.username,
                  password: activePl.password,
                  categoryId: cleanRawCatId,
                  categoryName: cat.name,
                  streamType: catType,
                });

                if (onDemandStreams.length > 0) {
                  try {
                    await db.channels.bulkPut(onDemandStreams);
                  } catch (putErr) {
                    for (const s of onDemandStreams) {
                      try { await db.channels.put(s); } catch {}
                    }
                  }
                  await db.categories.update(cat.id, { count: onDemandStreams.length });
                  setCategories((prev) =>
                    prev.map((c) => (c.id === cat.id ? { ...c, count: onDemandStreams.length } : c))
                  );
                  rawList = onDemandStreams;
                }
              } catch (onDemandErr: any) {
                console.warn('On-demand stream fetch error for category', cat.id, onDemandErr);
                setCategoryError(`Erreur serveur IPTV : ${onDemandErr?.message || onDemandErr}`);
              }
            }
          }
        }

        // Apply channel sort
        let sorted = [...rawList];
        if (sortMode === 'alpha') {
          sorted.sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })
          );
        } else if (sortMode === 'num') {
          sorted.sort((a, b) => (a.num || 0) - (b.num || 0));
        } else {
          // 'playlist' (strict default original lineup order)
          sorted.sort((a, b) => (a.custom_order || a.num || 0) - (b.custom_order || b.num || 0));
        }

        setChannels(sorted);
        if (sorted.length > 0) {
          setActiveChannel((prev) => prev || sorted[0]);
        }
      } catch (err) {
        console.error('Error loading channels for category:', cat.id, err);
        setChannels([]);
      } finally {
        setIsLoadingCategory(false);
      }

    },
    [channelSort]
  );

  // Background download of ALL live bouquets (small requests, 3 at a time) so the full playlist is local
  const startBackgroundLiveLoad = useCallback(async (pl: PlaylistConfig, cats: Category[]) => {
    if (pl.type !== 'xtream' || !pl.server_url || !pl.username || !pl.password) return;
    const token = ++bgLoadTokenRef.current;

    try {
      const loadedKeys = (await db.channels.orderBy('group_id').uniqueKeys()) as string[];
      const skip = new Set<string>(loadedKeys.map((k) => String(k)));

      await loadAllLiveCategories({
        serverUrl: pl.server_url,
        username: pl.username,
        password: pl.password,
        categories: cats,
        skipCategoryIds: skip,
        shouldAbort: () => bgLoadTokenRef.current !== token,
        onCategoryLoaded: async (cat, streams) => {
          if (streams.length === 0) return;
          try {
            await db.channels.bulkPut(streams);
          } catch {
            for (const s of streams) {
              try { await db.channels.put(s); } catch {}
            }
          }
          await db.categories.update(cat.id, { count: streams.length });
          setCategories((prev) => prev.map((c) => (c.id === cat.id ? { ...c, count: streams.length } : c)));
        },
        onProgress: (done, total) => {
          if (bgLoadTokenRef.current === token) {
            setBgLoadStatus(`Chargement de votre playlist : ${done}/${total} bouquets TV`);
          }
        },
      });

      if (bgLoadTokenRef.current === token) {
        const totalChannels = await db.channels.count();
        await db.playlists.update(pl.id, { channel_count: totalChannels });
        setPlaylists(await db.playlists.toArray());
      }
    } catch (err) {
      console.warn('Background live load error:', err);
    } finally {
      if (bgLoadTokenRef.current === token) {
        setBgLoadStatus(null);
      }
    }
  }, []);

  // Re-synchronize existing playlist and reload all channels safely into Dexie
  const handleResyncPlaylist = useCallback(
    async (pl?: PlaylistConfig) => {
      const targetPl = pl || (await db.playlists.toCollection().first());
      if (!targetPl) return;

      setIsResyncing(true);
      setSyncStatusBanner(`Re-synchronisation de "${targetPl.name}"...`);

      try {
        let result: { playlist: PlaylistConfig; categories: Category[]; channels: Channel[] };
        if (targetPl.type === 'xtream') {
          result = await syncXtreamPlaylist({
            serverUrl: targetPl.server_url,
            username: targetPl.username || '',
            password: targetPl.password || '',
            name: targetPl.name,
            onProgress: (p) => setSyncStatusBanner(p),
          });
        } else {
          result = await parseM3UPlaylist({
            m3uUrl: targetPl.m3u_url || targetPl.server_url,
            name: targetPl.name,
            onProgress: (p) => setSyncStatusBanner(p),
          });
        }

        setSyncStatusBanner(`Enregistrement de ${result.channels.length} chaînes...`);

        await db.playlists.clear();
        await db.categories.clear();
        await db.channels.clear();

        await db.playlists.put(result.playlist);
        await db.categories.bulkPut(result.categories);

        const CHUNK_SIZE = 500;
        for (let i = 0; i < result.channels.length; i += CHUNK_SIZE) {
          const chunk = result.channels.slice(i, i + CHUNK_SIZE);
          try {
            await db.channels.bulkPut(chunk);
          } catch (chunkErr) {
            console.warn('bulkPut chunk error, fallback to individual put:', chunkErr);
            for (const item of chunk) {
              try {
                await db.channels.put(item);
              } catch (putErr) {
                console.error('Failed to put channel', item.id, putErr);
              }
            }
          }
          if (result.channels.length > 1000) {
            const percent = Math.min(100, Math.round(((i + chunk.length) / result.channels.length) * 100));
            setSyncStatusBanner(`Enregistrement local : ${percent}% (${Math.min(i + chunk.length, result.channels.length)}/${result.channels.length} chaînes)...`);
          }
        }

        const loadedCats = await db.categories.orderBy('custom_order').toArray();
        const loadedPlaylists = await db.playlists.toArray();
        setCategories(loadedCats);
        setPlaylists(loadedPlaylists);
        setFavCount(0);
        startBackgroundLiveLoad(result.playlist, loadedCats);

        let firstCat = loadedCats.find((c) => c.id !== 'fav' && (c.count || 0) > 0) || loadedCats.find((c) => c.id !== 'fav') || loadedCats[0];
        if (firstCat) {
          setSelectedCategory(firstCat);
          setFocusedCategoryIndex(0);
          setFocusedChannelIndex(0);
          await loadCategoryChannels(firstCat, channelSort);
        }

        const firstChannel = result.channels[0];
        if (firstChannel) {
          setActiveChannel(firstChannel);
          setCurrentEpg({
            id: 'epg_' + firstChannel.id,
            channel_id: firstChannel.id,
            title: firstChannel.name + ' (En Direct)',
            description: 'Flux en direct de ' + firstChannel.name,
            start: new Date().toISOString(),
            end: new Date(Date.now() + 7200000).toISOString(),
            duration_min: 120,
          });
          setNextEpg(null);
          setIsStopped(false);
        }
      } catch (err: any) {
        console.error('Failed to resync playlist:', err);
        alert(`Erreur lors de la synchronisation : ${err.message}`);
      } finally {
        setIsResyncing(false);
        setSyncStatusBanner(null);
      }
    },
    [channelSort, loadCategoryChannels]
  );

  // Silent background refresh of bouquets & channels (keeps playback uninterrupted)
  const triggerSilentRefresh = useCallback(async () => {
    if (isSilentRefreshing) return;
    const allPls = await db.playlists.toArray();
    const activePl = allPls.find((p) => p.type === 'xtream' || (p.type === 'm3u' && p.id !== 'pl_demo_default'));
    if (!activePl) return;

    setIsSilentRefreshing(true);
    try {
      let result: { playlist: PlaylistConfig; categories: Category[]; channels: Channel[] };
      if (activePl.type === 'xtream') {
        result = await syncXtreamPlaylist({
          serverUrl: activePl.server_url,
          username: activePl.username || '',
          password: activePl.password || '',
          name: activePl.name,
          onProgress: () => {},
        });
      } else {
        result = await parseM3UPlaylist({
          m3uUrl: activePl.m3u_url || activePl.server_url,
          name: activePl.name,
          onProgress: () => {},
        });
      }

      if (result && result.categories && result.categories.length > 0) {
        // Keep existing user favorites
        const favIds = new Set((await db.channels.filter((c) => Boolean(c.is_favorite)).toArray()).map((c) => c.id));
        for (const ch of result.channels) {
          if (favIds.has(ch.id)) {
            ch.is_favorite = true;
          }
        }

        await db.playlists.put(result.playlist);
        await db.categories.bulkPut(result.categories);

        const CHUNK_SIZE = 500;
        for (let i = 0; i < result.channels.length; i += CHUNK_SIZE) {
          const chunk = result.channels.slice(i, i + CHUNK_SIZE);
          try {
            await db.channels.bulkPut(chunk);
          } catch {
            for (const item of chunk) {
              try { await db.channels.put(item); } catch {}
            }
          }
        }

        const loadedCats = await db.categories.orderBy('custom_order').toArray();
        setCategories(loadedCats);
        setPlaylists(await db.playlists.toArray());

        if (selectedCategory) {
          const freshCat = loadedCats.find((c) => c.id === selectedCategory.id) || selectedCategory;
          loadCategoryChannels(freshCat, channelSort);
        }
      }

      const nowIso = new Date().toISOString();
      await setSetting('last_auto_refresh_at', nowIso);
      setLastAutoRefreshAt(nowIso);

      setSyncStatusBanner('Bouquets actualisés en arrière-plan');
      setTimeout(() => {
        setSyncStatusBanner(null);
      }, 3000);
    } catch (err) {
      console.warn('Silent bouquet refresh error:', err);
    } finally {
      setIsSilentRefreshing(false);
    }
  }, [isSilentRefreshing, selectedCategory, channelSort, loadCategoryChannels]);

  const handleAutoRefreshIntervalChange = useCallback(async (newInterval: number) => {
    setAutoRefreshInterval(newInterval);
    await setSetting('auto_refresh_interval', newInterval);
  }, []);

  // Recurring background check for scheduled bouquet refresh (checks every 15 minutes)
  useEffect(() => {
    if (autoRefreshInterval <= 0) return;
    const timer = setInterval(() => {
      getSetting<string>('last_auto_refresh_at', '').then((last) => {
        const lastTime = last ? new Date(last).getTime() : 0;
        const elapsed = (Date.now() - lastTime) / (1000 * 60 * 60);
        if (elapsed >= autoRefreshInterval) {
          triggerSilentRefresh();
        }
      });
    }, 15 * 60 * 1000);
    return () => clearInterval(timer);
  }, [autoRefreshInterval, triggerSilentRefresh]);

  // 1. Initialize IndexedDB & Seed initial channels (strictly once on component mount)
  useEffect(() => {
    if (hasInitRunRef.current) return;
    hasInitRunRef.current = true;

    async function initDB() {
      try {
        const savedCatSort = await getSetting<'playlist' | 'alpha' | 'count'>('category_sort', 'playlist');
        const savedChSort = await getSetting<'playlist' | 'alpha' | 'num'>('channel_sort', 'playlist');
        setCategorySort(savedCatSort);
        setChannelSort(savedChSort);

        // One-time clean reload: previous builds stored channels under wrong group ids
        const DATA_VERSION = 13;
        const savedDataVersion = await getSetting<number>('data_version', 0);
        let resyncTarget: PlaylistConfig | null = null;
        if (savedDataVersion < DATA_VERSION) {
          const existingPls = await db.playlists.toArray();
          const realPl = existingPls.find((p) => p.type === 'xtream' || (p.type === 'm3u' && p.id !== 'pl_demo_default'));
          if (realPl) {
            await db.categories.clear();
            await db.channels.clear();
            resyncTarget = realPl;
          }
          await setSetting('data_version', DATA_VERSION);
        }

        const allChannels = await db.channels.toArray();
        const chCount = allChannels.length;
        const currentPlaylists = await db.playlists.toArray();
        const plCount = currentPlaylists.length;

        // Repair categories saved by previous builds: the stream type is always the API namespace
        // encoded in the id (grp_live_ / grp_vod_ / grp_series_).
        const allDbCats = await db.categories.toArray();
        for (const c of allDbCats) {
          const expected = c.id.startsWith('grp_vod_')
            ? 'vod'
            : c.id.startsWith('grp_series_')
            ? 'series'
            : c.id.startsWith('grp_live_')
            ? 'live'
            : null;
          if (expected && c.type !== expected) {
            await db.categories.update(c.id, { type: expected });
            c.type = expected;
          }
        }

        // Check if user has real IPTV categories (non-demo)
        const hasRealCats = allDbCats.some(
          (c) =>
            c.id !== 'fav' &&
            c.id !== 'tnt' &&
            c.id !== 'sport' &&
            c.id !== 'cinema' &&
            c.id !== 'news' &&
            c.id !== 'doc'
        );

        // If user has real categories, NEVER keep the demo playlist in DB
        if (hasRealCats) {
          await db.playlists.delete('pl_demo_default');
        }

        const savedXtreamConfig = await getSetting<any>('last_xtream_config', null);
        let updatedPlaylists = await db.playlists.toArray();

        // Check if channels are user IPTV channels rather than TNT mock channels
        const isOnlyDemoChannels =
          chCount > 0 &&
          chCount <= 35 &&
          allChannels.every(
            (c) =>
              c.id.startsWith('ch_tf1') ||
              c.id.startsWith('ch_france') ||
              c.id.startsWith('ch_m6') ||
              c.id.startsWith('ch_arte') ||
              c.id.startsWith('ch_w9') ||
              c.id.startsWith('ch_tmc') ||
              c.id.startsWith('ch_bfm') ||
              c.id.startsWith('ch_c8')
          );

        // Restore real user subscription if playlists table is missing or was overwritten
        if (updatedPlaylists.length === 0 || updatedPlaylists.every((p) => p.id === 'pl_demo_default')) {
          if (savedXtreamConfig && savedXtreamConfig.server_url && savedXtreamConfig.username) {
            const recoveredPl: PlaylistConfig = {
              id: 'pl_xtream_' + Date.now(),
              name: savedXtreamConfig.name || 'Mon Abonnement IPTV',
              type: 'xtream',
              server_url: savedXtreamConfig.server_url,
              username: savedXtreamConfig.username,
              password: savedXtreamConfig.password,
              status: 'active',
              channel_count: chCount,
              last_sync_at: new Date().toISOString(),
            };
            await db.playlists.clear();
            await db.playlists.put(recoveredPl);
          } else if (!isOnlyDemoChannels && chCount > 0) {
            let userServerUrl = '';
            let userUsername = '';
            let userPassword = '';
            let isXtream = false;

            for (const ch of allChannels) {
              if (ch.stream_url) {
                const m = ch.stream_url.match(/^(https?:\/\/[^\/]+)\/(?:live|movie|series)\/([^\/]+)\/([^\/]+)\//i);
                if (m) {
                  userServerUrl = m[1];
                  userUsername = decodeURIComponent(m[2]);
                  userPassword = decodeURIComponent(m[3]);
                  isXtream = true;
                  break;
                }
              }
            }

            if (isXtream && userServerUrl) {
              const recoveredPl: PlaylistConfig = {
                id: 'pl_xtream_' + Date.now(),
                name: 'Mon Abonnement IPTV',
                type: 'xtream',
                server_url: userServerUrl,
                username: userUsername,
                password: userPassword,
                status: 'active',
                channel_count: chCount,
                last_sync_at: new Date().toISOString(),
              };
              await db.playlists.clear();
              await db.playlists.put(recoveredPl);
              await setSetting('last_xtream_config', {
                server_url: userServerUrl,
                username: userUsername,
                password: userPassword,
                name: 'Mon Abonnement IPTV',
              });
            }
          } else if (chCount === 0 && !hasRealCats) {
            const userHasDeletedAll = await getSetting<boolean>('user_deleted_all_playlists', false);
            if (!userHasDeletedAll) {
              await db.categories.clear();
              await db.channels.clear();
              await db.categories.bulkAdd(INITIAL_CATEGORIES);
              await db.channels.bulkAdd(INITIAL_CHANNELS);

              const demoPlaylist: PlaylistConfig = {
                id: 'pl_demo_default',
                name: 'Chaînes Démo Gratuites',
                type: 'm3u',
                server_url: 'https://test-streams.mux.dev',
                status: 'active',
                channel_count: INITIAL_CHANNELS.length,
                last_sync_at: new Date().toISOString(),
              };
              await db.playlists.put(demoPlaylist);
            }
          }
        }


        const loadedCats = await db.categories.orderBy('custom_order').toArray();
        const loadedPlaylists = await db.playlists.toArray();
        const initialFavCount = await db.channels.filter((c) => Boolean(c.is_favorite)).count();

        setCategories(loadedCats);
        setPlaylists(loadedPlaylists);
        setFavCount(initialFavCount);

        // Pick initial category: first non-fav category with count > 0 (or TNT if demo)
        let initialCat = loadedCats.find((c) => c.id === 'tnt');
        if (!initialCat) {
          initialCat =
            loadedCats.find((c) => c.id !== 'fav' && (c.count || 0) > 0) ||
            loadedCats.find((c) => c.id !== 'fav') ||
            loadedCats[0];
        }

        setSelectedCategory(initialCat || null);

        if (initialCat) {
          await loadCategoryChannels(initialCat, savedChSort);
        }

        // Pick initial channel
        const firstCh = (await db.channels.orderBy('num').first()) || null;
        if (firstCh) {
          setActiveChannel(firstCh);
          const epg = getMockEpgForChannel(firstCh.id);
          setCurrentEpg(epg.current);
          setNextEpg(epg.next);
        }

        // Load or create Sync Code
        let code = await getSetting<string>('sync_code', '');
        if (!code) {
          code = 'KEO-' + Math.floor(1000 + Math.random() * 9000);
          await setSetting('sync_code', code);
        }
        setSyncCode(code);

        // Dismiss splash screen with smooth fade-out
        setIsSplashFading(true);
        setTimeout(() => {
          setIsSplashVisible(false);
        }, 350);

        const savedAutoRefresh = await getSetting<number>('auto_refresh_interval', 24);
        const savedLastRefresh = await getSetting<string>('last_auto_refresh_at', '');
        setAutoRefreshInterval(savedAutoRefresh);
        setLastAutoRefreshAt(savedLastRefresh);

        if (resyncTarget) {
          handleResyncPlaylist(resyncTarget);
        } else if (chCount === 0) {
          // Only start initial background loader if database is empty
          const xtreamPl = (await db.playlists.toArray()).find((p) => p.type === 'xtream');
          if (xtreamPl) {
            startBackgroundLiveLoad(xtreamPl, loadedCats);
          }
        } else if (savedAutoRefresh > 0) {
          // Check if auto-refresh is due
          const lastTime = savedLastRefresh ? new Date(savedLastRefresh).getTime() : 0;
          const elapsedHours = (Date.now() - lastTime) / (1000 * 60 * 60);
          if (elapsedHours >= savedAutoRefresh) {
            // Trigger background refresh quietly after 4 seconds (app is fully interactive first)
            setTimeout(() => {
              triggerSilentRefresh();
            }, 4000);
          }
        }
      } catch (err) {
        console.error('Initialization error:', err);
      } finally {
        setIsSplashFading(true);
        setTimeout(() => {
          setIsSplashVisible(false);
        }, 350);
      }
    }
    initDB();
  }, [triggerSilentRefresh, handleResyncPlaylist, startBackgroundLiveLoad, loadCategoryChannels]);

  // Compute sorted categories based on user's preference and activeSection (Direct / Films / Séries / Favoris)
  const sortedCategories = useMemo(() => {
    // 1. Filter categories by activeSection
    let sectionCats = categories.filter((c) => {
      if (activeSection === 'live') {
        return c.type === 'live' || !c.type || c.id === 'fav';
      }
      if (activeSection === 'vod') {
        return c.type === 'vod';
      }
      if (activeSection === 'series') {
        return c.type === 'series';
      }
      if (activeSection === 'fav') {
        return c.id === 'fav';
      }
      return true;
    });

    // Graceful fallback ONLY if live section is active but categories had no explicit type tag
    if (activeSection === 'live' && sectionCats.length === 0 && categories.length > 0) {
      sectionCats = categories.filter((c) => c.id !== 'fav' && (!c.type || c.type === 'live'));
    }

    const favCat = sectionCats.find((c) => c.id === 'fav');
    const otherCats = sectionCats.filter((c) => c.id !== 'fav');

    if (categorySort === 'alpha') {
      otherCats.sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      );
    } else if (categorySort === 'count') {
      otherCats.sort((a, b) => (b.count || 0) - (a.count || 0));
    } else {
      // 'playlist' (strict default lineup order)
      otherCats.sort((a, b) => (a.custom_order || 0) - (b.custom_order || 0));
    }

    const result = (activeSection === 'live' || activeSection === 'fav') && favCat ? [favCat, ...otherCats] : otherCats;
    return result.map((c) => {
      if (c.id === 'fav') {
        return { ...c, count: favCount };
      }
      return c;
    });
  }, [categories, categorySort, favCount, activeSection]);

  // Section switcher (Direct, Films, Séries, Favoris)
  const handleSelectSection = useCallback(
    async (section: 'live' | 'vod' | 'series' | 'fav') => {
      setActiveSection(section);

      const matchingCats = categories.filter((c) => {
        if (section === 'live') return c.type === 'live' || !c.type;
        if (section === 'vod') return c.type === 'vod';
        if (section === 'series') return c.type === 'series';
        if (section === 'fav') return c.id === 'fav';
        return true;
      });

      // Sort matching categories to match the active categorySort preference
      const favCat = matchingCats.find((c) => c.id === 'fav');
      const otherCats = matchingCats.filter((c) => c.id !== 'fav');
      if (categorySort === 'alpha') {
        otherCats.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
      } else if (categorySort === 'count') {
        otherCats.sort((a, b) => (b.count || 0) - (a.count || 0));
      } else {
        otherCats.sort((a, b) => (a.custom_order || 0) - (b.custom_order || 0));
      }
      const sorted = (section === 'live' || section === 'fav') && favCat ? [favCat, ...otherCats] : otherCats;
      const targetCat = sorted[0] || null;

      setSelectedCategory(targetCat);
      setFocusedCategoryIndex(0);
      setFocusedChannelIndex(0);
      if (targetCat) {
        await loadCategoryChannels(targetCat, channelSort);
      } else {
        setChannels([]);
      }
    },
    [categories, channelSort, loadCategoryChannels]
  );

  // Handle category sort change
  const handleCategorySortChange = async (newSort: 'playlist' | 'alpha' | 'count') => {
    setCategorySort(newSort);
    await setSetting('category_sort', newSort);
  };

  // Handle channel sort change
  const handleChannelSortChange = async (newSort: 'playlist' | 'alpha' | 'num') => {
    setChannelSort(newSort);
    await setSetting('channel_sort', newSort);
    if (selectedCategory) {
      loadCategoryChannels(selectedCategory, newSort);
    }
  };

  // Filtered channels for currently active category
  const filteredChannels = channels;

  // Update EPG info whenever focused channel changes
  useEffect(() => {
    const focusedChannel = filteredChannels[focusedChannelIndex];
    if (focusedChannel) {
      const epg = getMockEpgForChannel(focusedChannel.id);
      setCurrentEpg(epg.current);
      setNextEpg(epg.next);
    }
  }, [focusedChannelIndex, filteredChannels]);

  // Play an episode chosen from the series detail page
  const handlePlaySeriesEpisode = useCallback(
    async (episode: SeriesEpisode, allEpisodes: SeriesEpisode[], audioPref?: string, subPref?: string) => {
      const index = Math.max(0, allEpisodes.findIndex((e) => e.id === episode.id));
      const seriesKey = String(selectedSeriesForDetails?.id || selectedSeriesForDetails?.name || '');
      const savedAudio = audioPref || (typeof window !== 'undefined' ? localStorage.getItem(`keotv_series_audio_${seriesKey}`) || 'vf' : 'vf');
      const savedSub = subPref || (typeof window !== 'undefined' ? localStorage.getItem(`keotv_series_sub_${seriesKey}`) || 'off' : 'off');

      if (isNativePlayerAvailable()) {
        try {
          await NativePlayer.play({
            urls: allEpisodes.map((e) => e.url),
            titles: allEpisodes.map((e) => `${selectedSeriesForDetails?.name || 'Série'} — S${String(e.season).padStart(2, '0')}E${String(e.episodeNum).padStart(2, '0')} ${e.title}`),
            index,
            userAgent: NATIVE_PLAYER_USER_AGENT,
            isLive: false,
            seriesId: seriesKey,
            preferredAudio: savedAudio,
            preferredSubtitle: savedSub,
          });
        } catch (err: any) {
          console.error('Native player episode error:', err);
          alert(`Lecture impossible : ${err?.message || err}`);
        }
      } else {
        if (selectedSeriesForDetails) {
          const epChannel: Channel = {
            ...selectedSeriesForDetails,
            id: `ch_ep_${episode.id}`,
            name: `${selectedSeriesForDetails.name} — S${episode.season}E${episode.episodeNum} ${episode.title}`,
            stream_url: episode.url,
          };
          setActiveChannel(epChannel);
          setIsStopped(false);
          setIsFullscreen(true);
        }
      }
    },
    [selectedSeriesForDetails]
  );

  // Play a movie chosen from the movie detail page
  const handlePlayMovie = useCallback(
    async (movieToPlay: Channel) => {
      if (isNativePlayerAvailable()) {
        try {
          const playlist = filteredChannels.length > 0 ? filteredChannels : [movieToPlay];
          const startIndex = Math.max(0, playlist.findIndex((c) => c.id === movieToPlay.id));
          await NativePlayer.play({
            urls: playlist.map((c) => c.stream_url),
            titles: playlist.map((c) => c.name),
            index: startIndex,
            userAgent: NATIVE_PLAYER_USER_AGENT,
            isLive: false,
          });
        } catch (err: any) {
          console.error('Native player movie error:', err);
          alert(`Lecture impossible : ${err?.message || err}`);
        }
        return;
      }

      // Browser fallback
      setActiveChannel(movieToPlay);
      setIsStopped(false);
      setIsFullscreen(true);
      setSelectedMovieForDetails(null);
    },
    [filteredChannels]
  );

  const handleSelectAnotherMovie = useCallback((anotherMovie: Channel) => {
    setSelectedMovieForDetails(anotherMovie);
  }, []);

  // Channel Selection: opens Series Details for series, Movie Details for films, or native player for live TV
  const handleSelectChannel = useCallback(
    async (target: Channel | number, forceFullscreen: boolean = false) => {
      const targetChannel = typeof target === 'number' ? filteredChannels[target] : target;
      if (!targetChannel) return;

      setIsStopped(false);
      setActiveChannel(targetChannel);
      const epg = getMockEpgForChannel(targetChannel.id);
      setCurrentEpg(epg.current);
      setNextEpg(epg.next);

      // ---- SÉRIES: A click on a series opens its dedicated page with seasons and all episodes! ----
      if (targetChannel.stream_type === 'series' || targetChannel.type === 'series' || (activeSection === 'series' && targetChannel.stream_type !== 'live')) {
        let serverUrl = '';
        let username = '';
        let password = '';
        const pl = (await db.playlists.toArray()).find((p) => p.type === 'xtream' && p.username && p.password);
        if (pl) {
          serverUrl = pl.server_url;
          username = pl.username || '';
          password = pl.password || '';
        } else {
          const saved = await getSetting<any>('last_xtream_config', null);
          if (saved?.server_url && saved?.username && saved?.password) {
            serverUrl = saved.server_url;
            username = saved.username;
            password = saved.password;
          }
        }
        if (!serverUrl || !username || !password) {
          alert('Identifiants Xtream introuvables : rechargez votre playlist.');
          return;
        }
        setSelectedSeriesForDetails(targetChannel);
        setSeriesServerCreds({ serverUrl, username, password });
        return;
      }

      // ---- FILMS (VOD): A click on a movie opens its dedicated sheet before playback! ----
      if (targetChannel.stream_type === 'vod' || targetChannel.type === 'vod' || (activeSection === 'vod' && targetChannel.stream_type !== 'live')) {
        let serverUrl = '';
        let username = '';
        let password = '';
        const pl = (await db.playlists.toArray()).find((p) => p.type === 'xtream' && p.username && p.password);
        if (pl) {
          serverUrl = pl.server_url;
          username = pl.username || '';
          password = pl.password || '';
        } else {
          const saved = await getSetting<any>('last_xtream_config', null);
          if (saved?.server_url && saved?.username && saved?.password) {
            serverUrl = saved.server_url;
            username = saved.username;
            password = saved.password;
          }
        }
        setSelectedMovieForDetails(targetChannel);
        setMovieServerCreds({
          serverUrl: serverUrl || targetChannel.stream_url,
          username: username || '',
          password: password || '',
        });
        return;
      }

      // ---- Native Android player (Live TV: reliable IPTV playback, no CORS, custom User-Agent) ----
      if (isNativePlayerAvailable()) {
        try {
          const playlist = filteredChannels.length > 0 ? filteredChannels : [targetChannel];
          const startIndex = Math.max(0, playlist.findIndex((c) => c.id === targetChannel.id));
          await NativePlayer.play({
            urls: playlist.map((c) => c.stream_url),
            titles: playlist.map((c) => c.name),
            index: startIndex,
            userAgent: NATIVE_PLAYER_USER_AGENT,
            isLive: targetChannel.stream_type === 'live',
          });
        } catch (err: any) {
          console.error('Native player error:', err);
          alert(`Lecture impossible : ${err?.message || err}`);
        }
        return;
      }

      // ---- Browser fallback (hls.js web player) ----
      if (activeChannel?.id === targetChannel.id && forceFullscreen) {
        setIsFullscreen(true);
      } else if (forceFullscreen) {
        setIsFullscreen(true);
      }
    },
    [filteredChannels, activeChannel, activeSection]
  );

  // Jump directly to channel by number
  const handleJumpToChannelNumber = useCallback(
    (channelNum: number) => {
      const idx = filteredChannels.findIndex((ch) => ch.num === channelNum);
      if (idx !== -1) {
        setFocusedChannelIndex(idx);
        handleSelectChannel(idx, isFullscreen);
      }
    },
    [filteredChannels, handleSelectChannel, isFullscreen]
  );

  // Toggle favorite
  const handleToggleFavorite = useCallback(
    async (targetChannelOrIndex: Channel | number) => {
      const ch =
        typeof targetChannelOrIndex === 'number'
          ? filteredChannels[targetChannelOrIndex]
          : targetChannelOrIndex;
      if (!ch) return;

      const newFavoriteState = !ch.is_favorite;
      await db.channels.update(ch.id, { is_favorite: newFavoriteState });

      // Update state
      setChannels((prev) =>
        prev.map((c) => (c.id === ch.id ? { ...c, is_favorite: newFavoriteState } : c))
      );

      // Recalculate favCount
      const count = await db.channels.filter((c) => Boolean(c.is_favorite)).count();
      setFavCount(count);

      // If viewing favorites, reload to update the view
      if (selectedCategory?.id === 'fav') {
        loadCategoryChannels(selectedCategory, channelSort);
      }

      // Auto-sync favorite to cloud if syncCode exists
      if (syncCode) {
        const favIds = (await db.channels.filter((c) => Boolean(c.is_favorite)).toArray()).map((c) => c.id);
        pushSyncToCloud(syncCode, { favorites: favIds });
      }
    },
    [filteredChannels, syncCode, selectedCategory, channelSort, loadCategoryChannels]
  );

  // Category selection
  const handleSelectCategory = (cat: Category, index: number, switchPane: boolean = false) => {
    setSelectedCategory(cat);
    setFocusedCategoryIndex(index);
    setFocusedChannelIndex(0);
    if (switchPane) {
      setActivePane('channels');
    }
    loadCategoryChannels(cat, channelSort);
  };

  // ==============================================================
  // ANDROID HIERARCHICAL BACK BUTTON & DOUBLE-PRESS TO EXIT
  // ==============================================================
  const handleAndroidBack = useCallback(() => {
    // -1. Startup update popup modal
    if (appUpdateInfo) {
      setAppUpdateInfo(null);
      return;
    }

    // -1b. Universal Search modal
    if (isSearchModalOpen) {
      setIsSearchModalOpen(false);
      return;
    }

    // 0. Movie details modal -> close movie page and return to movie catalog
    if (selectedMovieForDetails) {
      setSelectedMovieForDetails(null);
      return;
    }

    // 0b. Series details modal -> close series page and return to series list
    if (selectedSeriesForDetails) {
      setSelectedSeriesForDetails(null);
      return;
    }

    // 1. Fullscreen player -> exit fullscreen
    if (isFullscreen) {
      setIsFullscreen(false);
      return;
    }

    // 2. Modals -> close active modal
    if (isSettingsModalOpen) {
      setIsSettingsModalOpen(false);
      return;
    }
    if (isCategoryModalOpen) {
      setIsCategoryModalOpen(false);
      return;
    }
    if (isXtreamModalOpen) {
      setIsXtreamModalOpen(false);
      setEditingPlaylist(null);
      return;
    }
    if (isSyncModalOpen) {
      setIsSyncModalOpen(false);
      return;
    }

    // 3. Channels list pane -> go back to categories pane
    if (activePane === 'channels') {
      setActivePane('categories');
      return;
    }

    // 3b. Categories pane -> go back to sidebar menu pane
    if (activePane === 'categories') {
      setActivePane('menu');
      return;
    }

    // 4. Double back to exit application
    const now = Date.now();
    if (now - lastBackPressTimeRef.current < 2000) {
      if (Capacitor.isNativePlatform()) {
        CapApp.exitApp();
      }
    } else {
      lastBackPressTimeRef.current = now;
      setBackToastVisible(true);
      setTimeout(() => {
        setBackToastVisible(false);
      }, 2000);
    }
  }, [
    selectedSeriesForDetails,
    isFullscreen,
    isSettingsModalOpen,
    isCategoryModalOpen,
    isXtreamModalOpen,
    isSyncModalOpen,
    activePane,
  ]);

  // Register hardware Android Back button and webview history fallback
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let appListenerHandle: any = null;
    if (Capacitor.isNativePlatform()) {
      CapApp.addListener('backButton', () => {
        handleAndroidBack();
      }).then((h) => {
        appListenerHandle = h;
      });
    }

    const onPopState = (e: PopStateEvent) => {
      e.preventDefault();
      window.history.pushState(null, '', window.location.href);
      handleAndroidBack();
    };
    window.history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', onPopState);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.keyCode === 4) {
        e.preventDefault();
        handleAndroidBack();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      if (appListenerHandle) {
        appListenerHandle.remove();
      }
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [handleAndroidBack]);

  const isAnyModalOpen =
    isSplashVisible ||
    isSettingsModalOpen ||
    isSyncModalOpen ||
    isCategoryModalOpen ||
    isXtreamModalOpen ||
    isSearchModalOpen ||
    Boolean(appUpdateInfo) ||
    Boolean(selectedMovieForDetails) ||
    Boolean(selectedSeriesForDetails);

  // Register remote control D-Pad keyboard events with hierarchical back handler
  useTVNavigation({
    enabled: !isAnyModalOpen,
    activePane,
    setActivePane,
    channelCount: filteredChannels.length,
    categoryCount: sortedCategories.length,
    focusedCategoryIndex,
    setFocusedCategoryIndex,
    focusedChannelIndex,
    setFocusedChannelIndex,
    focusedMenuIndex,
    setFocusedMenuIndex,
    onSelectCategory: (idx, switchPane = false) => {
      const cat = sortedCategories[idx];
      if (cat) {
        handleSelectCategory(cat, idx, switchPane);
      }
    },
    onSelectChannel: handleSelectChannel,
    onToggleFavorite: (idx) => handleToggleFavorite(idx),
    onSelectMenuItem: (menuIdx) => {
      if (menuIdx === 0) handleSelectSection('live');
      else if (menuIdx === 1) handleSelectSection('vod');
      else if (menuIdx === 2) handleSelectSection('series');
      else if (menuIdx === 3) handleSelectSection('fav');
      else if (menuIdx === 4) setIsSearchModalOpen(true);
      else if (menuIdx === 5) setIsSettingsModalOpen(true);
      else if (menuIdx === 6) setIsSyncModalOpen(true);
    },
    isFullscreen,
    setIsFullscreen,
    onJumpToChannelNumber: handleJumpToChannelNumber,
    onJumpToCurrentCategory: () => {
      const idx = sortedCategories.findIndex((c) => c.id === selectedCategory?.id);
      if (idx >= 0) {
        setFocusedCategoryIndex(idx);
      }
    },
    onBack: handleAndroidBack,
  });



  // Save & Synchronize new playlist (Xtream / M3U) with chunked bulkPut to support 50k+ channels
  const handleSavePlaylist = async (
    data: any,
    onProgress: (step: string) => void
  ) => {
    await setSetting('user_deleted_all_playlists', false);
    let result: { playlist: PlaylistConfig; categories: Category[]; channels: Channel[] };

    if (data.type === 'xtream') {
      await setSetting('last_xtream_config', {
        server_url: data.server_url,
        username: data.username,
        password: data.password,
      });
      result = await syncXtreamPlaylist({
        serverUrl: data.server_url,
        username: data.username,
        password: data.password,
        name: data.name,
        onProgress,
      });
    } else {
      result = await parseM3UPlaylist({
        m3uUrl: data.m3u_url || data.server_url,
        name: data.name,
        onProgress,
      });
    }

    onProgress(`Enregistrement de ${result.channels.length} chaînes dans la mémoire locale...`);

    // Clean previous data to avoid duplicate or mixed playlists
    await db.playlists.clear();
    await db.categories.clear();
    await db.channels.clear();

    // Save playlist config
    await db.playlists.put(result.playlist);

    // Save real categories in Dexie
    await db.categories.bulkPut(result.categories);

    // Chunked channels save with individual put fallback to prevent SQLite / IndexedDB transaction limits & memory errors
    const CHUNK_SIZE = 500;
    for (let i = 0; i < result.channels.length; i += CHUNK_SIZE) {
      const chunk = result.channels.slice(i, i + CHUNK_SIZE);
      try {
        await db.channels.bulkPut(chunk);
      } catch (chunkErr) {
        console.warn('bulkPut chunk error, falling back to individual put:', chunkErr);
        for (const item of chunk) {
          try {
            await db.channels.put(item);
          } catch (itemErr) {
            console.error('Failed to put channel:', item.id, itemErr);
          }
        }
      }
      if (result.channels.length > 1000) {
        const percent = Math.min(100, Math.round(((i + chunk.length) / result.channels.length) * 100));
        onProgress(`Enregistrement local : ${percent}% (${Math.min(i + chunk.length, result.channels.length)}/${result.channels.length} chaînes)...`);
      }
    }

    // Reload categories from Dexie
    const loadedCats = await db.categories.orderBy('custom_order').toArray();
    const loadedPlaylists = await db.playlists.toArray();

    setCategories(loadedCats);
    setPlaylists(loadedPlaylists);
    setFavCount(0);
    startBackgroundLiveLoad(result.playlist, loadedCats);

    // Pick first non-fav category with channels (count > 0)
    let firstCat = loadedCats.find((c) => c.id !== 'fav' && (c.count || 0) > 0);
    if (!firstCat) {
      firstCat = loadedCats.find((c) => c.id !== 'fav') || loadedCats[0];
    }

    if (firstCat) {
      setSelectedCategory(firstCat);
      setFocusedCategoryIndex(0);
      setFocusedChannelIndex(0);
      await loadCategoryChannels(firstCat, channelSort);
    }

    // Select first real channel
    const firstChannel = result.channels[0];
    if (firstChannel) {
      setActiveChannel(firstChannel);
      setCurrentEpg({
        id: 'epg_' + firstChannel.id,
        channel_id: firstChannel.id,
        title: firstChannel.name + ' (En Direct)',
        description: 'Flux en direct de ' + firstChannel.name,
        start: new Date().toISOString(),
        end: new Date(Date.now() + 7200000).toISOString(),
        duration_min: 120,
      });
      setNextEpg(null);
      setIsStopped(false);
    }
  };

  // Open Xtream modal in edit mode with selected playlist data
  const handleOpenEditPlaylist = useCallback((pl: PlaylistConfig) => {
    setEditingPlaylist(pl);
    setIsSettingsModalOpen(false);
    setIsXtreamModalOpen(true);
  }, []);

  // Update playlist parameters (in-place or with full re-sync)
  const handleUpdatePlaylistSettings = useCallback(
    async (
      id: string,
      data: {
        type: 'xtream' | 'm3u';
        name: string;
        server_url: string;
        username?: string;
        password?: string;
        m3u_url?: string;
      },
      resync: boolean,
      onProgress: (step: string) => void
    ) => {
      const existing = await db.playlists.get(id);
      if (!existing) {
        throw new Error('Playlist introuvable dans la base locale.');
      }

      const oldServerUrl = existing.server_url;
      const oldUsername = existing.username;
      const oldPassword = existing.password;

      const updatedPl: PlaylistConfig = {
        ...existing,
        name: data.name,
        type: data.type,
        server_url: data.server_url,
        username: data.username,
        password: data.password,
        m3u_url: data.m3u_url,
      };

      if (data.type === 'xtream') {
        await setSetting('last_xtream_config', {
          server_url: data.server_url,
          username: data.username,
          password: data.password,
          name: data.name,
        });
      }

      await db.playlists.put(updatedPl);
      const allPls = await db.playlists.toArray();
      setPlaylists(allPls);

      if (resync) {
        onProgress('Lancement de la re-synchronisation complète...');
        await handleResyncPlaylist(updatedPl);
      } else {
        // Fast in-place credential/server URL update without re-downloading whole catalog
        if (
          data.type === 'xtream' &&
          oldServerUrl &&
          oldUsername &&
          oldPassword &&
          (oldServerUrl !== data.server_url ||
            oldUsername !== data.username ||
            oldPassword !== data.password)
        ) {
          onProgress('Mise à jour rapide des liens de flux...');
          await db.channels.toCollection().modify((ch) => {
            if (ch.stream_url) {
              if (oldServerUrl !== data.server_url && ch.stream_url.includes(oldServerUrl)) {
                ch.stream_url = ch.stream_url.replace(oldServerUrl, data.server_url);
              }
              if (oldUsername !== data.username && ch.stream_url.includes(`/${oldUsername}/`)) {
                ch.stream_url = ch.stream_url.replace(`/${oldUsername}/`, `/${data.username}/`);
              }
              if (oldPassword !== data.password && ch.stream_url.includes(`/${oldPassword}/`)) {
                ch.stream_url = ch.stream_url.replace(`/${oldPassword}/`, `/${data.password}/`);
              }
            }
          });

          if (activeChannel) {
            const freshActive = await db.channels.get(activeChannel.id);
            if (freshActive) {
              setActiveChannel(freshActive);
            }
          }
        }
        onProgress('Paramètres de playlist enregistrés avec succès !');
      }
    },
    [handleResyncPlaylist, activeChannel]
  );

  // Delete playlist handler
  const handleDeletePlaylist = async (id: string) => {
    bgLoadTokenRef.current++;
    setBgLoadStatus(null);
    await db.playlists.delete(id);
    const remainingPlaylists = await db.playlists.toArray();
    setPlaylists(remainingPlaylists);

    if (id === 'pl_demo_default' || remainingPlaylists.length === 0) {
      await setSetting('user_deleted_all_playlists', true);
      await setSetting('last_xtream_config', null);
      await db.categories.clear();
      await db.channels.clear();
      setCategories([]);
      setChannels([]);
      setActiveChannel(null);
      setSelectedCategory(null);
      setFavCount(0);
      setIsStopped(true);
    } else {
      const remainingCats = await db.categories.orderBy('custom_order').toArray();
      setCategories(remainingCats);
      const targetCat = remainingCats.find((c) => c.id !== 'fav' && (c.count || 0) > 0) || remainingCats[0] || null;
      setSelectedCategory(targetCat);
      if (targetCat) {
        await loadCategoryChannels(targetCat, channelSort);
      } else {
        setChannels([]);
        setActiveChannel(null);
      }
    }
  };

  // Restore demo playlist handler
  const handleRestoreDemoPlaylist = async () => {
    await setSetting('user_deleted_all_playlists', false);
    await db.categories.clear();
    await db.channels.clear();
    await db.categories.bulkAdd(INITIAL_CATEGORIES);
    await db.channels.bulkAdd(INITIAL_CHANNELS);

    const demoPlaylist: PlaylistConfig = {
      id: 'pl_demo_default',
      name: 'Chaînes Démo Gratuites',
      type: 'm3u',
      server_url: 'https://test-streams.mux.dev',
      status: 'active',
      channel_count: INITIAL_CHANNELS.length,
      last_sync_at: new Date().toISOString(),
    };
    await db.playlists.put(demoPlaylist);

    const loadedCats = await db.categories.orderBy('custom_order').toArray();
    const loadedPlaylists = await db.playlists.toArray();

    setCategories(loadedCats);
    setPlaylists(loadedPlaylists);
    setFavCount(0);

    const initialCat = loadedCats.find((c) => c.id === 'tnt') || loadedCats[0];
    setSelectedCategory(initialCat || null);
    if (initialCat) {
      await loadCategoryChannels(initialCat, channelSort);
    }

    const initialChannel = INITIAL_CHANNELS.find((ch) => ch.id === 'ch_tf1') || INITIAL_CHANNELS[0];
    if (initialChannel) {
      setActiveChannel(initialChannel);
      const epg = getMockEpgForChannel(initialChannel.id);
      setCurrentEpg(epg.current);
      setNextEpg(epg.next);
      setIsStopped(false);
    }
  };

  // Cloud Sync Handler
  const handleApplySyncCode = async (code: string) => {
    const data = await pullSyncFromCloud(code);
    if (!data) return false;

    if (data.favorites && data.favorites.length > 0) {
      await db.channels.toCollection().modify({ is_favorite: false });
      for (const favId of data.favorites) {
        await db.channels.update(favId, { is_favorite: true });
      }
      if (selectedCategory) {
        await loadCategoryChannels(selectedCategory, channelSort);
      }
      const count = await db.channels.filter((c) => Boolean(c.is_favorite)).count();
      setFavCount(count);
    }
    await setSetting('sync_code', code);
    setSyncCode(code);
    return true;
  };

  const handleForceSync = async () => {
    if (!syncCode) return;
    const favs = (await db.channels.filter((c) => Boolean(c.is_favorite)).toArray()).map((c) => c.id);
    const plList = await db.playlists.toArray();
    await pushSyncToCloud(syncCode, {
      favorites: favs,
      playlists: plList,
    });
  };

  const getCategoryIcon = (iconName?: string) => {
    switch (iconName) {
      case 'Star':
        return <Star className="w-3.5 h-3.5 text-amber-400" />;
      case 'Trophy':
        return <Trophy className="w-3.5 h-3.5 text-rose-400" />;
      case 'Film':
        return <Film className="w-3.5 h-3.5 text-purple-400" />;
      case 'Globe':
        return <Globe className="w-3.5 h-3.5 text-emerald-400" />;
      case 'Compass':
        return <Compass className="w-3.5 h-3.5 text-indigo-400" />;
      default:
        return <Tv className="w-3.5 h-3.5 text-sky-400" />;
    }
  };

  return (
    <main className="h-screen w-screen flex flex-col bg-tv-bg overflow-hidden font-tv select-none text-slate-100 relative">
      {/* ============================================================== */}
      {/* 1. MOBILE VIEW (Visible ONLY on Portrait Smartphones < 700px) */}
      {/* ============================================================== */}
      {isPortraitMobile && (
        <div className="flex flex-col h-full w-full bg-tv-bg overflow-hidden">
        {/* Top Video Player (Expands to fixed inset-0 if isFullscreen is active) */}
        <div
          className={`bg-black flex-shrink-0 transition-all ${
            isFullscreen
              ? 'fixed inset-0 z-50 w-screen h-screen'
              : 'w-full aspect-video relative'
          }`}
        >
          <LiveVideoPlayer
            channel={activeChannel}
            currentEpg={currentEpg}
            nextEpg={nextEpg}
            isFullscreen={isFullscreen}
            onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
            isStopped={isStopped}
            onTogglePlayStop={() => setIsStopped(!isStopped)}
          />
        </div>

        {/* Channel quick info bar under video */}
        <div className="px-4 py-2 bg-tv-surface border-b border-tv-border flex items-center justify-between flex-shrink-0">
          <div className="min-w-0 flex-1 mr-2">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-mono font-bold text-tv-accent">
                #{activeChannel?.num}
              </span>
              <h3 className="text-sm font-bold text-white truncate">
                {activeChannel?.name}
              </h3>
              {activeChannel?.resolution && (
                <span className="text-[9px] bg-sky-500/10 text-tv-accent border border-sky-500/20 px-1 rounded font-bold font-mono flex-shrink-0">
                  {activeChannel.resolution}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-300 truncate mt-0.5">
              {currentEpg?.title || 'Programme en direct'}
            </p>
          </div>

          <div className="flex items-center space-x-1.5 flex-shrink-0">
            <button
              onClick={() => setIsStopped(!isStopped)}
              className={`p-1.5 rounded-lg border transition ${
                isStopped
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                  : 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border-rose-500/20'
              }`}
              title={isStopped ? 'Reprendre le direct' : 'Arrêter le flux'}
            >
              {isStopped ? (
                <Play className="w-4 h-4 fill-emerald-400" />
              ) : (
                <Square className="w-4 h-4 fill-rose-400" />
              )}
            </button>
            <button
              onClick={() => activeChannel && handleToggleFavorite(activeChannel)}
              className="p-1.5 text-slate-400 hover:text-amber-400 transition"
              title="Favori"
            >
              <Star className={`w-5 h-5 ${activeChannel?.is_favorite ? 'fill-amber-400 text-amber-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* Category Header & Quick Channel Sort Bar */}
        <div className="px-3 py-1.5 bg-tv-surface/90 border-b border-tv-border flex items-center justify-between flex-shrink-0">
          <button
            onClick={() => setIsCategoryModalOpen(true)}
            className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-tv-card hover:bg-tv-cardHover border border-tv-border text-left transition min-w-0 mr-2"
          >
            <Layers className="w-4 h-4 text-tv-accent flex-shrink-0" />
            <span className="text-xs font-bold text-white truncate max-w-[130px]">
              {selectedCategory?.name || 'Groupes'}
            </span>
            <span className="text-[10px] text-slate-400 font-mono flex-shrink-0">
              ({filteredChannels.length})
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-0.5 flex-shrink-0" />
          </button>

          {/* Quick channel sort buttons */}
          <div className="flex items-center space-x-1 bg-black/40 p-0.5 rounded-lg border border-white/5 text-[10px] flex-shrink-0">
            <button
              onClick={() => handleChannelSortChange('playlist')}
              className={`px-2 py-0.5 rounded font-semibold transition ${
                channelSort === 'playlist' ? 'bg-tv-focus text-white' : 'text-slate-400 hover:text-white'
              }`}
              title="Ordre Playlist (défaut)"
            >
              Playlist
            </button>
            <button
              onClick={() => handleChannelSortChange('alpha')}
              className={`px-2 py-0.5 rounded font-semibold transition ${
                channelSort === 'alpha' ? 'bg-tv-focus text-white' : 'text-slate-400 hover:text-white'
              }`}
              title="Alphabétique A à Z"
            >
              A-Z
            </button>
            <button
              onClick={() => handleChannelSortChange('num')}
              className={`px-2 py-0.5 rounded font-semibold transition ${
                channelSort === 'num' ? 'bg-tv-focus text-white' : 'text-slate-400 hover:text-white'
              }`}
              title="Numéro de chaîne"
            >
              N°
            </button>
          </div>
        </div>

        {/* Horizontal Category Pills */}
        <div className="flex items-center space-x-2 px-3 py-2 bg-tv-surface/40 border-b border-tv-border overflow-x-auto scrollbar-none flex-shrink-0">
          {sortedCategories.map((cat, idx) => {
            const isSelected = selectedCategory?.id === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => handleSelectCategory(cat, idx, true)}
                className={`flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                  isSelected
                    ? 'bg-tv-focus text-white shadow-md'
                    : 'bg-tv-card text-slate-400 hover:text-white border border-tv-border/60'
                }`}
              >
                {getCategoryIcon(cat.icon)}
                <span>{cat.name}</span>
                {cat.count > 0 && <span className="text-[10px] opacity-75 font-mono">({cat.count})</span>}
              </button>
            );
          })}
        </div>

        {/* Full-width Channel & VOD List */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
          {isLoadingCategory ? (
            <div className="py-16 flex flex-col items-center justify-center text-center space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-tv-accent" />
              <p className="text-xs text-slate-300 font-semibold">Chargement des flux en cours...</p>
              <p className="text-[11px] text-slate-500">Connexion rapide au serveur IPTV</p>
            </div>
          ) : filteredChannels.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-3 px-4">
              <AlertCircle className="w-8 h-8 text-sky-400" />
              <p className="text-sm font-bold text-white">
                {sortedCategories.length === 0
                  ? activeSection === 'vod'
                    ? 'Aucune catégorie de films dans cet abonnement'
                    : activeSection === 'series'
                    ? 'Aucune catégorie de séries dans cet abonnement'
                    : 'Aucun bouquet disponible'
                  : activeSection === 'vod'
                  ? 'Aucun film dans ce bouquet'
                  : activeSection === 'series'
                  ? 'Aucune série dans ce bouquet'
                  : 'Aucune chaîne dans ce bouquet'}
              </p>
              <p className="text-xs text-slate-400 max-w-xs">
                {categoryError
                  ? categoryError
                  : sortedCategories.length === 0
                  ? 'Vous pouvez recharger votre playlist pour récupérer tous vos bouquets TV, Films et Séries.'
                  : 'Si vos flux ne sont pas encore apparus en mémoire, vous pouvez les recharger en un clic.'}
              </p>
              <button
                onClick={() => handleResyncPlaylist()}
                disabled={isResyncing}
                className="px-4 py-2 bg-tv-focus hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition flex items-center space-x-2 shadow-lg disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isResyncing ? 'animate-spin' : ''}`} />
                <span>{isResyncing ? 'Chargement en cours...' : 'Recharger maintenant'}</span>
              </button>
            </div>
          ) : (
            filteredChannels.map((ch, idx) => {
              const isActive = activeChannel?.id === ch.id;
              const chEpg = getMockEpgForChannel(ch.id);
              const isVodOrSeries = ch.stream_type === 'vod' || ch.stream_type === 'series' || activeSection === 'vod' || activeSection === 'series';

              return (
                <div
                  key={ch.id}
                  onClick={() => {
                    setFocusedChannelIndex(idx);
                    handleSelectChannel(ch, false);
                  }}
                  className={`flex items-center justify-between p-3 rounded-xl border transition cursor-pointer ${
                    isActive
                      ? 'bg-tv-card border-tv-accent shadow-md'
                      : 'bg-tv-card/50 border-tv-border/50 text-slate-300 hover:bg-tv-cardHover'
                  }`}
                >
                  <div className="flex items-center space-x-3 min-w-0 flex-1">
                    <span className={`text-xs font-mono font-bold w-6 text-right flex-shrink-0 ${isActive ? 'text-tv-accent' : 'text-slate-500'}`}>
                      {ch.num}
                    </span>
                    <div className={`${isVodOrSeries ? 'w-10 h-14' : 'w-10 h-10'} rounded-lg bg-black/40 border border-white/5 flex items-center justify-center flex-shrink-0 overflow-hidden`}>
                      {ch.logo ? (
                        <img
                          src={ch.logo}
                          alt={ch.name}
                          className={`w-full h-full ${isVodOrSeries ? 'object-cover' : 'object-contain p-1'}`}
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : isVodOrSeries ? (
                        <Film className="w-5 h-5 text-slate-500" />
                      ) : (
                        <span className="text-xs font-bold text-slate-400">
                          {ch.name.slice(0, 3)}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center space-x-2">
                        <h4 className="text-sm font-semibold truncate text-white">
                          {ch.name}
                        </h4>
                        {ch.resolution && (
                          <span className="text-[9px] bg-sky-500/10 text-tv-accent border border-sky-500/20 px-1 rounded font-bold font-mono">
                            {ch.resolution}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 truncate mt-0.5">
                        {isVodOrSeries
                          ? (ch.stream_type === 'series' ? 'Série complète VOD' : 'Film disponible en lecture instantanée')
                          : chEpg.current.title}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleFavorite(ch);
                    }}
                    className="p-2 text-slate-400 hover:text-amber-400 flex-shrink-0 ml-1"
                  >
                    <Star className={`w-4 h-4 ${ch.is_favorite ? 'fill-amber-400 text-amber-400' : ''}`} />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Mobile Bottom Navigation Bar (5 Main Sections) */}
        <div className="h-14 bg-tv-surface border-t border-tv-border flex items-center justify-around px-1 flex-shrink-0">
          {/* 1. Direct */}
          <button
            onClick={() => handleSelectSection('live')}
            className={`flex flex-col items-center justify-center flex-1 py-1 transition ${
              activeSection === 'live' ? 'text-tv-accent font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Tv className="w-4 h-4" />
            <span className="text-[10px] mt-0.5">Direct</span>
          </button>

          {/* 2. Films (VOD) */}
          <button
            onClick={() => handleSelectSection('vod')}
            className={`flex flex-col items-center justify-center flex-1 py-1 transition ${
              activeSection === 'vod' ? 'text-purple-400 font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Film className="w-4 h-4" />
            <span className="text-[10px] mt-0.5">Films</span>
          </button>

          {/* 3. Séries */}
          <button
            onClick={() => handleSelectSection('series')}
            className={`flex flex-col items-center justify-center flex-1 py-1 transition ${
              activeSection === 'series' ? 'text-pink-400 font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Clapperboard className="w-4 h-4" />
            <span className="text-[10px] mt-0.5">Séries</span>
          </button>

          {/* 4. Favoris */}
          <button
            onClick={() => handleSelectSection('fav')}
            className={`flex flex-col items-center justify-center flex-1 py-1 transition ${
              activeSection === 'fav' ? 'text-amber-400 font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Star className="w-4 h-4" />
            <span className="text-[10px] mt-0.5">Favoris</span>
          </button>

          {/* 5. Paramètres */}
          <button
            onClick={() => setIsSettingsModalOpen(true)}
            className="flex flex-col items-center justify-center flex-1 py-1 text-slate-400 hover:text-tv-accent transition"
          >
            <Settings className="w-4 h-4" />
            <span className="text-[10px] mt-0.5 font-bold">Paramètres</span>
          </button>
        </div>
      </div>
      )}

      {/* ============================================================== */}
      {/* 2. TV / LANDSCAPE VIEW (Android TV 16:9, Tablets, Monitors)   */}
      {/* ============================================================== */}
      {!isPortraitMobile && (
        <div className="flex flex-col h-full w-full">
          <TopBar
            currentCategoryName={selectedCategory?.name}
            onToggleFullscreen={() => setIsFullscreen(true)}
          />

          <div className="flex-1 flex overflow-hidden">
            <NavigationSidebar
              activeSection={activeSection}
              onSelectSection={(sec) => handleSelectSection(sec as any)}
              activePane={activePane}
              focusedMenuIndex={focusedMenuIndex}
              onOpenSyncModal={() => setIsSyncModalOpen(true)}
              onOpenSettingsModal={() => setIsSettingsModalOpen(true)}
              onOpenSearchModal={() => setIsSearchModalOpen(true)}
            />

            <TVGuide
              categories={sortedCategories}
              channels={filteredChannels}
              selectedCategory={selectedCategory}
              focusedCategoryIndex={focusedCategoryIndex}
              focusedChannelIndex={focusedChannelIndex}
              activeChannel={activeChannel}
              currentEpg={currentEpg}
              nextEpg={nextEpg}
              activePane={activePane}
              onSelectCategory={(cat, idx, switchPane = true) => handleSelectCategory(cat, idx, switchPane)}
              onSelectChannel={(ch, idx) => {
                setFocusedChannelIndex(idx);
                handleSelectChannel(idx, false);
              }}
              onToggleFavorite={handleToggleFavorite}
              onOpenSyncModal={() => setIsSyncModalOpen(true)}
              onOpenXtreamModal={() => {
                setEditingPlaylist(null);
                setIsXtreamModalOpen(true);
              }}
              onOpenSearch={() => setIsSearchModalOpen(true)}
              onToggleFullscreen={() => {
                if (isNativePlayerAvailable() && activeChannel) {
                  handleSelectChannel(activeChannel, true);
                } else {
                  setIsFullscreen(true);
                }
              }}
              isStopped={isStopped}
              onTogglePlayStop={() => setIsStopped(!isStopped)}
              categorySort={categorySort}
              onCategorySortChange={handleCategorySortChange}
              channelSort={channelSort}
              onChannelSortChange={handleChannelSortChange}
            />
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 3. MODALS (Settings Hub, Category Drawer, Xtream & Sync)       */}
      {/* ============================================================== */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        syncCode={syncCode}
        playlists={playlists}
        onOpenXtreamModal={() => {
          setEditingPlaylist(null);
          setIsXtreamModalOpen(true);
        }}
        onOpenSyncModal={() => setIsSyncModalOpen(true)}
        onDeletePlaylist={handleDeletePlaylist}
        onRestoreDemoPlaylist={handleRestoreDemoPlaylist}
        onResyncPlaylist={handleResyncPlaylist}
        onEditPlaylist={handleOpenEditPlaylist}
        isResyncing={isResyncing}
        currentBuildNumber={24}
        categorySort={categorySort}
        onCategorySortChange={handleCategorySortChange}
        channelSort={channelSort}
        onChannelSortChange={handleChannelSortChange}
        autoRefreshInterval={autoRefreshInterval}
        onAutoRefreshIntervalChange={handleAutoRefreshIntervalChange}
        lastAutoRefreshAt={lastAutoRefreshAt}
        onTriggerSilentRefresh={triggerSilentRefresh}
        isSilentRefreshing={isSilentRefreshing}
      />

      <CategoryDrawerModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        categories={sortedCategories}
        selectedCategory={selectedCategory}
        onSelectCategory={(cat, idx) => handleSelectCategory(cat, idx, true)}
        categorySort={categorySort}
        onCategorySortChange={handleCategorySortChange}
      />

      <XtreamModal
        isOpen={isXtreamModalOpen}
        onClose={() => {
          setIsXtreamModalOpen(false);
          setEditingPlaylist(null);
        }}
        onSavePlaylist={handleSavePlaylist}
        initialPlaylist={editingPlaylist}
        onUpdatePlaylist={handleUpdatePlaylistSettings}
      />

      <SyncModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        currentSyncCode={syncCode}
        onApplySyncCode={handleApplySyncCode}
        onForceSync={handleForceSync}
      />

      {/* Series Detail Full Page Modal (Seasons & Episodes) */}
      {selectedSeriesForDetails && seriesServerCreds && (
        <SeriesDetailModal
          series={selectedSeriesForDetails}
          serverUrl={seriesServerCreds.serverUrl}
          username={seriesServerCreds.username}
          password={seriesServerCreds.password}
          onClose={() => setSelectedSeriesForDetails(null)}
          onPlayEpisode={handlePlaySeriesEpisode}
        />
      )}

      {/* Movie Detail Modal (Intermediate sheet before playback + Actor filmography) */}
      {selectedMovieForDetails && movieServerCreds && (
        <MovieDetailModal
          movie={selectedMovieForDetails}
          serverUrl={movieServerCreds.serverUrl}
          username={movieServerCreds.username}
          password={movieServerCreds.password}
          onClose={() => setSelectedMovieForDetails(null)}
          onPlay={handlePlayMovie}
          onSelectAnotherMovie={handleSelectAnotherMovie}
        />
      )}

      {/* Universal Search Modal (Fast instant search across Live TV, Movies & Series) */}
      <SearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        onSelectChannel={(ch) => handleSelectChannel(ch, true)}
        onSelectMovie={(movie) => handleSelectChannel(movie, false)}
        onSelectSeries={(series) => handleSelectChannel(series, false)}
      />

      {/* Startup Update Alert Modal (Automatically triggered if a newer build is released) */}
      <UpdatePopupModal
        updateInfo={appUpdateInfo}
        onClose={() => setAppUpdateInfo(null)}
      />

      {/* Floating Status & Back Toast Notifications */}
      {syncStatusBanner && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-sky-950/95 text-sky-200 border border-sky-500/50 px-4 py-2.5 rounded-xl text-xs font-semibold shadow-2xl flex items-center space-x-2 backdrop-blur-md animate-fade-in pointer-events-none">
          <RefreshCw className="w-4 h-4 animate-spin text-sky-400" />
          <span>{syncStatusBanner}</span>
        </div>
      )}

      {!syncStatusBanner && bgLoadStatus && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-emerald-950/95 text-emerald-200 border border-emerald-500/50 px-4 py-2 rounded-xl text-[11px] font-semibold shadow-2xl flex items-center space-x-2 backdrop-blur-md animate-fade-in pointer-events-none">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
          <span>{bgLoadStatus}</span>
        </div>
      )}

      {backToastVisible && (
        <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 text-white text-xs font-semibold px-4 py-2 rounded-full border border-tv-border shadow-2xl backdrop-blur-md animate-fade-in pointer-events-none">
          Appuyez à nouveau pour quitter KeoTV
        </div>
      )}

      {/* Launch Splash Screen with Official KeoTV Logo */}
      <SplashScreen isVisible={isSplashVisible} isFading={isSplashFading} />
    </main>
  );
}
