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

/** Intrinsic size of the source artwork, from its viewBox. */
const LOGO_WIDTH_PX = 519.87402;
const LOGO_HEIGHT_PX = 504;

/** Width over height, so a caller can reserve the right box for it. */
export const MINIDISC_LOGO_ASPECT = LOGO_WIDTH_PX / LOGO_HEIGHT_PX;

const cache = new Map<string, ImageSource>();

export function miniDiscLogo(color: string): ImageSource {
  const cached = cache.get(color);
  if (cached) return cached;

  const recoloured = logoSvg.replaceAll('fill:black', `fill:${color}`);
  const source: ImageSource = {
    // Percent-encoded rather than base64: smaller, and readable in a dump.
    dataUrl: `data:image/svg+xml,${encodeURIComponent(recoloured)}`,
    widthPx: LOGO_WIDTH_PX,
    heightPx: LOGO_HEIGHT_PX,
  };
  cache.set(color, source);
  return source;
}
