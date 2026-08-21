import { describe, expect, it } from 'vitest';

import { DEFAULT_PART_DIMENSIONS, jCardSize, LABEL_PRESETS, partShape, partSize } from './parts.ts';
import type { LabelDimensions, PartDimensions } from './parts.ts';

const withLabel = (label: LabelDimensions): PartDimensions => ({ ...DEFAULT_PART_DIMENSIONS, label });

describe('the shape of a Part', () => {
  it('unfolds the J-Card into its three panels (ADR-0005)', () => {
    expect(jCardSize(DEFAULT_PART_DIMENSIONS.jcard)).toEqual({ width: 87.5, height: 79 });
    expect(partSize('back-card', DEFAULT_PART_DIMENSIONS)).toEqual({ width: 69, height: 79 });
  });

  it('cuts the Label’s diagonal corner, and squares it off when the notch is off', () => {
    const notched = partShape('label', withLabel({ width: 35, height: 52.5, notch: true, notchSize: 6 }));
    const square = partShape('label', withLabel({ width: 38, height: 54, notch: false, notchSize: 6 }));

    expect(notched.outline).toHaveLength(5);
    expect(notched.outline).toContainEqual({ x: 29, y: 0 });
    expect(notched.outline).toContainEqual({ x: 35, y: 6 });
    expect(square.outline).toHaveLength(4);
  });

  it('never folds the outline through itself, however big the notch is asked to be', () => {
    // A project file is not trusted to be sane; a notch wider than the Label
    // used to produce a negative corner and a Label shaped like a triangle.
    const absurd = partShape('label', withLabel({ width: 20, height: 30, notch: true, notchSize: 25 }));

    expect(absurd.outline.every((point) => point.x >= 0 && point.y >= 0)).toBe(true);
    expect(Math.max(...absurd.outline.map((point) => point.x))).toBe(20);
    expect(Math.max(...absurd.outline.map((point) => point.y))).toBe(30);
  });

  it('keeps every preset’s outline inside its own size', () => {
    for (const preset of LABEL_PRESETS) {
      const { size, outline } = partShape('label', withLabel(preset.dimensions));

      for (const point of outline) {
        expect(point.x, `${preset.name} x`).toBeGreaterThanOrEqual(0);
        expect(point.y, `${preset.name} y`).toBeGreaterThanOrEqual(0);
        expect(point.x, `${preset.name} x`).toBeLessThanOrEqual(size.width);
        expect(point.y, `${preset.name} y`).toBeLessThanOrEqual(size.height);
      }
    }
  });
});
