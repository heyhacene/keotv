import { EPGService } from '@/lib/epg-service';
import { db } from '@/lib/db';
import * as iptvService from '@/lib/iptv-service';
import { CatchupService } from '@/lib/catchup-service';

// Mock dependencies
jest.mock('@/lib/db', () => ({
  db: {
    epg_programs: {
      bulkPut: jest.fn(),
      where: jest.fn().mockReturnThis(),
      between: jest.fn().mockReturnThis(),
      toArray: jest.fn(),
    },
  },
}));

jest.mock('@/lib/iptv-service', () => ({
  fetchHttp: jest.fn(),
  toArray: jest.fn((val) => (Array.isArray(val) ? val : val ? [val] : [])),
}));

jest.mock('@/lib/catchup-service', () => ({
  CatchupService: {
    generateCatchupUrl: jest.fn(),
  },
}));

describe('EPGService', () => {
  let originalConsoleWarn: any;

  beforeAll(() => {
    originalConsoleWarn = console.warn;
    console.warn = jest.fn(); // Suppress expected warnings
  });

  afterAll(() => {
    console.warn = originalConsoleWarn;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('decodeBase64IfNeeded', () => {
    // Access private method for testing using type assertion
    const decodeBase64IfNeeded = (EPGService as any).decodeBase64IfNeeded;

    it('should return empty string for null or undefined', () => {
      expect(decodeBase64IfNeeded(null)).toBe('');
      expect(decodeBase64IfNeeded(undefined)).toBe('');
    });

    it('should decode valid base64 strings', () => {
      const original = 'Hello World';
      const encoded = btoa(original);
      expect(decodeBase64IfNeeded(encoded)).toBe(original);
    });

    it('should decode URI encoded base64 strings', () => {
      const original = 'Café';
      // simulate escape+btoa pattern
      const encoded = btoa(unescape(encodeURIComponent(original)));
      expect(decodeBase64IfNeeded(encoded)).toBe(original);
    });

    it('should return original string if not valid base64 (e.g. spaces, length not mult of 4)', () => {
      expect(decodeBase64IfNeeded('Not Base 64')).toBe('Not Base 64');
      expect(decodeBase64IfNeeded('a')).toBe('a');
    });
  });

  describe('parseTimestampMs', () => {
    const parseTimestampMs = (EPGService as any).parseTimestampMs;
    const fallbackMs = 1000;

    it('should parse timestamp string (seconds)', () => {
      const ts = 1700000000;
      expect(parseTimestampMs(String(ts), null, fallbackMs)).toBe(ts * 1000);
    });

    it('should parse timestamp string (milliseconds)', () => {
      const tsMs = 1700000000000;
      expect(parseTimestampMs(String(tsMs), null, fallbackMs)).toBe(tsMs);
    });

    it('should parse date string "YYYY-MM-DD HH:mm:ss"', () => {
      const dateStr = '2023-10-25 12:00:00';
      const expectedMs = new Date('2023-10-25T12:00:00').getTime();
      expect(parseTimestampMs(null, dateStr, fallbackMs)).toBe(expectedMs);
    });

    it('should return fallback if inputs are invalid', () => {
      expect(parseTimestampMs('invalid', 'invalid date', fallbackMs)).toBe(fallbackMs);
      expect(parseTimestampMs(null, null, fallbackMs)).toBe(fallbackMs);
    });
  });

  describe('fetchXtreamShortEpg', () => {
    it('should fetch and parse listings correctly', async () => {
      const mockListings = [
        {
          id: '1',
          title: btoa('Test Show 1'),
          description: btoa('Description 1'),
          start_timestamp: String(Math.floor(Date.now() / 1000) - 3600), // 1 hour ago
          stop_timestamp: String(Math.floor(Date.now() / 1000)), // now
          has_archive: 1,
        },
      ];

      (iptvService.fetchHttp as jest.Mock).mockResolvedValue({
        epg_listings: mockListings,
      });
      (CatchupService.generateCatchupUrl as jest.Mock).mockReturnValue('http://catchup.url');

      const params = {
        serverUrl: 'http://example.com',
        username: 'user',
        password: 'password',
        streamId: '100',
        channelId: 'ch1',
      };

      const result = await EPGService.fetchXtreamShortEpg(params);

      expect(iptvService.fetchHttp).toHaveBeenCalledWith(
        'http://example.com/player_api.php?username=user&password=password&action=get_short_epg&stream_id=100&limit=12',
        'json'
      );

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Test Show 1');
      expect(result[0].has_catchup).toBe(true);
      expect(result[0].catchup_url).toBe('http://catchup.url');
      expect(db.epg_programs.bulkPut).toHaveBeenCalledWith(result);
    });

    it('should handle fetch errors gracefully', async () => {
      (iptvService.fetchHttp as jest.Mock).mockRejectedValue(new Error('Network error'));

      const result = await EPGService.fetchXtreamShortEpg({
        serverUrl: 'http://example.com',
        username: 'u',
        password: 'p',
        streamId: '1',
        channelId: 'c1'
      });

      expect(result).toEqual([]);
      expect(console.warn).toHaveBeenCalledWith('Failed to fetch short EPG for stream', '1', expect.any(Error));
    });

    it('should handle empty listings', async () => {
      (iptvService.fetchHttp as jest.Mock).mockResolvedValue({
        epg_listings: [],
      });

      const result = await EPGService.fetchXtreamShortEpg({
        serverUrl: 'http://example.com',
        username: 'u',
        password: 'p',
        streamId: '1',
        channelId: 'c1'
      });

      expect(result).toEqual([]);
      expect(db.epg_programs.bulkPut).not.toHaveBeenCalled();
    });
  });

  describe('fetchXtreamFullEpg', () => {
    it('should fetch and parse full listings correctly', async () => {
      const mockListings = [
        {
          id: '1',
          title: btoa('Full Show 1'),
          description: btoa('Description 1'),
          start_timestamp: String(Math.floor(Date.now() / 1000) - 3600), // 1 hour ago
          stop_timestamp: String(Math.floor(Date.now() / 1000)), // now
          has_archive: 1,
        },
      ];

      (iptvService.fetchHttp as jest.Mock).mockResolvedValue({
        epg_listings: mockListings,
      });

      const params = {
        serverUrl: 'http://example.com',
        username: 'user',
        password: 'password',
        streamId: '100',
        channelId: 'ch1',
      };

      const result = await EPGService.fetchXtreamFullEpg(params);

      expect(iptvService.fetchHttp).toHaveBeenCalledWith(
        'http://example.com/player_api.php?username=user&password=password&action=get_simple_data_table&stream_id=100',
        'json'
      );

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Full Show 1');
      expect(db.epg_programs.bulkPut).toHaveBeenCalledWith(result);
    });

    it('should fallback to short EPG if full EPG is empty', async () => {
      const mockShortListings = [
        {
          id: '2',
          title: btoa('Short Show 1'),
          description: btoa('Description 2'),
          start_timestamp: String(Math.floor(Date.now() / 1000) - 3600),
          stop_timestamp: String(Math.floor(Date.now() / 1000)),
          has_archive: 0,
        },
      ];

      // First call returns empty, second call returns short listings
      (iptvService.fetchHttp as jest.Mock)
        .mockResolvedValueOnce({ epg_listings: [] })
        .mockResolvedValueOnce({ epg_listings: mockShortListings });

      const params = {
        serverUrl: 'http://example.com',
        username: 'user',
        password: 'password',
        streamId: '100',
        channelId: 'ch1',
      };

      const result = await EPGService.fetchXtreamFullEpg(params);

      expect(iptvService.fetchHttp).toHaveBeenCalledTimes(2);
      expect(iptvService.fetchHttp).toHaveBeenLastCalledWith(
        'http://example.com/player_api.php?username=user&password=password&action=get_short_epg&stream_id=100&limit=50',
        'json'
      );
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Short Show 1');
      expect(db.epg_programs.bulkPut).toHaveBeenCalledWith(result);
    });

    it('should handle fetch errors gracefully', async () => {
      (iptvService.fetchHttp as jest.Mock).mockRejectedValue(new Error('Network error'));

      const result = await EPGService.fetchXtreamFullEpg({
        serverUrl: 'http://example.com',
        username: 'u',
        password: 'p',
        streamId: '1',
        channelId: 'c1'
      });

      expect(result).toEqual([]);
      expect(console.warn).toHaveBeenCalledWith('Failed to fetch full EPG for stream', '1', expect.any(Error));
    });
  });


  describe('getCurrentAndNext', () => {
    it('should return correct current and next programs based on time', async () => {
      const nowMs = Date.now();
      const pastProgram = {
        id: 'p1', channel_id: 'ch1', title: 'Past', description: '',
        start: new Date(nowMs - 7200000).toISOString(),
        end: new Date(nowMs - 3600000).toISOString(),
        duration_min: 60, has_catchup: false
      };
      const currentProgram = {
        id: 'p2', channel_id: 'ch1', title: 'Current', description: '',
        start: new Date(nowMs - 1800000).toISOString(), // 30 mins ago
        end: new Date(nowMs + 1800000).toISOString(),   // 30 mins from now
        duration_min: 60, has_catchup: false
      };
      const nextProgram = {
        id: 'p3', channel_id: 'ch1', title: 'Next', description: '',
        start: new Date(nowMs + 1800000).toISOString(),
        end: new Date(nowMs + 5400000).toISOString(),
        duration_min: 60, has_catchup: false
      };

      (db.epg_programs.toArray as jest.Mock).mockResolvedValue([pastProgram, currentProgram, nextProgram]);

      const result = await EPGService.getCurrentAndNext('ch1');

      expect(result.current).toEqual(currentProgram);
      expect(result.next).toEqual(nextProgram);
    });

    it('should return nulls if no programs found', async () => {
        (db.epg_programs.toArray as jest.Mock).mockResolvedValue([]);
        const result = await EPGService.getCurrentAndNext('ch1');
        expect(result).toEqual({ current: null, next: null });
    });
  });

  describe('getProgramsForChannel', () => {
    it('should return programs from db', async () => {
      const mockPrograms = [{ id: '1' }, { id: '2' }];
      (db.epg_programs.toArray as jest.Mock).mockResolvedValue(mockPrograms);

      const result = await EPGService.getProgramsForChannel('ch1');

      expect(result).toEqual(mockPrograms);
      expect(db.epg_programs.where).toHaveBeenCalledWith('[channel_id+start]');
      expect(db.epg_programs.between).toHaveBeenCalledWith(['ch1', ''], ['ch1', '\uffff']);
    });

    it('should handle db errors gracefully', async () => {
      (db.epg_programs.toArray as jest.Mock).mockRejectedValue(new Error('DB Error'));

      const result = await EPGService.getProgramsForChannel('ch1');

      expect(result).toEqual([]);
    });
  });
});
