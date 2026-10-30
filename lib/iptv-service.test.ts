import { isSeparatorChannel } from './iptv-service';
import { Channel } from '../types/iptv';

describe('isSeparatorChannel', () => {
  it('should return false for null or undefined', () => {
    expect(isSeparatorChannel(null)).toBe(false);
    expect(isSeparatorChannel(undefined)).toBe(false);
  });

  it('should return true for channel with empty name', () => {
    expect(isSeparatorChannel({ name: '' } as Channel)).toBe(true);
    expect(isSeparatorChannel({ name: '   ' } as Channel)).toBe(true);
  });

  it('should return true for channel with empty or dummy stream URL', () => {
    expect(isSeparatorChannel({ name: 'Valid Name', stream_url: '' } as Channel)).toBe(true);
    expect(isSeparatorChannel({ name: 'Valid Name', stream_url: '#' } as Channel)).toBe(true);
    expect(isSeparatorChannel({ name: 'Valid Name', stream_url: 'http://localhost/test' } as Channel)).toBe(true);
    expect(isSeparatorChannel({ name: 'Valid Name', stream_url: 'http://127.0.0.1/test' } as Channel)).toBe(true);
  });

  it('should return true for channel names consisting of separator characters', () => {
    expect(isSeparatorChannel({ name: '---', stream_url: 'http://valid.com' } as Channel)).toBe(true);
    expect(isSeparatorChannel({ name: '===', stream_url: 'http://valid.com' } as Channel)).toBe(true);
    expect(isSeparatorChannel({ name: '***', stream_url: 'http://valid.com' } as Channel)).toBe(true);
    expect(isSeparatorChannel({ name: '--- ---', stream_url: 'http://valid.com' } as Channel)).toBe(true);
    expect(isSeparatorChannel({ name: '...', stream_url: 'http://valid.com' } as Channel)).toBe(true);
  });

  it('should return true for channel names surrounded by separator characters', () => {
    expect(isSeparatorChannel({ name: '--- FRANCE ---', stream_url: 'http://valid.com' } as Channel)).toBe(true);
    expect(isSeparatorChannel({ name: '=== CINEMA ===', stream_url: 'http://valid.com' } as Channel)).toBe(true);
    expect(isSeparatorChannel({ name: '*** VOD 4K ***', stream_url: 'http://valid.com' } as Channel)).toBe(true);
  });

  it('should return true for channel names with common IPTV header prefixes', () => {
    expect(isSeparatorChannel({ name: '--- Category 1', stream_url: 'http://valid.com' } as Channel)).toBe(true);
    expect(isSeparatorChannel({ name: '>>> Category 2', stream_url: 'http://valid.com' } as Channel)).toBe(true);
    expect(isSeparatorChannel({ name: '||| Category 3', stream_url: 'http://valid.com' } as Channel)).toBe(true);
  });

  it('should return false for valid channels', () => {
    expect(isSeparatorChannel({ name: 'TF1', stream_url: 'http://valid.com/stream.m3u8' } as Channel)).toBe(false);
    expect(isSeparatorChannel({ name: 'Canal+', stream_url: 'http://valid.com/stream.m3u8' } as Channel)).toBe(false);
    expect(isSeparatorChannel({ name: 'BeIN Sports 1', stream_url: 'http://valid.com/stream.m3u8' } as Channel)).toBe(false);
  });
});
