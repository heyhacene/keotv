import { isFilmCategory } from '../../lib/iptv-service';

describe('isFilmCategory', () => {
  it('should return true for names containing film-related keywords', () => {
    const validNames = [
      'FILM',
      'FILMS',
      'MOVIE',
      'MOVIES',
      'CINEMA',
      'CINÉMA',
      'VOD',
      'SPECTACLE',
      'BOX OFFICE',
      'Action Movies',
      'Comédie (FILMS)',
      'Cinéma Français',
      'VOD Nouveautés'
    ];

    validNames.forEach(name => {
      expect(isFilmCategory(name)).toBe(true);
    });
  });

  it('should return true regardless of case', () => {
    const validNames = [
      'film',
      'Films',
      'movie',
      'Movies',
      'cinema',
      'cinéma',
      'vod',
      'spectacle',
      'Box Office'
    ];

    validNames.forEach(name => {
      expect(isFilmCategory(name)).toBe(true);
    });
  });

  it('should return false for non-film related categories', () => {
    const invalidNames = [
      'SERIES',
      'Séries',
      'TV Shows',
      'Live TV',
      'News',
      'Sports',
      'Documentaires',
      'Music'
    ];

    invalidNames.forEach(name => {
      expect(isFilmCategory(name)).toBe(false);
    });
  });

  it('should handle edge cases and null/undefined gracefully', () => {
    expect(isFilmCategory('')).toBe(false);
    // @ts-ignore - Testing invalid inputs if the function is called from non-TS code
    expect(isFilmCategory(null)).toBe(false);
    // @ts-ignore
    expect(isFilmCategory(undefined)).toBe(false);
  });
});
