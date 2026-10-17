'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { db, getSetting, setSetting } from '@/lib/db';
import { INITIAL_CATEGORIES, INITIAL_CHANNELS, getMockEpgForChannel } from '@/lib/mock-data';
import { Channel, Category, EpgProgram, NavigationPane } from '@/types/iptv';
import { useTVNavigation } from '@/lib/use-tv-navigation';
import { NavigationSidebar } from '@/components/NavigationSidebar';
import { TopBar } from '@/components/TopBar';
import { TVGuide } from '@/components/TVGuide';
import { LiveVideoPlayer } from '@/components/LiveVideoPlayer';
import { XtreamModal } from '@/components/XtreamModal';
import { SyncModal } from '@/components/SyncModal';
import { pushSyncToCloud, pullSyncFromCloud } from '@/lib/supabase';

export default function KeoTVHome() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);

  const [activePane, setActivePane] = useState<NavigationPane>('channels');
  const [focusedCategoryIndex, setFocusedCategoryIndex] = useState<number>(0);
  const [focusedChannelIndex, setFocusedChannelIndex] = useState<number>(0);

  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const [currentEpg, setCurrentEpg] = useState<EpgProgram | null>(null);
  const [nextEpg, setNextEpg] = useState<EpgProgram | null>(null);

  const [activeSection, setActiveSection] = useState<string>('live');
  const [syncCode, setSyncCode] = useState<string>('');

  const [isXtreamModalOpen, setIsXtreamModalOpen] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);

  // 1. Initialize IndexedDB & Seed initial channels on first launch
  useEffect(() => {
    async function initDB() {
      try {
        const catCount = await db.categories.count();
        if (catCount === 0) {
          await db.categories.bulkAdd(INITIAL_CATEGORIES);
          await db.channels.bulkAdd(INITIAL_CHANNELS);
        }

        const loadedCats = await db.categories.orderBy('custom_order').toArray();
        const loadedChannels = await db.channels.orderBy('num').toArray();

        setCategories(loadedCats);
        setChannels(loadedChannels);

        // Pick initial category & initial channel
        const initialCat = loadedCats.find((c) => c.id === 'tnt') || loadedCats[0];
        setSelectedCategory(initialCat || null);

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

  // Channel Selection: single press plays preview, second press goes fullscreen
  const handleSelectChannel = useCallback(
    (index: number, forceFullscreen: boolean = false) => {
      const targetChannel = filteredChannels[index];
      if (!targetChannel) return;

      if (activeChannel?.id === targetChannel.id || forceFullscreen) {
        setIsFullscreen(true);
      } else {
        setActiveChannel(targetChannel);
        const epg = getMockEpgForChannel(targetChannel.id);
        setCurrentEpg(epg.current);
        setNextEpg(epg.next);
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
    categoryCount: categories.length,
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

  // Save new playlist (Xtream / M3U)
  const handleSavePlaylist = async (data: any) => {
    const newPlaylist = {
      id: 'pl_' + Date.now(),
      name: data.name,
      type: data.type,
      server_url: data.server_url,
      username: data.username,
      password: data.password,
      m3u_url: data.m3u_url,
      status: 'active' as const,
      channel_count: 0,
      last_sync_at: new Date().toISOString(),
    };
    await db.playlists.add(newPlaylist);

    // If Xtream Codes: Add placeholder / demo group and simulate sync
    const newCat: Category = {
      id: 'grp_xtream_' + Date.now(),
      name: '🌐 ' + data.name,
      type: 'live',
      count: 1,
      is_hidden: false,
      custom_order: categories.length + 1,
      icon: 'Tv',
    };
    await db.categories.add(newCat);

    const newChannel: Channel = {
      id: 'ch_xtream_' + Date.now(),
      num: channels.length + 1,
      name: data.name + ' Flux Test',
      logo: '',
      stream_url: data.server_url.includes('.m3u8')
        ? data.server_url
        : 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
      stream_type: 'live',
      group_id: newCat.id,
      group_name: newCat.name,
      is_favorite: false,
      is_hidden: false,
      custom_order: 1,
      resolution: 'FHD',
    };
    await db.channels.add(newChannel);

    setCategories((prev) => [...prev, newCat]);
    setChannels((prev) => [...prev, newChannel]);
    setSelectedCategory(newCat);
  };

  // Cloud Sync Handler
  const handleApplySyncCode = async (code: string) => {
    const data = await pullSyncFromCloud(code);
    if (!data) return false;

    // Apply favorites
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

  return (
    <main className="h-screen w-screen flex flex-col bg-tv-bg overflow-hidden font-tv select-none">
      {/* Top Bar Header */}
      <TopBar
        currentCategoryName={selectedCategory?.name}
        onToggleFullscreen={() => setIsFullscreen(true)}
      />

      {/* Main TV Layout (Sidebar + Guide + Preview Player) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Leftmost Sidebar */}
        <NavigationSidebar
          activeSection={activeSection}
          onSelectSection={setActiveSection}
          activePane={activePane}
          onOpenSyncModal={() => setIsSyncModalOpen(true)}
          onOpenXtreamModal={() => setIsXtreamModalOpen(true)}
        />

        {/* Center: TV Guide (Categories + Channels + EPG description) */}
        <TVGuide
          categories={categories}
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
        />

        {/* Embedded Preview Player (Top-Right / Right Pane) */}
        <div className="hidden xl:flex w-80 2xl:w-96 border-l border-tv-border bg-black/40 p-4 flex-col justify-between">
          <div className="w-full aspect-video rounded-xl overflow-hidden shadow-2xl border border-tv-border bg-black">
            <LiveVideoPlayer
              channel={activeChannel}
              currentEpg={currentEpg}
              nextEpg={nextEpg}
              isFullscreen={false}
              onToggleFullscreen={() => setIsFullscreen(true)}
            />
          </div>

          <div className="bg-tv-card/40 p-4 rounded-xl border border-tv-border/40 mt-4 flex-1 flex flex-col justify-between">
            <div>
              <div className="text-xs uppercase font-bold text-tv-accent tracking-wider mb-1">
                Aperçu en direct
              </div>
              <p className="text-sm font-bold text-white truncate">
                {activeChannel?.name || 'Aucune chaîne active'}
              </p>
              <p className="text-xs text-slate-400 mt-1 line-clamp-3">
                {currentEpg?.description || 'Sélectionnez une chaîne dans la liste pour démarrer la lecture instantanée.'}
              </p>
            </div>

            <button
              onClick={() => setIsFullscreen(true)}
              className="w-full py-2.5 bg-tv-focus hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition shadow-lg mt-4"
            >
              Passer en plein écran (Entrée)
            </button>
          </div>
        </div>
      </div>

      {/* FULLSCREEN PLAYER OVERLAY */}
      {isFullscreen && (
        <LiveVideoPlayer
          channel={activeChannel}
          currentEpg={currentEpg}
          nextEpg={nextEpg}
          isFullscreen={true}
          onToggleFullscreen={() => setIsFullscreen(false)}
        />
      )}

      {/* MODALS */}
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
