import { extractCleanMovieTitle, normalizeMovieTitle } from '../lib/iptv-service';

describe('iptv-service string parsing', () => {
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
});
