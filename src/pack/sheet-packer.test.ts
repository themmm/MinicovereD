import { describe, expect, it } from 'vitest';

import { A4, LETTER, printableArea } from '../domain/paper.ts';
import { DEFAULT_PART_DIMENSIONS, partSize } from '../domain/parts.ts';
import type { PartKind } from '../domain/parts.ts';
import { rectsOverlap } from '../domain/units.ts';
import type { Size } from '../domain/units.ts';
import { DEFAULT_PART_GAP_MM, fitsPaper, packParts } from './sheet-packer.ts';
import type { PackConfig, PackItem, PackedSheet } from './sheet-packer.ts';

/** What the renderer hangs off a packed rectangle: which Release, which Part. */
interface PartRef {
  readonly releaseId: string;
  readonly part: PartKind;
}

type Item = PackItem<PartRef>;

/** The packer answers with more than sheets now; most tests only want those. */
const pack = (items: readonly Item[], config: PackConfig): ReadonlyArray<PackedSheet<PartRef>> =>
  packParts(items, config).sheets;

/**
 * Fixed rectangle sets with hand-worked answers. A4's printable area at a 5 mm
 * margin is 200 × 287 mm; with a 4 mm gap between Parts, a 98 mm-wide piece
 * fits twice across (98 + 4 + 98 = 200) and a 140 mm-tall one twice down
 * (140 + 4 + 140 = 284) — four to a Sheet, and the fifth starts a new one.
 */
const A4_CONFIG: PackConfig = { paper: A4, marginMm: 5, gapMm: 4 };

const quarters = (count: number): Item[] =>
  Array.from({ length: count }, (_, index) => ({
    ref: { releaseId: `r${index}`, part: 'insert' as PartKind },
    label: `a quarter r${index}`,
    size: { width: 98, height: 140 },
  }));

/**
 * A Release's Parts at the app's own sizes. Two Pages, which is the common case
 * and the only Insert that fits A4 standing up.
 */
const partsOf = (releaseId: string, only?: readonly PartKind[]): Item[] =>
  (only ?? (['insert', 'label'] as const)).map((part) => ({
    ref: { releaseId, part },
    label: `${part} of ${releaseId}`,
    size: partSize(part, DEFAULT_PART_DIMENSIONS, 2),
  }));

/** Generic over the ref, because the ADR-0014 blocks below pack plain shapes. */
const allPlacements = <T,>(sheets: ReadonlyArray<PackedSheet<T>>) =>
  sheets.flatMap((sheet) => sheet.placements);

const expectInsideMargin = <T,>(
  sheets: ReadonlyArray<PackedSheet<T>>,
  paper: Size,
  marginMm: number,
): void => {
  for (const sheet of sheets) {
    for (const { item, rect } of sheet.placements) {
      const what = item.label;
      expect(rect.x, `${what} left`).toBeGreaterThanOrEqual(marginMm);
      expect(rect.y, `${what} top`).toBeGreaterThanOrEqual(marginMm);
      expect(rect.x + rect.width, `${what} right`).toBeLessThanOrEqual(paper.width - marginMm);
      expect(rect.y + rect.height, `${what} bottom`).toBeLessThanOrEqual(paper.height - marginMm);
    }
  }
};

const expectNoOverlaps = <T,>(sheets: ReadonlyArray<PackedSheet<T>>): void => {
  for (const sheet of sheets) {
    for (const [index, a] of sheet.placements.entries()) {
      for (const b of sheet.placements.slice(index + 1)) {
        expect(
          rectsOverlap(a.rect, b.rect),
          `${a.item.label} overlaps ${b.item.label}`,
        ).toBe(false);
      }
    }
  }
};

describe('SheetPacker — sheet count', () => {
  it('packs nothing onto no Sheets', () => {
    expect(pack([], A4_CONFIG)).toEqual([]);
  });

  it('reports what it could not fit instead of throwing, when asked to', () => {
    const huge: Item = {
      ref: { releaseId: 'r1', part: 'insert' },
      label: 'the Insert of Too Wide',
      size: { width: 250, height: 79 },
    };

    const result = packParts([huge, ...quarters(1)], { ...A4_CONFIG, oversize: 'omit' });

    expect(result.omitted).toEqual(['the Insert of Too Wide']);
    expect(result.sheets.flatMap((sheet) => sheet.placements)).toHaveLength(1);
  });

  it('keeps room free at the top of the first Sheet when a heading needs it', () => {
    const result = packParts(quarters(1), { ...A4_CONFIG, firstSheetTopMm: 22 });
    const [placement] = result.sheets[0]?.placements ?? [];

    // 5 mm margin plus 22 mm of heading.
    expect(placement?.rect.y).toBe(27);
  });

  it('fits four quarter-page rectangles on one A4 Sheet', () => {
    expect(pack(quarters(4), A4_CONFIG)).toHaveLength(1);
  });

  it('opens a second Sheet for the fifth', () => {
    expect(pack(quarters(5), A4_CONFIG)).toHaveLength(2);
  });

  it('keeps filling Sheets four at a time', () => {
    expect(pack(quarters(8), A4_CONFIG)).toHaveLength(2);
    expect(pack(quarters(9), A4_CONFIG)).toHaveLength(3);
  });

  it('places every item exactly once, whatever the Sheet count', () => {
    const items = quarters(9);
    const placed = allPlacements(pack(items, A4_CONFIG));

    expect(placed).toHaveLength(items.length);
    expect(new Set(placed.map(({ item }) => item.ref.releaseId)).size).toBe(items.length);
  });
});

describe('SheetPacker — a single Release', () => {
  it('puts both Parts of one Release side by side on one Sheet', () => {
    const sheets = pack(partsOf('r1'), A4_CONFIG);

    expect(sheets).toHaveLength(1);
    expect(sheets[0]?.placements.map(({ item }) => item.ref.part).sort()).toEqual([
      'insert',
      'label',
    ]);
    // 152.5 of Insert, a 4 mm gap and a 35 mm Label is 191.5 of 200: two Parts
    // where v1 needed a row for three.
    expect(new Set(sheets[0]?.placements.map(({ rect }) => rect.y)).size).toBe(1);
  });

  it('fits three whole Releases — six Parts — on one A4 Sheet', () => {
    const sheets = pack([...partsOf('r1'), ...partsOf('r2'), ...partsOf('r3')], A4_CONFIG);

    expect(sheets).toHaveLength(1);
    expect(allPlacements(sheets)).toHaveLength(6);
    expectNoOverlaps(sheets);
    expectInsideMargin(sheets, A4, 5);
  });

  it('wastes no paper on a batch: ten Releases print on four Sheets, not ten', () => {
    const items = Array.from({ length: 10 }, (_, index) => partsOf(`r${index}`)).flat();
    const sheets = pack(items, A4_CONFIG);

    // Pinned: this is the heuristic's current quality, so a regression to a
    // worse packing has to be a deliberate change to this number. Twenty Parts
    // rather than v1's thirty, because a Release has two.
    expect(sheets).toHaveLength(4);
    expect(allPlacements(sheets)).toHaveLength(20);
    expectNoOverlaps(sheets);
    expectInsideMargin(sheets, A4, 5);
  });
});

describe('SheetPacker — Part toggles', () => {
  it('packs only what it is given, so a Labels-only job yields Sheets of Labels', () => {
    const labels = Array.from({ length: 12 }, (_, index) => partsOf(`r${index}`, ['label'])).flat();
    const sheets = pack(labels, A4_CONFIG);

    expect(allPlacements(sheets).every(({ item }) => item.ref.part === 'label')).toBe(true);
    expect(allPlacements(sheets)).toHaveLength(12);
    // 35 × 52.5 mm Labels are small: a dozen is nowhere near a full A4 Sheet.
    expect(sheets).toHaveLength(1);
  });
});

describe('SheetPacker — paper and margin', () => {
  it('uses the extra width Letter has over A4', () => {
    // Two 100 mm columns need 204 mm: more than A4's 200 mm printable width,
    // less than Letter's 205.9 mm. Same four squares, half the Sheets.
    const squares: Item[] = Array.from({ length: 4 }, (_, index) => ({
      ref: { releaseId: `r${index}`, part: 'label' as PartKind },
      label: `square ${index}`,
      size: { width: 100, height: 100 },
    }));

    expect(pack(squares, A4_CONFIG)).toHaveLength(2);

    const onLetter = pack(squares, { paper: LETTER, marginMm: 5, gapMm: 4 });
    expect(onLetter).toHaveLength(1);
    expectInsideMargin(onLetter, LETTER, 5);
    expectNoOverlaps(onLetter);
  });

  it('honours a larger printable margin by fitting less on a Sheet', () => {
    const roomy: PackConfig = { paper: A4, marginMm: 20, gapMm: 4 };

    // 170 × 257 printable: a 98 mm-wide piece fits once across and a 140 mm-tall
    // one once down, so each of the four needs its own Sheet.
    expect(pack(quarters(4), roomy)).toHaveLength(4);
    expectInsideMargin(pack(quarters(4), roomy), A4, 20);
    expectNoOverlaps(pack(quarters(4), roomy));
  });

  it('counts the caption room a figure needs beneath it, not only the figure', () => {
    // The calibration sheet reserves room under every outline for its two caption
    // lines, and a figure that fits the paper but not the paper minus its caption
    // has to be refused rather than printed with the caption off the page. The
    // fit rule is shared with `fitsPaper`, so this is also what says that export
    // reads the caption room.
    const area = printableArea(A4, 5);
    const tall: Item = {
      ref: { releaseId: 'r1', part: 'insert' },
      label: 'a figure as tall as the bed',
      // Exactly the printable height, so it fits alone and does not fit with a
      // caption under it.
      size: { width: 50, height: area.height },
    };

    expect(pack([tall], { ...A4_CONFIG, oversize: 'omit' })).toHaveLength(1);
    expect(
      packParts([tall], { ...A4_CONFIG, captionRoomMm: 8.8, oversize: 'omit' }).omitted,
    ).toEqual(['a figure as tall as the bed']);
  });

  it('refuses a Part that cannot fit the printable area at all', () => {
    const huge: Item = {
      ref: { releaseId: 'r1', part: 'insert' },
      label: 'the Insert of Too Wide',
      size: { width: 250, height: 79 },
    };

    expect(() => pack([huge], A4_CONFIG)).toThrow(/does not fit/);
  });
});

/**
 * ADR-0012's Insert, as rectangles: ADR-0014 asks for the turn to be "tested as
 * rectangles rather than as pixels", and this seam knows nothing about Parts.
 */
const INSERT_4PAGE: Size = { width: 282.5, height: 79 };
/** The common case: Inner Flap, Spine, Front Panel and one Page. */
const INSERT_2PAGE: Size = { width: 152.5, height: 79 };
const LABEL: Size = { width: 35, height: 52.5 };

/** A rectangle that is nobody's Part, named after itself. */
const shape = (label: string, size: Size): PackItem<string> => ({ ref: label, label, size });

const TURNING: PackConfig = { ...A4_CONFIG, turn: 'to-fit' };

const insertsAndLabels = (): Array<PackItem<string>> => [
  shape('the Insert of A', INSERT_4PAGE),
  shape('the Insert of B', INSERT_4PAGE),
  ...Array.from({ length: 5 }, (_, index) => shape(`Label ${index}`, LABEL)),
];

describe('SheetPacker — the one fit rule, asked directly', () => {
  /*
   * `fitsPaper` is exported because two things have to agree about it: this
   * packer, and whatever sized the rectangle. An Insert's Page count is chosen
   * against it (`maxInsertPages`), so a rule that disagreed with the placement
   * would be a strip the packer refuses — and refusing a Part blanks the whole
   * preview.
   *
   * Asked here directly rather than only through `packParts`, because no caller
   * in the app combines a caption room with a turn: the calibration sheet
   * reserves captions and never turns, and the renderer turns and reserves
   * nothing. The rule is general even where the callers are not, and the untested
   * half of it is exactly where a wrong answer would hide.
   */
  const A4_AT_5 = { paper: A4, marginMm: 5 } as const;

  it('takes a rectangle that fits standing up', () => {
    expect(fitsPaper({ width: 200, height: 287 }, A4_AT_5)).toBe(true);
    expect(fitsPaper({ width: 200.1, height: 287 }, A4_AT_5)).toBe(false);
    expect(fitsPaper({ width: 200, height: 287.1 }, A4_AT_5)).toBe(false);
  });

  it('turns only when asked, and only when turning helps', () => {
    const overlong = { width: 282.5, height: 79 };

    expect(fitsPaper(overlong, A4_AT_5)).toBe(false);
    expect(fitsPaper(overlong, { ...A4_AT_5, turn: 'never' })).toBe(false);
    expect(fitsPaper(overlong, { ...A4_AT_5, turn: 'to-fit' })).toBe(true);
    // Longer than the paper either way round: no policy rescues it.
    expect(fitsPaper({ width: 400, height: 79 }, { ...A4_AT_5, turn: 'to-fit' })).toBe(false);
  });

  it('counts the caption room whichever way the rectangle goes', () => {
    // Standing up, the caption comes off the height; turned, off the *width* the
    // rectangle used to have — because that is what the height becomes. Both
    // halves matter even though no caller in this app reaches the second, and
    // both are one `+ captionRoomMm` away from being silently wrong.
    const captionRoomMm = 8.8;

    expect(fitsPaper({ width: 50, height: 287 }, A4_AT_5)).toBe(true);
    expect(fitsPaper({ width: 50, height: 287 }, { ...A4_AT_5, captionRoomMm })).toBe(false);
    expect(fitsPaper({ width: 50, height: 287 - captionRoomMm }, { ...A4_AT_5, captionRoomMm })).toBe(true);

    // Turned: 287 × 50 becomes a 50 × 287 box, so the same caption room bites.
    const turning = { ...A4_AT_5, turn: 'to-fit' } as const;
    expect(fitsPaper({ width: 287, height: 50 }, turning)).toBe(true);
    expect(fitsPaper({ width: 287, height: 50 }, { ...turning, captionRoomMm })).toBe(false);
    expect(fitsPaper({ width: 287 - captionRoomMm, height: 50 }, { ...turning, captionRoomMm })).toBe(true);
  });

  it('agrees with the packer it is part of, which is the whole point of sharing it', () => {
    // The property `maxInsertPages` leans on: anything this rule accepts, the
    // packer places, and anything it refuses, the packer refuses.
    for (const size of [
      { width: 282.5, height: 79 },
      { width: 152.5, height: 79 },
      { width: 201, height: 79 },
      { width: 79, height: 288 },
    ]) {
      const config = { ...A4_AT_5, gapMm: 3.5, turn: 'to-fit' } as const;
      const item: Item = { ref: { releaseId: 'r1', part: 'insert' }, label: 'a strip', size };
      const placed = packParts([item], { ...config, oversize: 'omit' });

      expect(placed.omitted.length === 0, `${size.width} × ${size.height}`).toBe(
        fitsPaper(size, config),
      );
    }
  });
});

describe('SheetPacker — the Part turns, not the Sheet (ADR-0014)', () => {
  it('is measured against the sizes the app and the ADRs actually use', () => {
    // Every sheet count below is about these two rectangles, so both are
    // measured against the domain rather than against themselves. The Insert
    // keeps the J-Card's three panels and adds Pages at 65 mm (ADR-0012), so
    // its length is the J-Card's flat strip plus three of them.
    expect(LABEL).toEqual(partSize('label', DEFAULT_PART_DIMENSIONS, 2));
    expect(INSERT_4PAGE).toEqual(partSize('insert', DEFAULT_PART_DIMENSIONS, 4));
    expect(INSERT_2PAGE).toEqual(partSize('insert', DEFAULT_PART_DIMENSIONS, 2));
  });

  it('turns a rectangle too long for the paper, and the placement says so', () => {
    const { sheets } = packParts([shape('the Insert of Discovery', INSERT_4PAGE)], TURNING);
    const [placement] = sheets[0]?.placements ?? [];

    expect(placement?.turned).toBe(true);
    // 282.5 × 79 does not fit 200 × 287. Stood on end it does, with 4.5 mm of
    // the sheet's length to spare.
    expect(placement?.rect).toEqual({ x: 5, y: 5, width: 79, height: 282.5 });
    // What the caller asked for is untouched, because the Part is still drawn
    // and cut in its own millimetres.
    expect(placement?.item.size).toEqual(INSERT_4PAGE);
  });

  it('leaves a rectangle that already fits standing up', () => {
    const { sheets } = packParts([shape('a two-Page Insert', INSERT_2PAGE)], TURNING);
    const [placement] = sheets[0]?.placements ?? [];

    expect(placement?.turned).toBe(false);
    expect(placement?.rect).toEqual({ x: 5, y: 5, ...INSERT_2PAGE });
  });

  it('would pack worse if it turned for density rather than to fit', () => {
    // Why `to-fit` is a rescue and not an optimisation. Six two-Page Inserts go
    // three to a Sheet standing up — one per 79 mm row, three rows on a 287 mm
    // bed — and only two lying down, because two 79 mm columns fit the width
    // but a second 152.5 mm row does not fit under the first.
    const six = Array.from({ length: 6 }, (_, index) => shape(`two-Page ${index}`, INSERT_2PAGE));
    expect(packParts(six, TURNING).sheets.map((sheet) => sheet.placements.length)).toEqual([3, 3]);

    // Turned by hand, because the packer will not do it: this is the packing
    // the other heuristic would have produced, not a second answer from this one.
    const laidDown = six.map((item) => ({ ...item, size: { width: 79, height: 152.5 } }));
    expect(packParts(laidDown, TURNING).sheets.map((sheet) => sheet.placements.length)).toEqual([
      2, 2, 2,
    ]);
  });

  it('sorts a turned rectangle by the height it will actually be placed at', () => {
    // The Insert is 79 mm tall as it is handed over and 282.5 mm tall as it is
    // placed. Sorted by the first it would go last, find no shelf tall enough
    // to take it, and open a Sheet of its own with the two blocks left behind
    // on the first.
    const packed = packParts(
      [
        shape('the Insert of A', INSERT_4PAGE),
        shape('block 0', { width: 60, height: 100 }),
        shape('block 1', { width: 60, height: 100 }),
      ],
      { ...TURNING, columns: true },
    );

    expect(packed.sheets).toHaveLength(1);
    expect(allPlacements(packed.sheets).map(({ item }) => item.label)).toEqual([
      'the Insert of A',
      'block 0',
      'block 1',
    ]);
  });

  it('does not turn anything unless it is asked to', () => {
    // The default, and what the calibration sheet gets.
    expect(() => packParts([shape('the Insert of Discovery', INSERT_4PAGE)], A4_CONFIG)).toThrow(
      /does not fit/,
    );
  });

  it('lands two Inserts and five Labels on one A4 portrait Sheet, at the gap the app ships', () => {
    // ADR-0014's picture, at `DEFAULT_PART_GAP_MM` rather than at a gap chosen to
    // make it come out: two turned Inserts side by side, and the column that
    // leaves holds the Labels. They take 197 of the 200 mm — the ADR's 158 is the
    // same pair with no gap between them. It needs the column as much as the
    // turn: every rectangle on a shelf shares that shelf's top edge, so without
    // one only the first Label reaches the strip.
    const sheets = packParts(insertsAndLabels(), {
      ...TURNING,
      gapMm: DEFAULT_PART_GAP_MM,
      columns: true,
    }).sheets;

    expect(sheets).toHaveLength(1);
    const placed = allPlacements(sheets);
    expect(placed).toHaveLength(7);
    expect(placed.filter((placement) => placement.turned)).toHaveLength(2);
    // Side by side: 79 of Insert, the gap, 79 more.
    expect(placed.filter((placement) => placement.turned).map(({ rect }) => rect.x)).toEqual([
      5,
      5 + 79 + DEFAULT_PART_GAP_MM,
    ]);

    const labels = placed.filter((placement) => placement.item.label.startsWith('Label '));
    expect(labels).toHaveLength(5);
    // One column: the same left edge, each Label under the last.
    expect(new Set(labels.map((placement) => placement.rect.x)).size).toBe(1);
    expect(labels.map((placement) => placement.rect.y)).toEqual([5, 61, 117, 173, 229]);

    expectNoOverlaps(sheets);
    expectInsideMargin(sheets, A4, 5);
  });

  it('would miss it by a millimetre at a 4 mm gap, which is why the gap is 3.5', () => {
    // ADR-0014's table works the arithmetic with no gap at all. Two 79 mm
    // Inserts and a 35 mm Label need 193 mm plus two gaps against 200 mm of
    // printable width, so the picture holds up to a 3.5 mm gap and no further.
    // v1 shipped 4 and the ADR's claim was false by one millimetre; ticket 08
    // spent the half-millimetre, because the gap is scissor room and the other
    // three numbers in the sum are a case, a cartridge and a printer.
    //
    // Both directions asserted. Only the second can fail if the constant moves
    // up, and only the first if it moves down.
    const withColumns = { ...TURNING, columns: true };

    expect(packParts(insertsAndLabels(), { ...withColumns, gapMm: 4 }).sheets).toHaveLength(2);
    expect(
      packParts(insertsAndLabels(), { ...withColumns, gapMm: DEFAULT_PART_GAP_MM }).sheets,
    ).toHaveLength(1);
    expect(DEFAULT_PART_GAP_MM).toBeLessThanOrEqual(3.5);
  });

  it('names the margin, and the margin that would work, when it cannot place a Part', () => {
    // The case ADR-0014 says will actually happen: 5 mm is a default home
    // printers routinely need raised, and above 7.25 mm the four-Page Insert is
    // gone. "Does not fit" is a fact; the last sentence is something to do.
    expect(() =>
      packParts([shape('the Insert of Discovery', INSERT_4PAGE)], { ...TURNING, marginMm: 10 }),
    ).toThrow(
      'minicovered: the Insert of Discovery (282.5 × 79 mm) does not fit A4 with a printable ' +
        'margin of 10 mm, turned or not — that leaves 190 × 277 mm to print on. Lower the margin ' +
        'to 7.25 mm or less to make room for it.',
    );
  });

  it('places it at exactly the margin it named, and not a tenth above', () => {
    // 297 − 2 × 7.25 is 282.5. The sentence is arithmetic, not a rule of thumb.
    const at725 = packParts([shape('the Insert of Discovery', INSERT_4PAGE)], {
      ...TURNING,
      marginMm: 7.25,
    });
    expect(at725.sheets[0]?.placements[0]?.turned).toBe(true);

    expect(() =>
      packParts([shape('the Insert of Discovery', INSERT_4PAGE)], { ...TURNING, marginMm: 7.35 }),
    ).toThrow(/Lower the margin to 7\.25 mm or less/);
  });

  it('names a margin that really does leave room, rounding down to get there', () => {
    // 297 − 282.55 halves to 7.225, and a printable margin of 7.23 mm leaves
    // 282.54. Rounded the other way the sentence would name a margin that
    // refuses the Part all over again.
    const strip = shape('a long strip', { width: 282.55, height: 79 });

    expect(() => packParts([strip], { ...TURNING, marginMm: 10 })).toThrow(
      /Lower the margin to 7\.22 mm or less/,
    );
    expect(packParts([strip], { ...TURNING, marginMm: 7.22 }).sheets).toHaveLength(1);
    expect(() => packParts([strip], { ...TURNING, marginMm: 7.23 })).toThrow(/does not fit/);
  });

  it('counts the caption room a caller asked for when it works the margin out', () => {
    // A figure 270 mm tall with 20 mm of caption under it needs 290 of the
    // 297 mm sheet, so the margin has to come down to 3.5 — not the 13.5 the
    // figure alone would allow.
    expect(() =>
      packParts([shape('a tall figure', { width: 60, height: 270 })], {
        ...A4_CONFIG,
        marginMm: 20,
        captionRoomMm: 20,
      }),
    ).toThrow(/Lower the margin to 3\.5 mm or less/);
  });

  it('says plainly when no margin would help at all', () => {
    expect(() => packParts([shape('a poster', { width: 400, height: 400 })], TURNING)).toThrow(
      /No margin makes room for it: A4 is too small\./,
    );
  });

  it('names the printable area that is left, whichever answer it gives', () => {
    // The old message named the area alone, which reads as a fact about the
    // paper rather than about a setting the collector can move.
    expect(() =>
      packParts([shape('a poster', { width: 400, height: 400 })], { ...TURNING, marginMm: 12 }),
    ).toThrow(/printable margin of 12 mm/);
  });
});

describe('SheetPacker — a column under a rectangle', () => {
  /** A shelf 200 mm tall, then four pieces that only two of fit beside it. */
  const tower = shape('the tower', { width: 100, height: 200 });
  const bricks = (count: number, width = 96): Array<PackItem<string>> =>
    Array.from({ length: count }, (_, index) => shape(`brick ${index}`, { width, height: 60 }));

  it('leaves the room under a rectangle empty unless asked', () => {
    // One brick sits beside the tower and two share the row below its shelf —
    // a second row below that would start at 273 and end at 333 on a 292 mm
    // bed. So the fourth brick opens a Sheet of its own, and the 140 mm left
    // under the first brick goes to waste.
    const sheets = packParts([tower, ...bricks(4)], A4_CONFIG).sheets;

    expect(sheets).toHaveLength(2);
    expect(sheets[1]?.placements.map(({ item }) => item.label)).toEqual(['brick 3']);
  });

  it('stacks them under their neighbour when asked, and saves the Sheet', () => {
    const sheets = packParts([tower, ...bricks(4)], { ...A4_CONFIG, columns: true }).sheets;

    expect(sheets).toHaveLength(1);
    const stacked = allPlacements(sheets).filter(({ item }) => item.label.startsWith('brick'));
    // brick 0 sits beside the tower; 1 and 2 hang under it, one gap apart;
    // 3 is too far down for the shelf and opens the next row instead.
    expect(stacked.map(({ rect }) => [rect.x, rect.y])).toEqual([
      [109, 5],
      [109, 69],
      [109, 133],
      [5, 209],
    ]);
    expectNoOverlaps(sheets);
    expectInsideMargin(sheets, A4, 5);
  });

  it('fills the row first, so a column never takes a seat that was free', () => {
    // Both bricks fit beside the tower. The second must go beside the first
    // rather than under it, or switching columns on would move rectangles that
    // were already placed as well as they could be.
    const sheets = packParts([tower, ...bricks(2, 40)], { ...A4_CONFIG, columns: true }).sheets;

    expect(allPlacements(sheets).map(({ rect }) => [rect.x, rect.y])).toEqual([
      [5, 5],
      [109, 5],
      [153, 5],
    ]);
  });

  it('keeps caption room under every rectangle in a column, not only under the row', () => {
    // The calibration sheet prints two lines under each figure. A column that
    // ignored that would stack the next outline onto the caption above it.
    const sheets = packParts([tower, ...bricks(2)], {
      ...A4_CONFIG,
      columns: true,
      captionRoomMm: 10,
    }).sheets;

    // 5 + 60 for the brick above, then 10 of caption and the 4 mm gap.
    expect(allPlacements(sheets).at(-1)?.rect.y).toBe(79);
  });

  it('keeps caption room under the last rectangle in a column as well as the first', () => {
    // 200 mm of shelf: 90 for the brick on the row, then 10 of caption, a 4 mm
    // gap, 90 more and its own 10 of caption — 204. So no brick fits the column
    // and the second one opens a Sheet of its own. Drop that last 10 and it
    // slides in at 199, with its caption spilling out of the shelf into the
    // band the row below keeps for its own (`fitsInColumn` says why that is
    // refused rather than allowed).
    const packed = packParts(
      [tower, shape('brick 0', { width: 96, height: 90 }), shape('brick 1', { width: 96, height: 90 })],
      { ...A4_CONFIG, columns: true, captionRoomMm: 10 },
    );

    expect(packed.sheets).toHaveLength(2);
    expect(packed.sheets[1]?.placements.map(({ item }) => item.label)).toEqual(['brick 1']);
  });

  it('never lets a column reach past where the Sheet says its content ends', () => {
    // `contentBottom` is where the calibration sheet starts its footer, and it
    // is worked out from the shelves alone — so a column that outgrew its shelf
    // would print underneath it.
    const packed = packParts([tower, ...bricks(3)], { ...A4_CONFIG, columns: true, captionRoomMm: 6 });

    const shelfTops = new Set(packed.sheets.flatMap((sheet) => sheet.placements.map(({ rect }) => rect.y)));
    // The test is about stacked rectangles, so there had better be one: with
    // columns off every rectangle here sits at one of two shelf tops.
    expect(shelfTops.size).toBeGreaterThan(2);

    for (const [index, sheet] of packed.sheets.entries()) {
      for (const { item, rect } of sheet.placements) {
        expect(rect.y + rect.height, `${item.label} bottom`).toBeLessThanOrEqual(
          packed.contentBottom[index] ?? 0,
        );
      }
    }
  });

  it('takes the first column that fits, not the last', () => {
    // Two columns have room and the filler fits both. First-fit keeps it beside
    // the rectangle it would have sat next to, rather than at the far end of a
    // row it never reached.
    const packed = packParts(
      [
        shape('the opener', { width: 60, height: 200 }),
        shape('seat A', { width: 50, height: 50 }),
        shape('seat B', { width: 50, height: 50 }),
        shape('the filler', { width: 50, height: 50 }),
      ],
      { ...A4_CONFIG, columns: true, sortByHeight: false },
    );

    const filler = allPlacements(packed.sheets).find(({ item }) => item.label === 'the filler');
    expect(filler?.rect).toEqual({ x: 69, y: 59, width: 50, height: 50 });
  });

  it('carries the turn into a column, because a column takes whatever fits it', () => {
    // Unreachable from the app today — a turned rectangle is over 200 mm tall
    // on A4, so the shelf above it has to be nearly the whole bed — but
    // `packParts` is a seam and `sortByHeight` is a supported option. A turned
    // rectangle reported as standing up is drawn off the paper.
    const packed = packParts(
      [
        shape('the opener', { width: 60, height: 287 }),
        shape('the seat', { width: 90, height: 75 }),
        shape('a long strip', { width: 205, height: 85 }),
      ],
      { ...A4_CONFIG, turn: 'to-fit', columns: true, sortByHeight: false },
    );

    const strip = allPlacements(packed.sheets).find(({ item }) => item.label === 'a long strip');
    expect(strip?.turned).toBe(true);
    expect(strip?.rect).toEqual({ x: 69, y: 84, width: 85, height: 205 });
    expectNoOverlaps(packed.sheets);
    expectInsideMargin(packed.sheets, A4, 5);
  });
});

describe('SheetPacker — invariants over arbitrary rectangle sets', () => {
  /** A seeded generator, so a failure here is reproducible rather than a rumour. */
  const randomiser = (seed: number) => {
    let state = seed;
    return (): number => {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      return state / 0x7fffffff;
    };
  };

  it('never overlaps, never leaves the printable area, never drops a Part', () => {
    const random = randomiser(20250821);
    const pick = <T,>(options: readonly T[]): T =>
      options[Math.floor(random() * options.length)] as T;
    const tolerance = 1e-9;
    let turnedSeen = 0;

    for (let run = 0; run < 400; run++) {
      const paper = pick([A4, LETTER]);
      const marginMm = pick([0, 2, 5, 10, 20]);
      const gapMm = pick([0, 1, 4, 8]);
      const turn = pick(['never', 'to-fit'] as const);
      const columns = pick([false, true]);
      const area = printableArea(paper, marginMm);

      /**
       * A rectangle wider than the printable area and no taller than it is
       * wide: the four-Page Insert's shape, placeable only on its side. Mixed
       * in one time in five, and only when turning is on, so the runs that
       * cannot turn are still runs about rectangles that fit.
       */
      const overlong = (): Size => ({
        // Strictly wider than the area, or a rounded-down draw would land on
        // the width exactly and stand up after all.
        width: Math.round((area.width + 0.5 + random() * (area.height - area.width - 0.5)) * 10) / 10,
        height: Math.round((5 + random() * (area.width - 5)) * 10) / 10,
      });

      const items: Item[] = Array.from({ length: 1 + Math.floor(random() * 20) }, (_, index) => ({
        ref: { releaseId: `r${index}`, part: pick(['insert', 'label'] as const) },
        label: `r${index}`,
        size:
          turn === 'to-fit' && area.height > area.width && random() < 0.2
            ? overlong()
            : {
                width: Math.round((5 + random() * (area.width - 5)) * 10) / 10,
                height: Math.round((5 + random() * (area.height - 5)) * 10) / 10,
              },
      }));

      const sheets = pack(items, { paper, marginMm, gapMm, turn, columns });
      const context =
        `run ${run}: ${paper.name}, ${marginMm} mm margin, ${gapMm} mm gap, ` +
        `turn ${turn}, columns ${columns}`;

      expect(allPlacements(sheets), `${context}: every Part placed`).toHaveLength(items.length);

      for (const sheet of sheets) {
        for (const { item, rect, turned } of sheet.placements) {
          if (turned) turnedSeen += 1;
          expect(turned && turn === 'never', `${context}: turned without being asked`).toBe(false);
          // A turned rectangle reports the box it was actually placed in, and
          // that box is the one it was handed with its sides swapped — never a
          // third size, and never the size it was handed when it went sideways.
          const placed = turned
            ? { width: item.size.height, height: item.size.width }
            : item.size;
          expect({ width: rect.width, height: rect.height }, `${context}: Part keeps its size`).toEqual(
            placed,
          );
          expect(rect.x, `${context}: left`).toBeGreaterThanOrEqual(area.x - tolerance);
          expect(rect.y, `${context}: top`).toBeGreaterThanOrEqual(area.y - tolerance);
          expect(rect.x + rect.width, `${context}: right`).toBeLessThanOrEqual(
            area.x + area.width + tolerance,
          );
          expect(rect.y + rect.height, `${context}: bottom`).toBeLessThanOrEqual(
            area.y + area.height + tolerance,
          );
        }

        for (const [index, a] of sheet.placements.entries()) {
          for (const b of sheet.placements.slice(index + 1)) {
            expect(rectsOverlap(a.rect, b.rect), `${context}: no overlap`).toBe(false);

            // Neighbours are separated by at least the gap on one axis, so two
            // cut lines never end up on top of each other.
            const gapX = Math.max(a.rect.x - (b.rect.x + b.rect.width), b.rect.x - (a.rect.x + a.rect.width));
            const gapY = Math.max(a.rect.y - (b.rect.y + b.rect.height), b.rect.y - (a.rect.y + a.rect.height));
            expect(
              Math.max(gapX, gapY),
              `${context}: gap between Parts`,
            ).toBeGreaterThanOrEqual(gapMm - tolerance);
          }
        }
      }
    }

    // Otherwise the loop above could stop generating over-long rectangles and
    // the turn would go untested by every run of it, silently.
    expect(turnedSeen, 'placements that were actually turned').toBeGreaterThan(100);
  });
});
