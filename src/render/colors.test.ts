import { describe, expect, it } from 'vitest';

import { readableInkFor, relativeLuminance, withAlpha } from './colors.ts';

describe('putting a colour behind an overlay', () => {
  it('turns a hex colour into a translucent one', () => {
    expect(withAlpha('#204080', 0.6)).toBe('rgba(32, 64, 128, 0.6)');
  });

  it('expands the short hex form', () => {
    expect(withAlpha('#fff', 1)).toBe('rgba(255, 255, 255, 1)');
  });

  it('falls back to a neutral scrim for a colour it cannot read', () => {
    // Better a scrim in the wrong hue than an overlay that silently vanished.
    expect(withAlpha('rebeccapurple', 0.5)).toBe('rgba(0, 0, 0, 0.5)');
  });
});

describe('choosing ink that can be read', () => {
  it('measures luminance against the known endpoints', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 6);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 6);
    // Mid grey is far darker than half, which is the whole point of the curve.
    expect(relativeLuminance('#808080')).toBeCloseTo(0.2159, 3);
  });

  it('puts light ink on a dark background and dark ink on a light one', () => {
    expect(readableInkFor('#1f2933')).toBe('#ffffff');
    expect(readableInkFor('#000000')).toBe('#ffffff');
    expect(readableInkFor('#fef3c7')).toBe('#111111');
    expect(readableInkFor('#ffffff')).toBe('#111111');
  });

  it('keeps type readable on the colour combination that would otherwise hide it', () => {
    // Dark paper on a dark accent: the Spine bar and the Spine type would be
    // the same colour if the type simply used the paper colour.
    const accent = '#101418';

    expect(readableInkFor(accent)).toBe('#ffffff');
    expect(readableInkFor(accent)).not.toBe(accent);
  });
});
