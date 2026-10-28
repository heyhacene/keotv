'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { db, getSetting, setSetting, getFavoriteChannelIds, saveFavoriteChannelId } from '@/lib/db';
import { INITIAL_CATEGORIES, INITIAL_CHANNELS, getMockEpgForChannel } from '@/lib/mock-data';
import { Channel, Category, EpgProgram, NavigationPane, PlaylistConfig } from '@/types/iptv';
import { useTVNavigation } from '@/lib/use-tv-navigation';
import { NavigationSidebar } from '@/components/NavigationSidebar';
import { TopBar } from '@/components/TopBar';
import { TVGuide, buildProgramSlotsForChannel } from '@/components/TVGuide';
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
import { ContextMenuModal } from '@/components/ContextMenuModal';
import { CategoryManagerModal } from '@/components/CategoryManagerModal';
import { ParentalPinModal } from '@/components/ParentalPinModal';
import { CatchupModal } from '@/components/CatchupModal';
import { checkForAppUpdate, AppUpdateInfo, CURRENT_BUILD_NUMBER } from '@/lib/update-service';
import { pushSyncToCloud, pullSyncFromCloud } from '@/lib/supabase';
import {
  syncXtreamPlaylist,
  parseM3UPlaylist,
  fetchCategoryStreamsOnDemand,
  resolveSeriesEpisodes,
  loadAllLiveCategories,
  loadAllVodCategories,
  fetchAllSeriesCatalog,
  fetchRecentlyAddedVod,
  SeriesEpisode,
  isSeparatorChannel,
  isAdultCategoryName,
  shouldExcludeChannelByPrefix,
} from '@/lib/iptv-service';
import { buildForYouVod, getTopGenreNames } from '@/lib/recommendations';
import { NativePlayer, isNativePlayerAvailable, NATIVE_PLAYER_USER_AGENT } from '@/lib/native-player';
import { EPGService } from '@/lib/epg-service';
import { CatchupService } from '@/lib/catchup-service';

import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { Star, Tv, Film, Clapperboard, Settings, RefreshCw, Trophy, Globe, Compass, ChevronDown, Layers, Sparkles, Play, Square, ArrowUpDown, AlertCircle, Loader2, Search, Sliders, Maximize, Smartphone, RotateCw } from 'lucide-react';

export default function KeoTVHome() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [playlists, setPlaylists] = useState<PlaylistConfig[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [favCount, setFavCount] = useState<number>(0);
  const [favCounts, setFavCounts] = useState<{ live: number; vod: number; series: number; total: number }>({
    live: 0,
    vod: 0,
    series: 0,
    total: 0,
  });

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
  const [focusedCategoryHeaderIndex, setFocusedCategoryHeaderIndex] = useState<number>(2);
  const [focusedChannelHeaderIndex, setFocusedChannelHeaderIndex] = useState<number>(0);
  const [focusedRightPanelIndex, setFocusedRightPanelIndex] = useState<number>(0);
  const [focusedMenuIndex, setFocusedMenuIndex] = useState<number>(0);
  const [focusedProgramOffset, setFocusedProgramOffset] = useState<number>(0);
  const [isPastUnlocked, setIsPastUnlocked] = useState<boolean>(false);

  // Responsive Layout Mode: 'mobile-portrait' | 'mobile-landscape' | 'tv'
  const [layoutMode, setLayoutMode] = useState<'tv' | 'mobile-portrait' | 'mobile-landscape'>('tv');
  const [forcedOrientation, setForcedOrientation] = useState<'portrait' | 'landscape' | null>(null);

  useEffect(() => {
    // If user is accessing from a regular PC web browser (Vercel) outside of the Android/iOS native app,
    // redirect them to the Web Configuration Dashboard where they can manage their playlists comfortably!
    if (typeof window !== 'undefined' && !Capacitor.isNativePlatform()) {
      const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
      const isMobile = /Android|iPhone|iPad|iPod/i.test(ua);
      if (!isMobile && window.location.pathname === '/' && !window.location.search.includes('player=true')) {
        window.location.replace('/sync');
        return;
      }
    }
  }, []);

  useEffect(() => {
    const updateLayoutMode = () => {
      if (typeof window === 'undefined') return;

      const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
      const injectedTvFlag = (window as any).__KEOTV_IS_TV__;

      // IMPORTANT: Never use /Mobi/i here because Android TV Chromium WebView includes "Mobile Safari/537.36" in its UA!
      const isExplicitMobileUa =
        injectedTvFlag === false || /KeoTV-Mobile|iPhone|iPod/i.test(ua);
      const isTvDevice =
        injectedTvFlag === true ||
        (!isExplicitMobileUa &&
          /KeoTV-AndroidTV|Android TV|GoogleTV|Large Screen|AFT|BRAVIA|MiBox|SHIELD|PhilipsTV|SmartTV|Sony/i.test(ua));
      const isTouch =
        'ontouchstart' in window || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);

      // Dedicated Android TV hardware or any non-touch device (TV boxes, Fire TV, PC) ALWAYS stays in full TV mode!
      if (isTvDevice || (!isTouch && !isExplicitMobileUa)) {
        setLayoutMode('tv');
        return;
      }

      // Check if user manually forced portrait or landscape via in-app button
      if (forcedOrientation === 'portrait') {
        setLayoutMode('mobile-portrait');
        return;
      }
      if (forcedOrientation === 'landscape') {
        setLayoutMode('mobile-landscape');
        return;
      }

      const width = window.innerWidth;
      const height = window.innerHeight;
      const isPortrait = height > width;

      if (isPortrait) {
        // Vertical phone or portrait tablet -> Mobile Portrait
        setLayoutMode('mobile-portrait');
      } else {
        // Horizontal orientation on a touchscreen mobile device:
        if (isExplicitMobileUa || height < 520) {
          setLayoutMode('mobile-landscape');
        } else {
          // Large tablet, desktop widescreen monitor, or TV
          setLayoutMode('tv');
        }
      }
    };

    updateLayoutMode();
    window.addEventListener('resize', updateLayoutMode);
    window.addEventListener('orientationchange', updateLayoutMode);

    if (typeof screen !== 'undefined' && screen.orientation) {
      screen.orientation.addEventListener('change', updateLayoutMode);
    }

    return () => {
      window.removeEventListener('resize', updateLayoutMode);
      window.removeEventListener('orientationchange', updateLayoutMode);
      if (typeof screen !== 'undefined' && screen.orientation) {
        screen.orientation.removeEventListener('change', updateLayoutMode);
      }
    };
  }, [forcedOrientation]);

  const isPortraitMobile = layoutMode === 'mobile-portrait';
  const isLandscapeMobile = layoutMode === 'mobile-landscape';
  const isTvMode = layoutMode === 'tv';

  const handleToggleOrientation = useCallback(() => {
    if (layoutMode === 'mobile-portrait') {
      setForcedOrientation('landscape');
      try {
        if (typeof screen !== 'undefined' && (screen.orientation as any)?.lock) {
          (screen.orientation as any).lock('landscape').catch(() => {});
        }
      } catch {}
    } else {
      setForcedOrientation('portrait');
      try {
        if (typeof screen !== 'undefined' && (screen.orientation as any)?.lock) {
          (screen.orientation as any).lock('portrait').catch(() => {});
        } else if (typeof screen !== 'undefined' && screen.orientation?.unlock) {
          screen.orientation.unlock();
        }
      } catch {}
    }
  }, [layoutMode]);

  const getEpgProgressPercent = (epg: EpgProgram | null) => {
    if (!epg || !epg.start || !epg.end) return 0;
    try {
      const now = new Date();
      const [startH, startM] = epg.start.split(':').map(Number);
      const [endH, endM] = epg.end.split(':').map(Number);
      const startMin = startH * 60 + startM;
      let endMin = endH * 60 + endM;
      if (endMin < startMin) endMin += 24 * 60; // spans across midnight
      const nowMin = now.getHours() * 60 + now.getMinutes();
      if (nowMin < startMin) return 0;
      if (nowMin > endMin) return 100;
      return Math.round(((nowMin - startMin) / (endMin - startMin)) * 100);
    } catch {
      return 50;
    }
  };

  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isStopped, setIsStopped] = useState<boolean>(false);

  const [currentEpg, setCurrentEpg] = useState<EpgProgram | null>(null);
  const [nextEpg, setNextEpg] = useState<EpgProgram | null>(null);
  const [channelEpgMap, setChannelEpgMap] = useState<Record<string, EpgProgram[]>>({});

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

  // Category manager & contextual actions
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState<boolean>(false);
  const [contextMenuItem, setContextMenuItem] = useState<Channel | null>(null);
  const [contextMenuCategory, setContextMenuCategory] = useState<Category | null>(null);
  const [isContextMenuOpen, setIsContextMenuOpen] = useState<boolean>(false);

  // Catchup / Replay Modal state
  const [isCatchupModalOpen, setIsCatchupModalOpen] = useState<boolean>(false);
  const [catchupTargetChannel, setCatchupTargetChannel] = useState<Channel | null>(null);

  // Parental lock & PIN states
  const [isParentalPinModalOpen, setIsParentalPinModalOpen] = useState<boolean>(false);
  const [parentalPin, setParentalPin] = useState<string>('0000');
  const [parentalEnabled, setParentalEnabled] = useState<boolean>(false);
  const [parentalHideAdult, setParentalHideAdult] = useState<boolean>(false);
  const [unlockedAdultSession, setUnlockedAdultSession] = useState<boolean>(false);
  const [pendingCategoryToUnlock, setPendingCategoryToUnlock] = useState<Category | null>(null);
  const [pendingChannelToUnlock, setPendingChannelToUnlock] = useState<Channel | null>(null);

  // Channel classification, prefix exclusions, and favorite section toggles
  const [showFavoritesCategory, setShowFavoritesCategory] = useState<boolean>(true);
  const [singleStreamMode, setSingleStreamMode] = useState<boolean>(false);
  const [osdDuration, setOsdDuration] = useState<'2s' | '3s' | '5s' | '7s' | '10s' | 'manual'>('5s');
  const [excludedPrefixes, setExcludedPrefixes] = useState<string[]>([]);
  const [hiddenChannelIds, setHiddenChannelIds] = useState<Set<string>>(new Set());
  const [watchedPositions, setWatchedPositions] = useState<Array<{ id: string; title: string; url: string; poster?: string; position: number; duration: number; stream_type: 'vod' | 'series' }>>([]);

  const osdTimeoutMs = useMemo(() => {
    switch (osdDuration) {
      case '2s': return 2000;
      case '3s': return 3000;
      case '5s': return 5000;
      case '7s': return 7000;
      case '10s': return 10000;
      case 'manual': return 0;
      default: return 5000;
    }
  }, [osdDuration]);

  // List boundary hit state for carousel blockage feedback
  const [boundaryHit, setBoundaryHit] = useState<{
    pane: string;
    boundary: 'top' | 'bottom';
    time: number;
  } | null>(null);

  // Toast notification state
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 2800);
  }, []);

  // Active Xtream server credentials for rich metadata retrieval
  const activeXtreamCreds = useMemo(() => {
    const pl = playlists.find((p) => p.type === 'xtream' && p.username && p.password);
    if (pl) {
      return { serverUrl: pl.server_url, username: pl.username || '', password: pl.password || '' };
    }
    return null;
  }, [playlists]);

  // Startup Update Check state & auto-check
  const [appUpdateInfo, setAppUpdateInfo] = useState<AppUpdateInfo | null>(null);

  useEffect(() => {
    checkForAppUpdate(CURRENT_BUILD_NUMBER).then((info) => {
      if (info && info.hasUpdate) {
        setAppUpdateInfo(info);
      }
    });

    getSetting('parental_pin', '0000').then((pin) => setParentalPin(pin || '0000'));
    getSetting('parental_enabled', false).then((en) => setParentalEnabled(Boolean(en)));
    getSetting('parental_hide_adult', false).then((hd) => setParentalHideAdult(Boolean(hd)));
    getSetting('show_favorites_category', true).then((show) => setShowFavoritesCategory(show ?? true));
    getSetting('single_stream_mode', false).then((sm) => setSingleStreamMode(Boolean(sm)));
    getSetting('osd_duration', '5s').then((d) => setOsdDuration((d as any) || '5s'));
    getSetting<string[]>('excluded_prefixes', []).then((prefixes) => setExcludedPrefixes(prefixes || []));
    getSetting<string[]>('hidden_channel_ids', []).then((ids) => setHiddenChannelIds(new Set(ids || [])));

    // Load watched positions for VOD / series resume
    try {
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('keotv_watched_history');
        if (stored) {
          setWatchedPositions(JSON.parse(stored));
        }
      }
    } catch {}
  }, []);

  // Recalculate favorite counts by universe (live, vod, series, total)
  const updateFavoriteCounts = useCallback(async () => {
    try {
      const favs = await db.channels.filter((c) => Boolean(c.is_favorite)).toArray();
      let live = 0;
      let vod = 0;
      let series = 0;
      for (const c of favs) {
        if (c.stream_type === 'vod') vod++;
        else if (c.stream_type === 'series') series++;
        else live++;
      }
      const counts = { live, vod, series, total: favs.length };
      setFavCounts(counts);
      setFavCount(favs.length);
      return counts;
    } catch (e) {
      return { live: 0, vod: 0, series: 0, total: 0 };
    }
  }, []);

  // Universe-specific favorite categories
  const favSeriesCategory: Category = useMemo(
    () => ({
      id: 'fav_series',
      name: '⭐ Séries favorites',
      type: 'series',
      count: favCounts.series,
      icon: 'Clapperboard',
      is_hidden: false,
      custom_order: -100,
    }),
    [favCounts.series]
  );

  const favVodCategory: Category = useMemo(
    () => ({
      id: 'fav_vod',
      name: '⭐ Films favoris',
      type: 'vod',
      count: favCounts.vod,
      icon: 'Film',
      is_hidden: false,
      custom_order: -100,
    }),
    [favCounts.vod]
  );

  const favLiveCategory: Category = useMemo(
    () => ({
      id: 'fav_live',
      name: '⭐ Chaînes favorites',
      type: 'live',
      count: favCounts.live,
      icon: 'Tv',
      is_hidden: false,
      custom_order: -100,
    }),
    [favCounts.live]
  );

  const favAllCategory: Category = useMemo(
    () => ({
      id: 'fav',
      name: '⭐ Tous les favoris',
      type: 'live',
      count: favCounts.total,
      icon: 'Star',
      is_hidden: false,
      custom_order: -99,
    }),
    [favCounts.total]
  );

  // Dedicated VOD Category: "Récemment ajoutés" (strictly sorted by provider addition date)
  const vodRecentCategory: Category = useMemo(
    () => ({
      id: 'vod_recent_added',
      name: '🕐 Récemment ajoutés',
      type: 'vod',
      count: 0,
      icon: 'Clock',
      is_hidden: false,
      custom_order: -95,
    }),
    []
  );

  // Dedicated VOD Category: "Pour vous" (intelligent local recommendation based on playback history)
  const vodForYouCategory: Category = useMemo(
    () => ({
      id: 'vod_for_you',
      name: '✨ Pour vous',
      type: 'vod',
      count: 0,
      icon: 'Sparkles',
      is_hidden: false,
      custom_order: -98,
    }),
    []
  );

  const categoryLoadTokenRef = useRef<number>(0);

  // Channel loader for the selected category from IndexedDB with multi-tier lookup & on-demand fetch
  const loadCategoryChannels = useCallback(
    async (cat: Category | null, sortMode: 'playlist' | 'alpha' | 'num' = channelSort) => {
      if (!cat) {
        setChannels([]);
        return;
      }

      const token = ++categoryLoadTokenRef.current;
      setIsLoadingCategory(true);
      setCategoryError(null);
      try {
        let rawList: Channel[] = [];
        if (cat.id === 'fav' || cat.id === 'fav_all') {
          rawList = await db.channels.filter((c) => Boolean(c.is_favorite)).toArray();
        } else if (cat.id === 'fav_series') {
          rawList = await db.channels
            .filter((c) => Boolean(c.is_favorite) && c.stream_type === 'series')
            .toArray();
        } else if (cat.id === 'fav_vod') {
          rawList = await db.channels
            .filter((c) => Boolean(c.is_favorite) && c.stream_type === 'vod')
            .toArray();
        } else if (cat.id === 'fav_live') {
          rawList = await db.channels
            .filter((c) => Boolean(c.is_favorite) && (c.stream_type === 'live' || !c.stream_type))
            .toArray();
        } else if (cat.id === 'vod_for_you') {
          // "Pour vous": local affinity recommendation based on playback history & preferred genres
          const recs = await buildForYouVod(150);
          if (recs.length > 0) {
            rawList = recs;
          } else {
            // Fallback to recently added if no playback history exists yet
            const currentPlaylists = await db.playlists.toArray();
            let activePl = currentPlaylists.find(
              (p) => p.type === 'xtream' && p.server_url && p.username && p.password
            );
            if (!activePl) {
              const savedConfig = await getSetting<any>('last_xtream_config', null);
              if (savedConfig?.server_url && savedConfig?.username && savedConfig?.password) {
                activePl = savedConfig;
              }
            }
            if (activePl?.server_url) {
              rawList = await fetchRecentlyAddedVod({
                serverUrl: activePl.server_url,
                username: activePl.username,
                password: activePl.password,
                limit: 150,
              });
            }
          }
        } else if (cat.id === 'vod_recent_added') {
          // "Récemment ajoutés": strictly sorted by date the provider added the stream (Xtream `added`)
          const currentPlaylists = await db.playlists.toArray();
          let activePl = currentPlaylists.find(
            (p) => p.type === 'xtream' && p.server_url && p.username && p.password
          );
          if (!activePl) {
            const savedConfig = await getSetting<any>('last_xtream_config', null);
            if (savedConfig?.server_url && savedConfig?.username && savedConfig?.password) {
              activePl = savedConfig;
            }
          }
          if (activePl?.server_url) {
            rawList = await fetchRecentlyAddedVod({
              serverUrl: activePl.server_url,
              username: activePl.username,
              password: activePl.password,
              limit: 250,
            });
          }
        } else {
          // Tier 1: exact group_id indexed match (e.g. grp_live_123, grp_vod_456, grp_series_789)
          rawList = await db.channels.where('group_id').equals(cat.id).toArray();

          // NOTE: no fuzzy fallbacks here on purpose. Matching by numeric id or by name across
          // stream types mixed Films / Séries / TV together. The group_id is the single source of truth.

          // Tier 5: ON-DEMAND FETCH FROM XTREAM SERVER (if local database has 0 items for this category)
          if (rawList.length === 0 && !cat.id.startsWith('fav')) {
            if (categoryLoadTokenRef.current !== token) return;
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
              if (categoryLoadTokenRef.current !== token) return;
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

                if (categoryLoadTokenRef.current !== token) return;

                if (onDemandStreams.length > 0) {
                  const favIds = await getFavoriteChannelIds();
                  const mergedStreams = onDemandStreams.map((s) => (favIds.has(s.id) ? { ...s, is_favorite: true } : s));
                  try {
                    await db.channels.bulkPut(mergedStreams);
                  } catch (putErr) {
                    for (const s of mergedStreams) {
                      try { await db.channels.put(s); } catch {}
                    }
                  }
                  await db.categories.update(cat.id, { count: mergedStreams.length });
                  setCategories((prev) =>
                    prev.map((c) => (c.id === cat.id ? { ...c, count: mergedStreams.length } : c))
                  );
                  rawList = mergedStreams;
                }
              } catch (onDemandErr: any) {
                if (categoryLoadTokenRef.current !== token) return;
                console.warn('On-demand stream fetch error for category', cat.id, onDemandErr);
                setCategoryError(`Erreur serveur IPTV : ${onDemandErr?.message || onDemandErr}`);
              }
            }
          }
        }

        if (categoryLoadTokenRef.current !== token) return;

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
        if (categoryLoadTokenRef.current !== token) return;
        console.error('Error loading channels for category:', cat.id, err);
        setChannels([]);
      } finally {
        if (categoryLoadTokenRef.current === token) {
          setIsLoadingCategory(false);
        }
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

      // 1. Pre-fetch all series in one fast call if not yet loaded locally
      const localSeriesCount = await db.channels.where('stream_type').equals('series').count();
      if (localSeriesCount === 0 && pl.server_url && pl.username && pl.password) {
        try {
          const allSeries = await fetchAllSeriesCatalog({
            serverUrl: pl.server_url,
            username: pl.username,
            password: pl.password,
          });
          if (allSeries.length > 0 && bgLoadTokenRef.current === token) {
            const favIds = await getFavoriteChannelIds();
            const mergedSeries = allSeries.map((s) => (favIds.has(s.id) ? { ...s, is_favorite: true } : s));
            await db.channels.bulkPut(mergedSeries);
            const countsByGroup = new Map<string, number>();
            for (const s of mergedSeries) {
              countsByGroup.set(s.group_id, (countsByGroup.get(s.group_id) || 0) + 1);
            }
            for (const [gid, cnt] of Array.from(countsByGroup.entries())) {
              await db.categories.update(gid, { count: cnt });
            }
            setCategories((prev) =>
              prev.map((c) => (countsByGroup.has(c.id) ? { ...c, count: countsByGroup.get(c.id)! } : c))
            );
          }
        } catch (seriesErr) {
          console.warn('Background series pre-fetch error:', seriesErr);
        }
      }

      // 2. Load live categories progressively (3 by 3)
      await loadAllLiveCategories({
        serverUrl: pl.server_url,
        username: pl.username,
        password: pl.password,
        categories: cats,
        skipCategoryIds: skip,
        shouldAbort: () => bgLoadTokenRef.current !== token,
        onCategoryLoaded: async (cat, streams) => {
          if (streams.length === 0) return;
          const favIds = await getFavoriteChannelIds();
          const mergedStreams = streams.map((s) => (favIds.has(s.id) ? { ...s, is_favorite: true } : s));
          try {
            await db.channels.bulkPut(mergedStreams);
          } catch {
            for (const s of mergedStreams) {
              try { await db.channels.put(s); } catch {}
            }
          }
          await db.categories.update(cat.id, { count: streams.length });
          setCategories((prev) => prev.map((c) => (c.id === cat.id ? { ...c, count: streams.length } : c)));
        },
        onProgress: (done, total) => {
          if (bgLoadTokenRef.current === token) {
            setBgLoadStatus(`Synchronisation : ${done}/${total} bouquets TV`);
          }
        },
      });

      // 3. Load VOD categories progressively in the background (2 by 2, safe memory footprint)
      await loadAllVodCategories({
        serverUrl: pl.server_url,
        username: pl.username,
        password: pl.password,
        categories: cats,
        skipCategoryIds: skip,
        shouldAbort: () => bgLoadTokenRef.current !== token,
        onCategoryLoaded: async (cat, streams) => {
          if (streams.length === 0) return;
          const favIds = await getFavoriteChannelIds();
          const mergedStreams = streams.map((s) => (favIds.has(s.id) ? { ...s, is_favorite: true } : s));
          try {
            await db.channels.bulkPut(mergedStreams);
          } catch {
            for (const s of mergedStreams) {
              try { await db.channels.put(s); } catch {}
            }
          }
          await db.categories.update(cat.id, { count: streams.length });
          setCategories((prev) => prev.map((c) => (c.id === cat.id ? { ...c, count: streams.length } : c)));
        },
        onProgress: (done, total) => {
          if (bgLoadTokenRef.current === token) {
            setBgLoadStatus(`Synchronisation films : ${done}/${total} catégories VOD`);
          }
        },
      });

      await updateFavoriteCounts();

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

        const favIds = await getFavoriteChannelIds();
        const CHUNK_SIZE = 500;
        for (let i = 0; i < result.channels.length; i += CHUNK_SIZE) {
          const chunk = result.channels.slice(i, i + CHUNK_SIZE);
          const mergedChunk = chunk.map((s) => (favIds.has(s.id) ? { ...s, is_favorite: true } : s));
          try {
            await db.channels.bulkPut(mergedChunk);
          } catch (chunkErr) {
            console.warn('bulkPut chunk error, fallback to individual put:', chunkErr);
            for (const item of mergedChunk) {
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
        await updateFavoriteCounts();
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
        const favIds = await getFavoriteChannelIds();
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
          const mergedChunk = chunk.map((s) => (favIds.has(s.id) ? { ...s, is_favorite: true } : s));
          try {
            await db.channels.bulkPut(mergedChunk);
          } catch {
            for (const item of mergedChunk) {
              try { await db.channels.put(item); } catch {}
            }
          }
        }

        const loadedCats = await db.categories.orderBy('custom_order').toArray();
        setCategories(loadedCats);
        setPlaylists(await db.playlists.toArray());
        await updateFavoriteCounts();

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

    // Hard failsafe: NEVER let the Splash Screen stay visible longer than 2.5 seconds even if IndexedDB or network is slow!
    const splashFailsafeTimer = setTimeout(() => {
      setIsSplashFading(true);
      setTimeout(() => {
        setIsSplashVisible(false);
      }, 300);
    }, 2500);

    async function initDB() {
      try {
        const savedCatSort = await getSetting<'playlist' | 'alpha' | 'count'>('category_sort', 'playlist');
        const savedChSort = await getSetting<'playlist' | 'alpha' | 'num'>('channel_sort', 'playlist');
        setCategorySort(savedCatSort);
        setChannelSort(savedChSort);

        // 1. Permanent Playlist Persistence: Check Dexie, LocalStorage, and DB Settings
        const backupPlJson = typeof window !== 'undefined' ? localStorage.getItem('keotv_saved_playlist_v1') : null;
        const backupXtreamJson = typeof window !== 'undefined' ? localStorage.getItem('keotv_saved_xtream_creds') : null;
        const savedXtreamConfig = await getSetting<any>('last_xtream_config', null);

        let resyncTarget: PlaylistConfig | null = null;
        let activePlaylists = await db.playlists.toArray();

        // If Dexie playlists table is empty or only has the demo playlist, RESTORE from permanent backups!
        if (activePlaylists.length === 0 || activePlaylists.every((p) => p.id === 'pl_demo_default')) {
          let recoveredPl: PlaylistConfig | null = null;
          if (backupPlJson) {
            try {
              recoveredPl = JSON.parse(backupPlJson);
            } catch {}
          }
          if (!recoveredPl && backupXtreamJson) {
            try {
              const parsed = JSON.parse(backupXtreamJson);
              if (parsed?.server_url && parsed?.username) {
                recoveredPl = {
                  id: 'pl_xtream_' + Date.now(),
                  name: parsed.name || 'Mon Abonnement IPTV',
                  type: 'xtream',
                  server_url: parsed.server_url,
                  username: parsed.username,
                  password: parsed.password,
                  status: 'active',
                  channel_count: 0,
                  last_sync_at: new Date().toISOString(),
                };
              }
            } catch {}
          }
          if (!recoveredPl && savedXtreamConfig?.server_url && savedXtreamConfig?.username) {
            recoveredPl = {
              id: 'pl_xtream_' + Date.now(),
              name: savedXtreamConfig.name || 'Mon Abonnement IPTV',
              type: 'xtream',
              server_url: savedXtreamConfig.server_url,
              username: savedXtreamConfig.username,
              password: savedXtreamConfig.password,
              status: 'active',
              channel_count: 0,
              last_sync_at: new Date().toISOString(),
            };
          }

          if (recoveredPl) {
            await db.playlists.delete('pl_demo_default');
            await db.playlists.put(recoveredPl);
            activePlaylists = [recoveredPl];
            // If channels or categories are empty, schedule background reload
            const existingCatCount = await db.categories.count();
            if (existingCatCount === 0) {
              resyncTarget = recoveredPl;
            }
          }
        }

        // Fast count (zero memory overhead, no loading of 50k objects to RAM)
        const chCount = await db.channels.count();
        const catCount = await db.categories.count();

        // Repair category stream type tags if needed (grp_vod_ -> vod, grp_series_ -> series, grp_live_ -> live)
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

        // Check if user has non-demo categories
        const hasRealCats = allDbCats.some(
          (c) =>
            c.id !== 'fav' &&
            c.id !== 'tnt' &&
            c.id !== 'sport' &&
            c.id !== 'cinema' &&
            c.id !== 'news' &&
            c.id !== 'doc'
        );

        if (hasRealCats) {
          await db.playlists.delete('pl_demo_default');
        }

        // Only install demo channels on fresh first-time installation (NEVER overwrite user setup!)
        const hasAnyUserConfig =
          (await getSetting<boolean>('has_configured_playlist', false)) ||
          Boolean(backupPlJson) ||
          Boolean(backupXtreamJson) ||
          Boolean(savedXtreamConfig) ||
          activePlaylists.some((p) => p.id !== 'pl_demo_default');

        if (!hasAnyUserConfig && chCount === 0 && catCount === 0) {
          const userHasDeletedAll = await getSetting<boolean>('user_deleted_all_playlists', false);
          if (!userHasDeletedAll) {
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

        const loadedCats = await db.categories.orderBy('custom_order').toArray();
        const loadedPlaylists = await db.playlists.toArray();

        // Ensure saved favorite channel IDs are marked in db.channels
        const favIds = await getFavoriteChannelIds();
        if (favIds.size > 0) {
          for (const fId of favIds) {
            try {
              await db.channels.update(fId, { is_favorite: true });
            } catch {}
          }
        }
        await updateFavoriteCounts();

        setCategories(loadedCats);
        setPlaylists(loadedPlaylists);

        // Pick initial category: first non-fav category with count > 0 (or TNT if demo)
        let initialCat = loadedCats.find((c) => c.id === 'tnt');
        if (!initialCat) {
          initialCat =
            loadedCats.find((c) => c.id !== 'fav' && (c.count || 0) > 0) ||
            loadedCats.find((c) => c.id !== 'fav') ||
            loadedCats[0];
        }

        setSelectedCategory(initialCat || null);

        // Dismiss splash screen immediately so the UI is interactive right away!
        clearTimeout(splashFailsafeTimer);
        setIsSplashFading(true);
        setTimeout(() => {
          setIsSplashVisible(false);
        }, 300);

        if (initialCat) {
          await loadCategoryChannels(initialCat, savedChSort);
        }

        // Pick initial channel
        const firstCh = (await db.channels.orderBy('num').first()) || null;
        if (firstCh) {
          setActiveChannel(firstCh);
          try {
            const progs = await EPGService.getProgramsForChannel(firstCh.id);
            const nowIso = new Date().toISOString();
            const curr = progs.find((p) => p.start <= nowIso && p.end > nowIso) || progs[0] || null;
            const nxt = progs.find((p) => p.start >= (curr ? curr.end : nowIso)) || (progs.length > 1 ? progs[1] : null);
            setCurrentEpg(curr);
            setNextEpg(nxt);
          } catch {}
        }

        // Load or create Sync Code
        let code = await getSetting<string>('sync_code', '');
        if (!code) {
          code = 'KEO-' + Math.floor(1000 + Math.random() * 9000);
          await setSetting('sync_code', code);
        }
        setSyncCode(code);

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
        clearTimeout(splashFailsafeTimer);
        setIsSplashFading(true);
        setTimeout(() => {
          setIsSplashVisible(false);
        }, 300);
      }
    }
    initDB();
  }, [triggerSilentRefresh, handleResyncPlaylist, startBackgroundLiveLoad, loadCategoryChannels]);

  // ---- Parental control: auto-detect explicit adult bouquets + user manual overrides ----
  // Overrides are stored separately ({ [categoryId]: boolean }) so they survive playlist resyncs.
  const adultOverridesRef = useRef<Record<string, boolean> | null>(null);
  const loadAdultOverrides = useCallback(async () => {
    if (!adultOverridesRef.current) {
      adultOverridesRef.current = (await getSetting<Record<string, boolean>>('adult_overrides', {})) || {};
    }
    return adultOverridesRef.current;
  }, []);

  useEffect(() => {
    if (categories.length === 0) return;
    let cancelled = false;
    (async () => {
      const overrides = await loadAdultOverrides();
      const changed: Category[] = [];
      const next = categories.map((c) => {
        if (c.id === 'fav' || c.id.startsWith('fav_')) return c;
        const desired = overrides[c.id] !== undefined ? overrides[c.id] : isAdultCategoryName(c.name);
        if (Boolean(c.is_adult) !== desired) {
          const updated = { ...c, is_adult: desired };
          changed.push(updated);
          return updated;
        }
        return c;
      });
      if (cancelled || changed.length === 0) return;
      setCategories(next);
      for (const c of changed) {
        try {
          await db.categories.update(c.id, { is_adult: c.is_adult });
        } catch {}
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [categories, loadAdultOverrides]);

  const adultCategoryIds = useMemo(
    () => new Set(categories.filter((c) => c.is_adult).map((c) => c.id)),
    [categories]
  );

  // Compute sorted categories based on user's preference and activeSection (Direct / Films / Séries / Favoris)
  const sortedCategories = useMemo(() => {
    // 1. If activeSection === 'fav', return the dedicated favorites categories split by universe
    if (activeSection === 'fav') {
      return [favSeriesCategory, favVodCategory, favLiveCategory, favAllCategory];
    }

    // 2. Filter categories by activeSection, exclusion (is_hidden), and parental lock
    let sectionCats = categories.filter((c) => {
      if (c.is_hidden) return false;
      if (c.id === 'fav' || c.id.startsWith('fav_')) return false;
      if (parentalEnabled && parentalHideAdult && c.is_adult && !unlockedAdultSession) return false;
      if (activeSection === 'live') {
        return c.type === 'live' || !c.type;
      }
      if (activeSection === 'vod') {
        return c.type === 'vod';
      }
      if (activeSection === 'series') {
        return c.type === 'series';
      }
      return true;
    });

    // Graceful fallback ONLY if live section is active but categories had no explicit type tag
    if (activeSection === 'live' && sectionCats.length === 0 && categories.length > 0) {
      sectionCats = categories.filter((c) => !c.is_hidden && !c.id.startsWith('fav') && (!c.type || c.type === 'live'));
    }

    if (categorySort === 'alpha') {
      sectionCats.sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      );
    } else if (categorySort === 'count') {
      sectionCats.sort((a, b) => (b.count || 0) - (a.count || 0));
    } else {
      // 'playlist' (strict default lineup order)
      sectionCats.sort((a, b) => (a.custom_order || 0) - (b.custom_order || 0));
    }

    // Prepend universe-specific favorites and smart categories
    if (activeSection === 'vod') {
      const vodSpecials = [vodForYouCategory, vodRecentCategory];
      if (showFavoritesCategory) {
        return [favVodCategory, ...vodSpecials, ...sectionCats];
      }
      return [...vodSpecials, ...sectionCats];
    }

    if (showFavoritesCategory) {
      if (activeSection === 'live') {
        return [favLiveCategory, ...sectionCats];
      }
      if (activeSection === 'series') {
        return [favSeriesCategory, ...sectionCats];
      }
    }

    return sectionCats;
  }, [
    categories,
    categorySort,
    activeSection,
    parentalEnabled,
    parentalHideAdult,
    unlockedAdultSession,
    showFavoritesCategory,
    favSeriesCategory,
    favVodCategory,
    favLiveCategory,
    favAllCategory,
    vodRecentCategory,
    vodForYouCategory,
  ]);

  // Section switcher (Direct, Films, Séries, Favoris)
  const handleSelectSection = useCallback(
    async (section: 'live' | 'vod' | 'series' | 'fav') => {
      setActiveSection(section);
      setChannels([]); // Immediately clear channels to prevent ghost items from previous category!

      let targetCat: Category | null = null;
      if (section === 'fav') {
        if (activeSection === 'series' || (favCounts.series > 0 && favCounts.vod === 0 && favCounts.live === 0)) {
          targetCat = favSeriesCategory;
        } else if (activeSection === 'vod') {
          targetCat = favVodCategory;
        } else if (activeSection === 'live') {
          targetCat = favLiveCategory;
        } else if (favCounts.series > 0) {
          targetCat = favSeriesCategory;
        } else if (favCounts.vod > 0) {
          targetCat = favVodCategory;
        } else if (favCounts.live > 0) {
          targetCat = favLiveCategory;
        } else {
          targetCat = favSeriesCategory;
        }
      } else {
        const matchingCats = categories.filter((c) => {
          if (c.is_hidden) return false;
          if (c.id === 'fav' || c.id.startsWith('fav_')) return false;
          if (parentalEnabled && parentalHideAdult && c.is_adult && !unlockedAdultSession) return false;
          if (section === 'live') return c.type === 'live' || !c.type;
          if (section === 'vod') return c.type === 'vod';
          if (section === 'series') return c.type === 'series';
          return true;
        });

        if (categorySort === 'alpha') {
          matchingCats.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
        } else if (categorySort === 'count') {
          matchingCats.sort((a, b) => (b.count || 0) - (a.count || 0));
        } else {
          matchingCats.sort((a, b) => (a.custom_order || 0) - (b.custom_order || 0));
        }

        if (section === 'series') {
          targetCat = favCounts.series > 0 ? favSeriesCategory : matchingCats[0] || favSeriesCategory;
        } else if (section === 'vod') {
          targetCat = favCounts.vod > 0 ? favVodCategory : matchingCats[0] || favVodCategory;
        } else {
          targetCat = favCounts.live > 0 ? favLiveCategory : matchingCats[0] || favLiveCategory;
        }
      }

      setSelectedCategory(targetCat);
      setFocusedCategoryIndex(0);
      setFocusedChannelIndex(0);
      if (targetCat) {
        await loadCategoryChannels(targetCat, channelSort);
      }
    },
    [
      activeSection,
      categories,
      channelSort,
      loadCategoryChannels,
      categorySort,
      parentalEnabled,
      parentalHideAdult,
      unlockedAdultSession,
      favCounts,
      favSeriesCategory,
      favVodCategory,
      favLiveCategory,
    ]
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

  // Filtered channels for currently active category (excluding hidden channels & configured prefixes)
  const filteredChannels = useMemo(() => {
    return channels.filter((ch) => {
      if (ch.is_hidden || hiddenChannelIds.has(ch.id)) return false;
      if (shouldExcludeChannelByPrefix(ch.name, excludedPrefixes)) return false;
      return true;
    });
  }, [channels, hiddenChannelIds, excludedPrefixes]);

  // Bulk Dexie EPG preload for filteredChannels + background Short EPG fetch
  useEffect(() => {
    if (activeSection !== 'live' && activeSection !== 'fav') return;
    if (!filteredChannels || filteredChannels.length === 0) return;
    let active = true;

    const loadEpg = async () => {
      try {
        const channelIds = filteredChannels.map((c) => c.id).filter(Boolean);
        if (channelIds.length === 0) return;

        // 1. Bulk Dexie query (instant)
        const stored = await db.epg_programs.where('channel_id').anyOf(channelIds).toArray();
        if (!active) return;

        const grouped: Record<string, EpgProgram[]> = {};
        for (const p of stored) {
          if (!grouped[p.channel_id]) grouped[p.channel_id] = [];
          grouped[p.channel_id].push(p);
        }
        for (const cid in grouped) {
          grouped[cid].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
        }

        setChannelEpgMap((prev) => ({ ...prev, ...grouped }));

        // 2. Background short EPG fetch for channels without cached data (first 30 channels)
        const pl = (await db.playlists.toArray()).find((p) => p.type === 'xtream' && p.username && p.password);
        let serverUrl = pl?.server_url || '';
        let username = pl?.username || '';
        let password = pl?.password || '';

        if (!serverUrl) {
          const saved = await getSetting<any>('last_xtream_config', null);
          if (saved?.server_url && saved?.username && saved?.password) {
            serverUrl = saved.server_url;
            username = saved.username;
            password = saved.password;
          }
        }

        if (serverUrl && username && password) {
          const nowIso = new Date().toISOString();
          const toFetch = filteredChannels.slice(0, 30).filter((ch) => {
            const cached = grouped[ch.id] || [];
            return cached.length === 0 || !cached.some((p) => p.end > nowIso);
          });

          for (const ch of toFetch) {
            if (!active) break;
            const streamId = ch.stream_id || (ch.id.match(/\d+$/) ? ch.id.match(/\d+$/)![0] : null);
            if (!streamId) continue;
            try {
              const progs = await EPGService.fetchXtreamShortEpg({
                serverUrl,
                username,
                password,
                streamId,
                channelId: ch.id,
              });
              if (active && progs.length > 0) {
                setChannelEpgMap((prev) => ({ ...prev, [ch.id]: progs }));
              }
            } catch {}
          }
        }
      } catch (err) {
        console.warn('Error bulk loading EPG:', err);
      }
    };

    loadEpg();
    return () => {
      active = false;
    };
  }, [filteredChannels, activeSection]);

  // Update EPG info whenever focused channel changes (debounced by 80ms for ultra-fluid DPAD navigation)
  useEffect(() => {
    const focusedChannel = filteredChannels[focusedChannelIndex];
    if (!focusedChannel) {
      setCurrentEpg(null);
      setNextEpg(null);
      return;
    }

    const isSep = isSeparatorChannel(focusedChannel);
    const isVodOrSeries =
      activeSection === 'vod' ||
      activeSection === 'series' ||
      focusedChannel.stream_type === 'vod' ||
      focusedChannel.stream_type === 'series';

    // Never generate dummy EPG for separators or films/series
    if (isSep || isVodOrSeries) {
      setCurrentEpg(null);
      setNextEpg(null);
      return;
    }

    const timer = setTimeout(() => {
      const progs = channelEpgMap[focusedChannel.id] || [];
      const nowIso = new Date().toISOString();
      const curr = progs.find((p) => p.start <= nowIso && p.end > nowIso) || progs[0] || null;
      const nxt = progs.find((p) => p.start >= (curr ? curr.end : nowIso)) || (progs.length > 1 ? progs[1] : null);
      setCurrentEpg(curr);
      setNextEpg(nxt);
    }, 80);

    return () => clearTimeout(timer);
  }, [focusedChannelIndex, filteredChannels, activeSection, channelEpgMap]);

  // Play an episode chosen from the series detail page
  const handlePlaySeriesEpisode = useCallback(
    async (
      episode: SeriesEpisode,
      allEpisodes: SeriesEpisode[],
      audioPref?: string,
      subPref?: string,
      options?: { startPositionMs?: number; forceRestart?: boolean }
    ) => {
      const index = Math.max(0, allEpisodes.findIndex((e) => e.id === episode.id));
      const seriesKey = String(selectedSeriesForDetails?.id || selectedSeriesForDetails?.name || '');
      const savedAudio = audioPref || (typeof window !== 'undefined' ? localStorage.getItem(`keotv_series_audio_${seriesKey}`) || 'vf' : 'vf');
      const savedSub = subPref || (typeof window !== 'undefined' ? localStorage.getItem(`keotv_series_sub_${seriesKey}`) || 'off' : 'off');

      if (isNativePlayerAvailable()) {
        try {
          await NativePlayer.play({
            urls: allEpisodes.map((e) => e.url),
            titles: allEpisodes.map((e) => `${selectedSeriesForDetails?.name || 'Série'} — S${String(e.season || 1).padStart(2, '0')}E${String(e.episodeNum).padStart(2, '0')} ${e.title}`),
            index,
            userAgent: NATIVE_PLAYER_USER_AGENT,
            isLive: false,
            seriesId: seriesKey,
            preferredAudio: savedAudio,
            preferredSubtitle: savedSub,
            startPositionMs: options?.startPositionMs,
            forceRestart: options?.forceRestart,
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
    async (movieToPlay: Channel, options?: { startPositionMs?: number; forceRestart?: boolean }) => {
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
            startPositionMs: options?.startPositionMs,
            forceRestart: options?.forceRestart,
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

      // Parental control: protected if the item itself or its bouquet is marked adult
      const isAdultItem = Boolean(targetChannel.is_adult) || adultCategoryIds.has(targetChannel.group_id);
      if (isAdultItem && parentalEnabled && !unlockedAdultSession) {
        setPendingChannelToUnlock(targetChannel);
        setIsParentalPinModalOpen(true);
        return;
      }

      setIsStopped(false);
      setActiveChannel(targetChannel);

      // 1. Initial immediate EPG display (Dexie cache first)
      const cachedProgs = channelEpgMap[targetChannel.id] || [];
      const nowIso = new Date().toISOString();
      const currProg = cachedProgs.find((p) => p.start <= nowIso && p.end > nowIso) || cachedProgs[0] || null;
      const nextProg = cachedProgs.find((p) => p.start >= (currProg ? currProg.end : nowIso)) || (cachedProgs.length > 1 ? cachedProgs[1] : null);
      setCurrentEpg(currProg);
      setNextEpg(nextProg);

      // 2. Fetch real live EPG and Catchup from Xtream if available
      (async () => {
        try {
          const pl = (await db.playlists.toArray()).find((p) => p.type === 'xtream' && p.username && p.password);
          let serverUrl = pl?.server_url || '';
          let username = pl?.username || '';
          let password = pl?.password || '';

          if (!serverUrl) {
            const saved = await getSetting<any>('last_xtream_config', null);
            if (saved?.server_url && saved?.username && saved?.password) {
              serverUrl = saved.server_url;
              username = saved.username;
              password = saved.password;
            }
          }

          const streamId = targetChannel.stream_id || (targetChannel.id.match(/\d+$/) ? targetChannel.id.match(/\d+$/)![0] : null);

          if (serverUrl && username && password && streamId) {
            const realPrograms = await EPGService.fetchXtreamShortEpg({
              serverUrl,
              username,
              password,
              streamId,
              channelId: targetChannel.id,
            });

            if (realPrograms.length > 0) {
              const now = new Date().toISOString();
              const curr = realPrograms.find((p) => p.start <= now && p.end > now) || realPrograms[0];
              const next = realPrograms.find((p) => p.start >= (curr ? curr.end : now)) || (realPrograms.length > 1 ? realPrograms[1] : null);
              setCurrentEpg(curr || null);
              setNextEpg(next || null);
              setChannelEpgMap((prev) => ({ ...prev, [targetChannel.id]: realPrograms }));
            }
          }
        } catch (epgErr) {
          console.warn('Live EPG fetch non-fatal error:', epgErr);
        }
      })();

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
          if (targetChannel.stream_url) {
            setSelectedSeriesForDetails(targetChannel);
            setSeriesServerCreds({ serverUrl: targetChannel.stream_url, username: '', password: '' });
            return;
          }
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

      // ---- Native Android player (Live TV) ----
      // - On TV Mode (remote D-Pad): First press switches activeChannel to preview in top-left window, second press (or forceFullscreen) opens full-screen PlayerActivity!
      // - On Mobile or when forceFullscreen: opens full-screen PlayerActivity directly!
      const isAlreadyActiveChannel = activeChannel?.id === targetChannel.id;
      if (isNativePlayerAvailable()) {
        if (!forceFullscreen && !isAlreadyActiveChannel && isTvMode) {
          return;
        }
        try {
          const isTargetInPlaylist = filteredChannels.some((c) => c.id === targetChannel.id);
          const playlist = isTargetInPlaylist ? filteredChannels : [targetChannel];
          const startIndex = isTargetInPlaylist ? filteredChannels.findIndex((c) => c.id === targetChannel.id) : 0;
          let curTime = '';
          if (currentEpg?.start && currentEpg?.end) {
            try {
              const s = new Date(currentEpg.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              const e = new Date(currentEpg.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              curTime = `${s} - ${e}`;
            } catch {}
          }

          const epgTitles: string[] = [];
          const epgDescs: string[] = [];
          const epgTimes: string[] = [];
          const epgNextTitles: string[] = [];
          const nowIso = new Date().toISOString();

          for (const ch of playlist) {
            const progs = channelEpgMap[ch.id];
            let cur = progs?.find((p) => p.start <= nowIso && p.end > nowIso);
            let nxt = progs?.find((p) => p.start >= (cur ? cur.end : nowIso));
            if (ch.id === targetChannel.id && !cur && currentEpg) {
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

          await NativePlayer.play({
            urls: playlist.map((c) => c.stream_url),
            titles: playlist.map((c) => c.name),
            index: startIndex,
            userAgent: NATIVE_PLAYER_USER_AGENT,
            isLive: true,
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
          });
        } catch (err: any) {
          console.error('Native player error:', err);
          alert(`Lecture impossible : ${err?.message || err}`);
        }
        return;
      }

      // ---- Browser fallback (hls.js web player) ----
      if (isAlreadyActiveChannel || forceFullscreen) {
        setIsFullscreen(true);
      }
    },
    [filteredChannels, activeChannel, activeSection, parentalEnabled, unlockedAdultSession, adultCategoryIds, singleStreamMode, currentEpg, nextEpg, osdTimeoutMs, channelEpgMap, isTvMode]
  );

  // Play a specific past Catchup / Replay program via Timeshift (with multi-format fallback cascade!)
  const handlePlayCatchupProgram = useCallback(
    async (program: EpgProgram, channel: Channel) => {
      const pl = (await db.playlists.toArray()).find((p) => p.type === 'xtream' && p.username && p.password);
      let serverUrl = pl?.server_url || '';
      let username = pl?.username || '';
      let password = pl?.password || '';

      if (!serverUrl) {
        const saved = await getSetting<any>('last_xtream_config', null);
        if (saved?.server_url && saved?.username && saved?.password) {
          serverUrl = saved.server_url;
          username = saved.username;
          password = saved.password;
        }
      }

      const streamId =
        channel.stream_id ||
        channel.id.replace(/^ch_xtream_(?:live|vod|series)_/, '') ||
        (channel.id.match(/\d+$/) ? channel.id.match(/\d+$/)![0] : null);
      const startSec = Math.floor(new Date(program.start).getTime() / 1000);

      let fallbackUrls: string[] = [];
      if (serverUrl && username && password && streamId) {
        fallbackUrls = CatchupService.generateCatchupFallbackUrls({
          serverUrl,
          username,
          password,
          streamId,
          sourceUrl: channel.stream_url,
          startTimestamp: startSec,
          durationMinutes: program.duration_min || 60,
        });
      }

      if (program.catchup_url && !fallbackUrls.includes(program.catchup_url)) {
        fallbackUrls.push(program.catchup_url);
      }

      // If still empty (e.g., M3U or demo playlist), fallback to append utc or live stream_url so demo testing works smoothly
      if (fallbackUrls.length === 0 && channel.stream_url) {
        const sep = channel.stream_url.includes('?') ? '&' : '?';
        fallbackUrls.push(`${channel.stream_url}${sep}utc=${startSec}`);
        fallbackUrls.push(channel.stream_url);
      }

      const primaryUrl = fallbackUrls[0];
      if (!primaryUrl) {
        showToast('⚠️ Impossible de générer le lien Replay pour ce programme.');
        return;
      }

      const replayTitle = `[Replay] ${program.title} — ${channel.name}`;
      const replayChannel: Channel = {
        ...channel,
        name: replayTitle,
        stream_url: primaryUrl,
        stream_type: 'vod', // Enables transport seekbar / FF / Rewind controls
      };

      setIsStopped(false);
      setActiveChannel(replayChannel);
      setCurrentEpg(program);
      setNextEpg(null);

      if (isNativePlayerAvailable()) {
        try {
          await NativePlayer.play({
            urls: fallbackUrls,
            titles: fallbackUrls.map(() => replayTitle),
            index: 0,
            userAgent: NATIVE_PLAYER_USER_AGENT,
            isLive: false,
          });
        } catch (err: any) {
          console.error('Native catchup player error:', err);
          alert(`Erreur lecture Replay : ${err?.message || err}`);
        }
      } else {
        setIsFullscreen(true);
      }
    },
    [showToast]
  );

  // Hide a single channel from view
  const handleHideChannel = useCallback(async (target: Channel) => {
    setHiddenChannelIds((prev) => {
      const next = new Set(prev);
      next.add(target.id);
      setSetting('hidden_channel_ids', Array.from(next));
      return next;
    });
    showToast(`Chaîne "${target.name}" masquée`);
  }, [showToast]);

  // Exclude a prefix across all channels
  const handleExcludePrefix = useCallback(async (prefix: string) => {
    const clean = prefix.trim();
    if (!clean) return;
    setExcludedPrefixes((prev) => {
      if (prev.includes(clean)) return prev;
      const next = [...prev, clean];
      setSetting('excluded_prefixes', next);
      return next;
    });
    showToast(`Préfixe "${clean}" exclu des listes`);
  }, [showToast]);

  // Save playback progress for resume watching
  const handleSavePlaybackPosition = useCallback((item: { id: string; title: string; url: string; poster?: string; stream_type: 'vod' | 'series'; position: number; duration: number }) => {
    if (item.position < 15) return; // Ignore very early aborts
    setWatchedPositions((prev) => {
      const filtered = prev.filter((p) => p.id !== item.id && p.url !== item.url);
      const next = [{ ...item, updated_at: new Date().toISOString() }, ...filtered].slice(0, 30);
      try {
        if (typeof window !== 'undefined') {
          localStorage.setItem('keotv_watched_history', JSON.stringify(next));
        }
      } catch {}
      return next;
    });
  }, []);

  // Next / Previous Channel Switchers (for mobile gestures and on-screen controls)
  const handleNextChannel = useCallback(() => {
    if (filteredChannels.length === 0) return;
    const currentIndex = activeChannel ? filteredChannels.findIndex((c) => c.id === activeChannel.id) : -1;
    const nextIndex = currentIndex < filteredChannels.length - 1 ? currentIndex + 1 : 0;
    setFocusedChannelIndex(nextIndex);
    handleSelectChannel(filteredChannels[nextIndex]);
  }, [filteredChannels, activeChannel, handleSelectChannel]);

  const handlePreviousChannel = useCallback(() => {
    if (filteredChannels.length === 0) return;
    const currentIndex = activeChannel ? filteredChannels.findIndex((c) => c.id === activeChannel.id) : -1;
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : filteredChannels.length - 1;
    setFocusedChannelIndex(prevIndex);
    handleSelectChannel(filteredChannels[prevIndex]);
  }, [filteredChannels, activeChannel, handleSelectChannel]);

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
    async (targetChannelOrIndex: Channel | number, explicitNewState?: boolean) => {
      const ch =
        typeof targetChannelOrIndex === 'number'
          ? filteredChannels[targetChannelOrIndex]
          : targetChannelOrIndex;
      if (!ch) return;

      const newFavoriteState = explicitNewState !== undefined ? explicitNewState : !ch.is_favorite;

      // 1. Update in IndexedDB channels table
      try {
        await db.channels.update(ch.id, { is_favorite: newFavoriteState });
      } catch {
        try {
          await db.channels.put({ ...ch, is_favorite: newFavoriteState });
        } catch {}
      }

      // 2. Persist in protected favorite IDs storage
      await saveFavoriteChannelId(ch.id, newFavoriteState);

      // 3. Update active in-memory channels state
      setChannels((prev) =>
        prev.map((c) => (c.id === ch.id ? { ...c, is_favorite: newFavoriteState } : c))
      );

      // 4. Recalculate favCounts across all universes
      await updateFavoriteCounts();

      // 5. User-requested toast feedback
      showToast(newFavoriteState ? `⭐ « ${ch.name} » enregistré dans vos favoris !` : `« ${ch.name} » retiré de vos favoris.`);

      // 6. If currently viewing favorites, reload to update the view
      if (selectedCategory && (selectedCategory.id === 'fav' || selectedCategory.id.startsWith('fav_'))) {
        await loadCategoryChannels(selectedCategory, channelSort);
      }

      // 7. Auto-sync favorite to cloud if syncCode exists
      if (syncCode) {
        const favIds = Array.from(await getFavoriteChannelIds());
        pushSyncToCloud(syncCode, { favorites: favIds });
      }
    },
    [filteredChannels, syncCode, selectedCategory, channelSort, showToast, updateFavoriteCounts, loadCategoryChannels]
  );

  // Category selection with parental protection check
  const handleSelectCategory = (cat: Category, index: number, switchPane: boolean = false) => {
    if (cat.is_adult && parentalEnabled && !unlockedAdultSession) {
      setPendingCategoryToUnlock(cat);
      setIsParentalPinModalOpen(true);
      return;
    }
    setChannels([]); // Immediately clear channels to prevent ghost items from lingering!
    setSelectedCategory(cat);
    setFocusedCategoryIndex(index);
    setFocusedChannelIndex(0);
    if (switchPane) {
      setActivePane('channels');
    }
    loadCategoryChannels(cat, channelSort);
  };

  // Category change debounce when navigating categories list (prevents queuing dozens of requests when scrolling down)
  const categoryDebounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (activePane !== 'categories') return;
    if (categoryDebounceRef.current) clearTimeout(categoryDebounceRef.current);

    categoryDebounceRef.current = setTimeout(() => {
      const cat = sortedCategories[focusedCategoryIndex];
      if (cat && cat.id !== selectedCategory?.id) {
        handleSelectCategory(cat, focusedCategoryIndex, false);
      }
    }, 280);

    return () => {
      if (categoryDebounceRef.current) clearTimeout(categoryDebounceRef.current);
    };
  }, [focusedCategoryIndex, activePane, sortedCategories, selectedCategory]);

  // Parental & Category manager handlers
  const handleUpdateParentalPin = async (newPin: string) => {
    setParentalPin(newPin);
    await setSetting('parental_pin', newPin);
    showToast('🔒 Code PIN parental mis à jour');
  };

  const handleToggleParentalEnabled = async (enabled: boolean) => {
    setParentalEnabled(enabled);
    await setSetting('parental_enabled', enabled);
    showToast(enabled ? '🔒 Contrôle parental activé' : '🔓 Contrôle parental désactivé');
  };

  const handleToggleParentalHideAdult = async (hide: boolean) => {
    setParentalHideAdult(hide);
    await setSetting('parental_hide_adult', hide);
    showToast(hide ? '🔞 Bouquets adultes masqués' : '🔞 Cadenas affiché sur les bouquets adultes');
  };

  const handleUnlockAdultSession = () => {
    setUnlockedAdultSession(true);
    setIsParentalPinModalOpen(false);
    if (pendingCategoryToUnlock) {
      const cat = pendingCategoryToUnlock;
      setPendingCategoryToUnlock(null);
      setSelectedCategory(cat);
      setFocusedChannelIndex(0);
      loadCategoryChannels(cat, channelSort);
      setActivePane('channels');
    }
    if (pendingChannelToUnlock) {
      const ch = pendingChannelToUnlock;
      setPendingChannelToUnlock(null);
      handleSelectChannel(ch, true);
    }
    showToast('🔓 Session Adulte déverrouillée');
  };

  const handleUpdateCategory = async (catId: string, updates: Partial<Category>) => {
    if (updates.is_adult !== undefined) {
      const overrides = { ...(await loadAdultOverrides()), [catId]: Boolean(updates.is_adult) };
      adultOverridesRef.current = overrides;
      await setSetting('adult_overrides', overrides);
    }
    await db.categories.update(catId, updates);
    setCategories((prev) =>
      prev.map((c) => (c.id === catId ? { ...c, ...updates } : c))
    );
    showToast('Bouquet mis à jour');
  };

  const handleReorderCategories = async (reordered: Category[]) => {
    for (const c of reordered) {
      await db.categories.update(c.id, { custom_order: c.custom_order });
    }
    setCategories(reordered);
    showToast('Ordre des bouquets enregistré');
  };

  const handleResetCategoryOrder = async () => {
    const all = await db.categories.toArray();
    all.forEach((c, idx) => {
      c.custom_order = idx;
    });
    for (const c of all) {
      await db.categories.update(c.id, { custom_order: c.custom_order });
    }
    setCategories(all);
    showToast('Ordre d’origine réinitialisé');
  };

  const handleToggleAdultCategory = async (category: Category) => {
    const next = !category.is_adult;
    await handleUpdateCategory(category.id, { is_adult: next });
    showToast(next ? `🔞 « ${category.name} » protégé par contrôle parental` : `« ${category.name} » déverrouillé`);
  };

  const handleToggleHideCategory = async (category: Category) => {
    const next = !category.is_hidden;
    await handleUpdateCategory(category.id, { is_hidden: next });
    showToast(next ? `Bouquet « ${category.name} » masqué` : `Bouquet « ${category.name} » réaffiché`);
  };

  // ==============================================================
  // ANDROID HIERARCHICAL BACK BUTTON & DOUBLE-PRESS TO EXIT
  // ==============================================================
  const handleAndroidBack = useCallback(() => {
    // -2. Context menu modal
    if (isContextMenuOpen) {
      setIsContextMenuOpen(false);
      setContextMenuItem(null);
      setContextMenuCategory(null);
      return;
    }

    // -2a. Catchup / Replay modal
    if (isCatchupModalOpen) {
      setIsCatchupModalOpen(false);
      setCatchupTargetChannel(null);
      return;
    }

    // -2b. Parental PIN modal
    if (isParentalPinModalOpen) {
      setIsParentalPinModalOpen(false);
      setPendingCategoryToUnlock(null);
      setPendingChannelToUnlock(null);
      return;
    }

    // -2c. Category manager modal
    if (isCategoryManagerOpen) {
      setIsCategoryManagerOpen(false);
      return;
    }

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

    // 2b. EPG Timeline Grid or Right Details panel -> go back to channels list pane (re-showing bouquets)
    if (activePane === 'epg_grid' || activePane === 'right_panel') {
      setIsPastUnlocked(false);
      setFocusedProgramOffset(0);
      setActivePane('channels');
      return;
    }

    // 3. Channels list pane (or channel sort header) -> go back to categories pane
    if (activePane === 'channels' || activePane === 'channel_header') {
      const idx = sortedCategories.findIndex((c) => c.id === selectedCategory?.id);
      if (idx >= 0) {
        setFocusedCategoryIndex(idx);
      }
      setActivePane('categories');
      return;
    }

    // 3b. Categories pane (or category sort header) -> go back to sidebar menu pane
    if (activePane === 'categories' || activePane === 'category_header') {
      setActivePane('menu');
      return;
    }

    // 4. Double back to exit application
    const now = Date.now();
    const timeSinceLast = now - lastBackPressTimeRef.current;
    if (timeSinceLast < 450) {
      // Debounce rapid duplicate events from Android hardware / WebView
      return;
    }

    if (timeSinceLast < 2500) {
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
    isContextMenuOpen,
    isCatchupModalOpen,
    isParentalPinModalOpen,
    isCategoryManagerOpen,
    appUpdateInfo,
    isSearchModalOpen,
    selectedMovieForDetails,
    selectedSeriesForDetails,
    isFullscreen,
    isSettingsModalOpen,
    isCategoryModalOpen,
    isXtreamModalOpen,
    isSyncModalOpen,
    activePane,
    sortedCategories,
    selectedCategory,
  ]);

  // Register hardware Android Back button and webview history fallback
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let appListenerHandle: any = null;
    let onPopState: any = null;
    let onKeyDown: any = null;

    if (Capacitor.isNativePlatform()) {
      CapApp.addListener('backButton', () => {
        handleAndroidBack();
      }).then((h) => {
        appListenerHandle = h;
      });
    } else {
      onPopState = (e: PopStateEvent) => {
        e.preventDefault();
        window.history.pushState(null, '', window.location.href);
        handleAndroidBack();
      };
      window.history.pushState(null, '', window.location.href);
      window.addEventListener('popstate', onPopState);

      onKeyDown = (e: KeyboardEvent) => {
        if (e.keyCode === 4 || e.key === 'Escape') {
          e.preventDefault();
          handleAndroidBack();
        }
      };
      window.addEventListener('keydown', onKeyDown);
    }

    // Global protection against unexpected unhandled rejections that could close webview
    const onUnhandledRejection = (e: PromiseRejectionEvent) => {
      console.warn('Silently caught unhandled promise rejection in KeoTV:', e.reason);
      e.preventDefault();
    };
    window.addEventListener('unhandledrejection', onUnhandledRejection);

    return () => {
      if (appListenerHandle) {
        appListenerHandle.remove();
      }
      if (onPopState) window.removeEventListener('popstate', onPopState);
      if (onKeyDown) window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, [handleAndroidBack]);

  const isAnyModalOpen =
    isSplashVisible ||
    isSettingsModalOpen ||
    isSyncModalOpen ||
    isCategoryModalOpen ||
    isXtreamModalOpen ||
    isSearchModalOpen ||
    isCategoryManagerOpen ||
    isParentalPinModalOpen ||
    isContextMenuOpen ||
    isCatchupModalOpen ||
    Boolean(appUpdateInfo) ||
    Boolean(selectedMovieForDetails) ||
    Boolean(selectedSeriesForDetails);

  // Compute interactive buttons count in the Right Panel for D-Pad navigation
  const currentFocusedChannel = filteredChannels[focusedChannelIndex] || activeChannel;
  const isCurrentSep = isSeparatorChannel(currentFocusedChannel);
  const isCurrentMedia =
    activeSection === 'vod' ||
    activeSection === 'series' ||
    selectedCategory?.type === 'vod' ||
    selectedCategory?.type === 'series' ||
    currentFocusedChannel?.stream_type === 'vod' ||
    currentFocusedChannel?.stream_type === 'series';

  const isLiveTimelineMode = !isCurrentMedia;

  const rightPanelButtonCount = isCurrentSep
    ? 0
    : isCurrentMedia
    ? currentFocusedChannel
      ? 1
      : 0
    : currentFocusedChannel?.has_archive
    ? 2
    : 1;

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
    focusedCategoryHeaderIndex,
    setFocusedCategoryHeaderIndex,
    focusedChannelHeaderIndex,
    setFocusedChannelHeaderIndex,
    focusedRightPanelIndex,
    setFocusedRightPanelIndex,
    rightPanelButtonCount,
    isLiveTimelineMode,
    focusedProgramOffset,
    setFocusedProgramOffset,
    isPastUnlocked,
    setIsPastUnlocked,
    minProgramOffset: -168,
    maxProgramOffset: 48,
    onUnlockPastPrograms: (chIdx) => {
      const ch = filteredChannels[chIdx] || activeChannel;
      showToast(
        ch
          ? `⏪ Programmes passés débloqués pour « ${ch.name} » (OK pour lancer le Replay)`
          : '⏪ Navigation dans les programmes passés débloquée'
      );
    },
    onSelectTimelineProgram: async (chIdx, offset) => {
      const ch = filteredChannels[chIdx] || activeChannel;
      if (!ch) return;
      if (offset < 0) {
        // Past program selected in TiviMate timeline -> launch Replay!
        const storedProgs = await EPGService.getProgramsForChannel(ch.id);
        const slots = buildProgramSlotsForChannel(ch, storedProgs, [offset]);
        const targetProg = slots[offset];
        if (targetProg) {
          handlePlayCatchupProgram(targetProg, ch);
        } else {
          handleSelectChannel(ch, false);
        }
      } else {
        // Current live (0) or future (>0) program -> switches mini preview on first press, or opens fullscreen if already active!
        handleSelectChannel(ch, false);
      }
    },
    onSelectRightPanelAction: (btnIdx) => {
      const targetCh = filteredChannels[focusedChannelIndex] || activeChannel;
      if (!targetCh) return;
      if (isCurrentMedia) {
        handleSelectChannel(targetCh, false);
        return;
      }
      if (targetCh.has_archive) {
        if (btnIdx === 0) {
          setCatchupTargetChannel(targetCh);
          setIsCatchupModalOpen(true);
        } else {
          if (isNativePlayerAvailable()) {
            handleSelectChannel(targetCh, true);
          } else {
            setActiveChannel(targetCh);
            setIsFullscreen(true);
          }
        }
      } else {
        if (isNativePlayerAvailable()) {
          handleSelectChannel(targetCh, true);
        } else {
          setActiveChannel(targetCh);
          setIsFullscreen(true);
        }
      }
    },
    onOpenCatchup: (idx) => {
      const ch = filteredChannels[idx] || activeChannel;
      if (ch && ch.stream_type === 'live' && ch.has_archive) {
        setCatchupTargetChannel(ch);
        setIsCatchupModalOpen(true);
      } else if (ch && ch.stream_type === 'live') {
        showToast(`ℹ️ Aucun Replay disponible sur « ${ch.name} »`);
      }
    },
    focusedMenuIndex,
    setFocusedMenuIndex,
    onOpenCategoryManager: () => setIsCategoryManagerOpen(true),
    onOpenSearch: () => setIsSearchModalOpen(true),
    onCategorySortChange: handleCategorySortChange,
    onChannelSortChange: handleChannelSortChange,
    onSelectCategory: (idx, switchPane = false) => {
      const cat = sortedCategories[idx];
      if (cat) {
        handleSelectCategory(cat, idx, switchPane);
      }
    },
    onSelectChannel: handleSelectChannel,
    onToggleFavorite: (idx) => handleToggleFavorite(idx),
    onOpenContextMenu: (idx) => {
      if (activePane === 'channels' || activePane === 'epg_grid') {
        const ch = filteredChannels[idx];
        if (ch) {
          setContextMenuItem(ch);
          setContextMenuCategory(null);
          setIsContextMenuOpen(true);
        }
      } else if (activePane === 'categories') {
        const cat = sortedCategories[idx];
        if (cat) {
          setContextMenuCategory(cat);
          setContextMenuItem(null);
          setIsContextMenuOpen(true);
        }
      }
    },
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
    onBoundaryHit: (pane, boundary) => {
      setBoundaryHit({ pane, boundary, time: Date.now() });
    },
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

    // Save permanent redundant backup in localStorage so updates/cache clears NEVER lose the playlist
    await setSetting('has_configured_playlist', true);
    if (typeof window !== 'undefined') {
      localStorage.setItem('keotv_has_configured_playlist', 'true');
      localStorage.setItem('keotv_saved_playlist_v1', JSON.stringify(result.playlist));
      if (data.type === 'xtream') {
        localStorage.setItem(
          'keotv_saved_xtream_creds',
          JSON.stringify({
            server_url: data.server_url,
            username: data.username,
            password: data.password,
            name: data.name,
          })
        );
      }
    }

    // Save real categories in Dexie
    await db.categories.bulkPut(result.categories);

    // Chunked channels save with individual put fallback to prevent SQLite / IndexedDB transaction limits & memory errors
    const favIds = await getFavoriteChannelIds();
    const CHUNK_SIZE = 500;
    for (let i = 0; i < result.channels.length; i += CHUNK_SIZE) {
      const chunk = result.channels.slice(i, i + CHUNK_SIZE);
      const mergedChunk = chunk.map((s) => (favIds.has(s.id) ? { ...s, is_favorite: true } : s));
      try {
        await db.channels.bulkPut(mergedChunk);
      } catch (chunkErr) {
        console.warn('bulkPut chunk error, falling back to individual put:', chunkErr);
        for (const item of mergedChunk) {
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
    await updateFavoriteCounts();
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

    // Clear banner when save is fully finished
    setSyncStatusBanner(null);
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

      await setSetting('has_configured_playlist', true);
      if (typeof window !== 'undefined') {
        localStorage.setItem('keotv_has_configured_playlist', 'true');
        localStorage.setItem('keotv_saved_playlist_v1', JSON.stringify(updatedPl));
        if (data.type === 'xtream') {
          localStorage.setItem(
            'keotv_saved_xtream_creds',
            JSON.stringify({
              server_url: data.server_url,
              username: data.username,
              password: data.password,
              name: data.name,
            })
          );
        }
      }

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

  // User Account Sync Handler (username + password account login / registration)
  const handleApplyAccountSync = async (account: any) => {
    if (!account) return;

    try {
      // 1. If account has playlists, import credentials and configurations directly WITHOUT attempting to connect/fetch streams
      if (account.playlists && account.playlists.length > 0) {
        for (const pl of account.playlists) {
          const playlistConfig: PlaylistConfig = {
            id: pl.id || 'pl_' + Date.now(),
            name: pl.name || 'Playlist Cloud',
            type: pl.type || 'xtream',
            server_url: pl.server_url || '',
            username: pl.username || '',
            password: pl.password || '',
            m3u_url: pl.m3u_url || '',
            status: 'idle',
            channel_count: pl.channel_count || 0,
            last_sync_at: pl.last_sync_at || new Date().toISOString(),
          };

          await db.playlists.put(playlistConfig);

          if (pl.type === 'xtream') {
            await setSetting('last_xtream_config', {
              server_url: pl.server_url,
              username: pl.username,
              password: pl.password,
              name: pl.name,
            });
            if (typeof window !== 'undefined') {
              localStorage.setItem('keotv_saved_xtream_creds', JSON.stringify({
                server_url: pl.server_url,
                username: pl.username,
                password: pl.password,
                name: pl.name,
              }));
              localStorage.setItem('keotv_has_configured_playlist', 'true');
              localStorage.setItem('keotv_saved_playlist_v1', JSON.stringify(playlistConfig));
            }
          }
        }

        const allPls = await db.playlists.toArray();
        setPlaylists(allPls);

        const primaryPl = allPls[0];
        if (primaryPl) {
          // Trigger automatic channel loading in background or directly
          handleResyncPlaylist(primaryPl).catch((resyncErr) => {
            console.warn('Auto-resync on account sync failed:', resyncErr);
          });
        }
      }

      // 2. Restore user favorites
      if (account.favorites && account.favorites.length > 0) {
        await db.channels.toCollection().modify({ is_favorite: false });
        for (const favId of account.favorites) {
          await db.channels.update(favId, { is_favorite: true });
          await saveFavoriteChannelId(favId, true);
        }
        if (selectedCategory) {
          await loadCategoryChannels(selectedCategory, channelSort);
        }
        await updateFavoriteCounts();
      }

      // 3. Restore hidden channels and prefixes
      if (account.hidden_channels && Array.isArray(account.hidden_channels)) {
        setHiddenChannelIds(new Set(account.hidden_channels));
        await setSetting('hidden_channel_ids', account.hidden_channels);
      }
      if (account.excluded_prefixes && Array.isArray(account.excluded_prefixes)) {
        setExcludedPrefixes(account.excluded_prefixes);
        await setSetting('excluded_prefixes', account.excluded_prefixes);
      }

      showToast(`Compte « ${account.username} » synchronisé avec succès !`);
    } catch (err: any) {
      console.error('Account sync error:', err);
      showToast(`Erreur synchronisation : ${err?.message || 'Serveur indisponible'}`);
      throw err;
    } finally {
      setSyncStatusBanner(null);
    }
  };

  // Legacy sync code fallback
  const handleApplySyncCode = async (code: string) => {
    const data = await pullSyncFromCloud(code);
    if (!data) return false;

    if (data.favorites && data.favorites.length > 0) {
      await db.channels.toCollection().modify({ is_favorite: false });
      for (const favId of data.favorites) {
        await db.channels.update(favId, { is_favorite: true });
        await saveFavoriteChannelId(favId, true);
      }
      if (selectedCategory) {
        await loadCategoryChannels(selectedCategory, channelSort);
      }
      await updateFavoriteCounts();
    }
    await setSetting('sync_code', code);
    setSyncCode(code);
    return true;
  };

  const handleForceSync = async () => {
    if (!syncCode) return;
    const favs = Array.from(await getFavoriteChannelIds());
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
      case 'Clapperboard':
        return <Clapperboard className="w-3.5 h-3.5 text-amber-400" />;
      case 'Film':
        return <Film className="w-3.5 h-3.5 text-purple-400" />;
      case 'Trophy':
        return <Trophy className="w-3.5 h-3.5 text-rose-400" />;
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
          className={`bg-black flex-shrink-0 transition-transform ${
            isFullscreen
              ? 'fixed inset-0 z-50 w-screen h-screen'
              : 'w-full aspect-video relative'
          }`}
        >
          <LiveVideoPlayer
            channel={activeChannel}
            playlist={filteredChannels}
            currentEpg={currentEpg}
            nextEpg={nextEpg}
            channelEpgMap={channelEpgMap}
            isFullscreen={isFullscreen}
            onToggleFullscreen={() => {
              if (isNativePlayerAvailable() && activeChannel) {
                handleSelectChannel(activeChannel, true);
              } else {
                setIsFullscreen(!isFullscreen);
              }
            }}
            isStopped={isStopped}
            onTogglePlayStop={() => setIsStopped(!isStopped)}
            onNextChannel={handleNextChannel}
            onPreviousChannel={handlePreviousChannel}
            singleStreamMode={singleStreamMode}
            osdTimeoutMs={osdTimeoutMs}
            isModalCovering={
              isSplashVisible ||
              isSettingsModalOpen ||
              isCategoryModalOpen ||
              isXtreamModalOpen ||
              isSyncModalOpen ||
              isSearchModalOpen ||
              isCategoryManagerOpen ||
              isParentalPinModalOpen ||
              isContextMenuOpen ||
              isCatchupModalOpen ||
              Boolean(selectedSeriesForDetails) ||
              Boolean(selectedMovieForDetails) ||
              Boolean(appUpdateInfo)
            }
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
              onClick={() => {
                if (isNativePlayerAvailable() && activeChannel) {
                  handleSelectChannel(activeChannel, true);
                } else {
                  setIsFullscreen(true);
                }
              }}
              className="p-1.5 rounded-lg border bg-tv-focus hover:bg-sky-500 text-white border-tv-accent transition"
              title="Plein écran"
            >
              <Maximize className="w-4 h-4" />
            </button>
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
            <button
              onClick={handleToggleOrientation}
              className="p-1.5 text-slate-400 hover:text-sky-300 transition"
              title="Passer en mode paysage (TV)"
            >
              <RotateCw className="w-4 h-4" />
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
                className={`flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-transform ${
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
              {selectedCategory?.id.startsWith('fav') ? (
                <>
                  <Star className="w-8 h-8 text-amber-400/50" />
                  <p className="text-sm font-bold text-white">Aucun favori dans cette catégorie</p>
                  <p className="text-xs text-slate-400 max-w-xs">
                    Cliquez sur l&apos;étoile d&apos;une chaîne, d&apos;un film ou d&apos;une série pour l&apos;ajouter à vos favoris.
                  </p>
                </>
              ) : (
                <>
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
                </>
              )}
            </div>
          ) : (
            filteredChannels.map((ch, idx) => {
              const isActive = activeChannel?.id === ch.id;
              const isVodOrSeries = ch.stream_type === 'vod' || ch.stream_type === 'series' || activeSection === 'vod' || activeSection === 'series';
              const chProgs = channelEpgMap[ch.id] || [];
              const nowIso = new Date().toISOString();
              const curProg = chProgs.find((p) => p.start <= nowIso && p.end > nowIso) || chProgs[0];
              const epgTitle = isVodOrSeries
                ? (ch.stream_type === 'series' ? 'Série complète VOD' : 'Film disponible en lecture instantanée')
                : (curProg?.title || (isActive ? currentEpg?.title : undefined) || 'Programme en direct');

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
                        {epgTitle}
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
      {/* 2. MOBILE LANDSCAPE VIEW (Widescreen TV-inspired for Phones)   */}
      {/* ============================================================== */}
      {isLandscapeMobile && (
        <div className="flex h-full w-full bg-tv-bg overflow-hidden select-none">
          {/* A. Ultra-compact TV-style Sidebar (48px) */}
          <div className="w-12 bg-tv-surface border-r border-tv-border flex flex-col items-center py-2 justify-between flex-shrink-0 z-20">
            {/* KeoTV mini logo */}
            <div className="flex flex-col items-center mb-1">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-sky-600 to-tv-accent flex items-center justify-center shadow-md shadow-sky-500/20">
                <Tv className="w-4 h-4 text-white" />
              </div>
            </div>

            {/* Navigation Icons (Direct, Films, Séries, Favoris, Recherche) */}
            <div className="flex-1 flex flex-col items-center space-y-1.5 w-full px-1 justify-center">
              <button
                onClick={() => handleSelectSection('live')}
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition ${
                  activeSection === 'live'
                    ? 'bg-tv-focus text-white ring-1 ring-tv-accent shadow-md'
                    : 'text-slate-400 hover:text-white hover:bg-tv-card/50'
                }`}
                title="Direct"
              >
                <Tv className="w-4 h-4" />
              </button>

              <button
                onClick={() => handleSelectSection('vod')}
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition ${
                  activeSection === 'vod'
                    ? 'bg-purple-600 text-white ring-1 ring-purple-400 shadow-md'
                    : 'text-slate-400 hover:text-white hover:bg-tv-card/50'
                }`}
                title="Films (VOD)"
              >
                <Film className="w-4 h-4" />
              </button>

              <button
                onClick={() => handleSelectSection('series')}
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition ${
                  activeSection === 'series'
                    ? 'bg-pink-600 text-white ring-1 ring-pink-400 shadow-md'
                    : 'text-slate-400 hover:text-white hover:bg-tv-card/50'
                }`}
                title="Séries"
              >
                <Clapperboard className="w-4 h-4" />
              </button>

              <button
                onClick={() => handleSelectSection('fav')}
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition ${
                  activeSection === 'fav'
                    ? 'bg-amber-500 text-white ring-1 ring-amber-300 shadow-md'
                    : 'text-slate-400 hover:text-white hover:bg-tv-card/50'
                }`}
                title="Favoris"
              >
                <Star className="w-4 h-4" />
              </button>

              <button
                onClick={() => setIsSearchModalOpen(true)}
                className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-tv-accent hover:bg-tv-card/50 transition"
                title="Rechercher"
              >
                <Search className="w-4 h-4" />
              </button>
            </div>

            {/* Bottom: Settings & Orientation Toggle */}
            <div className="flex flex-col items-center space-y-1.5 w-full px-1 pt-1 border-t border-tv-border/50">
              <button
                onClick={() => setIsSettingsModalOpen(true)}
                className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-tv-accent hover:bg-tv-card/50 transition"
                title="Paramètres"
              >
                <Settings className="w-4 h-4 text-tv-accent" />
              </button>

              <button
                onClick={handleToggleOrientation}
                className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-sky-300 hover:bg-tv-card/50 transition"
                title="Passer en mode portrait"
              >
                <Smartphone className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* B. Center Pane: Channel / Bouquet List */}
          <div className="flex-1 min-w-[260px] border-r border-tv-border flex flex-col bg-tv-bg overflow-hidden">
            {/* Top Bar of Channel list */}
            <div className="px-2.5 py-1.5 bg-tv-surface border-b border-tv-border flex items-center justify-between flex-shrink-0">
              <button
                onClick={() => setIsCategoryModalOpen(true)}
                className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-tv-card hover:bg-tv-cardHover border border-tv-border text-left transition min-w-0 mr-2 max-w-[200px]"
                title="Changer de bouquet"
              >
                <Layers className="w-3.5 h-3.5 text-tv-accent flex-shrink-0" />
                <span className="text-xs font-bold text-white truncate">
                  {selectedCategory?.name || 'Groupes'}
                </span>
                <span className="text-[10px] text-slate-400 font-mono flex-shrink-0">
                  ({filteredChannels.length})
                </span>
                <ChevronDown className="w-3 h-3 text-slate-400 ml-0.5 flex-shrink-0" />
              </button>

              {/* Sort buttons */}
              <div className="flex items-center space-x-0.5 bg-black/40 p-0.5 rounded-md border border-white/5 text-[9px] flex-shrink-0">
                <button
                  onClick={() => handleChannelSortChange('playlist')}
                  className={`px-1.5 py-0.5 rounded font-semibold ${
                    channelSort === 'playlist' ? 'bg-tv-focus text-white' : 'text-slate-400 hover:text-white'
                  }`}
                  title="Ordre Playlist"
                >
                  Playlist
                </button>
                <button
                  onClick={() => handleChannelSortChange('alpha')}
                  className={`px-1.5 py-0.5 rounded font-semibold ${
                    channelSort === 'alpha' ? 'bg-tv-focus text-white' : 'text-slate-400 hover:text-white'
                  }`}
                  title="A-Z"
                >
                  A-Z
                </button>
                <button
                  onClick={() => handleChannelSortChange('num')}
                  className={`px-1.5 py-0.5 rounded font-semibold ${
                    channelSort === 'num' ? 'bg-tv-focus text-white' : 'text-slate-400 hover:text-white'
                  }`}
                  title="Numéro"
                >
                  N°
                </button>
              </div>
            </div>

            {/* Horizontal category chips bar for rapid 1-tap switching */}
            <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-tv-surface/40 border-b border-tv-border overflow-x-auto scrollbar-none flex-shrink-0">
              {sortedCategories.map((cat, idx) => {
                const isSelected = selectedCategory?.id === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => handleSelectCategory(cat, idx, true)}
                    className={`flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap transition-transform ${
                      isSelected
                        ? 'bg-tv-focus text-white shadow-sm'
                        : 'bg-tv-card text-slate-400 hover:text-white border border-tv-border/60'
                    }`}
                  >
                    <span>{cat.name}</span>
                    {cat.count > 0 && <span className="text-[9px] opacity-75 font-mono">({cat.count})</span>}
                  </button>
                );
              })}
            </div>

            {/* Scrollable channels list */}
            <div className="flex-1 overflow-y-auto px-2 py-1.5 space-y-1">
              {isLoadingCategory ? (
                <div className="py-12 flex flex-col items-center justify-center text-center space-y-2">
                  <Loader2 className="w-6 h-6 animate-spin text-tv-accent" />
                  <p className="text-xs text-slate-300 font-semibold">Chargement des flux...</p>
                </div>
              ) : filteredChannels.length === 0 ? (
                <div className="py-10 flex flex-col items-center justify-center text-center space-y-2 px-3">
                  <AlertCircle className="w-6 h-6 text-sky-400" />
                  <p className="text-xs font-bold text-white">Aucun flux dans ce bouquet</p>
                  <button
                    onClick={() => handleResyncPlaylist()}
                    disabled={isResyncing}
                    className="px-3 py-1 bg-tv-focus hover:bg-sky-500 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1.5 shadow"
                  >
                    <RefreshCw className={`w-3 h-3 ${isResyncing ? 'animate-spin' : ''}`} />
                    <span>Recharger</span>
                  </button>
                </div>
              ) : (
                filteredChannels.map((ch, idx) => {
                  const isActive = activeChannel?.id === ch.id;
                  const isVodOrSeries =
                    ch.stream_type === 'vod' ||
                    ch.stream_type === 'series' ||
                    activeSection === 'vod' ||
                    activeSection === 'series';
                  const chProgs = channelEpgMap[ch.id] || [];
                  const nowIso = new Date().toISOString();
                  const curProg = chProgs.find((p) => p.start <= nowIso && p.end > nowIso) || chProgs[0];
                  const epgTitle = isVodOrSeries
                    ? ch.group_name || 'VOD'
                    : (curProg?.title || (isActive ? currentEpg?.title : undefined) || 'Programme en direct');

                  return (
                    <div
                      key={ch.id}
                      onClick={() => {
                        setFocusedChannelIndex(idx);
                        handleSelectChannel(ch, false);
                      }}
                      className={`flex items-center justify-between p-2 rounded-lg border transition cursor-pointer ${
                        isActive
                          ? 'bg-tv-card border-tv-accent shadow-md text-white'
                          : 'bg-tv-card/50 border-tv-border/50 text-slate-300 hover:bg-tv-cardHover'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                        <span
                          className={`text-xs font-mono font-bold w-5 text-right flex-shrink-0 ${
                            isActive ? 'text-tv-accent' : 'text-slate-500'
                          }`}
                        >
                          {ch.num}
                        </span>
                        <div
                          className={`${
                            isVodOrSeries ? 'w-8 h-11' : 'w-8 h-8'
                          } rounded-md bg-black/40 border border-white/5 flex items-center justify-center flex-shrink-0 overflow-hidden`}
                        >
                          {ch.logo ? (
                            <img
                              src={ch.logo}
                              alt={ch.name}
                              className={`w-full h-full ${
                                isVodOrSeries ? 'object-cover' : 'object-contain p-0.5'
                              }`}
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                          ) : isVodOrSeries ? (
                            <Film className="w-4 h-4 text-slate-500" />
                          ) : (
                            <span className="text-[10px] font-bold text-slate-400">
                              {ch.name.slice(0, 3)}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center space-x-1.5">
                            <h4 className="text-xs font-semibold truncate text-white">
                              {ch.name}
                            </h4>
                            {ch.resolution && (
                              <span className="text-[8px] bg-sky-500/10 text-tv-accent border border-sky-500/20 px-1 rounded font-bold font-mono">
                                {ch.resolution}
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-400 truncate mt-0.5">
                            {epgTitle}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleFavorite(ch);
                        }}
                        className="p-1.5 text-slate-400 hover:text-amber-400 flex-shrink-0 ml-1"
                        title={ch.is_favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                      >
                        <Star className={`w-3.5 h-3.5 ${ch.is_favorite ? 'fill-amber-400 text-amber-400' : ''}`} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* C. Right Pane: Video Player + Program Details Card */}
          <div className="w-[320px] md:w-[360px] lg:w-[400px] flex flex-col bg-tv-surface/60 border-l border-tv-border overflow-y-auto flex-shrink-0">
            {/* 1. Live Video Player (Aspect 16:9) */}
            <div
              className={`bg-black flex-shrink-0 transition-transform ${
                isFullscreen
                  ? 'fixed inset-0 z-50 w-screen h-screen'
                  : 'w-full aspect-video relative rounded-lg overflow-hidden border border-white/10 shadow-lg'
              }`}
            >
              <LiveVideoPlayer
                channel={activeChannel}
                playlist={filteredChannels}
                currentEpg={currentEpg}
                nextEpg={nextEpg}
                channelEpgMap={channelEpgMap}
                isFullscreen={isFullscreen}
                onToggleFullscreen={() => {
                  if (isNativePlayerAvailable() && activeChannel) {
                    handleSelectChannel(activeChannel, true);
                  } else {
                    setIsFullscreen(!isFullscreen);
                  }
                }}
                isStopped={isStopped}
                onTogglePlayStop={() => setIsStopped(!isStopped)}
                onNextChannel={handleNextChannel}
                onPreviousChannel={handlePreviousChannel}
                singleStreamMode={singleStreamMode}
                osdTimeoutMs={osdTimeoutMs}
                isModalCovering={
                  isSplashVisible ||
                  isSettingsModalOpen ||
                  isCategoryModalOpen ||
                  isXtreamModalOpen ||
                  isSyncModalOpen ||
                  isSearchModalOpen ||
                  isCategoryManagerOpen ||
                  isParentalPinModalOpen ||
                  isContextMenuOpen ||
                  isCatchupModalOpen ||
                  Boolean(selectedSeriesForDetails) ||
                  Boolean(selectedMovieForDetails) ||
                  Boolean(appUpdateInfo)
                }
              />
            </div>

            {/* 2. Channel & Program Details Info */}
            <div className="flex-1 p-2.5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center space-x-1.5 min-w-0 mr-2">
                    {activeChannel?.num && (
                      <span className="text-xs font-mono font-bold text-tv-accent">
                        #{activeChannel.num}
                      </span>
                    )}
                    <h3 className="text-sm font-bold text-white truncate">
                      {activeChannel?.name || 'Aucune chaîne sélectionnée'}
                    </h3>
                  </div>
                  {activeChannel?.resolution && (
                    <span className="text-[9px] bg-sky-500/10 text-tv-accent border border-sky-500/20 px-1.5 py-0.5 rounded font-bold font-mono flex-shrink-0">
                      {activeChannel.resolution}
                    </span>
                  )}
                </div>

                {/* EPG / Program Title */}
                <p className="text-xs font-semibold text-slate-200 truncate">
                  {currentEpg?.title || 'Flux en direct'}
                </p>

                {/* Progress bar */}
                {currentEpg && currentEpg.start && currentEpg.end && (
                  <div className="mt-1.5">
                    <div className="w-full bg-slate-800 rounded-full h-1 overflow-hidden">
                      <div
                        className="bg-tv-accent h-1 rounded-full transition-transform"
                        style={{ width: `${Math.min(100, Math.max(5, getEpgProgressPercent(currentEpg)))}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[9px] text-slate-400 font-mono mt-0.5">
                      <span>{currentEpg.start}</span>
                      <span>{currentEpg.end}</span>
                    </div>
                  </div>
                )}

                {/* Next program */}
                {nextEpg && (
                  <div className="mt-2 text-[11px] text-slate-400">
                    <span className="text-slate-500 font-semibold mr-1">À suivre :</span>
                    <span className="text-slate-300 font-medium truncate">{nextEpg.title}</span>
                    <span className="text-slate-500 font-mono text-[10px] ml-1">({nextEpg.start})</span>
                  </div>
                )}
              </div>

              {/* Action Buttons Toolbar */}
              <div className="flex items-center space-x-1.5 pt-2 border-t border-tv-border/40 mt-2 flex-shrink-0">
                <button
                  onClick={() => {
                    if (isNativePlayerAvailable() && activeChannel) {
                      handleSelectChannel(activeChannel, true);
                    } else {
                      setIsFullscreen(true);
                    }
                  }}
                  className="flex-1 py-1.5 px-2 rounded-lg bg-tv-focus hover:bg-sky-500 text-white font-bold text-xs flex items-center justify-center space-x-1.5 shadow-md transition"
                  title="Plein écran"
                >
                  <Maximize className="w-3.5 h-3.5" />
                  <span>Plein écran</span>
                </button>

                <button
                  onClick={() => activeChannel && handleToggleFavorite(activeChannel)}
                  className={`p-1.5 rounded-lg border transition ${
                    activeChannel?.is_favorite
                      ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                      : 'bg-tv-card text-slate-400 hover:text-white border-tv-border'
                  }`}
                  title={activeChannel?.is_favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                >
                  <Star className={`w-4 h-4 ${activeChannel?.is_favorite ? 'fill-amber-400 text-amber-400' : ''}`} />
                </button>

                <button
                  onClick={() => setIsStopped(!isStopped)}
                  className={`p-1.5 rounded-lg border transition ${
                    isStopped
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                      : 'bg-rose-500/10 text-rose-400 border-rose-500/20 hover:bg-rose-500/20'
                  }`}
                  title={isStopped ? 'Reprendre' : 'Pause'}
                >
                  {isStopped ? <Play className="w-4 h-4 fill-emerald-400" /> : <Square className="w-4 h-4 fill-rose-400" />}
                </button>

                {activeChannel && (
                  <button
                    onClick={() => {
                      setContextMenuItem(activeChannel);
                      setContextMenuCategory(null);
                      setIsContextMenuOpen(true);
                    }}
                    className="p-1.5 rounded-lg bg-tv-card hover:bg-tv-cardHover text-slate-300 hover:text-white border border-tv-border transition"
                    title="Options"
                  >
                    <Sliders className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 3. TV / DESKTOP VIEW (Android TV 16:9, Monitors, Large Screens) */}
      {/* ============================================================== */}
      {isTvMode && (
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
              boundaryHit={boundaryHit}
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
              activeSection={activeSection}
              serverCreds={activeXtreamCreds}
              boundaryHit={boundaryHit}
              singleStreamMode={singleStreamMode}
              osdTimeoutMs={osdTimeoutMs}
              isModalCovering={
                isSplashVisible ||
                isSettingsModalOpen ||
                isCategoryModalOpen ||
                isXtreamModalOpen ||
                isSyncModalOpen ||
                isSearchModalOpen ||
                isCategoryManagerOpen ||
                isParentalPinModalOpen ||
                isContextMenuOpen ||
                isCatchupModalOpen ||
                Boolean(selectedSeriesForDetails) ||
                Boolean(selectedMovieForDetails) ||
                Boolean(appUpdateInfo)
              }
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
              onOpenContextMenu={(ch) => {
                setContextMenuItem(ch);
                setContextMenuCategory(null);
                setIsContextMenuOpen(true);
              }}
              onOpenCategoryManager={() => setIsCategoryManagerOpen(true)}
              onOpenCatchupModal={(ch) => {
                setCatchupTargetChannel(ch);
                setIsCatchupModalOpen(true);
              }}
              onToggleFullscreen={() => {
                const target = activeChannel || filteredChannels[focusedChannelIndex];
                if (isNativePlayerAvailable() && target) {
                  handleSelectChannel(target, true);
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
              focusedCategoryHeaderIndex={focusedCategoryHeaderIndex}
              focusedChannelHeaderIndex={focusedChannelHeaderIndex}
              focusedRightPanelIndex={focusedRightPanelIndex}
              onPlayCatchupProgram={handlePlayCatchupProgram}
              focusedProgramOffset={focusedProgramOffset}
              onFocusProgramOffsetChange={setFocusedProgramOffset}
              isPastUnlocked={isPastUnlocked}
              onTogglePastUnlocked={(unlocked) => {
                setIsPastUnlocked(unlocked);
                if (!unlocked) {
                  setFocusedProgramOffset(0);
                } else if (focusedProgramOffset >= 0) {
                  setFocusedProgramOffset(-1);
                }
              }}
              onEnterEpgGrid={(chIdx, offset) => {
                setFocusedChannelIndex(chIdx);
                setFocusedProgramOffset(offset);
                if (offset < 0) setIsPastUnlocked(true);
                setActivePane('epg_grid');
              }}
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
        currentBuildNumber={CURRENT_BUILD_NUMBER}
        categorySort={categorySort}
        onCategorySortChange={handleCategorySortChange}
        channelSort={channelSort}
        onChannelSortChange={handleChannelSortChange}
        autoRefreshInterval={autoRefreshInterval}
        onAutoRefreshIntervalChange={handleAutoRefreshIntervalChange}
        lastAutoRefreshAt={lastAutoRefreshAt}
        onTriggerSilentRefresh={triggerSilentRefresh}
        isSilentRefreshing={isSilentRefreshing}
        parentalPin={parentalPin}
        parentalEnabled={parentalEnabled}
        parentalHideAdult={parentalHideAdult}
        onUpdateParentalPin={handleUpdateParentalPin}
        onToggleParentalEnabled={handleToggleParentalEnabled}
        onToggleParentalHideAdult={handleToggleParentalHideAdult}
        showFavoritesCategory={showFavoritesCategory}
        onToggleShowFavoritesCategory={(show) => {
          setShowFavoritesCategory(show);
          setSetting('show_favorites_category', show);
        }}
        excludedPrefixes={excludedPrefixes}
        onUpdateExcludedPrefixes={(prefixes) => {
          setExcludedPrefixes(prefixes);
          setSetting('excluded_prefixes', prefixes);
        }}
        onOpenCategoryManager={() => setIsCategoryManagerOpen(true)}
        parentalCategories={categories}
        onToggleAdultCategory={handleToggleAdultCategory}
        singleStreamMode={singleStreamMode}
        onToggleSingleStreamMode={(enabled) => {
          setSingleStreamMode(enabled);
          setSetting('single_stream_mode', enabled);
        }}
        osdDuration={osdDuration}
        onOsdDurationChange={(dur) => {
          setOsdDuration(dur);
          setSetting('osd_duration', dur);
        }}
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
        onApplyAccountSync={handleApplyAccountSync}
        currentPlaylists={playlists}
        currentFavorites={Array.from(favCount > 0 ? channels.filter(c => c.is_favorite).map(c => c.id) : [])}
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
          onToggleFavorite={handleToggleFavorite}
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
          onToggleFavorite={handleToggleFavorite}
        />
      )}

      {/* Universal Search Modal (Fast instant search across Live TV, Movies & Series) */}
      <SearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        onSelectChannel={(ch) => handleSelectChannel(ch, true)}
        onSelectMovie={(movie) => handleSelectChannel(movie, false)}
        onSelectSeries={(series) => handleSelectChannel(series, false)}
        onToggleFavorite={handleToggleFavorite}
        serverCreds={activeXtreamCreds}
      />

      {/* Category Manager Modal */}
      <CategoryManagerModal
        isOpen={isCategoryManagerOpen}
        onClose={() => setIsCategoryManagerOpen(false)}
        categories={categories}
        onUpdateCategory={handleUpdateCategory}
        onReorderCategories={handleReorderCategories}
        onResetOrder={handleResetCategoryOrder}
        parentalPin={parentalPin}
        parentalEnabled={parentalEnabled}
      />

      {/* Parental PIN Verification Modal */}
      <ParentalPinModal
        isOpen={isParentalPinModalOpen}
        onClose={() => {
          setIsParentalPinModalOpen(false);
          setPendingCategoryToUnlock(null);
          setPendingChannelToUnlock(null);
        }}
        onSuccess={handleUnlockAdultSession}
        correctPin={parentalPin}
        categoryName={pendingCategoryToUnlock?.name}
      />

      {/* TV Long-Press Context Menu */}
      <ContextMenuModal
        isOpen={isContextMenuOpen}
        onClose={() => {
          setIsContextMenuOpen(false);
          setContextMenuItem(null);
          setContextMenuCategory(null);
        }}
        item={contextMenuItem}
        category={contextMenuCategory}
        onToggleFavorite={handleToggleFavorite}
        onPlay={(ch) => handleSelectChannel(ch, true)}
        onOpenDetails={(ch) => handleSelectChannel(ch, false)}
        onToggleAdultCategory={handleToggleAdultCategory}
        onToggleHideCategory={handleToggleHideCategory}
        onHideChannel={handleHideChannel}
        onExcludePrefix={handleExcludePrefix}
        onOpenReplay={(ch) => {
          setCatchupTargetChannel(ch);
          setIsCatchupModalOpen(true);
        }}
      />

      {/* Replay & Catchup Modal (7 Days Multi-day Listings & Timeshift Playback) */}
      <CatchupModal
        isOpen={isCatchupModalOpen}
        channel={catchupTargetChannel}
        serverCreds={activeXtreamCreds}
        onClose={() => {
          setIsCatchupModalOpen(false);
          setCatchupTargetChannel(null);
        }}
        onPlayProgram={handlePlayCatchupProgram}
      />

      {/* Startup Update Alert Modal (Automatically triggered if a newer build is released) */}
      <UpdatePopupModal
        updateInfo={appUpdateInfo}
        onClose={() => setAppUpdateInfo(null)}
      />

      {/* User Toast Message */}
      {toastMessage && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 text-white border border-amber-500/50 px-5 py-3 rounded-2xl text-sm font-semibold shadow-2xl flex items-center space-x-2.5 animate-fade-in pointer-events-none">
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Floating Status & Back Toast Notifications */}
      {syncStatusBanner && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-sky-950/95 text-sky-200 border border-sky-500/50 px-4 py-2.5 rounded-xl text-xs font-semibold shadow-2xl flex items-center space-x-2 animate-fade-in pointer-events-none">
          <RefreshCw className="w-4 h-4 animate-spin text-sky-400" />
          <span>{syncStatusBanner}</span>
        </div>
      )}

      {!syncStatusBanner && bgLoadStatus && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-emerald-950/95 text-emerald-200 border border-emerald-500/50 px-4 py-2 rounded-xl text-[11px] font-semibold shadow-2xl flex items-center space-x-2 animate-fade-in pointer-events-none">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
          <span>{bgLoadStatus}</span>
        </div>
      )}

      {backToastVisible && (
        <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 text-white text-xs font-semibold px-4 py-2 rounded-full border border-tv-border shadow-2xl animate-fade-in pointer-events-none">
          Appuyez à nouveau pour quitter KeoTV
        </div>
      )}

      {/* Launch Splash Screen with Official KeoTV Logo */}
      <SplashScreen isVisible={isSplashVisible} isFading={isSplashFading} />
    </main>
  );
}
