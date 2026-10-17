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
import { Star, Tv, Film, Clapperboard, PlusCircle, RefreshCw, Trophy, Globe, Compass, Sparkles, Maximize2 } from 'lucide-react';

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
    <main className="h-screen w-screen flex flex-col bg-tv-bg overflow-hidden font-tv select-none text-slate-100">
      {/* ============================================================== */}
      {/* 1. MOBILE VIEW (Visible on Portrait / Small Screens < 1024px)  */}
      {/* ============================================================== */}
      <div className="flex lg:hidden flex-col h-full w-full bg-tv-bg overflow-hidden">
        {/* Top Video Player */}
        <div className="w-full aspect-video bg-black flex-shrink-0 relative">
          <LiveVideoPlayer
            channel={activeChannel}
            currentEpg={currentEpg}
            nextEpg={nextEpg}
            isFullscreen={false}
            onToggleFullscreen={() => setIsFullscreen(true)}
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
          <div className="flex items-center space-x-1">
            <button
              onClick={() => activeChannel && handleToggleFavorite(activeChannel)}
              className="p-1.5 text-slate-400 hover:text-amber-400 transition"
              title="Favori"
            >
              <Star className={`w-5 h-5 ${activeChannel?.is_favorite ? 'fill-amber-400 text-amber-400' : ''}`} />
            </button>
            <button
              onClick={() => setIsFullscreen(true)}
              className="p-1.5 text-slate-300 hover:text-white transition"
              title="Plein écran"
            >
              <Maximize2 className="w-5 h-5 text-tv-accent" />
            </button>
          </div>
        </div>

        {/* Horizontal Category Pills */}
        <div className="flex items-center space-x-2 px-3 py-2 bg-tv-surface/60 border-b border-tv-border overflow-x-auto scrollbar-none flex-shrink-0">
          {categories.map((cat, idx) => {
            const isSelected = selectedCategory?.id === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => handleSelectCategory(cat, idx)}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                  isSelected
                    ? 'bg-tv-focus text-white shadow-md'
                    : 'bg-tv-card text-slate-400 hover:text-white border border-tv-border/60'
                }`}
              >
                {getCategoryIcon(cat.icon)}
                <span>{cat.name}</span>
                <span className="text-[10px] opacity-75">({cat.count})</span>
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
            onClick={() => setActiveSection('live')}
            className={`flex flex-col items-center justify-center flex-1 py-1 ${activeSection === 'live' ? 'text-tv-accent' : 'text-slate-400'}`}
          >
            <Tv className="w-4 h-4" />
            <span className="text-[10px] mt-0.5">Direct</span>
          </button>
          <button
            onClick={() => setActiveSection('movies')}
            className={`flex flex-col items-center justify-center flex-1 py-1 ${activeSection === 'movies' ? 'text-tv-accent' : 'text-slate-400'}`}
          >
            <Film className="w-4 h-4" />
            <span className="text-[10px] mt-0.5">Films</span>
          </button>
          <button
            onClick={() => setActiveSection('series')}
            className={`flex flex-col items-center justify-center flex-1 py-1 ${activeSection === 'series' ? 'text-tv-accent' : 'text-slate-400'}`}
          >
            <Clapperboard className="w-4 h-4" />
            <span className="text-[10px] mt-0.5">Séries</span>
          </button>
          <button
            onClick={() => {
              const favCat = categories.find((c) => c.id === 'fav');
              if (favCat) handleSelectCategory(favCat, 0);
            }}
            className="flex flex-col items-center justify-center flex-1 py-1 text-slate-400 hover:text-amber-400"
          >
            <Star className="w-4 h-4" />
            <span className="text-[10px] mt-0.5">Favoris</span>
          </button>
          <button
            onClick={() => setIsXtreamModalOpen(true)}
            className="flex flex-col items-center justify-center flex-1 py-1 text-tv-accent"
          >
            <PlusCircle className="w-4 h-4" />
            <span className="text-[10px] mt-0.5">Ajouter</span>
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
        {/* Top Bar Header */}
        <TopBar
          currentCategoryName={selectedCategory?.name}
          onToggleFullscreen={() => setIsFullscreen(true)}
        />

        {/* Main TV Layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* Leftmost Sidebar */}
          <NavigationSidebar
            activeSection={activeSection}
            onSelectSection={setActiveSection}
            activePane={activePane}
            onOpenSyncModal={() => setIsSyncModalOpen(true)}
            onOpenXtreamModal={() => setIsXtreamModalOpen(true)}
          />

          {/* Center & Right: Complete TV Guide with integrated Preview Player */}
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
            onToggleFullscreen={() => setIsFullscreen(true)}
          />
        </div>
      </div>

      {/* ============================================================== */}
      {/* 3. FULLSCREEN PLAYER OVERLAY                                  */}
      {/* ============================================================== */}
      {isFullscreen && (
        <LiveVideoPlayer
          channel={activeChannel}
          currentEpg={currentEpg}
          nextEpg={nextEpg}
          isFullscreen={true}
          onToggleFullscreen={() => setIsFullscreen(false)}
        />
      )}

      {/* ============================================================== */}
      {/* 4. MODALS (Xtream & Cloud Sync)                               */}
      {/* ============================================================== */}
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
