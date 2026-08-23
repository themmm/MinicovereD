import { describe, expect, it } from 'vitest';

import { A4, LETTER } from '../domain/paper.ts';
import { DEFAULT_PART_DIMENSIONS, LABEL_PRESETS } from '../domain/parts.ts';
import type { PartDimensions } from '../domain/parts.ts';
import { rectsOverlap } from '../domain/units.ts';
import type { Rect } from '../domain/units.ts';
import { CALIBRATION_SQUARE_MM, renderCalibrationSheet } from './calibration.ts';
import type { TextMeasurer } from './text.ts';

const measurer: TextMeasurer = {
  widthMm: (text, style) => text.length * style.sizeMm * 0.5,
};

const sheet = (dimensions: PartDimensions = DEFAULT_PART_DIMENSIONS, marginMm = 5) =>
  renderCalibrationSheet({ paper: A4, marginMm }, dimensions, measurer);

/** Every figure the sheet draws, by the caption printed beside it. */
const figures = (dimensions?: PartDimensions): Map<string, Rect> =>
  new Map(sheet(dimensions).figures.map((figure) => [figure.label, figure.bounds]));

const expectMm = (actual: number, expected: number, what: string): void => {
  expect(Math.abs(actual - expected), `${what}: expected ${expected} mm, got ${actual} mm`).toBeLessThanOrEqual(
    0.2,
  );
};

describe('the calibration sheet — the test square', () => {
  it('draws a square of exactly 100 mm', () => {
    const square = figures().get('100 mm test square');

    expect(square).toBeDefined();
    expectMm(square?.width ?? -1, 100, 'square width');
    expectMm(square?.height ?? -1, 100, 'square height');
    expect(CALIBRATION_SQUARE_MM).toBe(100);
  });

  it('says on the paper what the square should measure', () => {
    const printed = sheet()
      .layouts.flatMap((layout) => layout.ops ?? [])
      .flatMap((op) => (op.op === 'text' ? [op.text] : []))
      .join(' ');

    expect(printed).toContain('100 mm');
    expect(printed).toMatch(/ruler|measure/i);
  });
});

describe('the calibration sheet — outlines at 1:1', () => {
  it('shows every Label preset at its own size', () => {
    const drawn = figures();

    for (const preset of LABEL_PRESETS) {
      const bounds = drawn.get(`Label — ${preset.name}`);
      expect(bounds, `${preset.name} outline`).toBeDefined();
      expectMm(bounds?.width ?? -1, preset.dimensions.width, `${preset.name} width`);
      expectMm(bounds?.height ?? -1, preset.dimensions.height, `${preset.name} height`);
    }
  });

  it('cuts the notch into the outline of a preset that has one, and not one that has not', () => {
    const outlines = new Map(sheet().figures.map((figure) => [figure.label, figure.outline]));

    // Classic keeps the cartridge's cut corner, so its top-right corner is
    // missing and replaced by two points on the diagonal. Full covers it.
    expect(outlines.get('Label — Classic')).toContainEqual({ x: 29, y: 0 });
    expect(outlines.get('Label — Classic')).toContainEqual({ x: 35, y: 6 });
    expect(outlines.get('Label — Classic')?.some((p) => p.x === 35 && p.y === 0)).toBe(false);
    expect(outlines.get('Label — Full')).toContainEqual({ x: 38, y: 0 });
  });

  it('shows the Label this Release is actually set to, once it is not a preset', () => {
    const nudged: PartDimensions = {
      ...DEFAULT_PART_DIMENSIONS,
      label: { width: 36.4, height: 53.1, notch: true, notchSize: 6 },
    };

    // Nudging the size is exactly when a collector wants their own outline to
    // hold a cartridge against; the presets alone would not show it.
    const own = figures(nudged).get('Label — this Release');
    expectMm(own?.width ?? -1, 36.4, 'own Label width');
    expectMm(own?.height ?? -1, 53.1, 'own Label height');

    // On a preset there is nothing extra to draw.
    expect(figures().has('Label — this Release')).toBe(false);
  });

  it('shows the Insert as the end that wraps the case, and one Page beside it', () => {
    // Not the flat strip: 282.5 mm does not fit any printable area this app can
    // produce, so an outline of it would be omitted at every margin and the
    // footer would then advise a margin change that cannot help. What a case
    // actually decides is these two shapes.
    const drawn = figures();

    expectMm(drawn.get('Insert — case end')?.width ?? -1, 87.5, 'case end width');
    expectMm(drawn.get('Insert — case end')?.height ?? -1, 79, 'case end height');
    expectMm(drawn.get('Insert — one Page')?.width ?? -1, 65, 'Page width');
    expectMm(drawn.get('Insert — one Page')?.height ?? -1, 79, 'Page height');
  });

  it('never omits either Insert figure, at any margin the control can reach', () => {
    // The whole point of the two figures. The margin control stops at 25 mm, and
    // an 87.5 mm outline plus its caption clears A4 at every step of it — so the
    // one Part that matters is always on the page, which the strip never could be.
    for (const marginMm of [0, 5, 10, 25]) {
      const drawn = sheet(DEFAULT_PART_DIMENSIONS, marginMm);
      expect(drawn.omitted, `${marginMm} mm margin`).not.toContain('Insert — case end');
      expect(drawn.omitted, `${marginMm} mm margin`).not.toContain('Insert — one Page');
    }
  });

  it('prints the flat strip’s length as a number, since it cannot be an outline', () => {
    const printed = sheet()
      .layouts.flatMap((layout) => layout.ops ?? [])
      .flatMap((op) => (op.op === 'text' ? [op.text] : []))
      .join(' ');

    expect(printed).toContain('152.5 mm at 2 Pages');
    expect(printed).toContain('282.5 mm at 4');
  });

  it('follows the Part dimensions it is given rather than the defaults', () => {
    const adjusted: PartDimensions = {
      ...DEFAULT_PART_DIMENSIONS,
      insert: { ...DEFAULT_PART_DIMENSIONS.insert, pageWidth: 62, height: 74 },
    };

    expectMm(figures(adjusted).get('Insert — one Page')?.width ?? -1, 62, 'adjusted Page width');
    expectMm(figures(adjusted).get('Insert — one Page')?.height ?? -1, 74, 'adjusted Page height');
    expectMm(figures(adjusted).get('Insert — case end')?.height ?? -1, 74, 'adjusted case end height');
  });

  it('marks the case end’s two fold lines, so the panel widths can be measured too', () => {
    const caseEnd = sheet().figures.find((figure) => figure.label === 'Insert — case end');

    expect(caseEnd?.folds).toHaveLength(2);
    expectMm(caseEnd?.folds?.[0] ?? -1, 14, 'first fold');
    expectMm(caseEnd?.folds?.[1] ?? -1, 19.5, 'second fold');
  });

  it('marks them as case folds, which is the only kind on this page', () => {
    // The fore-edge and the spine belong to the strip, and the strip is not here.
    const folds = sheet()
      .layouts.flatMap((layout) => layout.guides ?? [])
      .filter((guide) => guide.kind === 'fold');

    expect(folds).toHaveLength(2);
    expect(new Set(folds.map((guide) => guide.kind === 'fold' && guide.fold))).toEqual(
      new Set(['case']),
    );
  });
});

describe('the calibration sheet — the page', () => {
  it('keeps every caption clear of the next figure along', () => {
    const drawn = sheet().figures;

    for (const a of drawn) {
      for (const b of drawn) {
        if (a === b || a.sheet !== b.sheet) continue;
        const sameRow = Math.abs(a.bounds.y - b.bounds.y) < 1;
        if (!sameRow || b.bounds.x <= a.bounds.x) continue;
        // A caption may spill into the gap but must stop short of its neighbour.
        expect(a.bounds.x + a.bounds.width, `${a.label} caption vs ${b.label}`).toBeLessThan(
          b.bounds.x,
        );
      }
    }
  });

  it('keeps every figure inside the printable margin', () => {
    for (const figure of sheet().figures) {
      expect(figure.bounds.x, `${figure.label} left`).toBeGreaterThanOrEqual(5);
      expect(figure.bounds.y, `${figure.label} top`).toBeGreaterThanOrEqual(5);
      expect(figure.bounds.x + figure.bounds.width, `${figure.label} right`).toBeLessThanOrEqual(
        A4.width - 5,
      );
      expect(figure.bounds.y + figure.bounds.height, `${figure.label} bottom`).toBeLessThanOrEqual(
        A4.height - 5,
      );
    }
  });

  it('never overlaps two figures on the same Sheet', () => {
    const drawn = sheet().figures;

    for (const [index, a] of drawn.entries()) {
      for (const b of drawn.slice(index + 1)) {
        if (a.sheet !== b.sheet) continue;
        expect(rectsOverlap(a.bounds, b.bounds), `${a.label} overlaps ${b.label}`).toBe(false);
      }
    }
  });

  it('fits on one sheet of Letter too', () => {
    const onLetter = renderCalibrationSheet(
      { paper: LETTER, marginMm: 5 },
      DEFAULT_PART_DIMENSIONS,
      measurer,
    );

    expect(onLetter.layouts[0]?.paper.id).toBe('letter');
    for (const figure of onLetter.figures) {
      expect(figure.bounds.x + figure.bounds.width, figure.label).toBeLessThanOrEqual(
        LETTER.width - 5,
      );
      expect(figure.bounds.y + figure.bounds.height, figure.label).toBeLessThanOrEqual(
        LETTER.height - 5,
      );
    }
  });

  it('carries no Parts: nothing here is a Release, it is a ruler', () => {
    expect(sheet().layouts.every((layout) => layout.placements.length === 0)).toBe(true);
  });

  it('fits on one Sheet at the default margin', () => {
    expect(sheet().layouts).toHaveLength(1);
    expect(sheet().omitted).toEqual([]);
  });

  it('runs onto more Sheets rather than off the bottom of a generous margin', () => {
    const roomy = renderCalibrationSheet({ paper: A4, marginMm: 40 }, DEFAULT_PART_DIMENSIONS, measurer);

    expect(roomy.layouts.length).toBeGreaterThan(1);
    expect(roomy.figures).toHaveLength(5);
    for (const figure of roomy.figures) {
      expect(figure.bounds.y + figure.bounds.height, `${figure.label} bottom`).toBeLessThanOrEqual(
        A4.height - 40,
      );
      expect(figure.bounds.x + figure.bounds.width, `${figure.label} right`).toBeLessThanOrEqual(
        A4.width - 40,
      );
    }
  });

  it('never turns a figure to make it fit, which is what keeps this page unchanged', () => {
    // 210 − 2 × 62 leaves 86 mm of width and the Insert's case end is 87.5
    // across. Lying down it is 79 × 87.5 and would fit easily, and the packer can
    // do that now (ADR-0014) — but this page draws its own outlines in paper
    // coordinates from the packed box and knows nothing about a turn, so it passes
    // no `turn` and takes the packer's `never`. Turned, it would put an upright
    // 87.5 mm outline inside a 79 mm box, spilling out to the right and stopping
    // 8.5 mm short at the bottom, under a caption reading 79 × 87.5.
    //
    // A 62 mm margin is far past the 25 mm the control reaches, which is the
    // point: this is the behaviour, not a case a collector meets.
    //
    // The other half of ADR-0014, the column under a figure, is off here for
    // the same reason `sortByHeight` is: this page is meant to be read down and
    // across, and a column reads after the figure to its right. Nothing on it
    // is short enough to open one at the sizes it ships with anyway.
    const narrow = renderCalibrationSheet({ paper: A4, marginMm: 62 }, DEFAULT_PART_DIMENSIONS, measurer);

    expect(narrow.omitted).toContain('Insert — case end');
    expect(narrow.figures.some((figure) => figure.label === 'Insert — case end')).toBe(false);
    // The Labels and one Page are narrow enough to print standing up and still
    // do. The test square is gone too, but for its own reason and at a smaller
    // margin — the test below this one is about that.
    expect(narrow.figures.map((figure) => figure.label)).toContain('Label — Classic');
    expect(narrow.figures.map((figure) => figure.label)).toContain('Insert — one Page');
  });

  it('names what it could not print at 1:1 rather than shrinking it', () => {
    // A margin this wide leaves under 100 mm of width: the test square would
    // have to be scaled, and a scaled ruler is worse than no ruler.
    const cramped = renderCalibrationSheet(
      { paper: A4, marginMm: 60 },
      DEFAULT_PART_DIMENSIONS,
      measurer,
    );

    expect(cramped.omitted).toContain('100 mm test square');
    expect(cramped.figures.some((figure) => figure.label === '100 mm test square')).toBe(false);

    const printed = cramped.layouts
      .flatMap((layout) => layout.ops ?? [])
      .flatMap((op) => (op.op === 'text' ? [op.text] : []))
      .join(' ');
    expect(printed).toContain('100 mm test square');
    expect(printed).toMatch(/reduce the printable margin/i);
  });
});
