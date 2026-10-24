'use client';

import { useEffect, useCallback, useRef } from 'react';
import { NavigationPane } from '@/types/iptv';

export interface TVNavOptions {
  enabled?: boolean;
  activePane: NavigationPane;
  setActivePane: (pane: NavigationPane) => void;
  channelCount: number;
  categoryCount: number;
  focusedCategoryIndex: number;
  setFocusedCategoryIndex: (index: number | ((prev: number) => number)) => void;
  focusedChannelIndex: number;
  setFocusedChannelIndex: (index: number | ((prev: number) => number)) => void;
  focusedMenuIndex: number;
  setFocusedMenuIndex: (index: number | ((prev: number) => number)) => void;
  focusedCategoryHeaderIndex?: number;
  setFocusedCategoryHeaderIndex?: (index: number | ((prev: number) => number)) => void;
  focusedChannelHeaderIndex?: number;
  setFocusedChannelHeaderIndex?: (index: number | ((prev: number) => number)) => void;
  onSelectCategory: (index: number, switchPane?: boolean) => void;
  onSelectChannel: (index: number, fullscreen: boolean) => void;
  onToggleFavorite: (channelIndex: number) => void;
  onOpenContextMenu?: (channelIndex: number) => void;
  onSelectMenuItem: (menuIndex: number) => void;
  onOpenCategoryManager?: () => void;
  onOpenSearch?: () => void;
  onCategorySortChange?: (sort: 'playlist' | 'alpha' | 'count') => void;
  onChannelSortChange?: (sort: 'playlist' | 'alpha' | 'num') => void;
  isFullscreen: boolean;
  setIsFullscreen: (full: boolean) => void;
  onJumpToChannelNumber: (num: number) => void;
  onJumpToCurrentCategory?: () => void;
  onBack?: () => void;
  onBoundaryHit?: (pane: NavigationPane | 'menu' | 'fullscreen', boundary: 'top' | 'bottom') => void;
}

export function useTVNavigation({
  enabled = true,
  activePane,
  setActivePane,
  channelCount,
  categoryCount,
  focusedCategoryIndex,
  setFocusedCategoryIndex,
  focusedChannelIndex,
  setFocusedChannelIndex,
  focusedMenuIndex,
  setFocusedMenuIndex,
  focusedCategoryHeaderIndex = 2,
  setFocusedCategoryHeaderIndex,
  focusedChannelHeaderIndex = 0,
  setFocusedChannelHeaderIndex,
  onSelectCategory,
  onSelectChannel,
  onToggleFavorite,
  onOpenContextMenu,
  onSelectMenuItem,
  onOpenCategoryManager,
  onOpenSearch,
  onCategorySortChange,
  onChannelSortChange,
  isFullscreen,
  setIsFullscreen,
  onJumpToChannelNumber,
  onJumpToCurrentCategory,
  onBack,
  onBoundaryHit,
}: TVNavOptions) {
  const numberBufferRef = useRef<string>('');
  const numberTimerRef = useRef<NodeJS.Timeout | null>(null);

  const focusedCategoryIndexRef = useRef(focusedCategoryIndex);
  focusedCategoryIndexRef.current = focusedCategoryIndex;
  const focusedChannelIndexRef = useRef(focusedChannelIndex);
  focusedChannelIndexRef.current = focusedChannelIndex;
  const focusedMenuIndexRef = useRef(focusedMenuIndex);
  focusedMenuIndexRef.current = focusedMenuIndex;
  const focusedCategoryHeaderIndexRef = useRef(focusedCategoryHeaderIndex);
  focusedCategoryHeaderIndexRef.current = focusedCategoryHeaderIndex;
  const focusedChannelHeaderIndexRef = useRef(focusedChannelHeaderIndex);
  focusedChannelHeaderIndexRef.current = focusedChannelHeaderIndex;

  // Track boundary attempts for list carousel blockage (gives user time to understand they are at the end)
  const boundaryAttemptRef = useRef<{
    pane: string;
    boundary: 'top' | 'bottom';
    timestamp: number;
  } | null>(null);

  const shouldAllowWrap = useCallback(
    (pane: string, boundary: 'top' | 'bottom', isRepeat: boolean): boolean => {
      const now = Date.now();
      const attempt = boundaryAttemptRef.current;

      // If first attempt at this boundary or happened more than 1200ms ago:
      if (!attempt || attempt.pane !== pane || attempt.boundary !== boundary || now - attempt.timestamp > 1200) {
        boundaryAttemptRef.current = { pane, boundary, timestamp: now };
        if (onBoundaryHit) {
          onBoundaryHit(pane as any, boundary);
        }
        return false; // LÉGER BLOCAGE: stop at the boundary!
      }

      const elapsed = now - attempt.timestamp;

      // When holding down the arrow key (repeat events):
      // Require holding through a clear 380ms pause at the boundary before wrapping
      if (isRepeat) {
        if (elapsed < 380) {
          return false;
        }
        boundaryAttemptRef.current = null;
        return true;
      }

      // Ignore rapid switch debounce chatter < 40ms for faster scrolling
      if (elapsed < 40) {
        return false;
      }

      // Deliberate second press: allow wrap back to the start!
      boundaryAttemptRef.current = null;
      return true;
    },
    [onBoundaryHit]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (enabled === false) return;
      const keyCode = (e as any).keyCode || 0;
      const key = e.key || '';

      // Direct Channel Number Input (0-9)
      if (key >= '0' && key <= '9') {
        numberBufferRef.current += key;
        if (numberTimerRef.current) clearTimeout(numberTimerRef.current);
        numberTimerRef.current = setTimeout(() => {
          const channelNum = parseInt(numberBufferRef.current, 10);
          if (!isNaN(channelNum)) {
            onJumpToChannelNumber(channelNum);
          }
          numberBufferRef.current = '';
        }, 600);
        return;
      }

      // Identify key intentions across TV remotes & web browsers
      const isEnter =
        key === 'Enter' ||
        key === 'Select' ||
        key === 'Ok' ||
        key === 'Accept' ||
        keyCode === 13 ||
        keyCode === 23 || // Android KEYCODE_DPAD_CENTER
        keyCode === 66;   // Android KEYCODE_ENTER

      const isUp =
        key === 'ArrowUp' ||
        key === 'Up' ||
        keyCode === 38 ||
        keyCode === 19;   // Android KEYCODE_DPAD_UP

      const isDown =
        key === 'ArrowDown' ||
        key === 'Down' ||
        keyCode === 40 ||
        keyCode === 20;   // Android KEYCODE_DPAD_DOWN

      const isLeft =
        key === 'ArrowLeft' ||
        key === 'Left' ||
        keyCode === 37 ||
        keyCode === 21;   // Android KEYCODE_DPAD_LEFT

      const isRight =
        key === 'ArrowRight' ||
        key === 'Right' ||
        keyCode === 39 ||
        keyCode === 22;   // Android KEYCODE_DPAD_RIGHT

      const isBack =
        key === 'Escape' ||
        key === 'Backspace' ||
        key === 'GoBack' ||
        key === 'Back' ||
        keyCode === 27 ||
        keyCode === 4;    // Android KEYCODE_BACK

      const isFav =
        key === 'f' ||
        key === 'F' ||
        e.code === 'KeyF' ||
        keyCode === 185;  // PROG_YELLOW on TV remotes

      const isChannelUp = key === 'ChannelUp' || key === 'PageUp' || keyCode === 33 || keyCode === 166;
      const isChannelDown = key === 'ChannelDown' || key === 'PageDown' || keyCode === 34 || keyCode === 167;

      // Menu key (Android TV keyCode 82 or Menu button)
      const isMenu = key === 'Menu' || keyCode === 82;
      if (isMenu) {
        if (activePane === 'channels' && onOpenContextMenu && channelCount > 0) {
          e.preventDefault();
          onOpenContextMenu(focusedChannelIndexRef.current);
          return;
        }
      }

      // Favorite toggle key ('f' or Media/Yellow button)
      if (isFav) {
        if (activePane === 'channels' && channelCount > 0) {
          e.preventDefault();
          onToggleFavorite(focusedChannelIndex);
          return;
        }
      }

      // Handle Fullscreen Player Controls
      if (isFullscreen) {
        if (isBack) {
          e.preventDefault();
          if (onBack) {
            onBack();
            return;
          }
          setIsFullscreen(false);
          return;
        }
        if (isUp || isChannelUp) {
          e.preventDefault();
          if (channelCount <= 1) return;
          const current = focusedChannelIndexRef.current;
          if (current >= channelCount - 1) {
            if (shouldAllowWrap('fullscreen', 'bottom', e.repeat)) {
              setFocusedChannelIndex(0);
              onSelectChannel(0, true);
            }
          } else {
            boundaryAttemptRef.current = null;
            const next = current + 1;
            setFocusedChannelIndex(next);
            onSelectChannel(next, true);
          }
          return;
        }
        if (isDown || isChannelDown) {
          e.preventDefault();
          if (channelCount <= 1) return;
          const current = focusedChannelIndexRef.current;
          if (current <= 0) {
            if (shouldAllowWrap('fullscreen', 'top', e.repeat)) {
              const next = channelCount - 1;
              setFocusedChannelIndex(next);
              onSelectChannel(next, true);
            }
          } else {
            boundaryAttemptRef.current = null;
            const next = current - 1;
            setFocusedChannelIndex(next);
            onSelectChannel(next, true);
          }
          return;
        }
        return;
      }

      // TV Guide Navigation
      if (isUp) {
        e.preventDefault();
        if (activePane === 'channels') {
          const current = focusedChannelIndexRef.current;
          if (current <= 0) {
            // Move up into channel header sort bar!
            setActivePane('channel_header');
            setFocusedChannelHeaderIndex?.(0);
          } else {
            boundaryAttemptRef.current = null;
            setFocusedChannelIndex((prev) => Math.max(0, prev - 1));
          }
        } else if (activePane === 'channel_header') {
          // Already at top
        } else if (activePane === 'categories') {
          const current = focusedCategoryIndexRef.current;
          if (current <= 0) {
            // Move up into category header sort bar (row 2: sort pills)
            setActivePane('category_header');
            setFocusedCategoryHeaderIndex?.(2);
          } else {
            boundaryAttemptRef.current = null;
            setFocusedCategoryIndex((prev) => Math.max(0, prev - 1));
          }
        } else if (activePane === 'category_header') {
          const current = focusedCategoryHeaderIndexRef.current;
          if (current >= 2) {
            // Row 2 (2: playlist, 3: alpha, 4: count) -> move up to Row 1 (0: order, 1: search)
            const next = current === 4 ? 1 : 0;
            setFocusedCategoryHeaderIndex?.(next);
          }
        } else if (activePane === 'menu') {
          const current = focusedMenuIndexRef.current;
          if (current <= 0) {
            if (shouldAllowWrap('menu', 'top', e.repeat)) {
              setFocusedMenuIndex(6);
            }
          } else {
            boundaryAttemptRef.current = null;
            setFocusedMenuIndex((prev) => Math.max(0, prev - 1));
          }
        }
        return;
      }

      if (isDown) {
        e.preventDefault();
        if (activePane === 'channels') {
          if (channelCount <= 1) return;
          const current = focusedChannelIndexRef.current;
          if (current >= channelCount - 1) {
            if (shouldAllowWrap('channels', 'bottom', e.repeat)) {
              setFocusedChannelIndex(0);
            }
          } else {
            boundaryAttemptRef.current = null;
            setFocusedChannelIndex((prev) => prev + 1);
          }
        } else if (activePane === 'channel_header') {
          // Down from channel header enters channel list at index 0
          setActivePane('channels');
          setFocusedChannelIndex(0);
        } else if (activePane === 'categories') {
          if (categoryCount <= 1) return;
          const current = focusedCategoryIndexRef.current;
          if (current >= categoryCount - 1) {
            if (shouldAllowWrap('categories', 'bottom', e.repeat)) {
              setFocusedCategoryIndex(0);
            }
          } else {
            boundaryAttemptRef.current = null;
            setFocusedCategoryIndex((prev) => prev + 1);
          }
        } else if (activePane === 'category_header') {
          const current = focusedCategoryHeaderIndexRef.current;
          if (current <= 1) {
            // Row 1 -> Row 2 (0 -> 2: playlist, 1 -> 4: count)
            const next = current === 0 ? 2 : 4;
            setFocusedCategoryHeaderIndex?.(next);
          } else {
            // Row 2 -> Enter category list at index 0
            setActivePane('categories');
            setFocusedCategoryIndex(0);
          }
        } else if (activePane === 'menu') {
          const current = focusedMenuIndexRef.current;
          if (current >= 6) {
            if (shouldAllowWrap('menu', 'bottom', e.repeat)) {
              setFocusedMenuIndex(0);
            }
          } else {
            boundaryAttemptRef.current = null;
            setFocusedMenuIndex((prev) => prev + 1);
          }
        }
        return;
      }

      if (isLeft) {
        e.preventDefault();
        boundaryAttemptRef.current = null;
        if (activePane === 'channels') {
          if (onJumpToCurrentCategory) {
            onJumpToCurrentCategory();
          }
          setActivePane('categories');
        } else if (activePane === 'channel_header') {
          const current = focusedChannelHeaderIndexRef.current;
          if (current > 0) {
            setFocusedChannelHeaderIndex?.((prev) => Math.max(0, prev - 1));
          } else {
            setActivePane('category_header');
            setFocusedCategoryHeaderIndex?.(4);
          }
        } else if (activePane === 'categories') {
          setActivePane('menu');
        } else if (activePane === 'category_header') {
          const current = focusedCategoryHeaderIndexRef.current;
          if (current === 1) {
            setFocusedCategoryHeaderIndex?.(0);
          } else if (current === 0) {
            setActivePane('menu');
          } else if (current > 2) {
            setFocusedCategoryHeaderIndex?.((prev) => Math.max(2, prev - 1));
          } else if (current === 2) {
            setActivePane('menu');
          }
        }
        return;
      }

      if (isRight) {
        e.preventDefault();
        boundaryAttemptRef.current = null;
        if (activePane === 'menu') {
          setActivePane('categories');
        } else if (activePane === 'categories') {
          onSelectCategory(focusedCategoryIndexRef.current, true);
          setActivePane('channels');
        } else if (activePane === 'category_header') {
          const current = focusedCategoryHeaderIndexRef.current;
          if (current === 0) {
            setFocusedCategoryHeaderIndex?.(1);
          } else if (current === 1) {
            setActivePane('channel_header');
            setFocusedChannelHeaderIndex?.(0);
          } else if (current < 4) {
            setFocusedCategoryHeaderIndex?.((prev) => Math.min(4, prev + 1));
          } else if (current === 4) {
            setActivePane('channels');
            setFocusedChannelIndex(0);
          }
        } else if (activePane === 'channel_header') {
          const current = focusedChannelHeaderIndexRef.current;
          if (current < 2) {
            setFocusedChannelHeaderIndex?.((prev) => Math.min(2, prev + 1));
          }
        }
        return;
      }

      if (isEnter) {
        boundaryAttemptRef.current = null;
        if (e.repeat && activePane === 'channels' && onOpenContextMenu && channelCount > 0) {
          e.preventDefault();
          onOpenContextMenu(focusedChannelIndexRef.current);
          return;
        }
        e.preventDefault();
        if (activePane === 'menu') {
          onSelectMenuItem(focusedMenuIndexRef.current);
        } else if (activePane === 'categories') {
          onSelectCategory(focusedCategoryIndexRef.current, true);
          setActivePane('channels');
        } else if (activePane === 'category_header') {
          const current = focusedCategoryHeaderIndexRef.current;
          if (current === 0) {
            onOpenCategoryManager?.();
          } else if (current === 1) {
            onOpenSearch?.();
          } else if (current === 2) {
            onCategorySortChange?.('playlist');
          } else if (current === 3) {
            onCategorySortChange?.('alpha');
          } else if (current === 4) {
            onCategorySortChange?.('count');
          }
        } else if (activePane === 'channel_header') {
          const current = focusedChannelHeaderIndexRef.current;
          if (current === 0) {
            onChannelSortChange?.('playlist');
          } else if (current === 1) {
            onChannelSortChange?.('alpha');
          } else if (current === 2) {
            onChannelSortChange?.('num');
          }
        } else if (activePane === 'channels') {
          onSelectChannel(focusedChannelIndexRef.current, false);
        }
        return;
      }

      if (isBack) {
        e.preventDefault();
        boundaryAttemptRef.current = null;
        if (onBack) {
          onBack();
          return;
        }
        if (activePane === 'channels' || activePane === 'channel_header') {
          setActivePane('categories');
        } else if (activePane === 'categories' || activePane === 'category_header') {
          setActivePane('menu');
        }
        return;
      }
    },
    [
      isFullscreen,
      activePane,
      setActivePane,
      channelCount,
      categoryCount,
      focusedCategoryIndex,
      focusedChannelIndex,
      focusedMenuIndex,
      focusedCategoryHeaderIndex,
      focusedChannelHeaderIndex,
      setFocusedCategoryIndex,
      setFocusedChannelIndex,
      setFocusedMenuIndex,
      setFocusedCategoryHeaderIndex,
      setFocusedChannelHeaderIndex,
      onSelectCategory,
      onSelectChannel,
      onToggleFavorite,
      onOpenContextMenu,
      onSelectMenuItem,
      onOpenCategoryManager,
      onOpenSearch,
      onCategorySortChange,
      onChannelSortChange,
      setIsFullscreen,
      onJumpToChannelNumber,
      onBack,
      shouldAllowWrap,
    ]
  );

  useEffect(() => {
    if (enabled === false) return;
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (numberTimerRef.current) clearTimeout(numberTimerRef.current);
    };
  }, [enabled, handleKeyDown]);
}
