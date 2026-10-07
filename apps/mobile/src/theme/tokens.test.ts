import { describe, expect, it } from 'vitest';
import { colors, toneColors } from './tokens';

function luminance(hex: string) {
  const channels = hex
    .slice(1)
    .match(/../g)!
    .map((channel) => {
      const value = parseInt(channel, 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
function contrast(foreground: string, background: string) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

describe.each(Object.entries(colors))('%s semantic palette', (_name, palette) => {
  it('keeps normal, selected, pressed and disabled text readable', () => {
    const pairs = [
      [palette.text, palette.background],
      [palette.text, palette.surface],
      [palette.muted, palette.background],
      [palette.muted, palette.surface],
      [palette.onPrimary, palette.primary],
      [palette.onPrimary, palette.primaryPressed],
      [palette.primary, palette.surface],
      [palette.primary, palette.background],
      [palette.primary, palette.selected],
      [palette.onDisabled, palette.disabled],
      [palette.onDanger, palette.dangerFill],
    ];
    for (const [foreground, background] of pairs) {
      expect(
        contrast(foreground, background),
        `${foreground} on ${background}`
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
  it.each(['info', 'success', 'warning', 'danger'] as const)(
    'keeps %s notice and badge text readable',
    (tone) => {
      const { foreground, background } = toneColors(palette, tone);
      expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
    }
  );
  it('keeps controls and focus distinct from their surrounding surfaces', () => {
    for (const surface of [palette.surface, palette.background, palette.selected]) {
      expect(contrast(palette.controlBorder, surface)).toBeGreaterThanOrEqual(3);
      expect(contrast(palette.focus, surface)).toBeGreaterThanOrEqual(3);
    }
  });
});
