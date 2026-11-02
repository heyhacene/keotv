import { describe, it, expect } from 'vitest';
import { detectCategoryIcon } from './iptv-service';

describe('detectCategoryIcon', () => {
  it('returns "Lock" for adult content', () => {
    expect(detectCategoryIcon('xxx')).toBe('Lock');
    expect(detectCategoryIcon('adult')).toBe('Lock');
    expect(detectCategoryIcon('18+')).toBe('Lock');
  });

  it('returns "Trophy" for sports content', () => {
    expect(detectCategoryIcon('sport')).toBe('Trophy');
    expect(detectCategoryIcon('foot')).toBe('Trophy');
    expect(detectCategoryIcon('bein')).toBe('Trophy');
    expect(detectCategoryIcon('rmc')).toBe('Trophy');
  });

  it('returns "Film" for cinema/film content', () => {
    expect(detectCategoryIcon('cinema')).toBe('Film');
    expect(detectCategoryIcon('movie')).toBe('Film');
    expect(detectCategoryIcon('serie')).toBe('Film');
    expect(detectCategoryIcon('netflix')).toBe('Film');
  });

  it('returns "Globe" for news content', () => {
    expect(detectCategoryIcon('info')).toBe('Globe');
    expect(detectCategoryIcon('news')).toBe('Globe');
    expect(detectCategoryIcon('actu')).toBe('Globe');
    expect(detectCategoryIcon('bfm')).toBe('Globe');
  });

  it('returns "Compass" for documentary/history content', () => {
    expect(detectCategoryIcon('doc')).toBe('Compass');
    expect(detectCategoryIcon('discovery')).toBe('Compass');
    expect(detectCategoryIcon('geo')).toBe('Compass');
    expect(detectCategoryIcon('hist')).toBe('Compass');
  });

  it('returns "Star" for favorites/VIP content', () => {
    expect(detectCategoryIcon('fav')).toBe('Star');
    expect(detectCategoryIcon('top')).toBe('Star');
    expect(detectCategoryIcon('vip')).toBe('Star');
  });

  it('returns "Tv" as a fallback', () => {
    expect(detectCategoryIcon('general')).toBe('Tv');
    expect(detectCategoryIcon('random category')).toBe('Tv');
    expect(detectCategoryIcon('kids')).toBe('Tv');
  });

  it('handles empty/undefined strings gracefully', () => {
    expect(detectCategoryIcon('')).toBe('Tv');
    expect(detectCategoryIcon(undefined as unknown as string)).toBe('Tv');
    expect(detectCategoryIcon(null as unknown as string)).toBe('Tv');
  });
});
