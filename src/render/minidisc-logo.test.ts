import { describe, expect, it } from 'vitest';

import { MINIDISC_LOGO_ASPECT, miniDiscLogo, safeLogoColor } from './minidisc-logo.ts';

/**
 * The logo is a bundled asset recoloured by substituting into SVG markup
 * (ADR-0004). Sony's rules allow one colour only, which is exactly what a
 * single substitution gives — provided the value really is a colour.
 */
const markup = (dataUrl: string): string =>
  decodeURIComponent(dataUrl.replace('data:image/svg+xml,', ''));

describe('the bundled MiniDisc logo', () => {
  it('is drawn in the one colour it is asked for', () => {
    const svg = markup(miniDiscLogo('#ff8800').dataUrl);

    expect(svg).toContain('fill:#ff8800');
    expect(svg).not.toContain('fill:black');
  });

  it('reports the aspect ratio of the mark, so callers can reserve a box for it', () => {
    // The source artwork is 519.874 × 504 units.
    expect(MINIDISC_LOGO_ASPECT).toBeCloseTo(1.0315, 4);
  });

  it('refuses anything that is not a colour rather than substituting it into the markup', () => {
    const hostile = '"/><script>alert(1)</script>';

    expect(safeLogoColor(hostile)).toBe('black');
    expect(markup(miniDiscLogo(hostile).dataUrl)).not.toContain('<script');
  });

  it('accepts the colour shapes a picker and a project file actually produce', () => {
    for (const colour of ['#fff', '#ff8800', '#ff8800cc', 'black', 'rebeccapurple']) {
      expect(safeLogoColor(colour), colour).toBe(colour);
    }
  });

  it('does not let one caller poison another caller through the cache', () => {
    const hostile = miniDiscLogo('"/><script>alert(1)</script>');
    const plain = miniDiscLogo('black');

    // Both normalise to black, so they are the same mark — and it is intact.
    expect(hostile.dataUrl).toBe(plain.dataUrl);
    expect(markup(plain.dataUrl)).toContain('fill:black');
  });
});
