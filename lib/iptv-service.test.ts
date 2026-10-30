import { cleanSeparatorName } from './iptv-service';

describe('cleanSeparatorName', () => {
  it('should return empty string for falsy values', () => {
    expect(cleanSeparatorName('')).toBe('');
    expect(cleanSeparatorName(null as any)).toBe('');
    expect(cleanSeparatorName(undefined as any)).toBe('');
  });

  it('should return the name if there are no separator characters', () => {
    expect(cleanSeparatorName('Normal Channel')).toBe('Normal Channel');
    expect(cleanSeparatorName('News 24/7')).toBe('News 24/7');
  });

  it('should remove separator characters from the beginning of the name', () => {
    expect(cleanSeparatorName('--- CANAL+')).toBe('CANAL+');
    expect(cleanSeparatorName('*** Sports')).toBe('Sports');
    expect(cleanSeparatorName('=== BEIN')).toBe('BEIN');
    expect(cleanSeparatorName('>>> Movies')).toBe('Movies');
    expect(cleanSeparatorName('### Music')).toBe('Music');
    expect(cleanSeparatorName('_~| News')).toBe('News');
  });

  it('should remove separator characters from the end of the name', () => {
    expect(cleanSeparatorName('CANAL+ ---')).toBe('CANAL+');
    expect(cleanSeparatorName('Sports ***')).toBe('Sports');
    expect(cleanSeparatorName('BEIN ===')).toBe('BEIN');
    expect(cleanSeparatorName('Movies <<<')).toBe('Movies');
    expect(cleanSeparatorName('Music ###')).toBe('Music');
  });

  it('should remove separator characters from both ends of the name', () => {
    expect(cleanSeparatorName('--- CANAL+ ---')).toBe('CANAL+');
    expect(cleanSeparatorName('*** Sports ***')).toBe('Sports');
    expect(cleanSeparatorName('=== BEIN ===')).toBe('BEIN');
    expect(cleanSeparatorName('>>> Movies <<<')).toBe('Movies');
    expect(cleanSeparatorName('### Music ###')).toBe('Music');
  });

  it('should trim whitespace around the remaining name', () => {
    expect(cleanSeparatorName('   ---   CANAL+   ---   ')).toBe('CANAL+');
  });

  it('should handle complex separator strings', () => {
    expect(cleanSeparatorName('=-*#_~|.\\/   My Channel  =-*#_~|.\\/')).toBe('My Channel');
  });

  it('should return the original name if it consists only of separators', () => {
    expect(cleanSeparatorName('---')).toBe('---');
    expect(cleanSeparatorName('***')).toBe('***');
    expect(cleanSeparatorName('===')).toBe('===');
  });
});
