import { describe, expect, it } from 'vitest';

import { A4, LETTER, printableArea } from '../domain/paper.ts';
import { DEFAULT_PART_DIMENSIONS, partSize } from '../domain/parts.ts';
import type { PartKind } from '../domain/parts.ts';
import { rectsOverlap } from '../domain/units.ts';
import type { Rect, Size } from '../domain/units.ts';
import { packParts } from './sheet-packer.ts';
import type { PackConfig, PackItem, PackedSheet } from './sheet-packer.ts';

/**
 * Fixed rectangle sets with hand-worked answers. A4's printable area at a 5 mm
 * margin is 200 × 287 mm; with a 4 mm gap between Parts, a 98 mm-wide piece
 * fits twice across (98 + 4 + 98 = 200) and a 140 mm-tall one twice down
 * (140 + 4 + 140 = 284) — four to a Sheet, and the fifth starts a new one.
 */
const A4_CONFIG: PackConfig = { paper: A4, marginMm: 5, gapMm: 4 };

const quarters = (count: number): PackItem[] =>
  Array.from({ length: count }, (_, index) => ({
    releaseId: `r${index}`,
    part: 'back-card' as PartKind,
    size: { width: 98, height: 140 },
  }));

const partsOf = (releaseId: string, only?: readonly PartKind[]): PackItem[] =>
  (only ?? (['jcard', 'back-card', 'label'] as const)).map((part) => ({
    releaseId,
    part,
    size: partSize(part, DEFAULT_PART_DIMENSIONS),
  }));

const allPlacements = (sheets: readonly PackedSheet[]): Array<{ item: PackItem; rect: Rect }> =>
  sheets.flatMap((sheet) => sheet.placements);

const expectInsideMargin = (sheets: readonly PackedSheet[], paper: Size, marginMm: number): void => {
  for (const sheet of sheets) {
    for (const { item, rect } of sheet.placements) {
      const what = `${item.releaseId}/${item.part}`;
      expect(rect.x, `${what} left`).toBeGreaterThanOrEqual(marginMm);
      expect(rect.y, `${what} top`).toBeGreaterThanOrEqual(marginMm);
      expect(rect.x + rect.width, `${what} right`).toBeLessThanOrEqual(paper.width - marginMm);
      expect(rect.y + rect.height, `${what} bottom`).toBeLessThanOrEqual(paper.height - marginMm);
    }
  }
};

const expectNoOverlaps = (sheets: readonly PackedSheet[]): void => {
  for (const sheet of sheets) {
    for (const [index, a] of sheet.placements.entries()) {
      for (const b of sheet.placements.slice(index + 1)) {
        expect(
          rectsOverlap(a.rect, b.rect),
          `${a.item.releaseId}/${a.item.part} overlaps ${b.item.releaseId}/${b.item.part}`,
        ).toBe(false);
      }
    }
  }
};

describe('SheetPacker — sheet count', () => {
  it('packs nothing onto no Sheets', () => {
    expect(packParts([], A4_CONFIG)).toEqual([]);
  });

  it('fits four quarter-page rectangles on one A4 Sheet', () => {
    expect(packParts(quarters(4), A4_CONFIG)).toHaveLength(1);
  });

  it('opens a second Sheet for the fifth', () => {
    expect(packParts(quarters(5), A4_CONFIG)).toHaveLength(2);
  });

  it('keeps filling Sheets four at a time', () => {
    expect(packParts(quarters(8), A4_CONFIG)).toHaveLength(2);
    expect(packParts(quarters(9), A4_CONFIG)).toHaveLength(3);
  });

  it('places every item exactly once, whatever the Sheet count', () => {
    const items = quarters(9);
    const placed = allPlacements(packParts(items, A4_CONFIG));

    expect(placed).toHaveLength(items.length);
    expect(new Set(placed.map(({ item }) => item.releaseId)).size).toBe(items.length);
  });
});

describe('SheetPacker — a single Release', () => {
  it('puts all three Parts of one Release on one Sheet', () => {
    const sheets = packParts(partsOf('r1'), A4_CONFIG);

    expect(sheets).toHaveLength(1);
    expect(sheets[0]?.placements.map(({ item }) => item.part).sort()).toEqual([
      'back-card',
      'jcard',
      'label',
    ]);
  });

  it('fits three whole Releases — nine Parts — on one A4 Sheet', () => {
    const sheets = packParts([...partsOf('r1'), ...partsOf('r2'), ...partsOf('r3')], A4_CONFIG);

    expect(sheets).toHaveLength(1);
    expect(allPlacements(sheets)).toHaveLength(9);
    expectNoOverlaps(sheets);
    expectInsideMargin(sheets, A4, 5);
  });

  it('wastes no paper on a batch: ten Releases print on four Sheets, not ten', () => {
    const items = Array.from({ length: 10 }, (_, index) => partsOf(`r${index}`)).flat();
    const sheets = packParts(items, A4_CONFIG);

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
    const sheets = packParts(labels, A4_CONFIG);

    expect(allPlacements(sheets).every(({ item }) => item.part === 'label')).toBe(true);
    expect(allPlacements(sheets)).toHaveLength(12);
    // 35 × 52.5 mm Labels are small: a dozen is nowhere near a full A4 Sheet.
    expect(sheets).toHaveLength(1);
  });
});

describe('SheetPacker — paper and margin', () => {
  it('uses the extra width Letter has over A4', () => {
    // Two 100 mm columns need 204 mm: more than A4's 200 mm printable width,
    // less than Letter's 205.9 mm. Same four squares, half the Sheets.
    const squares: PackItem[] = Array.from({ length: 4 }, (_, index) => ({
      releaseId: `r${index}`,
      part: 'label' as PartKind,
      size: { width: 100, height: 100 },
    }));

    expect(packParts(squares, A4_CONFIG)).toHaveLength(2);

    const onLetter = packParts(squares, { paper: LETTER, marginMm: 5, gapMm: 4 });
    expect(onLetter).toHaveLength(1);
    expectInsideMargin(onLetter, LETTER, 5);
    expectNoOverlaps(onLetter);
  });

  it('honours a larger printable margin by fitting less on a Sheet', () => {
    const roomy: PackConfig = { paper: A4, marginMm: 20, gapMm: 4 };

    // 170 × 257 printable: a 98 mm-wide piece fits once across and a 140 mm-tall
    // one once down, so each of the four needs its own Sheet.
    expect(packParts(quarters(4), roomy)).toHaveLength(4);
    expectInsideMargin(packParts(quarters(4), roomy), A4, 20);
    expectNoOverlaps(packParts(quarters(4), roomy));
  });

  it('refuses a Part that cannot fit the printable area at all', () => {
    const huge: PackItem = { releaseId: 'r1', part: 'jcard', size: { width: 250, height: 79 } };

    expect(() => packParts([huge], A4_CONFIG)).toThrow(/does not fit/);
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

      const items: PackItem[] = Array.from({ length: 1 + Math.floor(random() * 20) }, (_, index) => ({
        releaseId: `r${index}`,
        part: pick(['jcard', 'back-card', 'label'] as const),
        size: {
          width: Math.round((5 + random() * (area.width - 5)) * 10) / 10,
          height: Math.round((5 + random() * (area.height - 5)) * 10) / 10,
        },
      }));

      const sheets = packParts(items, { paper, marginMm, gapMm });
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
