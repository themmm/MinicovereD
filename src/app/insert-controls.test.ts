import { describe, expect, it } from 'vitest';

import { DEFAULT_PART_DIMENSIONS } from '../domain/parts.ts';
import { describeStrip } from './insert-controls.ts';

/**
 * The one sentence the Insert panel prints, and the reason the Page width has a
 * control at all: a millimetre here is three on the paper at four Pages, so the
 * collector needs to see what the number costs.
 *
 * The panel itself is a DOM component and this suite runs on `node`, so what is
 * tested is the line rather than the widget — which is also the part that can be
 * quietly wrong without anything looking broken.
 */
describe('what the Insert panel says a Page width costs', () => {
  it('names the strip’s length at both Page counts', () => {
    expect(describeStrip(DEFAULT_PART_DIMENSIONS.insert)).toBe(
      'Flat strip: 152.5 mm at 2 Pages, 282.5 mm at 4.',
    );
  });

  it('follows the width it is given, three millimetres to the millimetre', () => {
    // Every Page after the first adds `pageWidth`, so at four Pages a 1 mm nudge
    // is 3 mm of paper. That multiplier is the whole argument for the control.
    const wider = { ...DEFAULT_PART_DIMENSIONS.insert, pageWidth: 66 };

    expect(describeStrip(wider)).toContain('153.5 mm at 2 Pages');
    expect(describeStrip(wider)).toContain('285.5 mm at 4');
  });

  it('follows the case measurements too, not only the Page', () => {
    // The other four have no control, so a project file is the only way to move
    // them — and the sentence has to follow when one does.
    const narrow = { ...DEFAULT_PART_DIMENSIONS.insert, frontPanelWidth: 60 };

    expect(describeStrip(narrow)).toContain('144.5 mm at 2 Pages');
  });
});
