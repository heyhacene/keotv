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
  onSelectCategory: (index: number) => void;
  onSelectChannel: (index: number, fullscreen: boolean) => void;
  onToggleFavorite: (channelIndex: number) => void;
  onSelectMenuItem: (menuIndex: number) => void;
  isFullscreen: boolean;
  setIsFullscreen: (full: boolean) => void;
  onJumpToChannelNumber: (num: number) => void;
  onBack?: () => void;
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
  onSelectCategory,
  onSelectChannel,
  onToggleFavorite,
  onSelectMenuItem,
  isFullscreen,
  setIsFullscreen,
  onJumpToChannelNumber,
  onBack,
}: TVNavOptions) {
  const numberBufferRef = useRef<string>('');
  const numberTimerRef = useRef<NodeJS.Timeout | null>(null);

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
        }, 900);
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
          setFocusedChannelIndex((prev) => {
            const next = prev > 0 ? prev - 1 : Math.max(0, channelCount - 1);
            onSelectChannel(next, true);
            return next;
          });
          return;
        }
        if (isDown || isChannelDown) {
          e.preventDefault();
          setFocusedChannelIndex((prev) => {
            const next = prev < channelCount - 1 ? prev + 1 : 0;
            onSelectChannel(next, true);
            return next;
          });
          return;
        }
        return;
      }

      // TV Guide Navigation
      if (isUp) {
        e.preventDefault();
        if (activePane === 'channels') {
          setFocusedChannelIndex((prev) => (prev > 0 ? prev - 1 : Math.max(0, channelCount - 1)));
        } else if (activePane === 'categories') {
          setFocusedCategoryIndex((prev) => {
            const next = prev > 0 ? prev - 1 : Math.max(0, categoryCount - 1);
            onSelectCategory(next);
            return next;
          });
        } else if (activePane === 'menu') {
          setFocusedMenuIndex((prev) => (prev > 0 ? prev - 1 : 5));
        }
        return;
      }

      if (isDown) {
        e.preventDefault();
        if (activePane === 'channels') {
          setFocusedChannelIndex((prev) => (prev < channelCount - 1 ? prev + 1 : 0));
        } else if (activePane === 'categories') {
          setFocusedCategoryIndex((prev) => {
            const next = prev < categoryCount - 1 ? prev + 1 : 0;
            onSelectCategory(next);
            return next;
          });
        } else if (activePane === 'menu') {
          setFocusedMenuIndex((prev) => (prev < 5 ? prev + 1 : 0));
        }
        return;
      }

      if (isLeft) {
        e.preventDefault();
        if (activePane === 'channels') {
          setActivePane('categories');
        } else if (activePane === 'categories') {
          setActivePane('menu');
        }
        return;
      }

      if (isRight) {
        e.preventDefault();
        if (activePane === 'menu') {
          setActivePane('categories');
        } else if (activePane === 'categories') {
          setActivePane('channels');
        }
        return;
      }

      if (isEnter) {
        e.preventDefault();
        if (activePane === 'menu') {
          onSelectMenuItem(focusedMenuIndex);
        } else if (activePane === 'categories') {
          onSelectCategory(focusedCategoryIndex);
          setActivePane('channels');
        } else if (activePane === 'channels') {
          onSelectChannel(focusedChannelIndex, false);
        }
        return;
      }

      if (isBack) {
        e.preventDefault();
        if (onBack) {
          onBack();
          return;
        }
        if (activePane === 'channels') {
          setActivePane('categories');
        } else if (activePane === 'categories') {
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
      setFocusedCategoryIndex,
      setFocusedChannelIndex,
      setFocusedMenuIndex,
      onSelectCategory,
      onSelectChannel,
      onToggleFavorite,
      onSelectMenuItem,
      setIsFullscreen,
      onJumpToChannelNumber,
      onBack,
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
