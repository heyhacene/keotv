import { db, setSetting } from './db';

describe('db settings', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('setSetting', () => {
    it('should successfully save a setting', async () => {
      const putSpy = jest.spyOn(db.settings, 'put');

      await setSetting('testKey', 'testValue');

      expect(putSpy).toHaveBeenCalledWith({ key: 'testKey', value: 'testValue' });
    });

    it('should handle errors and call console.error', async () => {
      const mockError = new Error('Mock Dexie error');
      jest.spyOn(db.settings, 'put').mockRejectedValue(mockError);
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await setSetting('errorKey', 'errorValue');

      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to save setting', 'errorKey', mockError);
    });
  });
});
