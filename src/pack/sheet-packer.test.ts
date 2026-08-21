import { describe, expect, it } from 'vitest';

import { A4, LETTER, printableArea } from '../domain/paper.ts';
import { DEFAULT_PART_DIMENSIONS, partSize } from '../domain/parts.ts';
import type { PartKind } from '../domain/parts.ts';
import { rectsOverlap } from '../domain/units.ts';
import type { Rect, Size } from '../domain/units.ts';
import { packParts } from './sheet-packer.ts';
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

const allPlacements = (
  sheets: ReadonlyArray<PackedSheet<PartRef>>,
): Array<{ item: Item; rect: Rect }> => sheets.flatMap((sheet) => sheet.placements);

const expectInsideMargin = (
  sheets: ReadonlyArray<PackedSheet<PartRef>>,
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

const expectNoOverlaps = (sheets: ReadonlyArray<PackedSheet<PartRef>>): void => {
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

    for (let run = 0; run < 400; run++) {
      const paper = pick([A4, LETTER]);
      const marginMm = pick([0, 2, 5, 10, 20]);
      const gapMm = pick([0, 1, 4, 8]);
      const area = printableArea(paper, marginMm);

      const items: Item[] = Array.from({ length: 1 + Math.floor(random() * 20) }, (_, index) => ({
        ref: { releaseId: `r${index}`, part: pick(['jcard', 'back-card', 'label'] as const) },
        label: `r${index}`,
        size: {
          width: Math.round((5 + random() * (area.width - 5)) * 10) / 10,
          height: Math.round((5 + random() * (area.height - 5)) * 10) / 10,
        },
      }));

      const sheets = pack(items, { paper, marginMm, gapMm });
      const context = `run ${run}: ${paper.name}, ${marginMm} mm margin, ${gapMm} mm gap`;

      expect(allPlacements(sheets), `${context}: every Part placed`).toHaveLength(items.length);

      for (const sheet of sheets) {
        for (const { item, rect } of sheet.placements) {
          expect({ width: rect.width, height: rect.height }, `${context}: Part keeps its size`).toEqual(
            item.size,
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
  });
});
