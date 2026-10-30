import { detectResolution } from '../iptv-service';

describe('detectResolution', () => {
  it('detects 4K and UHD correctly', () => {
    expect(detectResolution('Movie 4K')).toBe('4K');
    expect(detectResolution('Sports UHD')).toBe('4K');
    expect(detectResolution('channel-4k-stream')).toBe('4K');
    expect(detectResolution('uhd movie')).toBe('4K');
  });

  it('detects FHD and 1080 correctly', () => {
    expect(detectResolution('News FHD')).toBe('FHD');
    expect(detectResolution('Movie 1080p')).toBe('FHD');
    expect(detectResolution('fhd-channel')).toBe('FHD');
    expect(detectResolution('1080')).toBe('FHD');
  });

  it('detects HD and 720 correctly', () => {
    expect(detectResolution('Drama HD')).toBe('HD');
    expect(detectResolution('Cartoon 720p')).toBe('HD');
    expect(detectResolution('hd-channel')).toBe('HD');
    expect(detectResolution('720')).toBe('HD');
  });

  it('detects SD and 576 correctly', () => {
    expect(detectResolution('Old Movie SD')).toBe('SD');
    expect(detectResolution('Classic 576p')).toBe('SD');
    expect(detectResolution('sd-channel')).toBe('SD');
    expect(detectResolution('576')).toBe('SD');
  });

  it('defaults to HD for unknown or empty input', () => {
    expect(detectResolution('Normal Channel')).toBe('HD');
    expect(detectResolution('')).toBe('HD');
    // @ts-expect-error - testing invalid input
    expect(detectResolution(null)).toBe('HD');
    // @ts-expect-error - testing invalid input
    expect(detectResolution(undefined)).toBe('HD');
  });
});
