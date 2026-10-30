import { isSeriesCategory } from '../iptv-service';

describe('isSeriesCategory', () => {
  it('should identify basic series categories', () => {
    expect(isSeriesCategory('serie')).toBe(true);
    expect(isSeriesCategory('series')).toBe(true);
    expect(isSeriesCategory('série')).toBe(true);
    expect(isSeriesCategory('séries')).toBe(true);
  });

  it('should be case insensitive', () => {
    expect(isSeriesCategory('SERIE')).toBe(true);
    expect(isSeriesCategory('SeRiEs')).toBe(true);
    expect(isSeriesCategory('SÉRIE')).toBe(true);
  });

  it('should identify categories with surrounding text', () => {
    expect(isSeriesCategory('FR - Séries HD')).toBe(true);
    expect(isSeriesCategory('Mes series preferées')).toBe(true);
    expect(isSeriesCategory('Top Season 1')).toBe(true);
  });

  it('should identify season/episode variations', () => {
    expect(isSeriesCategory('Saison 1')).toBe(true);
    expect(isSeriesCategory('Season 1')).toBe(true);
    expect(isSeriesCategory('Episode 1')).toBe(true);
    expect(isSeriesCategory('Épisode 1')).toBe(true);
  });

  it('should identify anime/manga/drama variations', () => {
    expect(isSeriesCategory('Anime')).toBe(true);
    expect(isSeriesCategory('Animes')).toBe(true);
    expect(isSeriesCategory('Manga')).toBe(true);
    expect(isSeriesCategory('Drama')).toBe(true);
  });

  it('should return false for non-series categories', () => {
    expect(isSeriesCategory('Films')).toBe(false);
    expect(isSeriesCategory('Documentaires')).toBe(false);
    expect(isSeriesCategory('Sport')).toBe(false);
    expect(isSeriesCategory('VOD')).toBe(false);
    expect(isSeriesCategory('')).toBe(false);
    expect(isSeriesCategory('   ')).toBe(false);
  });

  it('should handle edge cases', () => {
    // @ts-ignore
    expect(isSeriesCategory(null)).toBe(false);
    // @ts-ignore
    expect(isSeriesCategory(undefined)).toBe(false);
  });
});
