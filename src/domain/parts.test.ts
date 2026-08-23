import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PART_DIMENSIONS,
  jCardSize,
  LABEL_PRESETS,
  partShape,
  partSize,
  sameLabelCut,
  samePartDimensions,
} from './parts.ts';
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

describe('whether two sets of measurements cut the same paper', () => {
  const label = (over: Partial<LabelDimensions> = {}): LabelDimensions => ({
    width: 35,
    height: 52.5,
    notch: true,
    notchSize: 6,
    ...over,
  });

  it('counts the notch size when the notch is cut', () => {
    expect(sameLabelCut(label(), label({ notchSize: 5 }))).toBe(false);
  });

  it('ignores the notch size when the corner is square, because it is not on the paper', () => {
    // `labelNotchDepth` is zero either way, so the two outlines are the same
    // rectangle — and a picker that called one of them Custom would be lying
    // about a number nothing cuts.
    const squared = label({ notch: false });

    expect(sameLabelCut(squared, { ...squared, notchSize: 0 })).toBe(true);
    expect(partShape('label', withLabel(squared)).outline).toEqual(
      partShape('label', withLabel({ ...squared, notchSize: 0 })).outline,
    );
  });

  it('ignores a notch size that is clamped away, for the same reason', () => {
    // Half the shorter edge is 17.5 mm on a 35 mm Label, so 40 and 200 are the
    // same cut. A project file can carry either.
    expect(sameLabelCut(label({ notchSize: 40 }), label({ notchSize: 200 }))).toBe(true);
  });

  it('separates the two presets, which is what the picker asks it', () => {
    const [classic, full] = LABEL_PRESETS;

    expect(sameLabelCut(classic!.dimensions, classic!.dimensions)).toBe(true);
    expect(sameLabelCut(classic!.dimensions, full!.dimensions)).toBe(false);
  });

  it('notices a Part the collector has no control for', () => {
    // The J-Card and the Back Card are measurements with no UI, so an import is
    // the only thing that can change them and the only thing that can say so.
    const taller: PartDimensions = {
      ...DEFAULT_PART_DIMENSIONS,
      jcard: { ...DEFAULT_PART_DIMENSIONS.jcard, height: 81 },
    };
    const wider: PartDimensions = {
      ...DEFAULT_PART_DIMENSIONS,
      backCard: { ...DEFAULT_PART_DIMENSIONS.backCard, width: 70 },
    };

    expect(samePartDimensions(DEFAULT_PART_DIMENSIONS, DEFAULT_PART_DIMENSIONS)).toBe(true);
    expect(samePartDimensions(DEFAULT_PART_DIMENSIONS, taller)).toBe(false);
    expect(samePartDimensions(DEFAULT_PART_DIMENSIONS, wider)).toBe(false);
    expect(samePartDimensions(DEFAULT_PART_DIMENSIONS, withLabel(label({ width: 34.6 })))).toBe(false);
  });
});
