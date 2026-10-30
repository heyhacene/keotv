import { db, getSetting, setSetting, getFavoriteChannelIds, saveFavoriteChannelId } from './db';

describe('Database helpers', () => {
  beforeEach(async () => {
    await db.settings.clear();
    await db.channels.clear();
  });

  describe('getSetting', () => {
    it('should return default value if setting does not exist', async () => {
      const result = await getSetting('missing_key', 'default_value');
      expect(result).toBe('default_value');
    });

    it('should return stored value if setting exists', async () => {
      await db.settings.put({ key: 'test_key', value: 'stored_value' });
      const result = await getSetting('test_key', 'default_value');
      expect(result).toBe('stored_value');
    });

    it('should return default value and log error on database error', async () => {
      // Mock db.settings.get to throw an error
      const mockGet = jest.spyOn(db.settings, 'get').mockRejectedValueOnce(new Error('DB Error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await getSetting('test_key', 'default_value');

      expect(result).toBe('default_value');
      expect(consoleSpy).toHaveBeenCalledWith('Failed to get setting', 'test_key', expect.any(Error));

      mockGet.mockRestore();
      consoleSpy.mockRestore();
    });
  });
});
