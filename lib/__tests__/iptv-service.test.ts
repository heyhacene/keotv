import { extractAttribute } from '../iptv-service';

describe('extractAttribute', () => {
  it('should extract double-quoted attributes', () => {
    const line = 'tvg-id="test-id" tvg-name="test name"';
    expect(extractAttribute(line, 'tvg-id')).toBe('test-id');
    expect(extractAttribute(line, 'tvg-name')).toBe('test name');
  });

  it('should extract single-quoted attributes', () => {
    const line = "tvg-id='test-id' tvg-name='test name'";
    expect(extractAttribute(line, 'tvg-id')).toBe('test-id');
    expect(extractAttribute(line, 'tvg-name')).toBe('test name');
  });

  it('should extract unquoted attributes', () => {
    const line = 'tvg-id=test-id tvg-name="test name"';
    expect(extractAttribute(line, 'tvg-id')).toBe('test-id');
  });

  it('should return empty string when attribute is missing', () => {
    const line = 'tvg-id="test-id"';
    expect(extractAttribute(line, 'tvg-name')).toBe('');
  });

  it('should handle case insensitivity', () => {
    const line = 'TVG-ID="test-id"';
    expect(extractAttribute(line, 'tvg-id')).toBe('test-id');
    expect(extractAttribute(line, 'TVG-ID')).toBe('test-id');
  });

  it('should handle attributes with empty values', () => {
    const line = 'tvg-id="" tvg-name=\'\' tvg-logo=';
    expect(extractAttribute(line, 'tvg-id')).toBe('');
    expect(extractAttribute(line, 'tvg-name')).toBe('');
    // The current implementation of noQuote regex `${attrName}=([^\\s,]+)`
    // requires at least one character, so it won't match `tvg-logo=`.
    // It will return '' which is the default.
    expect(extractAttribute(line, 'tvg-logo')).toBe('');
  });

  it('should trim extracted values', () => {
    const line = 'tvg-id="  test-id  " tvg-name=\' test name \'';
    expect(extractAttribute(line, 'tvg-id')).toBe('test-id');
    expect(extractAttribute(line, 'tvg-name')).toBe('test name');
  });
});
