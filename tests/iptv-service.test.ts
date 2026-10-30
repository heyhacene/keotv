import {
  extractCleanMovieTitle,
  normalizeMovieTitle,
  isSeparatorChannel,
  cleanSeparatorName,
  isAdultCategoryName,
  isSeriesCategory,
  isFilmCategory,
  detectResolution,
} from '../lib/iptv-service';

describe('iptv-service string parsing and utilities', () => {
  describe('extractCleanMovieTitle', () => {
    it('should strip initial brackets', () => {
      expect(extractCleanMovieTitle('[FR] Some Movie')).toBe('some movie');
      expect(extractCleanMovieTitle('[MULTI] Another Movie')).toBe('another movie');
    });

    it('should strip country or category prefixes', () => {
      expect(extractCleanMovieTitle('FR | The Matrix')).toBe('the matrix');
      expect(extractCleanMovieTitle('FR - Inception')).toBe('inception');
      expect(extractCleanMovieTitle('FR: Interstellar')).toBe('interstellar');
      expect(extractCleanMovieTitle('EN | Avatar')).toBe('avatar');
      expect(extractCleanMovieTitle('VOD | Gladiator')).toBe('gladiator');
      expect(extractCleanMovieTitle('FILM | Titanic')).toBe('titanic');
      expect(extractCleanMovieTitle('FILMS : Jurassic Park')).toBe('jurassic park');
    });

    it('should strip quality tags, brackets, and year patterns', () => {
      expect(extractCleanMovieTitle('The Matrix (1999)')).toBe('the matrix');
      expect(extractCleanMovieTitle('Inception 2010')).toBe('inception');
      expect(extractCleanMovieTitle('Avatar [1080p]')).toBe('avatar');
      expect(extractCleanMovieTitle('Gladiator 4K HEVC')).toBe('gladiator');
      expect(extractCleanMovieTitle('Titanic MULTI TRUEFRENCH')).toBe('titanic');
    });

    it('should handle complex combinations', () => {
      expect(extractCleanMovieTitle('[FR] VOD | The Matrix (1999) [1080p] TRUEFRENCH')).toBe('the matrix');
      expect(extractCleanMovieTitle('FILMS : Inception 2010 MULTI')).toBe('inception');
    });

    it('should handle single/double quotes correctly', () => {
      expect(extractCleanMovieTitle('Movie with "double quotes"')).toBe('movie with double quotes');
      expect(extractCleanMovieTitle("Movie with 'single quotes'")).toBe('movie with single quotes');
      expect(extractCleanMovieTitle("L'Ours (1988)")).toBe('l ours');
    });
  });

  describe('normalizeMovieTitle', () => {
    it('should lowercase strings', () => {
      expect(normalizeMovieTitle('HELLO WORLD')).toBe('hello world');
    });

    it('should remove diacritics', () => {
      expect(normalizeMovieTitle('éàèùâêîôûäëïöüç')).toBe('eaeuaeiouaeiouc');
    });

    it('should remove special characters', () => {
      expect(normalizeMovieTitle('Hello @ World!')).toBe('hello world');
    });
  });

  describe('isSeparatorChannel and cleanSeparatorName', () => {
    it('should detect separator channels with various prefixes', () => {
      expect(isSeparatorChannel({ name: '--- FRANCE DIRECT ---', stream_url: 'http://stream.url' } as any)).toBe(true);
      expect(isSeparatorChannel({ name: '=== SPORT HD ===', stream_url: 'http://stream.url' } as any)).toBe(true);
      expect(isSeparatorChannel({ name: '>>> BOUQUET CINEMA <<<', stream_url: 'http://stream.url' } as any)).toBe(true);
      expect(isSeparatorChannel({ name: '||| GENERALISTE |||', stream_url: 'http://stream.url' } as any)).toBe(true);
      expect(isSeparatorChannel({ name: 'TF1 HD', stream_url: 'http://stream.url' } as any)).toBe(false);
    });

    it('should clean decorative separator names properly', () => {
      expect(cleanSeparatorName('--- FRANCE DIRECT ---')).toBe('FRANCE DIRECT');
      expect(cleanSeparatorName('>>> BOUQUET CINEMA <<<')).toBe('BOUQUET CINEMA');
      expect(cleanSeparatorName('=== SPORT ===')).toBe('SPORT');
    });
  });

  describe('isAdultCategoryName', () => {
    it('should identify adult category keywords', () => {
      expect(isAdultCategoryName('Adulte 18+')).toBe(true);
      expect(isAdultCategoryName('XXX Movies')).toBe(true);
      expect(isAdultCategoryName('Section Erotique')).toBe(true);
      expect(isAdultCategoryName('FR | Cinéma')).toBe(false);
      expect(isAdultCategoryName('Dessins Animés')).toBe(false);
    });
  });

  describe('isSeriesCategory and isFilmCategory', () => {
    it('should classify series and films accurately', () => {
      expect(isSeriesCategory('Séries Françaises')).toBe(true);
      expect(isSeriesCategory('Saison 1 Épisodes')).toBe(true);
      expect(isSeriesCategory('Films 2024')).toBe(false);

      expect(isFilmCategory('Films Box Office')).toBe(true);
      expect(isFilmCategory('Cinéma HD')).toBe(true);
      expect(isFilmCategory('Séries Netflix')).toBe(false);
    });
  });

  describe('detectResolution', () => {
    it('should detect 4K, FHD, HD and SD resolutions', () => {
      expect(detectResolution('Canal+ 4K UHD')).toBe('4K');
      expect(detectResolution('TF1 FHD 1080p')).toBe('FHD');
      expect(detectResolution('M6 HD 720p')).toBe('HD');
      expect(detectResolution('RTL SD')).toBe('SD');
    });
  });
});
