import { describe, expect, it } from 'vitest';

import { A4, LETTER } from '../domain/paper.ts';
import { DEFAULT_PART_DIMENSIONS, LABEL_PRESETS, partSize } from '../domain/parts.ts';
import type { PartDimensions } from '../domain/parts.ts';
import { rectsOverlap } from '../domain/units.ts';
import type { Rect } from '../domain/units.ts';
import { CALIBRATION_SQUARE_MM, renderCalibrationSheet } from './calibration.ts';
import type { TextMeasurer } from './text.ts';

const measurer: TextMeasurer = {
  widthMm: (text, style) => text.length * style.sizeMm * 0.5,
};

const sheet = (dimensions: PartDimensions = DEFAULT_PART_DIMENSIONS) =>
  renderCalibrationSheet({ paper: A4, marginMm: 5 }, dimensions, measurer);

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
    expectMm(square?.width ?? -1, CALIBRATION_SQUARE_MM, 'square width');
    expectMm(square?.height ?? -1, CALIBRATION_SQUARE_MM, 'square height');
    expect(CALIBRATION_SQUARE_MM).toBe(100);
  });

  it('says on the paper what the square should measure', () => {
    const printed = (sheet().layout.ops ?? [])
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

    // Classic keeps the cartridge's cut corner; Full covers it.
    expect(outlines.get('Label — Classic')).toHaveLength(5);
    expect(outlines.get('Label — Full')).toHaveLength(4);
  });

  it('shows the J-Card and the Back Card at their current dimensions', () => {
    const drawn = figures();
    const jcard = partSize('jcard', DEFAULT_PART_DIMENSIONS);
    const backCard = partSize('back-card', DEFAULT_PART_DIMENSIONS);

    expectMm(drawn.get('J-Card')?.width ?? -1, jcard.width, 'J-Card width');
    expectMm(drawn.get('J-Card')?.height ?? -1, jcard.height, 'J-Card height');
    expectMm(drawn.get('Back Card')?.width ?? -1, backCard.width, 'Back Card width');
    expectMm(drawn.get('Back Card')?.height ?? -1, backCard.height, 'Back Card height');
  });

  it('follows the Part dimensions it is given rather than the defaults', () => {
    const adjusted: PartDimensions = {
      ...DEFAULT_PART_DIMENSIONS,
      backCard: { width: 66, height: 74 },
    };

    expectMm(figures(adjusted).get('Back Card')?.width ?? -1, 66, 'adjusted Back Card width');
    expectMm(figures(adjusted).get('Back Card')?.height ?? -1, 74, 'adjusted Back Card height');
  });

  it('marks the J-Card fold lines, so the panel widths can be measured too', () => {
    const jcard = sheet().figures.find((figure) => figure.label === 'J-Card');

    expect(jcard?.folds).toHaveLength(2);
    expectMm(jcard?.folds?.[0] ?? -1, 14, 'first fold');
    expectMm(jcard?.folds?.[1] ?? -1, 19.5, 'second fold');
  });
});

describe('the calibration sheet — the page', () => {
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

  it('never overlaps two figures', () => {
    const drawn = sheet().figures;

    for (const [index, a] of drawn.entries()) {
      for (const b of drawn.slice(index + 1)) {
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

    expect(onLetter.layout.paper.id).toBe('letter');
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
    expect(sheet().layout.placements).toEqual([]);
  });
});
