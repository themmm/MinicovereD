import { describe, expect, it } from 'vitest';

import { A4 } from '../domain/paper.ts';
import { DEFAULT_PART_DIMENSIONS, jCardSize } from '../domain/parts.ts';
import type { PartPlacement } from './layout.ts';
import { partSheet, visibleBox } from './part-sheet.ts';

/**
 * The Part as its own Sheet (ADR-0010). Geometry only: that a Part is drawn at
 * all is the rasteriser's business and already covered, and what matters here is
 * that trimming the paper to the Part cannot move the Part relative to it.
 */

const { jcard } = DEFAULT_PART_DIMENSIONS;
const FLAP = jcard.innerFlapWidth;
const SPINE = jcard.spineWidth;
const FRONT = jcard.frontPanelWidth;

const jCardPlacement = (): PartPlacement => ({
  releaseId: 'r1',
  part: 'jcard',
  // Somewhere in the middle of a Sheet, so a stale offset cannot pass as zero.
  bounds: { x: 37, y: 61, ...jCardSize(jcard) },
  ops: [],
  guides: [],
  panels: [
    { panel: 'inner-flap', rect: { x: 0, y: 0, width: FLAP, height: jcard.height } },
    { panel: 'spine', rect: { x: FLAP, y: 0, width: SPINE, height: jcard.height } },
    { panel: 'front-panel', rect: { x: FLAP + SPINE, y: 0, width: FRONT, height: jcard.height } },
  ],
});

const labelPlacement = (): PartPlacement => ({
  releaseId: 'r1',
  part: 'label',
  bounds: { x: 12, y: 5, width: 35, height: 52.5 },
  ops: [],
  guides: [{ kind: 'cut', points: [{ x: 0, y: 0 }], closed: true }],
});

describe('a Part as its own Sheet', () => {
  it('trims the paper to the Part and leaves the Part at the origin', () => {
    const sheet = partSheet(A4, labelPlacement());

    expect(sheet.paper.width).toBe(35);
    expect(sheet.paper.height).toBe(52.5);
    expect(sheet.placements).toHaveLength(1);
    expect(sheet.placements[0]?.bounds).toMatchObject({ x: 0, y: 0 });
    // No margin: a Part is not packed onto anything, it *is* the page.
    expect(sheet.marginMm).toBe(0);
  });

  it('keeps the guides, because they are what clips the drawing', () => {
    // A Label drawn without its cut outline fills the notched corner the
    // cartridge does not have.
    expect(partSheet(A4, labelPlacement()).placements[0]?.guides).toHaveLength(1);
  });

  it('shows the whole 87.5 mm strip when the J-Card is flat', () => {
    const sheet = partSheet(A4, jCardPlacement(), 'flat');

    expect(sheet.paper.width).toBe(FLAP + SPINE + FRONT);
    expect(sheet.placements[0]?.bounds.x).toBe(0);
  });

  it('hides the Inner Flap when the J-Card is assembled, by moving it off the canvas', () => {
    const sheet = partSheet(A4, jCardPlacement(), 'assembled');

    // Spine plus Front Panel: the 73.5 mm that faces out of the case.
    expect(sheet.paper.width).toBe(SPINE + FRONT);
    expect(sheet.paper.height).toBe(jcard.height);
    // Shifted left by exactly the flap, so the Spine starts at zero and the
    // flap is clipped by the canvas rather than by any drawing code.
    expect(sheet.placements[0]?.bounds.x).toBe(-FLAP);
    expect(sheet.placements[0]?.bounds.y).toBe(0);
  });

  it('assembles by the union of the visible panels, not by the flap’s width', () => {
    // Same panels, declared in the reverse order. A reader of `panels[0]` would
    // trim to the wrong edge; the union cannot.
    const placement = jCardPlacement();
    const reversed: PartPlacement = { ...placement, panels: [...(placement.panels ?? [])].reverse() };

    expect(visibleBox(reversed, 'assembled')).toEqual(visibleBox(placement, 'assembled'));
  });

  it('shows a Part whole when it has no panels to fold', () => {
    // Only the J-Card folds, so `assembled` has to mean nothing for the others
    // rather than trimming them to whatever a missing panel list implies.
    expect(visibleBox(labelPlacement(), 'assembled')).toEqual({
      x: 0,
      y: 0,
      width: 35,
      height: 52.5,
    });
  });

  it('names a paper that exists, and resizes only what the rasteriser reads', () => {
    const sheet = partSheet(A4, labelPlacement());

    // The id and name come from the Sheet the Part was packed on. Inventing one
    // would put a paper in the model that no printer has.
    expect(sheet.paper.id).toBe(A4.id);
    expect(sheet.paper.name).toBe(A4.name);
    expect(sheet.paper.width).not.toBe(A4.width);
  });
});
