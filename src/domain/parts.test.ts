import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PART_DIMENSIONS,
  insertSize,
  LABEL_PRESETS,
  labelShape,
  partSize,
  sameLabelCut,
  samePartDimensions,
} from './parts.ts';
import type { LabelDimensions, PartDimensions } from './parts.ts';

const withLabel = (label: LabelDimensions): PartDimensions => ({ ...DEFAULT_PART_DIMENSIONS, label });

describe('the shape of a Part', () => {
  it('unfolds the Insert into its sections and its Pages (ADR-0012)', () => {
    // Inner Flap 14 + Spine 5.5 + Front Panel 68 is the J-Card's own 87.5, and
    // every Page after the first adds 65: 152.5 at two Pages, 282.5 at four.
    expect(insertSize(DEFAULT_PART_DIMENSIONS.insert, 1)).toEqual({ width: 87.5, height: 79 });
    expect(insertSize(DEFAULT_PART_DIMENSIONS.insert, 2)).toEqual({ width: 152.5, height: 79 });
    expect(insertSize(DEFAULT_PART_DIMENSIONS.insert, 4)).toEqual({ width: 282.5, height: 79 });
    expect(partSize('insert', DEFAULT_PART_DIMENSIONS, 4)).toEqual({ width: 282.5, height: 79 });
  });

  it('never gives the strip a negative length, whatever Page count it is handed', () => {
    // A project file cannot reach this — `readPageCount` refuses anything that is
    // not 2 or 4 — but arithmetic that turns 0 Pages into a shorter-than-empty
    // rectangle would be a hole under every caller.
    for (const pages of [-4, 0, 1]) {
      expect(insertSize(DEFAULT_PART_DIMENSIONS.insert, pages).width).toBeGreaterThanOrEqual(87.5);
    }
  });

  it('cuts the Label’s diagonal corner, and squares it off when the notch is off', () => {
    const notched = labelShape({ width: 35, height: 52.5, notch: true, notchSize: 6 });
    const square = labelShape({ width: 38, height: 54, notch: false, notchSize: 6 });

    expect(notched.outline).toHaveLength(5);
    expect(notched.outline).toContainEqual({ x: 29, y: 0 });
    expect(notched.outline).toContainEqual({ x: 35, y: 6 });
    expect(square.outline).toHaveLength(4);
  });

  it('never folds the outline through itself, however big the notch is asked to be', () => {
    // A project file is not trusted to be sane; a notch wider than the Label
    // used to produce a negative corner and a Label shaped like a triangle.
    const absurd = labelShape({ width: 20, height: 30, notch: true, notchSize: 25 });

    expect(absurd.outline.every((point) => point.x >= 0 && point.y >= 0)).toBe(true);
    expect(Math.max(...absurd.outline.map((point) => point.x))).toBe(20);
    expect(Math.max(...absurd.outline.map((point) => point.y))).toBe(30);
  });

  it('keeps every preset’s outline inside its own size', () => {
    for (const preset of LABEL_PRESETS) {
      const { size, outline } = labelShape(preset.dimensions);

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
    expect(labelShape(squared).outline).toEqual(labelShape({ ...squared, notchSize: 0 }).outline);
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

  it('notices a measurement the collector has no control for', () => {
    // Four of the Insert's five have no UI — only the Page width does — so an
    // import is the only thing that can change them and the only thing that can
    // say so.
    const taller: PartDimensions = {
      ...DEFAULT_PART_DIMENSIONS,
      insert: { ...DEFAULT_PART_DIMENSIONS.insert, height: 81 },
    };
    const narrowerFlap: PartDimensions = {
      ...DEFAULT_PART_DIMENSIONS,
      insert: { ...DEFAULT_PART_DIMENSIONS.insert, innerFlapWidth: 12 },
    };
    const widerPage: PartDimensions = {
      ...DEFAULT_PART_DIMENSIONS,
      insert: { ...DEFAULT_PART_DIMENSIONS.insert, pageWidth: 66 },
    };

    expect(samePartDimensions(DEFAULT_PART_DIMENSIONS, DEFAULT_PART_DIMENSIONS)).toBe(true);
    expect(samePartDimensions(DEFAULT_PART_DIMENSIONS, taller)).toBe(false);
    expect(samePartDimensions(DEFAULT_PART_DIMENSIONS, narrowerFlap)).toBe(false);
    expect(samePartDimensions(DEFAULT_PART_DIMENSIONS, widerPage)).toBe(false);
    expect(samePartDimensions(DEFAULT_PART_DIMENSIONS, withLabel(label({ width: 34.6 })))).toBe(false);
  });
});
