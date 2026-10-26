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
  focusedRightPanelIndex?: number;
  setFocusedRightPanelIndex?: (index: number | ((prev: number) => number)) => void;
  rightPanelButtonCount?: number;
  onSelectRightPanelAction?: (buttonIndex: number) => void;
  // TiviMate EPG Timeline Grid Navigation
  isLiveTimelineMode?: boolean;
  focusedProgramOffset?: number;
  setFocusedProgramOffset?: (offset: number | ((prev: number) => number)) => void;
  isPastUnlocked?: boolean;
  setIsPastUnlocked?: (unlocked: boolean) => void;
  minProgramOffset?: number;
  maxProgramOffset?: number;
  onSelectTimelineProgram?: (channelIndex: number, programOffset: number) => void;
  onUnlockPastPrograms?: (channelIndex: number) => void;
  onOpenCatchup?: (channelIndex: number) => void;
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
  focusedRightPanelIndex = 0,
  setFocusedRightPanelIndex,
  rightPanelButtonCount = 1,
  onSelectRightPanelAction,
  isLiveTimelineMode = false,
  focusedProgramOffset = 0,
  setFocusedProgramOffset,
  isPastUnlocked = false,
  setIsPastUnlocked,
  minProgramOffset = -168,
  maxProgramOffset = 48,
  onSelectTimelineProgram,
  onUnlockPastPrograms,
  onOpenCatchup,
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

  // Calibrated Long-press vs Short-press state for TV remote OK / Enter button (800ms hold)
  const enterDownPaneRef = useRef<NavigationPane | null>(null);
  const enterDownTimeRef = useRef<number>(0);
  const enterHoldTimerRef = useRef<NodeJS.Timeout | null>(null);
  const longPressFiredRef = useRef<boolean>(false);

  // Long-press DPAD_LEFT state in epg_grid to unlock past programs (TiviMate style)
  const leftDownInEpgRef = useRef<boolean>(false);
  const leftHoldTimerRef = useRef<NodeJS.Timeout | null>(null);
  const leftLongPressFiredRef = useRef<boolean>(false);

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
  const focusedRightPanelIndexRef = useRef(focusedRightPanelIndex);
  focusedRightPanelIndexRef.current = focusedRightPanelIndex;
  const focusedProgramOffsetRef = useRef(focusedProgramOffset);
  focusedProgramOffsetRef.current = focusedProgramOffset;
  const isPastUnlockedRef = useRef(isPastUnlocked);
  isPastUnlockedRef.current = isPastUnlocked;

  const clearEnterHoldTimer = useCallback(() => {
    if (enterHoldTimerRef.current) {
      clearTimeout(enterHoldTimerRef.current);
      enterHoldTimerRef.current = null;
    }
  }, []);

  const clearLeftHoldTimer = useCallback(() => {
    if (leftHoldTimerRef.current) {
      clearTimeout(leftHoldTimerRef.current);
      leftHoldTimerRef.current = null;
    }
  }, []);

  // Track boundary attempts for list carousel blockage
  const boundaryAttemptRef = useRef<{
    pane: string;
    boundary: 'top' | 'bottom';
    timestamp: number;
  } | null>(null);

  const shouldAllowWrap = useCallback(
    (pane: string, boundary: 'top' | 'bottom', isRepeat: boolean): boolean => {
      const now = Date.now();
      const attempt = boundaryAttemptRef.current;

      if (!attempt || attempt.pane !== pane || attempt.boundary !== boundary || now - attempt.timestamp > 1200) {
        boundaryAttemptRef.current = { pane, boundary, timestamp: now };
        if (onBoundaryHit) {
          onBoundaryHit(pane as any, boundary);
        }
        return false;
      }

      const elapsed = now - attempt.timestamp;

      if (isRepeat) {
        if (elapsed < 380) {
          return false;
        }
        boundaryAttemptRef.current = null;
        return true;
      }

      if (elapsed < 40) {
        return false;
      }

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

      const isGreenReplay =
        key === 'r' ||
        key === 'R' ||
        e.code === 'KeyR' ||
        key === 'ColorF1Green' ||
        keyCode === 184;  // PROG_GREEN on TV remotes

      const isChannelUp = key === 'ChannelUp' || key === 'PageUp' || keyCode === 33 || keyCode === 166;
      const isChannelDown = key === 'ChannelDown' || key === 'PageDown' || keyCode === 34 || keyCode === 167;

      // Menu / Info / Context key (Android TV keyCode 82, 165 Info, or ContextMenu)
      const isMenu = key === 'Menu' || key === 'ContextMenu' || key === 'Info' || keyCode === 82 || keyCode === 165;
      if (isMenu) {
        if ((activePane === 'channels' || activePane === 'epg_grid' || activePane === 'categories') && onOpenContextMenu) {
          e.preventDefault();
          clearEnterHoldTimer();
          longPressFiredRef.current = true;
          onOpenContextMenu(
            activePane === 'categories' ? focusedCategoryIndexRef.current : focusedChannelIndexRef.current
          );
          return;
        }
      }

      // Green button or 'R' key: Direct Replay / Catchup shortcut
      if (isGreenReplay) {
        if ((activePane === 'channels' || activePane === 'epg_grid' || activePane === 'right_panel') && onOpenCatchup && channelCount > 0) {
          e.preventDefault();
          onOpenCatchup(focusedChannelIndexRef.current);
          return;
        }
      }

      // Favorite toggle key ('f' or Media/Yellow button)
      if (isFav) {
        if ((activePane === 'channels' || activePane === 'epg_grid' || activePane === 'right_panel') && channelCount > 0) {
          e.preventDefault();
          onToggleFavorite(focusedChannelIndexRef.current);
          return;
        }
      }

      // Cancel any pending Enter hold timer if user presses a directional or back key
      if (isUp || isDown || isLeft || isRight || isBack) {
        clearEnterHoldTimer();
        enterDownPaneRef.current = null;
        longPressFiredRef.current = false;
      }

      if (isUp || isDown || isRight || isEnter || isBack) {
        clearLeftHoldTimer();
        leftDownInEpgRef.current = false;
        leftLongPressFiredRef.current = false;
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
        if (activePane === 'right_panel') {
          const current = focusedRightPanelIndexRef.current;
          if (current > 0) {
            setFocusedRightPanelIndex?.((prev) => Math.max(0, prev - 1));
          }
        } else if (activePane === 'epg_grid') {
          const current = focusedChannelIndexRef.current;
          if (current <= 0) {
            if (shouldAllowWrap('channels', 'top', e.repeat)) {
              setFocusedChannelIndex(Math.max(0, channelCount - 1));
            }
          } else {
            boundaryAttemptRef.current = null;
            setFocusedChannelIndex((prev) => Math.max(0, prev - 1));
          }
        } else if (activePane === 'channels') {
          const current = focusedChannelIndexRef.current;
          if (current <= 0) {
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
            setActivePane('category_header');
            setFocusedCategoryHeaderIndex?.(2);
          } else {
            boundaryAttemptRef.current = null;
            setFocusedCategoryIndex((prev) => Math.max(0, prev - 1));
          }
        } else if (activePane === 'category_header') {
          const current = focusedCategoryHeaderIndexRef.current;
          if (current >= 2) {
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
        if (activePane === 'right_panel') {
          const current = focusedRightPanelIndexRef.current;
          const maxIdx = Math.max(0, rightPanelButtonCount - 1);
          if (current < maxIdx) {
            setFocusedRightPanelIndex?.((prev) => Math.min(maxIdx, prev + 1));
          }
        } else if (activePane === 'epg_grid') {
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
        } else if (activePane === 'channels') {
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
            const next = current === 0 ? 2 : 4;
            setFocusedCategoryHeaderIndex?.(next);
          } else {
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

        // TiviMate EPG Timeline Navigation (activePane === 'epg_grid')
        if (activePane === 'epg_grid') {
          const curOffset = focusedProgramOffsetRef.current;

          // 1. If currently on a future program (offset > 0), move left toward live (0)
          if (curOffset > 0) {
            setFocusedProgramOffset?.((prev) => prev - 1);
            return;
          }

          // 2. If past programs are already unlocked, move further left into past programs (down to minProgramOffset)
          if (isPastUnlockedRef.current && curOffset <= 0) {
            if (curOffset > minProgramOffset) {
              setFocusedProgramOffset?.((prev) => Math.max(minProgramOffset, prev - 1));
            }
            return;
          }

          // 3. Currently at live program (curOffset === 0) and past is locked:
          // - Short press DPAD_LEFT (handled on keyup): returns to channel list and re-opens bouquets column!
          // - Long press DPAD_LEFT (e.repeat or hold >= 240ms): unlocks past programs (Replay / Catchup) and steps into offset -1!
          if (e.repeat) {
            if (!leftLongPressFiredRef.current) {
              clearLeftHoldTimer();
              leftLongPressFiredRef.current = true;
              leftDownInEpgRef.current = false;
              setIsPastUnlocked?.(true);
              setFocusedProgramOffset?.(-1);
              onUnlockPastPrograms?.(focusedChannelIndexRef.current);
            }
            return;
          }

          leftDownInEpgRef.current = true;
          leftLongPressFiredRef.current = false;
          clearLeftHoldTimer();
          leftHoldTimerRef.current = setTimeout(() => {
            leftLongPressFiredRef.current = true;
            leftDownInEpgRef.current = false;
            leftHoldTimerRef.current = null;
            setIsPastUnlocked?.(true);
            setFocusedProgramOffset?.(-1);
            onUnlockPastPrograms?.(focusedChannelIndexRef.current);
          }, 240);
          return;
        }

        if (activePane === 'right_panel') {
          setActivePane('channels');
        } else if (activePane === 'channels') {
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
        } else if (activePane === 'channels') {
          // In Live TV (TiviMate mode): DPAD_RIGHT collapses the bouquets list and enters the horizontal Program Timeline!
          if (isLiveTimelineMode && channelCount > 0) {
            setIsPastUnlocked?.(false);
            setFocusedProgramOffset?.(0);
            setActivePane('epg_grid');
          } else if (rightPanelButtonCount > 0) {
            setFocusedRightPanelIndex?.(0);
            setActivePane('right_panel');
          }
        } else if (activePane === 'epg_grid') {
          const curOffset = focusedProgramOffsetRef.current;
          if (curOffset < maxProgramOffset) {
            const nextOffset = curOffset + 1;
            setFocusedProgramOffset?.(nextOffset);
            if (nextOffset >= 0 && isPastUnlockedRef.current) {
              setIsPastUnlocked?.(false);
            }
          }
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
          } else if (isLiveTimelineMode && channelCount > 0) {
            setIsPastUnlocked?.(false);
            setFocusedProgramOffset?.(0);
            setActivePane('epg_grid');
          } else if (rightPanelButtonCount > 0) {
            setFocusedRightPanelIndex?.(0);
            setActivePane('right_panel');
          }
        }
        return;
      }

      if (isEnter) {
        boundaryAttemptRef.current = null;
        e.preventDefault();

        // In EPG timeline grid: immediate press on OK launches the channel (if live/future) or Replay (if past)!
        if (activePane === 'epg_grid') {
          if (e.repeat) return;
          if (onSelectTimelineProgram && channelCount > 0) {
            onSelectTimelineProgram(focusedChannelIndexRef.current, focusedProgramOffsetRef.current);
          }
          return;
        }

        // For 'channels' and 'categories':
        // Calibrated to 850ms hold so normal clicks NEVER accidentally trigger the context menu,
        // and holding OK deliberately for ~0.85s reliably opens the ContextMenuModal!
        if (activePane === 'channels' || activePane === 'categories') {
          const itemCount = activePane === 'channels' ? channelCount : categoryCount;
          if (itemCount <= 0) return;

          if (e.repeat) {
            const heldDuration = enterDownTimeRef.current > 0 ? Date.now() - enterDownTimeRef.current : 0;
            if (heldDuration >= 800 && !longPressFiredRef.current && onOpenContextMenu) {
              clearEnterHoldTimer();
              longPressFiredRef.current = true;
              onOpenContextMenu(
                activePane === 'channels' ? focusedChannelIndexRef.current : focusedCategoryIndexRef.current
              );
            }
            return;
          }

          enterDownPaneRef.current = activePane;
          enterDownTimeRef.current = Date.now();
          longPressFiredRef.current = false;
          clearEnterHoldTimer();
          if (onOpenContextMenu) {
            const targetIdx =
              activePane === 'channels' ? focusedChannelIndexRef.current : focusedCategoryIndexRef.current;
            enterHoldTimerRef.current = setTimeout(() => {
              longPressFiredRef.current = true;
              enterHoldTimerRef.current = null;
              onOpenContextMenu(targetIdx);
            }, 850);
          }
          return;
        }

        if (e.repeat) return;

        if (activePane === 'right_panel') {
          onSelectRightPanelAction?.(focusedRightPanelIndexRef.current);
        } else if (activePane === 'menu') {
          onSelectMenuItem(focusedMenuIndexRef.current);
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
        if (activePane === 'epg_grid') {
          setIsPastUnlocked?.(false);
          setFocusedProgramOffset?.(0);
          setActivePane('channels');
        } else if (activePane === 'right_panel') {
          setActivePane('channels');
        } else if (activePane === 'channels' || activePane === 'channel_header') {
          setActivePane('categories');
        } else if (activePane === 'categories' || activePane === 'category_header') {
          setActivePane('menu');
        }
        return;
      }
    },
    [
      enabled,
      isFullscreen,
      activePane,
      setActivePane,
      channelCount,
      categoryCount,
      rightPanelButtonCount,
      isLiveTimelineMode,
      minProgramOffset,
      maxProgramOffset,
      setFocusedCategoryIndex,
      setFocusedChannelIndex,
      setFocusedMenuIndex,
      setFocusedCategoryHeaderIndex,
      setFocusedChannelHeaderIndex,
      setFocusedRightPanelIndex,
      setFocusedProgramOffset,
      setIsPastUnlocked,
      onSelectRightPanelAction,
      onSelectTimelineProgram,
      onUnlockPastPrograms,
      onOpenCatchup,
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
      onJumpToCurrentCategory,
      onBack,
      shouldAllowWrap,
      clearEnterHoldTimer,
      clearLeftHoldTimer,
    ]
  );

  const handleKeyUp = useCallback(
    (e: KeyboardEvent) => {
      if (enabled === false) return;
      const keyCode = (e as any).keyCode || 0;
      const key = e.key || '';

      const isEnter =
        key === 'Enter' ||
        key === 'Select' ||
        key === 'Ok' ||
        key === 'Accept' ||
        keyCode === 13 ||
        keyCode === 23 ||
        keyCode === 66;

      const isLeft =
        key === 'ArrowLeft' ||
        key === 'Left' ||
        keyCode === 37 ||
        keyCode === 21;

      if (isLeft && activePane === 'epg_grid') {
        clearLeftHoldTimer();
        const wasDown = leftDownInEpgRef.current;
        const wasLong = leftLongPressFiredRef.current;
        leftDownInEpgRef.current = false;
        leftLongPressFiredRef.current = false;

        if (!wasLong && wasDown && focusedProgramOffsetRef.current === 0 && !isPastUnlockedRef.current) {
          e.preventDefault();
          // Short press Left from live program: return to channels list & re-show bouquets!
          setIsPastUnlocked?.(false);
          setFocusedProgramOffset?.(0);
          setActivePane('channels');
        }
        return;
      }

      if (!isEnter) return;

      clearEnterHoldTimer();
      const downPane = enterDownPaneRef.current;
      const wasLongPress = longPressFiredRef.current;

      enterDownPaneRef.current = null;
      enterDownTimeRef.current = 0;
      longPressFiredRef.current = false;

      if (wasLongPress || !downPane) {
        return;
      }

      // Short press completed! Trigger the primary action for channels or categories
      e.preventDefault();
      if (downPane === 'channels' && activePane === 'channels' && channelCount > 0) {
        onSelectChannel(focusedChannelIndexRef.current, false);
      } else if (downPane === 'categories' && activePane === 'categories' && categoryCount > 0) {
        onSelectCategory(focusedCategoryIndexRef.current, true);
        setActivePane('channels');
      }
    },
    [
      enabled,
      activePane,
      channelCount,
      categoryCount,
      onSelectChannel,
      onSelectCategory,
      setActivePane,
      setFocusedProgramOffset,
      setIsPastUnlocked,
      clearEnterHoldTimer,
      clearLeftHoldTimer,
    ]
  );

  useEffect(() => {
    if (enabled === false) {
      clearEnterHoldTimer();
      clearLeftHoldTimer();
      enterDownPaneRef.current = null;
      longPressFiredRef.current = false;
      leftDownInEpgRef.current = false;
      leftLongPressFiredRef.current = false;
      return;
    }
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      clearEnterHoldTimer();
      clearLeftHoldTimer();
      if (numberTimerRef.current) clearTimeout(numberTimerRef.current);
    };
  }, [enabled, handleKeyDown, handleKeyUp, clearEnterHoldTimer, clearLeftHoldTimer]);
}


