import { describe, it, expect } from 'vitest';
import { detectAudioAndSubtitles } from '../lib/iptv-service';

describe('detectAudioAndSubtitles', () => {
  it('should detect explicit audio and subtitles from rawInfo', () => {
    const rawInfo = {
      audio: 'English, French | Spanish',
      subtitles: 'English; French/Spanish',
    };

    const result = detectAudioAndSubtitles('Some Movie', rawInfo);

    expect(result.audio).toContain('English');
    expect(result.audio).toContain('French');
    expect(result.audio).toContain('Spanish');

    expect(result.subtitles).toContain('English');
    expect(result.subtitles).toContain('French');
    expect(result.subtitles).toContain('Spanish');
  });

  it('should fall back to title parsing if rawInfo is empty', () => {
    const result = detectAudioAndSubtitles('Some Movie VOSTFR');

    expect(result.subtitles).toContain('Français (VOSTFR)');
    expect(result.audio).toContain('Version Originale (VO)');
  });

  it('should detect MULTI correctly from title', () => {
    const result = detectAudioAndSubtitles('Some Movie MULTI');

    expect(result.audio).toContain('Français (VF)');
    expect(result.audio).toContain('Version Originale (VO)');
  });

  it('should detect VF correctly from title', () => {
    const result = detectAudioAndSubtitles('Some Movie TRUEFRENCH');

    expect(result.audio).toContain('Français (VF)');
  });

  it('should detect VO correctly from title', () => {
    const result = detectAudioAndSubtitles('Some Movie VO');

    expect(result.audio).toContain('Version Originale (VO)');
  });

  it('should fallback to VF if no audio is detected', () => {
    const result = detectAudioAndSubtitles('Some Movie');

    expect(result.audio).toContain('Français (VF)');
  });

  it('should detect EN correctly from title', () => {
      const result = detectAudioAndSubtitles('Some Movie ENG');

      expect(result.audio).toContain('Anglais (Audio)');
  });

  it('should detect AR correctly from title', () => {
      const result = detectAudioAndSubtitles('Some Movie ARABIC');

      expect(result.audio).toContain('Arabe (Audio)');
  });

  it('should detect ES correctly from title', () => {
      const result = detectAudioAndSubtitles('Some Movie SPANISH');

      expect(result.audio).toContain('Espagnol (Audio)');
  });
});
