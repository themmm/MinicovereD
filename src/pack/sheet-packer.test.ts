import { describe, expect, it } from 'vitest';

import { A4, LETTER, printableArea } from '../domain/paper.ts';
import { DEFAULT_PART_DIMENSIONS, partSize } from '../domain/parts.ts';
import type { PartKind } from '../domain/parts.ts';
import { rectsOverlap } from '../domain/units.ts';
import type { Size } from '../domain/units.ts';
import { DEFAULT_PART_GAP_MM, packParts } from './sheet-packer.ts';
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
    ref: { releaseId: `r${index}`, part: 'back-card' as PartKind },
    label: `Back Card r${index}`,
    size: { width: 98, height: 140 },
  }));

const partsOf = (releaseId: string, only?: readonly PartKind[]): Item[] =>
  (only ?? (['jcard', 'back-card', 'label'] as const)).map((part) => ({
    ref: { releaseId, part },
    label: `${part} of ${releaseId}`,
    size: partSize(part, DEFAULT_PART_DIMENSIONS),
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
      ref: { releaseId: 'r1', part: 'jcard' },
      label: 'the J-Card of Too Wide',
      size: { width: 250, height: 79 },
    };

    const result = packParts([huge, ...quarters(1)], { ...A4_CONFIG, oversize: 'omit' });

    expect(result.omitted).toEqual(['the J-Card of Too Wide']);
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
  it('puts all three Parts of one Release on one Sheet', () => {
    const sheets = pack(partsOf('r1'), A4_CONFIG);

    expect(sheets).toHaveLength(1);
    expect(sheets[0]?.placements.map(({ item }) => item.ref.part).sort()).toEqual([
      'back-card',
      'jcard',
      'label',
    ]);
  });

  it('fits three whole Releases — nine Parts — on one A4 Sheet', () => {
    const sheets = pack([...partsOf('r1'), ...partsOf('r2'), ...partsOf('r3')], A4_CONFIG);

    expect(sheets).toHaveLength(1);
    expect(allPlacements(sheets)).toHaveLength(9);
    expectNoOverlaps(sheets);
    expectInsideMargin(sheets, A4, 5);
  });

  it('wastes no paper on a batch: ten Releases print on four Sheets, not ten', () => {
    const items = Array.from({ length: 10 }, (_, index) => partsOf(`r${index}`)).flat();
    const sheets = pack(items, A4_CONFIG);

    // Pinned: this is the heuristic's current quality, so a regression to a
    // worse packing has to be a deliberate change to this number.
    expect(sheets).toHaveLength(4);
    expect(allPlacements(sheets)).toHaveLength(30);
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

  it('refuses a Part that cannot fit the printable area at all', () => {
    const huge: Item = {
      ref: { releaseId: 'r1', part: 'jcard' },
      label: 'the J-Card of Too Wide',
      size: { width: 250, height: 79 },
    };

    expect(() => pack([huge], A4_CONFIG)).toThrow(/does not fit/);
  });
});

/**
 * ADR-0012's Insert, as rectangles. There is none in the app yet — it is ticket
 * 08, and it is gated on a printed strip — and ADR-0014 asks for the turn to be
 * "tested as rectangles rather than as pixels" in any case.
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

describe('SheetPacker — the Part turns, not the Sheet (ADR-0014)', () => {
  it('is measured against the sizes the app and the ADRs actually use', () => {
    // Every sheet count below is about these two rectangles. If the default
    // Label moves, or ADR-0012's strip is re-cut, the arithmetic in these
    // comments is about a Part nobody has.
    expect(LABEL).toEqual(partSize('label', DEFAULT_PART_DIMENSIONS));
    // Inner Flap 14 + Spine 5.5 + Front Panel 68 + three Pages at 65 (ADR-0012).
    expect(INSERT_4PAGE.width).toBe(14 + 5.5 + 68 + 3 * 65);
    expect(INSERT_2PAGE.width).toBe(14 + 5.5 + 68 + 65);
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

    const laidDown = six.map((item) => ({ ...item, size: { width: 79, height: 152.5 } }));
    expect(packParts(laidDown, TURNING).sheets.map((sheet) => sheet.placements.length)).toEqual([
      2, 2, 2,
    ]);
  });

  it('does not turn anything unless it is asked to', () => {
    // The default, and what the calibration sheet gets.
    expect(() => packParts([shape('the Insert of Discovery', INSERT_4PAGE)], A4_CONFIG)).toThrow(
      /does not fit/,
    );
  });

  it('lands two Inserts and five Labels on one A4 portrait Sheet', () => {
    // ADR-0014's picture: two turned Inserts take 158 of 200 mm and the column
    // that leaves holds the Labels. It needs the column as much as the turn —
    // every rectangle on a shelf shares the shelf's top edge, so without one
    // only the first Label reaches the strip.
    const sheets = packParts(insertsAndLabels(), {
      ...TURNING,
      gapMm: 3,
      columns: true,
    }).sheets;

    expect(sheets).toHaveLength(1);
    const placed = allPlacements(sheets);
    expect(placed).toHaveLength(7);
    expect(placed.filter((placement) => placement.turned)).toHaveLength(2);

    const labels = placed.filter((placement) => placement.item.label.startsWith('Label '));
    expect(labels).toHaveLength(5);
    // One column: the same left edge, each Label under the last.
    expect(new Set(labels.map((placement) => placement.rect.x)).size).toBe(1);
    expect(labels.map((placement) => placement.rect.y)).toEqual([5, 60.5, 116, 171.5, 227]);

    expectNoOverlaps(sheets);
    expectInsideMargin(sheets, A4, 5);
  });

  it('misses that by a millimetre at the gap the app actually packs with', () => {
    // ADR-0014's table works the arithmetic with no gap at all. Two 79 mm
    // Inserts and a 35 mm Label need 193 mm plus two gaps against 200 mm of
    // printable width, so the picture holds up to a 3.5 mm gap and no further —
    // and `DEFAULT_PART_GAP_MM` is 4. The Labels are pushed to a second Sheet
    // by one millimetre.
    const withColumns = { ...TURNING, columns: true };

    expect(packParts(insertsAndLabels(), { ...withColumns, gapMm: 3.5 }).sheets).toHaveLength(1);
    expect(
      packParts(insertsAndLabels(), { ...withColumns, gapMm: DEFAULT_PART_GAP_MM }).sheets,
    ).toHaveLength(2);
    expect(DEFAULT_PART_GAP_MM).toBeGreaterThan(3.5);
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
        'to 7.25 mm to make room for it.',
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
    ).toThrow(/Lower the margin to 7\.25 mm/);
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
    // Two rows of 60 mm fit under the tower's 200 mm shelf, so the fourth brick
    // is pushed onto a second Sheet.
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

  it('never lets a column reach past where the Sheet says its content ends', () => {
    // `contentBottom` is where the calibration sheet starts its footer.
    const packed = packParts([tower, ...bricks(3)], { ...A4_CONFIG, columns: true });

    for (const [index, sheet] of packed.sheets.entries()) {
      for (const { item, rect } of sheet.placements) {
        expect(rect.y + rect.height, `${item.label} bottom`).toBeLessThanOrEqual(
          packed.contentBottom[index] ?? 0,
        );
      }
    }
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
        width: Math.round((area.width + random() * (area.height - area.width)) * 10) / 10,
        height: Math.round((5 + random() * (area.width - 5)) * 10) / 10,
      });

      const items: Item[] = Array.from({ length: 1 + Math.floor(random() * 20) }, (_, index) => ({
        ref: { releaseId: `r${index}`, part: pick(['jcard', 'back-card', 'label'] as const) },
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
    expect(turnedSeen, 'runs that actually turned something').toBeGreaterThan(100);
  });
});
