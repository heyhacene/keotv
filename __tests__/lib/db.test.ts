import 'fake-indexeddb/auto';
import { getFavoriteChannelIds, saveFavoriteChannelId, db, getSetting, setSetting } from '../../lib/db';

describe('db.ts - Favorite Channels', () => {
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;

  beforeEach(async () => {
    // Clear databases before each test
    await db.settings.clear();
    await db.channels.clear();
    // Silence console warnings for expected error tests
    console.error = jest.fn();
    console.warn = jest.fn();
  });

  afterEach(() => {
    // Restore console warnings
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
    jest.restoreAllMocks();
  });

  afterAll(() => {
    db.close();
  });

  describe('getSetting', () => {
    it('should catch errors and log error', async () => {
      const getSpy = jest.spyOn(db.settings, 'get').mockRejectedValue(new Error('Simulated failure'));

      const val = await getSetting('favorite_channel_ids', ['default']);

      expect(console.error).toHaveBeenCalledWith('Failed to get setting', 'favorite_channel_ids', expect.any(Error));
      expect(val).toEqual(['default']);

      getSpy.mockRestore();
    });
  });

  describe('setSetting', () => {
    it('should catch errors and log error', async () => {
      const putSpy = jest.spyOn(db.settings, 'put').mockRejectedValue(new Error('Simulated failure'));

      await setSetting('favorite_channel_ids', ['channel1']);

      expect(console.error).toHaveBeenCalledWith('Failed to save setting', 'favorite_channel_ids', expect.any(Error));

      putSpy.mockRestore();
    });
  });

  describe('getFavoriteChannelIds', () => {
    it('should return an empty set if no favorites exist', async () => {
      const favorites = await getFavoriteChannelIds();
      expect(favorites.size).toBe(0);
    });

    it('should return favorites stored in settings', async () => {
      await db.settings.put({ key: 'favorite_channel_ids', value: ['channel1', 'channel2'] });
      const favorites = await getFavoriteChannelIds();
      expect(favorites.size).toBe(2);
      expect(favorites.has('channel1')).toBe(true);
      expect(favorites.has('channel2')).toBe(true);
    });

    it('should handle settings returning non-array gracefully', async () => {
      // Simulate corrupted data where settings value is not an array
      await db.settings.put({ key: 'favorite_channel_ids', value: 'not-an-array' });
      const favorites = await getFavoriteChannelIds();
      expect(favorites.size).toBe(0);
    });

    it('should harvest favorites from db.channels if they are not in settings', async () => {
      await db.channels.put({ id: 'channel1', name: 'Channel 1', is_favorite: true } as any);
      await db.channels.put({ id: 'channel2', name: 'Channel 2', is_favorite: false } as any);

      const favorites = await getFavoriteChannelIds();

      expect(favorites.size).toBe(1);
      expect(favorites.has('channel1')).toBe(true);

      // It should also update the settings
      const settings = await db.settings.get('favorite_channel_ids');
      expect(settings?.value).toEqual(['channel1']);
    });

    it('should not add to set if it already exists from db.channels harvest', async () => {
      await db.settings.put({ key: 'favorite_channel_ids', value: ['channel1'] });
      await db.channels.put({ id: 'channel1', name: 'Channel 1', is_favorite: true } as any);

      const favorites = await getFavoriteChannelIds();

      expect(favorites.size).toBe(1);
      expect(favorites.has('channel1')).toBe(true);
    });

    it('should handle db.channels being empty during harvest', async () => {
      // Put a favorite in settings, ensure it does not break if channels is empty
      await db.settings.put({ key: 'favorite_channel_ids', value: ['channel1'] });

      const favorites = await getFavoriteChannelIds();

      expect(favorites.size).toBe(1);
      expect(favorites.has('channel1')).toBe(true);
    });

    it('should not update settings if no new favorites are harvested', async () => {
      // Start with channel1 in settings
      await db.settings.put({ key: 'favorite_channel_ids', value: ['channel1'] });

      // Spy on settings.put
      const putSpy = jest.spyOn(db.settings, 'put');

      const favorites = await getFavoriteChannelIds();

      expect(favorites.size).toBe(1);
      // settings.put should not be called since there's no update
      expect(putSpy).not.toHaveBeenCalled();

      putSpy.mockRestore();
    });

    it('should handle errors gracefully and return an empty set', async () => {
      const originalFilter = db.channels.filter;
      db.channels.filter = jest.fn().mockImplementation(() => {
        throw new Error('Database Error');
      });

      const favorites = await getFavoriteChannelIds();

      expect(favorites.size).toBe(0);

      // Restore
      db.channels.filter = originalFilter;
    });
  });

  describe('saveFavoriteChannelId', () => {
    it('should add a channel to favorites', async () => {
      await saveFavoriteChannelId('channel1', true);
      const favorites = await getFavoriteChannelIds();
      expect(favorites.has('channel1')).toBe(true);
    });

    it('should remove a channel from favorites', async () => {
      await db.settings.put({ key: 'favorite_channel_ids', value: ['channel1'] });
      await saveFavoriteChannelId('channel1', false);
      const favorites = await getFavoriteChannelIds();
      expect(favorites.has('channel1')).toBe(false);
      expect(favorites.size).toBe(0);
    });

    it('should handle existing non-array settings during add gracefully', async () => {
      // Simulate corrupted data
      await db.settings.put({ key: 'favorite_channel_ids', value: 'not-an-array' });
      await saveFavoriteChannelId('channel1', true);

      const favorites = await getFavoriteChannelIds();
      expect(favorites.has('channel1')).toBe(true);
      expect(favorites.size).toBe(1);
    });

    it('should handle existing non-array settings during remove gracefully', async () => {
      // Simulate corrupted data
      await db.settings.put({ key: 'favorite_channel_ids', value: 'not-an-array' });
      await saveFavoriteChannelId('channel1', false);

      const favorites = await getFavoriteChannelIds();
      expect(favorites.has('channel1')).toBe(false);
      expect(favorites.size).toBe(0);
    });

    it('should catch errors and log a warning if an error occurs during saveFavoriteChannelId', async () => {
      // Since getSetting and setSetting catch their own errors,
      // the only way to trigger the catch in saveFavoriteChannelId is
      // if Set construction fails, e.g. if getSetting returns something that is
      // incorrectly reported as an array but isn't iterable.
      // Wait, getSetting is called and its result is checked with Array.isArray.
      // If we mock Set constructor... wait, we can't easily do that.
      // Let's redefine Array.isArray temporarily for this test to throw.
      const originalAdd = Set.prototype.add;
      Set.prototype.add = jest.fn().mockImplementation(() => {
        throw new Error('Simulated failure');
      });

      await saveFavoriteChannelId('channel1', true);

      expect(console.warn).toHaveBeenCalledWith('Failed to persist favorite channel id:', expect.any(Error));

      Set.prototype.add = originalAdd;
    });
  });
});
