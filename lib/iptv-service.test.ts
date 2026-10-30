import { shouldExcludeChannelByPrefix } from './iptv-service';

describe('shouldExcludeChannelByPrefix', () => {
  it('should return false for empty channel name or empty prefixes', () => {
    expect(shouldExcludeChannelByPrefix('', ['FR'])).toBe(false);
    expect(shouldExcludeChannelByPrefix('TF1', [])).toBe(false);
  });

  it('should handle undefined or null gracefully', () => {
    expect(shouldExcludeChannelByPrefix(undefined as any, ['FR'])).toBe(false);
    expect(shouldExcludeChannelByPrefix('TF1', undefined as any)).toBe(false);
  });

  it('should handle invalid types for channelName', () => {
    expect(shouldExcludeChannelByPrefix(123 as any, ['FR'])).toBe(false);
    expect(shouldExcludeChannelByPrefix({ name: 'TF1' } as any, ['FR'])).toBe(false);
  });

  it('should handle invalid types for excludedPrefixes', () => {
    expect(shouldExcludeChannelByPrefix('TF1', 'FR' as any)).toBe(false);
    expect(shouldExcludeChannelByPrefix('TF1', { 0: 'FR' } as any)).toBe(false);
  });

  it('should match direct prefix', () => {
    expect(shouldExcludeChannelByPrefix('FR: TF1', ['FR'])).toBe(true);
    expect(shouldExcludeChannelByPrefix('EN: BBC', ['FR'])).toBe(false);
  });

  it('should handle case insensitivity', () => {
    expect(shouldExcludeChannelByPrefix('fr: tf1', ['FR'])).toBe(true);
    expect(shouldExcludeChannelByPrefix('FR: TF1', ['fr'])).toBe(true);
  });

  it('should handle accents (normalization)', () => {
    expect(shouldExcludeChannelByPrefix('Écran', ['ecran'])).toBe(true);
    expect(shouldExcludeChannelByPrefix('ecran', ['Écran'])).toBe(true);
  });

  it('should match if prefix is included anywhere', () => {
    expect(shouldExcludeChannelByPrefix('TF1 4K', ['4K'])).toBe(true);
    expect(shouldExcludeChannelByPrefix('[FR] M6', ['[FR]'])).toBe(true);
  });

  it('should handle punctuation-stripped start matches', () => {
    expect(shouldExcludeChannelByPrefix('FR | TF1', ['FR'])).toBe(true);
    expect(shouldExcludeChannelByPrefix('[FR] TF1', ['FR'])).toBe(true);
  });
});
