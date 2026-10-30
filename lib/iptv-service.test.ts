import { describe, it, expect } from 'vitest';
import { isAdultCategoryName } from './iptv-service';

describe('isAdultCategoryName', () => {
  it('should return false for empty or null inputs', () => {
    expect(isAdultCategoryName('')).toBe(false);
    // TypeScript typing usually prevents this, but to be safe for JS consumers:
    expect(isAdultCategoryName(null as any)).toBe(false);
    expect(isAdultCategoryName(undefined as any)).toBe(false);
  });

  it('should return true for exact matches of adult keywords', () => {
    expect(isAdultCategoryName('xxx')).toBe(true);
    expect(isAdultCategoryName('porn')).toBe(true);
    expect(isAdultCategoryName('18+')).toBe(true);
    expect(isAdultCategoryName('adult')).toBe(true);
  });

  it('should ignore case sensitivity', () => {
    expect(isAdultCategoryName('XXX')).toBe(true);
    expect(isAdultCategoryName('PoRn')).toBe(true);
    expect(isAdultCategoryName('ADULT')).toBe(true);
  });

  it('should ignore diacritics', () => {
    expect(isAdultCategoryName('érotique')).toBe(true);
    expect(isAdultCategoryName('EROTIQUE')).toBe(true);
  });

  it('should match keywords inside larger names if properly separated', () => {
    expect(isAdultCategoryName('Movies xxx HD')).toBe(true);
    expect(isAdultCategoryName('[18+] Films')).toBe(true);
    expect(isAdultCategoryName('Action / porn / Thriller')).toBe(true);
    expect(isAdultCategoryName('  porno ')).toBe(true);
    expect(isAdultCategoryName('-erotic-')).toBe(true);
    expect(isAdultCategoryName('playboy TV')).toBe(true);
  });

  it('should return false for false positive boundary cases', () => {
    expect(isAdultCategoryName('sussex')).toBe(false); // Contains 'sex'
    expect(isAdultCategoryName('playboy123')).toBe(false); // Starts with playboy but not a separate word
    expect(isAdultCategoryName('18+action')).toBe(false);
    expect(isAdultCategoryName('familiale')).toBe(false);
  });

  it('should return true if plural or suffixed with "s"', () => {
    expect(isAdultCategoryName('adults')).toBe(true);
    expect(isAdultCategoryName('adultes')).toBe(true);
  });
});
