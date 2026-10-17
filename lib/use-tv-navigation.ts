'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { NavigationPane } from '@/types/iptv';

interface TVNavOptions {
  activePane: NavigationPane;
  setActivePane: (pane: NavigationPane) => void;
  channelCount: number;
  categoryCount: number;
  focusedCategoryIndex: number;
  setFocusedCategoryIndex: (index: number | ((prev: number) => number)) => void;
  focusedChannelIndex: number;
  setFocusedChannelIndex: (index: number | ((prev: number) => number)) => void;
  onSelectChannel: (index: number, fullscreen: boolean) => void;
  onToggleFavorite: (channelIndex: number) => void;
  isFullscreen: boolean;
  setIsFullscreen: (full: boolean) => void;
  onJumpToChannelNumber: (num: number) => void;
}

export function useTVNavigation({
  activePane,
  setActivePane,
  channelCount,
  categoryCount,
  focusedCategoryIndex,
  setFocusedCategoryIndex,
  focusedChannelIndex,
  setFocusedChannelIndex,
  onSelectChannel,
  onToggleFavorite,
  isFullscreen,
  setIsFullscreen,
  onJumpToChannelNumber,
}: TVNavOptions) {
  const numberBufferRef = useRef<string>('');
  const numberTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Direct Channel Number Input (0-9)
      if (e.key >= '0' && e.key <= '9') {
        numberBufferRef.current += e.key;
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

      // Favorite toggle key ('f' or Media/Yellow button)
      if (e.key === 'f' || e.key === 'F' || e.code === 'KeyF') {
        if (activePane === 'channels' && channelCount > 0) {
          onToggleFavorite(focusedChannelIndex);
          return;
        }
      }

      // Handle Fullscreen Player Controls
      if (isFullscreen) {
        if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'GoBack') {
          e.preventDefault();
          setIsFullscreen(false);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          // Zap to previous channel in fullscreen
          setFocusedChannelIndex((prev) => {
            const next = prev > 0 ? prev - 1 : channelCount - 1;
            onSelectChannel(next, true);
            return next;
          });
          return;
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          // Zap to next channel in fullscreen
          setFocusedChannelIndex((prev) => {
            const next = prev < channelCount - 1 ? prev + 1 : 0;
            onSelectChannel(next, true);
            return next;
          });
          return;
        }
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          // Toggle OSD or exit fullscreen
          return;
        }
        return;
      }

      // Normal TV Guide Navigation
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          if (activePane === 'channels') {
            setFocusedChannelIndex((prev) => (prev > 0 ? prev - 1 : Math.max(0, channelCount - 1)));
          } else if (activePane === 'categories') {
            setFocusedCategoryIndex((prev) => (prev > 0 ? prev - 1 : Math.max(0, categoryCount - 1)));
          }
          break;

        case 'ArrowDown':
          e.preventDefault();
          if (activePane === 'channels') {
            setFocusedChannelIndex((prev) => (prev < channelCount - 1 ? prev + 1 : 0));
          } else if (activePane === 'categories') {
            setFocusedCategoryIndex((prev) => (prev < categoryCount - 1 ? prev + 1 : 0));
          }
          break;

        case 'ArrowLeft':
          e.preventDefault();
          if (activePane === 'channels') {
            setActivePane('categories');
          } else if (activePane === 'categories') {
            setActivePane('menu');
          }
          break;

        case 'ArrowRight':
          e.preventDefault();
          if (activePane === 'menu') {
            setActivePane('categories');
          } else if (activePane === 'categories') {
            setActivePane('channels');
          }
          break;

        case 'Enter':
        case 'Select':
          e.preventDefault();
          if (activePane === 'categories') {
            setActivePane('channels');
          } else if (activePane === 'channels') {
            onSelectChannel(focusedChannelIndex, false);
          }
          break;

        case 'Escape':
        case 'Backspace':
        case 'GoBack':
          e.preventDefault();
          if (activePane === 'channels') {
            setActivePane('categories');
          } else if (activePane === 'categories') {
            setActivePane('menu');
          }
          break;

        default:
          break;
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
      setFocusedCategoryIndex,
      setFocusedChannelIndex,
      onSelectChannel,
      onToggleFavorite,
      setIsFullscreen,
      onJumpToChannelNumber,
    ]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (numberTimerRef.current) clearTimeout(numberTimerRef.current);
    };
  }, [handleKeyDown]);
}
