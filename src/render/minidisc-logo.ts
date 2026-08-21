import logoSvg from '../../assets/minidisc-logo.svg?raw';
import type { ImageSource } from './layout.ts';

/**
 * The official MiniDisc logo, bundled as an optional asset (ADR-0004). It is a
 * Sony trademark; the mark is kept a plain toggleable image so a design works
 * without it.
 *
 * Sony's own artwork rules say the logo may be printed in one colour only, in
 * positive or reverse. That is exactly what recolouring the single `fill:black`
 * of the source SVG gives — and it is why there is no multi-colour variant.
 */

/** Intrinsic size of the source artwork, from its own width and height. */
const LOGO_WIDTH_PX = 519.87402;
const LOGO_HEIGHT_PX = 504;

/** Width over height, so a caller can reserve the right box for it. */
export const MINIDISC_LOGO_ASPECT = LOGO_WIDTH_PX / LOGO_HEIGHT_PX;

/**
 * The recolour substitutes into SVG markup, so the value has to be a colour and
 * nothing else. Colours reach here from a `<input type="color">` today and from
 * an imported project file tomorrow, and an imported file is not trustworthy.
 * An SVG in an `<img>` cannot run script, but a broken one does not draw at all
 * — and neither outcome is worth allowing.
 */
const SAFE_COLOR = /^#[0-9a-f]{3,8}$|^[a-z]{3,20}$/i;

const FALLBACK_COLOR = 'black';

export function safeLogoColor(color: string): string {
  return SAFE_COLOR.test(color.trim()) ? color.trim() : FALLBACK_COLOR;
}

/**
 * Colour swatches fire on every frame of a drag, and each colour interns a
 * ~13 KB data URL. A handful of colours is all a design ever uses at once.
 */
const CACHE_LIMIT = 8;
const cache = new Map<string, ImageSource>();

export function miniDiscLogo(requestedColor: string): ImageSource {
  const color = safeLogoColor(requestedColor);
  const cached = cache.get(color);
  if (cached) return cached;

  const recoloured = logoSvg.replaceAll('fill:black', `fill:${color}`);
  const source: ImageSource = {
    // Percent-encoded rather than base64: smaller, and readable in a dump.
    dataUrl: `data:image/svg+xml,${encodeURIComponent(recoloured)}`,
    widthPx: LOGO_WIDTH_PX,
    heightPx: LOGO_HEIGHT_PX,
  };
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  cache.set(color, source);
  return source;
}
