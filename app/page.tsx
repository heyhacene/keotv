'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
import { syncXtreamPlaylist, parseM3UPlaylist } from '@/lib/iptv-service';
import { Star, Tv, Film, Settings, RefreshCw, Trophy, Globe, Compass, ChevronDown, Layers, Sparkles, Play, Square } from 'lucide-react';

export default function KeoTVHome() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [playlists, setPlaylists] = useState<PlaylistConfig[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);

  const [activePane, setActivePane] = useState<NavigationPane>('channels');
  const [focusedCategoryIndex, setFocusedCategoryIndex] = useState<number>(0);
  const [focusedChannelIndex, setFocusedChannelIndex] = useState<number>(0);

  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isStopped, setIsStopped] = useState<boolean>(false);

  const [currentEpg, setCurrentEpg] = useState<EpgProgram | null>(null);
  const [nextEpg, setNextEpg] = useState<EpgProgram | null>(null);

  const [activeSection, setActiveSection] = useState<string>('live');
  const [syncCode, setSyncCode] = useState<string>('');

  const [isXtreamModalOpen, setIsXtreamModalOpen] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // 1. Initialize IndexedDB & Seed initial channels
  useEffect(() => {
    async function initDB() {
      try {
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
          // If channels exist from previous build but playlist wasn't registered
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
        const loadedChannels = await db.channels.orderBy('num').toArray();
        const loadedPlaylists = await db.playlists.toArray();

        setCategories(loadedCats);
        setChannels(loadedChannels);
        setPlaylists(loadedPlaylists);

        // Pick initial category (TNT by default)
        const initialCat = loadedCats.find((c) => c.id === 'tnt') || loadedCats[0];
        setSelectedCategory(initialCat || null);

        // Pick initial channel
        const initialChannel = loadedChannels.find((ch) => ch.id === 'ch_tf1') || loadedChannels[0];
        if (initialChannel) {
          setActiveChannel(initialChannel);
          const epg = getMockEpgForChannel(initialChannel.id);
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
  }, []);

  // Compute exact live counts for each category
  const categoriesWithCounts = useMemo(() => {
    return categories.map((cat) => {
      let count = 0;
      if (cat.id === 'fav') {
        count = channels.filter((c) => c.is_favorite).length;
      } else {
        count = channels.filter((c) => c.group_id === cat.id).length;
      }
      return { ...cat, count };
    });
  }, [categories, channels]);

  // Filter channels according to the selected category
  const filteredChannels = useMemo(() => {
    if (!selectedCategory) return channels;
    if (selectedCategory.id === 'fav') {
      return channels.filter((ch) => ch.is_favorite);
    }
    return channels.filter((ch) => ch.group_id === selectedCategory.id);
  }, [channels, selectedCategory]);

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

      // Auto-sync favorite to cloud if syncCode exists
      if (syncCode) {
        const favIds = (await db.channels.where('is_favorite').equals(1).toArray()).map((c) => c.id);
        pushSyncToCloud(syncCode, { favorites: favIds });
      }
    },
    [filteredChannels, syncCode]
  );

  // Category selection
  const handleSelectCategory = (cat: Category, index: number) => {
    setSelectedCategory(cat);
    setFocusedCategoryIndex(index);
    setFocusedChannelIndex(0);
    setActivePane('channels');
  };

  // Register remote control D-Pad keyboard events
  useTVNavigation({
    activePane,
    setActivePane,
    channelCount: filteredChannels.length,
    categoryCount: categoriesWithCounts.length,
    focusedCategoryIndex,
    setFocusedCategoryIndex,
    focusedChannelIndex,
    setFocusedChannelIndex,
    onSelectChannel: handleSelectChannel,
    onToggleFavorite: (idx) => handleToggleFavorite(idx),
    isFullscreen,
    setIsFullscreen,
    onJumpToChannelNumber: handleJumpToChannelNumber,
  });

  // Save & Synchronize new playlist (Xtream / M3U)
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

    // If only demo playlist existed, clear it to start clean with the user's real channels
    const currentPlaylists = await db.playlists.toArray();
    const hasOnlyDemo = currentPlaylists.length === 1 && currentPlaylists[0].id === 'pl_demo_default';
    if (hasOnlyDemo) {
      await db.playlists.delete('pl_demo_default');
      await db.categories.clear();
      await db.channels.clear();
    }

    // Save playlist config
    await db.playlists.put(result.playlist);

    // Save real categories and channels in Dexie
    await db.categories.bulkPut(result.categories);
    await db.channels.bulkPut(result.channels);

    // Reload from Dexie
    const loadedCats = await db.categories.orderBy('custom_order').toArray();
    const loadedChannels = await db.channels.orderBy('num').toArray();
    const loadedPlaylists = await db.playlists.toArray();

    setCategories(loadedCats);
    setChannels(loadedChannels);
    setPlaylists(loadedPlaylists);

    // Select first non-fav category
    const firstCat = loadedCats.find((c) => c.id !== 'fav') || loadedCats[0];
    if (firstCat) {
      setSelectedCategory(firstCat);
      setFocusedCategoryIndex(0);
      setFocusedChannelIndex(0);
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
      setIsStopped(true);
    } else {
      const remainingCats = await db.categories.toArray();
      const remainingChannels = await db.channels.toArray();
      setCategories(remainingCats);
      setChannels(remainingChannels);
      if (remainingCats.length > 0 && (!selectedCategory || !remainingCats.some((c) => c.id === selectedCategory.id))) {
        setSelectedCategory(remainingCats[0]);
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
    const loadedChannels = await db.channels.orderBy('num').toArray();
    const loadedPlaylists = await db.playlists.toArray();

    setCategories(loadedCats);
    setChannels(loadedChannels);
    setPlaylists(loadedPlaylists);

    const initialCat = loadedCats.find((c) => c.id === 'tnt') || loadedCats[0];
    setSelectedCategory(initialCat || null);

    const initialChannel = loadedChannels.find((ch) => ch.id === 'ch_tf1') || loadedChannels[0];
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
      const updatedChannels = await db.channels.orderBy('num').toArray();
      setChannels(updatedChannels);
    }
    await setSetting('sync_code', code);
    setSyncCode(code);
    return true;
  };

  const handleForceSync = async () => {
    if (!syncCode) return;
    const favs = (await db.channels.where('is_favorite').equals(1).toArray()).map((c) => c.id);
    const playlists = await db.playlists.toArray();
    await pushSyncToCloud(syncCode, {
      favorites: favs,
      playlists: playlists,
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

        {/* Category Header & Drawer Opener */}
        <div className="px-3 py-1.5 bg-tv-surface/90 border-b border-tv-border flex items-center justify-between flex-shrink-0">
          <button
            onClick={() => setIsCategoryModalOpen(true)}
            className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-tv-card hover:bg-tv-cardHover border border-tv-border text-left transition"
          >
            <Layers className="w-4 h-4 text-tv-accent flex-shrink-0" />
            <span className="text-xs font-bold text-white truncate max-w-[190px]">
              {selectedCategory?.name || 'Groupes'}
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              ({filteredChannels.length})
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-1" />
          </button>

          <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
            {filteredChannels.length} chaînes
          </span>
        </div>

        {/* Horizontal Category Pills */}
        <div className="flex items-center space-x-2 px-3 py-2 bg-tv-surface/40 border-b border-tv-border overflow-x-auto scrollbar-none flex-shrink-0">
          {categoriesWithCounts.map((cat, idx) => {
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

        {/* Full-width Channel List */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
          {filteredChannels.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs">
              Aucune chaîne dans cette catégorie.
            </div>
          ) : (
            filteredChannels.map((ch, idx) => {
              const isActive = activeChannel?.id === ch.id;
              const chEpg = getMockEpgForChannel(ch.id);

              return (
                <div
                  key={ch.id}
                  onClick={() => {
                    setFocusedChannelIndex(idx);
                    handleSelectChannel(idx, false);
                  }}
                  className={`flex items-center justify-between p-3 rounded-xl border transition ${
                    isActive
                      ? 'bg-tv-card border-tv-accent shadow-md'
                      : 'bg-tv-card/50 border-tv-border/50 text-slate-300 hover:bg-tv-cardHover'
                  }`}
                >
                  <div className="flex items-center space-x-3 min-w-0 flex-1">
                    <span className={`text-xs font-mono font-bold w-6 text-right ${isActive ? 'text-tv-accent' : 'text-slate-500'}`}>
                      {ch.num}
                    </span>
                    <div className="w-9 h-9 rounded-lg bg-black/40 border border-white/5 flex items-center justify-center flex-shrink-0">
                      <span className="text-[11px] font-bold text-slate-200">
                        {ch.name.slice(0, 3)}
                      </span>
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
                        {chEpg.current.title}
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

        {/* Mobile Bottom Navigation Bar */}
        <div className="h-14 bg-tv-surface border-t border-tv-border flex items-center justify-around px-2 flex-shrink-0">
          <button
            onClick={() => {
              setActiveSection('live');
              const tntCat = categoriesWithCounts.find((c) => c.id === 'tnt');
              if (tntCat) handleSelectCategory(tntCat, 1);
            }}
            className={`flex flex-col items-center justify-center flex-1 py-1 ${activeSection === 'live' ? 'text-tv-accent' : 'text-slate-400'}`}
          >
            <Tv className="w-4 h-4" />
            <span className="text-[10px] mt-0.5">Direct</span>
          </button>

          <button
            onClick={() => setIsCategoryModalOpen(true)}
            className="flex flex-col items-center justify-center flex-1 py-1 text-slate-400 hover:text-tv-accent"
          >
            <Layers className="w-4 h-4" />
            <span className="text-[10px] mt-0.5 font-bold">Groupes</span>
          </button>

          <button
            onClick={() => {
              const favCat = categoriesWithCounts.find((c) => c.id === 'fav');
              if (favCat) handleSelectCategory(favCat, 0);
            }}
            className={`flex flex-col items-center justify-center flex-1 py-1 ${selectedCategory?.id === 'fav' ? 'text-amber-400' : 'text-slate-400'}`}
          >
            <Star className="w-4 h-4" />
            <span className="text-[10px] mt-0.5">Favoris</span>
          </button>

          <button
            onClick={() => {
              const cinemaCat = categoriesWithCounts.find((c) => c.id === 'cinema');
              if (cinemaCat) handleSelectCategory(cinemaCat, 3);
            }}
            className={`flex flex-col items-center justify-center flex-1 py-1 ${selectedCategory?.id === 'cinema' ? 'text-purple-400' : 'text-slate-400'}`}
          >
            <Film className="w-4 h-4" />
            <span className="text-[10px] mt-0.5">Films</span>
          </button>

          {/* PARAMETRES BUTTON (replaces the '+' button) */}
          <button
            onClick={() => setIsSettingsModalOpen(true)}
            className="flex flex-col items-center justify-center flex-1 py-1 text-slate-400 hover:text-tv-accent"
          >
            <Settings className="w-4 h-4" />
            <span className="text-[10px] mt-0.5 font-bold">Paramètres</span>
          </button>

          <button
            onClick={() => setIsSyncModalOpen(true)}
            className="flex flex-col items-center justify-center flex-1 py-1 text-emerald-400"
          >
            <RefreshCw className="w-4 h-4" />
            <span className="text-[10px] mt-0.5">Synchro</span>
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
            onSelectSection={setActiveSection}
            activePane={activePane}
            onOpenSyncModal={() => setIsSyncModalOpen(true)}
            onOpenSettingsModal={() => setIsSettingsModalOpen(true)}
          />

          <TVGuide
            categories={categoriesWithCounts}
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
        currentBuildNumber={6}
      />

      <CategoryDrawerModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        categories={categoriesWithCounts}
        selectedCategory={selectedCategory}
        onSelectCategory={handleSelectCategory}
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
    </main>
  );
}
