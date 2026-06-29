import { describe, it, expect } from 'vitest';
import { describeUserAgent } from '@/lib/pushDevice';

describe('describeUserAgent', () => {
  it('parses Chrome on macOS', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    expect(describeUserAgent(ua)).toBe('Chrome · macOS');
  });

  it('parses Safari on iPhone (not mistaken for macOS/Chrome)', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    expect(describeUserAgent(ua)).toBe('Safari · iPhone');
  });

  it('parses Edge on Windows (not mistaken for Chrome)', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0';
    expect(describeUserAgent(ua)).toBe('Edge · Windows');
  });

  it('parses Firefox on Android (not mistaken for Linux)', () => {
    const ua = 'Mozilla/5.0 (Android 13; Mobile; rv:120.0) Gecko/120.0 Firefox/120.0';
    expect(describeUserAgent(ua)).toBe('Firefox · Android');
  });

  it('falls back to the recognized half when the other is unknown', () => {
    expect(describeUserAgent('Some weird crawler Chrome/1.0')).toBe('Chrome');
  });

  it('returns empty string for missing / unrecognizable UA', () => {
    expect(describeUserAgent(null)).toBe('');
    expect(describeUserAgent(undefined)).toBe('');
    expect(describeUserAgent('')).toBe('');
    expect(describeUserAgent('totally-unknown')).toBe('');
  });
});
