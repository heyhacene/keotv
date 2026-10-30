import 'fake-indexeddb/auto';
import { db, getSetting, setSetting, getFavoriteChannelIds, saveFavoriteChannelId } from '@/lib/db';

describe('db.ts', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  afterAll(async () => {
    await db.delete();
  });

  describe('settings', () => {
    it('should get default setting when not set', async () => {
      const val = await getSetting('my_setting', 'default_val');
      expect(val).toBe('default_val');
    });

    it('should set and get a setting', async () => {
      await setSetting('my_setting', 'custom_val');
      const val = await getSetting('my_setting', 'default_val');
      expect(val).toBe('custom_val');
    });

    it('should return default when getting setting fails', async () => {
      jest.spyOn(db.settings, 'get').mockRejectedValueOnce(new Error('Mock DB Error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const val = await getSetting('my_setting', 'default_val');
      expect(val).toBe('default_val');
      expect(consoleSpy).toHaveBeenCalledWith('Failed to get setting', 'my_setting', expect.any(Error));

      consoleSpy.mockRestore();
    });

    it('should gracefully handle setting failure', async () => {
      jest.spyOn(db.settings, 'put').mockRejectedValueOnce(new Error('Mock DB Error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await expect(setSetting('my_setting', 'custom_val')).resolves.not.toThrow();
      expect(consoleSpy).toHaveBeenCalledWith('Failed to save setting', 'my_setting', expect.any(Error));

      consoleSpy.mockRestore();
    });
  });

  describe('favorite channels', () => {
    it('should return empty set when no favorites exist', async () => {
      const favs = await getFavoriteChannelIds();
      expect(favs.size).toBe(0);
    });

    it('should save and get a favorite channel id', async () => {
      await saveFavoriteChannelId('chan_1', true);
      let favs = await getFavoriteChannelIds();
      expect(favs.has('chan_1')).toBe(true);
      expect(favs.size).toBe(1);

      await saveFavoriteChannelId('chan_1', false);
      favs = await getFavoriteChannelIds();
      expect(favs.has('chan_1')).toBe(false);
      expect(favs.size).toBe(0);
    });

    it('should harvest favorites from db.channels if they exist', async () => {
      await db.channels.put({
        id: 'chan_2',
        num: 2,
        name: 'Channel 2',
        logo: '',
        stream_url: '',
        stream_type: 'live',
        group_id: 'g1',
        group_name: 'G1',
        is_favorite: true,
        is_hidden: false,
        custom_order: 0
      });

      const favs = await getFavoriteChannelIds();
      expect(favs.has('chan_2')).toBe(true);

      const savedIds = await getSetting('favorite_channel_ids', []);
      expect(savedIds).toContain('chan_2');
    });

    it('should handle db.channels filter failure during harvest', async () => {
      jest.spyOn(db.channels, 'filter').mockImplementationOnce(() => {
        throw new Error('Mock Filter Error');
      });

      const favs = await getFavoriteChannelIds();
      expect(favs.size).toBe(0); // Should return empty set when error occurs
    });

    it('should handle saveFavoriteChannelId failure gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {
        throw new Error('Mock error thrown from console.error to bypass setSetting catch');
      });
      jest.spyOn(db.settings, 'put').mockRejectedValueOnce(new Error('Mock DB error in put'));

      await expect(saveFavoriteChannelId('chan_1', true)).resolves.not.toThrow();
      expect(consoleSpy).toHaveBeenCalledWith('Failed to persist favorite channel id:', expect.any(Error));

      consoleSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });
  });
});
