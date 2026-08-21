/**
 * Colour arithmetic for the Templates. Two jobs: put a colour behind an
 * overlay at partial opacity, and pick ink that can actually be read on a
 * given background — because a collector is free to choose dark paper and a
 * dark accent, and neither Template may answer that with invisible type.
 */

interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** Parses `#rgb`, `#rgba`, `#rrggbb` and `#rrggbbaa`. Other notations are not read. */
function parseHex(color: string): Rgb | undefined {
  const value = color.trim();
  if (!HEX.test(value)) return undefined;

  const digits = value.slice(1);
  const expanded =
    digits.length <= 4
      ? [...digits]
          .slice(0, 3)
          .map((digit) => digit + digit)
          .join('')
      : digits.slice(0, 6);

  return {
    r: Number.parseInt(expanded.slice(0, 2), 16),
    g: Number.parseInt(expanded.slice(2, 4), 16),
    b: Number.parseInt(expanded.slice(4, 6), 16),
  };
}

/** `color` at `alpha`, as a CSS colour a canvas will accept. */
export function withAlpha(color: string, alpha: number): string {
  const rgb = parseHex(color);
  // A colour we cannot read stays a scrim, just a neutral one: an overlay that
  // silently vanished would be worse than one in the wrong hue.
  if (!rgb) return `rgba(0, 0, 0, ${alpha})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(color: string): number {
  const rgb = parseHex(color) ?? { r: 0, g: 0, b: 0 };
  const channel = (value: number): number => {
    const srgb = value / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

const READABLE_ON_DARK = '#ffffff';
const READABLE_ON_LIGHT = '#111111';

/**
 * Ink that can be read on `background`. Used where a Template puts type over a
 * colour the collector chose — the Spine bar, and the Full-bleed scrim — so no
 * combination of parameters can produce a Part with unreadable type on it.
 */
export function readableInkFor(background: string): string {
  return relativeLuminance(background) > 0.45 ? READABLE_ON_LIGHT : READABLE_ON_DARK;
}
