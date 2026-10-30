import { normalizeMovieTitle } from '../iptv-service';

describe('normalizeMovieTitle', () => {
  it('should return empty string when input is empty or null', () => {
    expect(normalizeMovieTitle('')).toBe('');
    expect(normalizeMovieTitle(null as any)).toBe('');
    expect(normalizeMovieTitle(undefined as any)).toBe('');
  });

  it('should convert to lowercase', () => {
    expect(normalizeMovieTitle('HELLO')).toBe('hello');
    expect(normalizeMovieTitle('MoViE Title')).toBe('movie title');
  });

  it('should remove accents (diacritics)', () => {
    expect(normalizeMovieTitle('Hélp mē')).toBe('help me');
    expect(normalizeMovieTitle('Le fabuleux destin d\'Amélie Poulain')).toBe('le fabuleux destin d amelie poulain');
    expect(normalizeMovieTitle('č ě š ř ž ý á í é')).toBe('c e s r z y a i e');
  });

  it('should replace non-alphanumeric characters with spaces', () => {
    expect(normalizeMovieTitle('Spider-Man: No Way Home')).toBe('spider man no way home');
    expect(normalizeMovieTitle('Avatar: The Way of Water!')).toBe('avatar the way of water');
    expect(normalizeMovieTitle('X-Men (2000)')).toBe('x men 2000');
    expect(normalizeMovieTitle('M.A.S.H.')).toBe('m a s h');
  });

  it('should trim whitespace from start and end', () => {
    expect(normalizeMovieTitle('  Spaces around  ')).toBe('spaces around');
  });

  it('should collapse multiple spaces into a single space', () => {
    expect(normalizeMovieTitle('Double  Space')).toBe('double space');
    expect(normalizeMovieTitle('Multiple     Spaces')).toBe('multiple spaces');
  });

  it('should handle all transformations together correctly', () => {
    expect(normalizeMovieTitle('  -L\'Épée 2 (2024)-  ')).toBe('l epee 2 2024');
  });
});
