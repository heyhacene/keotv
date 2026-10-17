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
import { pushSyncToCloud, pullSyncFromCloud } from '@/lib/supabase';
import { syncXtreamPlaylist, parseM3UPlaylist, fetchCategoryStreamsOnDemand } from '@/lib/iptv-service';
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

  // Sorting preferences
  const [categorySort, setCategorySort] = useState<'playlist' | 'alpha' | 'count'>('playlist');
  const [channelSort, setChannelSort] = useState<'playlist' | 'alpha' | 'num'>('playlist');

  const [activePane, setActivePane] = useState<NavigationPane>('channels');
  const [focusedCategoryIndex, setFocusedCategoryIndex] = useState<number>(0);
  const [focusedChannelIndex, setFocusedChannelIndex] = useState<number>(0);

  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isStopped, setIsStopped] = useState<boolean>(false);

  const [currentEpg, setCurrentEpg] = useState<EpgProgram | null>(null);
  const [nextEpg, setNextEpg] = useState<EpgProgram | null>(null);

  const [activeSection, setActiveSection] = useState<'live' | 'vod' | 'series' | 'fav'>('live');
  const [syncCode, setSyncCode] = useState<string>('');
  const [isLoadingCategory, setIsLoadingCategory] = useState<boolean>(false);

  const [isXtreamModalOpen, setIsXtreamModalOpen] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // Channel loader for the selected category from IndexedDB with multi-tier lookup & on-demand fetch
  const loadCategoryChannels = useCallback(
    async (cat: Category | null, sortMode: 'playlist' | 'alpha' | 'num' = channelSort) => {
      if (!cat) {
        setChannels([]);
        return;
      }

      setIsLoadingCategory(true);
      try {
        let rawList: Channel[] = [];
        if (cat.id === 'fav') {
          rawList = await db.channels.filter((c) => Boolean(c.is_favorite)).toArray();
        } else {
          // Tier 1: exact group_id indexed match
          rawList = await db.channels.where('group_id').equals(cat.id).toArray();

          // Tier 2: alternate group_id prefix (with or without 'grp_')
          if (rawList.length === 0) {
            const altId = cat.id.startsWith('grp_') ? cat.id.replace('grp_', '') : `grp_${cat.id}`;
            rawList = await db.channels.where('group_id').equals(altId).toArray();
          }

          // Tier 3: exact group_name match
          if (rawList.length === 0 && cat.name) {
            rawList = await db.channels.filter((c) => 
              Boolean(c.group_name && c.group_name.trim().toLowerCase() === cat.name.trim().toLowerCase())
            ).toArray();
          }

          // Tier 4: universal memory fallback across all channels in Dexie
          if (rawList.length === 0) {
            const all = await db.channels.toArray();
            const cleanCatId = cat.id.replace('grp_', '').trim().toLowerCase();
            const cleanCatName = cat.name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

            rawList = all.filter((c) => {
              const cGrpId = (c.group_id || '').replace('grp_', '').trim().toLowerCase();
              if (cGrpId && cGrpId === cleanCatId) return true;
              const cGrpName = (c.group_name || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
              if (cGrpName && cleanCatName && (cGrpName === cleanCatName || cGrpName.includes(cleanCatName) || cleanCatName.includes(cGrpName))) {
                return true;
              }
              return false;
            });
          }

          // Tier 5: ON-DEMAND FETCH FROM XTREAM SERVER (if local database has 0 items for this category)
          if (rawList.length === 0 && cat.id !== 'fav') {
            const currentPlaylists = await db.playlists.toArray();
            const activePl = currentPlaylists[0];
            if (activePl && activePl.type === 'xtream' && activePl.server_url && activePl.username && activePl.password) {
              const cleanRawCatId = cat.id.replace('grp_', '').trim();
              const catType = cat.type || 'live';
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
                  // Save into Dexie in background for offline & instant future queries
                  try {
                    await db.channels.bulkPut(onDemandStreams);
                  } catch (putErr) {
                    for (const s of onDemandStreams) {
                      try { await db.channels.put(s); } catch {}
                    }
                  }
                  // Update category count
                  await db.categories.update(cat.id, { count: onDemandStreams.length });
                  setCategories((prev) =>
                    prev.map((c) => (c.id === cat.id ? { ...c, count: onDemandStreams.length } : c))
                  );
                  rawList = onDemandStreams;
                }
              } catch (onDemandErr) {
                console.warn('On-demand stream fetch error for category', cat.id, onDemandErr);
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
      } catch (err) {
        console.error('Error loading channels for category:', cat.id, err);
        setChannels([]);
      } finally {
        setIsLoadingCategory(false);
      }
    },
    [channelSort]
  );

  // 1. Initialize IndexedDB & Seed initial channels
  useEffect(() => {
    async function initDB() {
      try {
        const savedCatSort = await getSetting<'playlist' | 'alpha' | 'count'>('category_sort', 'playlist');
        const savedChSort = await getSetting<'playlist' | 'alpha' | 'num'>('channel_sort', 'playlist');
        setCategorySort(savedCatSort);
        setChannelSort(savedChSort);

        const chCount = await db.channels.count();
        const plCount = await db.playlists.count();

        // If empty or older small seed (< 25 channels), reload the full channel catalog
        if (chCount < 25 && plCount === 0) {
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
        } else if (plCount === 0 && chCount >= 25) {
          const demoPlaylist: PlaylistConfig = {
            id: 'pl_demo_default',
            name: 'Chaînes Démo Gratuites',
            type: 'm3u',
            server_url: 'https://test-streams.mux.dev',
            status: 'active',
            channel_count: chCount,
            last_sync_at: new Date().toISOString(),
          };
          await db.playlists.put(demoPlaylist);
        }

        const loadedCats = await db.categories.orderBy('custom_order').toArray();
        const loadedPlaylists = await db.playlists.toArray();
        const initialFavCount = await db.channels.filter((c) => Boolean(c.is_favorite)).count();

        setCategories(loadedCats);
        setPlaylists(loadedPlaylists);
        setFavCount(initialFavCount);

        // Auto-recovery if a playlist was saved but 0 channels exist (e.g. from Build 7 boolean index issue)
        if (plCount > 0 && chCount === 0 && loadedPlaylists.length > 0) {
          console.warn('Playlist exists but 0 channels in Dexie. Triggering auto-recovery...');
          const activePl = loadedPlaylists[0];
          setTimeout(() => {
            handleResyncPlaylist(activePl);
          }, 400);
        }

        // Pick initial category: first non-fav category with count > 0 (or TNT if demo)
        let initialCat = loadedCats.find((c) => c.id === 'tnt');
        if (!initialCat) {
          initialCat = loadedCats.find((c) => c.id !== 'fav' && (c.count || 0) > 0) || loadedCats.find((c) => c.id !== 'fav') || loadedCats[0];
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
      } catch (err) {
        console.error('Initialization error:', err);
      }
    }
    initDB();
  }, [loadCategoryChannels]);

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

    // Graceful fallback if no categories exist for this section in the playlist
    if (sectionCats.length === 0 && categories.length > 0) {
      if (activeSection === 'fav') {
        sectionCats = categories.filter((c) => c.id === 'fav');
      } else {
        sectionCats = categories.filter((c) => c.id !== 'fav');
      }
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

      let targetCat: Category | null = null;
      if (section === 'fav') {
        targetCat = categories.find((c) => c.id === 'fav') || null;
      } else {
        targetCat =
          matchingCats.find((c) => c.id !== 'fav' && (c.count || 0) > 0) ||
          matchingCats.find((c) => c.id !== 'fav') ||
          matchingCats[0] ||
          null;
      }

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

  // Channel Selection: single tap plays channel in the single player
  const handleSelectChannel = useCallback(
    (index: number, forceFullscreen: boolean = false) => {
      const targetChannel = filteredChannels[index];
      if (!targetChannel) return;

      setIsStopped(false);
      if (activeChannel?.id === targetChannel.id && forceFullscreen) {
        setIsFullscreen(true);
      } else {
        setActiveChannel(targetChannel);
        const epg = getMockEpgForChannel(targetChannel.id);
        setCurrentEpg(epg.current);
        setNextEpg(epg.next);
        if (forceFullscreen) {
          setIsFullscreen(true);
        }
      }
    },
    [filteredChannels, activeChannel]
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
  const handleSelectCategory = (cat: Category, index: number) => {
    setSelectedCategory(cat);
    setFocusedCategoryIndex(index);
    setFocusedChannelIndex(0);
    setActivePane('channels');
    loadCategoryChannels(cat, channelSort);
  };

  // ==============================================================
  // ANDROID HIERARCHICAL BACK BUTTON & DOUBLE-PRESS TO EXIT
  // ==============================================================
  const handleAndroidBack = useCallback(() => {
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

  // Register remote control D-Pad keyboard events with hierarchical back handler
  useTVNavigation({
    activePane,
    setActivePane,
    channelCount: filteredChannels.length,
    categoryCount: sortedCategories.length,
    focusedCategoryIndex,
    setFocusedCategoryIndex,
    focusedChannelIndex,
    setFocusedChannelIndex,
    onSelectChannel: handleSelectChannel,
    onToggleFavorite: (idx) => handleToggleFavorite(idx),
    isFullscreen,
    setIsFullscreen,
    onJumpToChannelNumber: handleJumpToChannelNumber,
    onBack: handleAndroidBack,
  });

  // Re-synchronize existing playlist and reload all channels safely into Dexie
  const handleResyncPlaylist = useCallback(async (pl?: PlaylistConfig) => {
    const targetPl = pl || playlists[0];
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
  }, [playlists, channelSort, loadCategoryChannels]);

  // Save & Synchronize new playlist (Xtream / M3U) with chunked bulkPut to support 50k+ channels
  const handleSavePlaylist = async (
    data: any,
    onProgress: (step: string) => void
  ) => {
    let result: { playlist: PlaylistConfig; categories: Category[]; channels: Channel[] };

    if (data.type === 'xtream') {
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

  // Delete playlist handler
  const handleDeletePlaylist = async (id: string) => {
    await db.playlists.delete(id);
    const remainingPlaylists = await db.playlists.toArray();
    setPlaylists(remainingPlaylists);

    if (id === 'pl_demo_default' || remainingPlaylists.length === 0) {
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
      {/* 1. MOBILE VIEW (Visible on Portrait / Small Screens < 1024px)  */}
      {/* ============================================================== */}
      <div className="flex lg:hidden flex-col h-full w-full bg-tv-bg overflow-hidden">
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
                onClick={() => handleSelectCategory(cat, idx)}
                className={`flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                  isSelected
                    ? 'bg-tv-focus text-white shadow-md'
                    : 'bg-tv-card text-slate-400 hover:text-white border border-tv-border/60'
                }`}
              >
                {getCategoryIcon(cat.icon)}
                <span>{cat.name}</span>
                <span className="text-[10px] opacity-75 font-mono">({cat.count})</span>
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
                {activeSection === 'vod'
                  ? 'Aucun film dans ce bouquet'
                  : activeSection === 'series'
                  ? 'Aucune série dans ce bouquet'
                  : 'Aucune chaîne dans ce bouquet'}
              </p>
              <p className="text-xs text-slate-400 max-w-xs">
                Si vos flux ne sont pas encore apparus en mémoire, vous pouvez les recharger en un clic.
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
                    handleSelectChannel(idx, false);
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

      {/* ============================================================== */}
      {/* 2. TV / LANDSCAPE VIEW (Screens >= 1024px or Android TV 16:9)  */}
      {/* ============================================================== */}
      <div className="hidden lg:flex flex-col h-full w-full">
        <TopBar
          currentCategoryName={selectedCategory?.name}
          onToggleFullscreen={() => setIsFullscreen(true)}
        />

        <div className="flex-1 flex overflow-hidden">
          <NavigationSidebar
            activeSection={activeSection}
            onSelectSection={(sec) => handleSelectSection(sec as any)}
            activePane={activePane}
            onOpenSyncModal={() => setIsSyncModalOpen(true)}
            onOpenSettingsModal={() => setIsSettingsModalOpen(true)}
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
            onSelectCategory={handleSelectCategory}
            onSelectChannel={(ch, idx) => {
              setFocusedChannelIndex(idx);
              handleSelectChannel(idx, false);
            }}
            onToggleFavorite={handleToggleFavorite}
            onOpenSyncModal={() => setIsSyncModalOpen(true)}
            onOpenXtreamModal={() => setIsXtreamModalOpen(true)}
            onToggleFullscreen={() => setIsFullscreen(true)}
            isStopped={isStopped}
            onTogglePlayStop={() => setIsStopped(!isStopped)}
            categorySort={categorySort}
            onCategorySortChange={handleCategorySortChange}
            channelSort={channelSort}
            onChannelSortChange={handleChannelSortChange}
          />
        </div>
      </div>

      {/* ============================================================== */}
      {/* 3. MODALS (Settings Hub, Category Drawer, Xtream & Sync)       */}
      {/* ============================================================== */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        syncCode={syncCode}
        playlists={playlists}
        onOpenXtreamModal={() => setIsXtreamModalOpen(true)}
        onOpenSyncModal={() => setIsSyncModalOpen(true)}
        onDeletePlaylist={handleDeletePlaylist}
        onRestoreDemoPlaylist={handleRestoreDemoPlaylist}
        onResyncPlaylist={handleResyncPlaylist}
        isResyncing={isResyncing}
        currentBuildNumber={9}
        categorySort={categorySort}
        onCategorySortChange={handleCategorySortChange}
        channelSort={channelSort}
        onChannelSortChange={handleChannelSortChange}
      />

      <CategoryDrawerModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        categories={sortedCategories}
        selectedCategory={selectedCategory}
        onSelectCategory={handleSelectCategory}
        categorySort={categorySort}
        onCategorySortChange={handleCategorySortChange}
      />

      <XtreamModal
        isOpen={isXtreamModalOpen}
        onClose={() => setIsXtreamModalOpen(false)}
        onSavePlaylist={handleSavePlaylist}
      />

      <SyncModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        currentSyncCode={syncCode}
        onApplySyncCode={handleApplySyncCode}
        onForceSync={handleForceSync}
      />

      {/* Floating Status & Back Toast Notifications */}
      {syncStatusBanner && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-sky-950/95 text-sky-200 border border-sky-500/50 px-4 py-2.5 rounded-xl text-xs font-semibold shadow-2xl flex items-center space-x-2 backdrop-blur-md animate-fade-in pointer-events-none">
          <RefreshCw className="w-4 h-4 animate-spin text-sky-400" />
          <span>{syncStatusBanner}</span>
        </div>
      )}

      {backToastVisible && (
        <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 text-white text-xs font-semibold px-4 py-2 rounded-full border border-tv-border shadow-2xl backdrop-blur-md animate-fade-in pointer-events-none">
          Appuyez à nouveau pour quitter KeoTV
        </div>
      )}
    </main>
  );
}
