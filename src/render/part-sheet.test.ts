import { describe, expect, it } from 'vitest';

import { A4 } from '../domain/paper.ts';
import { DEFAULT_PART_DIMENSIONS, insertSize } from '../domain/parts.ts';
import { insertPanels } from './insert-plan.ts';
import type { PartPlacement } from './layout.ts';
import { partSheet, visibleBox } from './part-sheet.ts';

/**
 * The Part as its own Sheet (ADR-0010). Geometry only: that a Part is drawn at
 * all is the rasteriser's business and already covered, and what matters here is
 * that trimming the paper to the Part cannot move the Part relative to it.
 */

const { insert } = DEFAULT_PART_DIMENSIONS;
const FLAP = insert.innerFlapWidth;
const SPINE = insert.spineWidth;
const FRONT = insert.frontPanelWidth;

const insertPlacement = (pages = 2): PartPlacement => ({
  releaseId: 'r1',
  part: 'insert',
  // Somewhere in the middle of a Sheet, so a stale offset cannot pass as zero.
  bounds: { x: 37, y: 61, ...insertSize(insert, pages) },
  turned: false,
  ops: [],
  guides: [],
  // The renderer's own sections, so this test cannot drift from the strip the
  // app actually folds.
  panels: insertPanels(
    insert,
    pages === 4 ? ['cover', 'tracklist', 'credits', 'artwork'] : ['cover', 'tracklist'],
  ),
});

const labelPlacement = (): PartPlacement => ({
  releaseId: 'r1',
  part: 'label',
  bounds: { x: 12, y: 5, width: 35, height: 52.5 },
  turned: false,
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

  it('shows the whole strip when the Insert is flat, at either Page count', () => {
    expect(partSheet(A4, insertPlacement(2), 'flat').paper.width).toBe(152.5);
    expect(partSheet(A4, insertPlacement(4), 'flat').paper.width).toBe(282.5);
    expect(partSheet(A4, insertPlacement(4), 'flat').placements[0]?.bounds.x).toBe(0);
  });

  it('shows the closed booklet when the Insert is assembled: the Spine and Page 1', () => {
    const sheet = partSheet(A4, insertPlacement(2), 'assembled');

    // Spine plus Front Panel: the 73.5 mm that faces out of the case.
    expect(sheet.paper.width).toBe(SPINE + FRONT);
    expect(sheet.paper.height).toBe(insert.height);
    // Shifted left by exactly the flap, so the Spine starts at zero and the
    // flap is clipped by the canvas rather than by any drawing code.
    expect(sheet.placements[0]?.bounds.x).toBe(-FLAP);
    expect(sheet.placements[0]?.bounds.y).toBe(0);
  });

  it('folds every Page after the first away too, so assembled is one box at any count', () => {
    // The whole reason ADR-0010's one shared scale still works: a four-Page
    // Insert's default view is 73.5 mm on screen, the same box a v1 J-Card had,
    // and not the 282.5 mm strip. Unioning "everything but the flap", which is
    // what this did with three panels, would have given back the strip.
    expect(partSheet(A4, insertPlacement(4), 'assembled').paper.width).toBe(SPINE + FRONT);
    expect(visibleBox(insertPlacement(4), 'assembled')).toEqual(
      visibleBox(insertPlacement(2), 'assembled'),
    );
  });

  it('assembles by the union of the visible sections, not by the flap’s width', () => {
    // Same sections, declared in the reverse order. A reader of `panels[0]` would
    // trim to the wrong edge; the union cannot.
    const placement = insertPlacement(4);
    const reversed: PartPlacement = { ...placement, panels: [...(placement.panels ?? [])].reverse() };

    expect(visibleBox(reversed, 'assembled')).toEqual(visibleBox(placement, 'assembled'));
  });

  it('shows a Part whole when it has no sections to fold', () => {
    // Only the Insert folds, so `assembled` has to mean nothing for the Label
    // rather than trimming it to whatever a missing section list implies.
    expect(visibleBox(labelPlacement(), 'assembled')).toEqual({
      x: 0,
      y: 0,
      width: 35,
      height: 52.5,
    });
  });

  it('shows a Part that was packed on its side standing up again', () => {
    // The specimen is the design surface (ADR-0010) and the collector never
    // chose the turn — it is an answer to the size of the paper, and it belongs
    // to the Sheet check where the paper is.
    const packedTurned: PartPlacement = {
      ...labelPlacement(),
      bounds: { x: 5, y: 5, width: 52.5, height: 35 },
      turned: true,
    };
    const sheet = partSheet(A4, packedTurned);

    expect(sheet.paper.width).toBe(35);
    expect(sheet.paper.height).toBe(52.5);
    expect(sheet.placements[0]?.turned).toBe(false);
    expect(sheet.placements[0]?.bounds).toEqual({ x: 0, y: 0, width: 35, height: 52.5 });
  });

  it('assembles a turned Insert exactly as it assembles an upright one', () => {
    // A four-Page Insert is the Part that really does get turned (ADR-0014). Its
    // sections are Part-local and stay upright whatever the packer did, so the
    // assembled box is the same box either way. What must not survive is the turn
    // itself: a specimen still carrying it would be drawn on its side inside
    // paper trimmed to a standing Part.
    const upright = insertPlacement(4);
    const packedTurned: PartPlacement = {
      ...upright,
      bounds: { x: 5, y: 5, width: insert.height, height: insertSize(insert, 4).width },
      turned: true,
    };
    const sheet = partSheet(A4, packedTurned, 'assembled');

    expect(sheet.placements[0]?.turned).toBe(false);
    expect(sheet.placements[0]?.bounds).toEqual({
      x: -FLAP,
      y: 0,
      width: SPINE + FRONT,
      height: insert.height,
    });
    expect(sheet.paper.width).toBe(SPINE + FRONT);
    expect(visibleBox(packedTurned, 'assembled')).toEqual(visibleBox(upright, 'assembled'));
  });

  it('shows a turned Insert’s whole strip when it is flat, standing up', () => {
    // Flat and turned is the combination the Sheet check and the design surface
    // disagree about: the paper has it lying down and the specimen has to stand
    // it up, at its full 282.5 mm.
    const packedTurned: PartPlacement = {
      ...insertPlacement(4),
      bounds: { x: 5, y: 5, width: insert.height, height: insertSize(insert, 4).width },
      turned: true,
    };
    const sheet = partSheet(A4, packedTurned, 'flat');

    expect(sheet.paper).toMatchObject({ width: 282.5, height: insert.height });
    expect(sheet.placements[0]?.turned).toBe(false);
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
