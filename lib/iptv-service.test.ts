import { describe, it, expect } from 'vitest';
import { detectStreamType } from './iptv-service';

describe('detectStreamType', () => {
  describe('Series detection', () => {
    it('should detect series by URL (/series/)', () => {
      expect(detectStreamType('Breaking Bad', 'Drama', 'http://example.com/series/bb.mp4')).toBe('series');
    });

    it('should detect series by groupName containing SERIE/SERIES/SAISON/SEASON', () => {
      expect(detectStreamType('Episode 1', 'My Serie', 'http://example.com/stream.ts')).toBe('series');
      expect(detectStreamType('Episode 1', 'Top SERIES', 'http://example.com/stream.ts')).toBe('series');
      expect(detectStreamType('Episode 1', 'Saison 1', 'http://example.com/stream.ts')).toBe('series');
      expect(detectStreamType('Episode 1', 'Season 2', 'http://example.com/stream.ts')).toBe('series');
    });

    it('should detect series by name matching S(xx)E(xx) format', () => {
      expect(detectStreamType('Breaking Bad S01E01', 'Drama', 'http://example.com/stream.ts')).toBe('series');
      expect(detectStreamType('Breaking Bad S1 E1', 'Drama', 'http://example.com/stream.ts')).toBe('series');
    });
  });

  describe('VOD / Movies detection', () => {
    it('should detect VOD by URL (/movie/)', () => {
      expect(detectStreamType('Inception', 'Sci-Fi', 'http://example.com/movie/inception.mkv')).toBe('vod');
    });

    it('should detect VOD by URL ending with common video extensions', () => {
      expect(detectStreamType('Video', 'Unknown', 'http://example.com/video.mp4')).toBe('vod');
      expect(detectStreamType('Video', 'Unknown', 'http://example.com/video.mkv')).toBe('vod');
      expect(detectStreamType('Video', 'Unknown', 'http://example.com/video.avi')).toBe('vod');
      expect(detectStreamType('Video', 'Unknown', 'http://example.com/video.mov')).toBe('vod');
    });

    it('should detect VOD by groupName containing VOD/FILM/MOVIE/CINEMA', () => {
      expect(detectStreamType('Movie', 'Top VOD', 'http://example.com/stream.ts')).toBe('vod');
      expect(detectStreamType('Movie', 'Action FILM', 'http://example.com/stream.ts')).toBe('vod');
      expect(detectStreamType('Movie', 'New MOVIE', 'http://example.com/stream.ts')).toBe('vod');
      expect(detectStreamType('Movie', 'Home CINEMA', 'http://example.com/stream.ts')).toBe('vod');
    });
  });

  describe('Live detection (default)', () => {
    it('should default to live when no series/vod heuristics match', () => {
      expect(detectStreamType('CNN', 'News', 'http://example.com/live/cnn.ts')).toBe('live');
      expect(detectStreamType('TF1', 'France', 'http://example.com/tf1')).toBe('live');
    });
  });

  describe('Edge cases', () => {
    it('should handle undefined/null values gracefully and default to live', () => {
      // @ts-expect-error Testing invalid inputs
      expect(detectStreamType(undefined, undefined, undefined)).toBe('live');
      // @ts-expect-error Testing invalid inputs
      expect(detectStreamType(null, null, null)).toBe('live');
    });

    it('should handle empty strings and default to live', () => {
      expect(detectStreamType('', '', '')).toBe('live');
    });
  });
});
