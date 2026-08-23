import { describe, expect, it } from 'vitest';

import { A4, LETTER } from '../domain/paper.ts';
import { DEFAULT_PART_DIMENSIONS, insertSize } from '../domain/parts.ts';
import type { InsertDimensions } from '../domain/parts.ts';
import type { PageRole } from './layout.ts';
import { insertFolds, insertPanels, maxInsertPages, planInsert } from './insert-plan.ts';
import type { InsertContent } from './insert-plan.ts';

/**
 * How many Pages an Insert folds into, what goes on each, and where the paper
 * creases (ADR-0012). All arithmetic — no measurer, no Release, no canvas —
 * because the Page count decides how long the strip is *cut*, and that has to be
 * decidable before anything is drawn.
 */

const { insert } = DEFAULT_PART_DIMENSIONS;

/** 40 tracks fit one Page's 60 mm at 2.4 mm type in two columns; 41 do not. */
const FITS_ONE_PAGE = 40;
const OVERFLOWS_ONE_PAGE = 41;

const content = (overrides: Partial<InsertContent> = {}): InsertContent => ({
  trackCount: 12,
  hasCredits: false,
  hasBackCover: false,
  ...overrides,
});

const plan = (overrides: Partial<InsertContent> = {}, maxPages = 4, override?: number): readonly PageRole[] =>
  planInsert(content(overrides), insert, maxPages, override).pages;

describe('how many Pages an Insert folds into', () => {
  it('gives a Release with no credits and no back cover exactly two Pages', () => {
    // The ticket's own checkbox, and the common case: the Front Panel and the
    // tracklist, which is all a mixtape can ever have.
    expect(plan()).toEqual(['cover', 'tracklist']);
  });

  it('is always even, whatever the content', () => {
    for (const hasCredits of [false, true]) {
      for (const hasBackCover of [false, true]) {
        for (const trackCount of [0, 1, 12, FITS_ONE_PAGE, OVERFLOWS_ONE_PAGE, 254]) {
          const pages = plan({ hasCredits, hasBackCover, trackCount });
          expect(pages.length % 2, `${trackCount} tracks, credits ${hasCredits}, back ${hasBackCover}`).toBe(0);
        }
      }
    }
  });

  it('goes to four when there are credits to print', () => {
    expect(plan({ hasCredits: true, hasBackCover: true })).toEqual([
      'cover',
      'tracklist',
      'credits',
      'artwork',
    ]);
  });

  it('draws ADR-0012’s own picture: cover, tracklist, credits, artwork', () => {
    // The four-Page strip in the ADR's diagram, in the ADR's order.
    expect(plan({ hasCredits: true, hasBackCover: true, trackCount: 12 })).toEqual([
      'cover',
      'tracklist',
      'credits',
      'artwork',
    ]);
  });

  it('goes to four when the tracklist overflows one Page and there is a back cover', () => {
    expect(plan({ trackCount: OVERFLOWS_ONE_PAGE, hasBackCover: true })).toEqual([
      'cover',
      'tracklist',
      'tracklist',
      'artwork',
    ]);
  });

  it('keeps a mixtape at two Pages however long its tracklist is', () => {
    // No credits and no back cover: there is nothing to put on a third Page
    // (ADR-0012), so the list stays on one and shrinks, which is what it has
    // always done. Three Pages of tracklist is not a better object.
    expect(plan({ trackCount: 254 })).toEqual(['cover', 'tracklist']);
  });

  it('does not add Pages for artwork alone', () => {
    // The artwork Page is the *odd Page out* — what fills a Page the even rule
    // produced — and never a reason to produce one.
    expect(plan({ hasBackCover: true })).toEqual(['cover', 'tracklist']);
  });

  it('gives the tracklist the second Page when there is no back cover to fill it', () => {
    // Credits and no artwork: three interior Pages, and the list takes the one
    // the back cover would have had rather than leaving it blank.
    expect(plan({ hasCredits: true })).toEqual(['cover', 'tracklist', 'tracklist', 'credits']);
  });

  it('drops the back cover before the credits when both want the last Page', () => {
    // A long list needs two Pages and the credits need one, which is the whole
    // interior. The back cover is decoration and goes.
    expect(plan({ trackCount: OVERFLOWS_ONE_PAGE, hasCredits: true, hasBackCover: true })).toEqual([
      'cover',
      'tracklist',
      'tracklist',
      'credits',
    ]);
  });

  it('never folds a Page with nothing on it', () => {
    for (const hasCredits of [false, true]) {
      for (const hasBackCover of [false, true]) {
        for (const trackCount of [0, 1, 2, 3, 12, OVERFLOWS_ONE_PAGE]) {
          const pages = plan({ hasCredits, hasBackCover, trackCount });
          const lists = pages.filter((role) => role === 'tracklist').length;
          // A tracklist Page needs a track on it, except the one every Insert
          // has: an empty Release's second Page is an empty list, exactly as
          // v1's Back Card was.
          expect(lists, `${trackCount} tracks`).toBeLessThanOrEqual(Math.max(1, trackCount));
          if (!hasCredits) expect(pages).not.toContain('credits');
          if (!hasBackCover) expect(pages).not.toContain('artwork');
        }
      }
    }
  });

  it('always folds at least one tracklist Page, whatever the Release has', () => {
    // The invariant `dropped` rests on: the tracklist is never *lost*, only set
    // smaller, so it is never in the list of things a collector did not get. If a
    // Release could ever produce a strip with no tracklist Page on it, that claim
    // would be false and the warning would be silent about it.
    for (const hasCredits of [false, true]) {
      for (const hasBackCover of [false, true]) {
        for (const trackCount of [0, 1, 12, OVERFLOWS_ONE_PAGE]) {
          for (const override of [undefined, 2, 4]) {
            const pages = plan({ hasCredits, hasBackCover, trackCount }, 4, override);
            expect(
              pages.filter((role) => role === 'tracklist').length,
              `${trackCount} tracks, credits ${hasCredits}, back ${hasBackCover}, override ${override}`,
            ).toBeGreaterThanOrEqual(1);
          }
        }
      }
    }
  });

  it('counts the tracklist as fitting right up to the last line that does', () => {
    expect(plan({ trackCount: FITS_ONE_PAGE, hasBackCover: true })).toEqual(['cover', 'tracklist']);
    expect(plan({ trackCount: OVERFLOWS_ONE_PAGE, hasBackCover: true })).toHaveLength(4);
  });
});

describe('the Page count against the paper', () => {
  it('allows four Pages on A4 up to a 7.25 mm printable margin, and two above it', () => {
    // ADR-0014's slack, reached from the other side: 282.5 mm of strip against
    // 297 − 2 × 7.25 = 282.5 mm of long edge.
    expect(maxInsertPages(insert, A4, 5)).toBe(4);
    expect(maxInsertPages(insert, A4, 7.25)).toBe(4);
    expect(maxInsertPages(insert, A4, 7.5)).toBe(2);
    expect(maxInsertPages(insert, A4, 25)).toBe(2);
  });

  it('allows only two Pages on Letter, at every margin including none', () => {
    // The thing ADR-0014's arithmetic did not check: a four-Page strip is
    // 282.5 mm and Letter's long edge is 279.4, so no margin makes room for it.
    expect(insertSize(insert, 4).width).toBeGreaterThan(LETTER.height);
    expect(maxInsertPages(insert, LETTER, 0)).toBe(2);
    expect(maxInsertPages(insert, LETTER, 5)).toBe(2);
  });

  it('never reports fewer than two, because two Pages is the Insert', () => {
    const enormous: InsertDimensions = { ...insert, pageWidth: 200, frontPanelWidth: 200 };
    expect(maxInsertPages(enormous, A4, 5)).toBe(2);
  });

  it('reports what the content wanted and what was given up when the paper is short', () => {
    const capped = planInsert(content({ hasCredits: true, hasBackCover: true }), insert, 2);

    expect(capped.pages).toEqual(['cover', 'tracklist']);
    expect(capped.wantedPages).toBe(4);
    expect(capped.dropped).toEqual(['credits', 'artwork']);
  });

  it('gives up nothing, and says so, when the paper has room', () => {
    const roomy = planInsert(content({ hasCredits: true, hasBackCover: true }), insert, 4);

    expect(roomy.dropped).toEqual([]);
    expect(roomy.wantedPages).toBe(4);
  });

  it('never reports the tracklist as given up, because it is only ever squeezed', () => {
    const capped = planInsert(
      content({ trackCount: OVERFLOWS_ONE_PAGE, hasBackCover: true }),
      insert,
      2,
    );

    expect(capped.pages).toEqual(['cover', 'tracklist']);
    expect(capped.dropped).toEqual(['artwork']);
  });
});

describe('the collector’s own Page count', () => {
  it('takes two when the content asked for four', () => {
    const forced = planInsert(content({ hasCredits: true, hasBackCover: true }), insert, 4, 2);

    expect(forced.pages).toEqual(['cover', 'tracklist']);
    expect(forced.dropped).toEqual(['credits', 'artwork']);
  });

  it('takes four when the content asked for two, and fills them', () => {
    const forced = planInsert(content({ hasBackCover: true }), insert, 4, 4);

    expect(forced.pages).toEqual(['cover', 'tracklist', 'tracklist', 'artwork']);
    expect(forced.dropped).toEqual([]);
  });

  it('refuses four when nothing would go on the extra Pages', () => {
    // Two tracks, no credits, no back cover: the interior cannot be filled
    // three ways without a blank Page, so the strip stays at two.
    expect(planInsert(content({ trackCount: 2 }), insert, 4, 4).pages).toEqual([
      'cover',
      'tracklist',
    ]);
  });

  it('refuses four when the paper has no room for it', () => {
    const forced = planInsert(content({ hasCredits: true, hasBackCover: true }), insert, 2, 4);

    expect(forced.pages).toEqual(['cover', 'tracklist']);
  });

  it('rounds an odd or absurd count to something foldable', () => {
    for (const asked of [-4, 0, 1, 3, 5, 99]) {
      const pages = planInsert(content({ hasCredits: true, hasBackCover: true }), insert, 4, asked).pages;
      expect(pages.length % 2, `asked for ${asked}`).toBe(0);
      expect(pages.length, `asked for ${asked}`).toBeGreaterThanOrEqual(2);
      expect(pages.length, `asked for ${asked}`).toBeLessThanOrEqual(4);
    }
  });
});

describe('where the paper folds', () => {
  it('creases a two-Page strip three times: two case folds and one fore-edge', () => {
    expect(insertFolds(insert, 2)).toEqual([
      { kind: 'case', atMm: 14 },
      { kind: 'case', atMm: 19.5 },
      { kind: 'fore-edge', atMm: 87.5 },
    ]);
  });

  it('alternates fore-edge, spine, fore-edge along a four-Page strip', () => {
    // ADR-0012's table, in millimetres: blank meets blank at 87.5 and 217.5,
    // printed meets printed at the 152.5 spine, which is the one fold that goes
    // the other way and the hinge the booklet pages on.
    expect(insertFolds(insert, 4)).toEqual([
      { kind: 'case', atMm: 14 },
      { kind: 'case', atMm: 19.5 },
      { kind: 'fore-edge', atMm: 87.5 },
      { kind: 'spine', atMm: 152.5 },
      { kind: 'fore-edge', atMm: 217.5 },
    ]);
  });

  it('never ends the strip on a spine fold, so blank always meets blank last', () => {
    for (const pages of [2, 4]) {
      const folds = insertFolds(insert, pages);
      expect(folds.at(-1)?.kind, `${pages} Pages`).toBe('fore-edge');
    }
  });

  it('puts every fold inside the strip it creases', () => {
    for (const pages of [2, 4]) {
      const width = insertSize(insert, pages).width;
      for (const fold of insertFolds(insert, pages)) {
        expect(fold.atMm, `${pages} Pages, fold at ${fold.atMm}`).toBeGreaterThan(0);
        expect(fold.atMm, `${pages} Pages, fold at ${fold.atMm}`).toBeLessThan(width);
      }
    }
  });

  it('follows the measurements it is given rather than the defaults', () => {
    const narrow: InsertDimensions = { ...insert, innerFlapWidth: 10, spineWidth: 4, pageWidth: 50 };

    expect(insertFolds(narrow, 4).map((fold) => fold.atMm)).toEqual([10, 14, 82, 132, 182]);
  });
});

describe('the sections of the strip', () => {
  it('lays the Inner Flap, the Spine and every Page out left to right', () => {
    const panels = insertPanels(insert, ['cover', 'tracklist', 'credits', 'artwork']);

    expect(panels.map((panel) => panel.panel)).toEqual([
      'inner-flap',
      'spine',
      'page',
      'page',
      'page',
      'page',
    ]);
    expect(panels.map((panel) => panel.rect.x)).toEqual([0, 14, 19.5, 87.5, 152.5, 217.5]);
    expect(panels.map((panel) => panel.rect.width)).toEqual([14, 5.5, 68, 65, 65, 65]);
    expect(panels.every((panel) => panel.rect.height === 79)).toBe(true);
  });

  it('makes Page 1 the Front Panel, at the Front Panel’s own width', () => {
    // ADR-0012: Page 1 *is* the Front Panel — the 68 mm face the case window
    // shows — and the inner Pages come out slightly narrower, as a book's do.
    const [, , first] = insertPanels(insert, ['cover', 'tracklist']);

    expect(first).toEqual({
      panel: 'page',
      page: 1,
      role: 'cover',
      rect: { x: 19.5, y: 0, width: 68, height: 79 },
    });
  });

  it('numbers the Pages from one and carries each Page’s role', () => {
    const panels = insertPanels(insert, ['cover', 'tracklist', 'credits', 'artwork']);
    const pages = panels.flatMap((panel) => (panel.panel === 'page' ? [panel] : []));

    expect(pages.map((page) => page.page)).toEqual([1, 2, 3, 4]);
    expect(pages.map((page) => page.role)).toEqual(['cover', 'tracklist', 'credits', 'artwork']);
  });

  it('covers the whole strip with no gap and no overlap', () => {
    for (const pages of [['cover', 'tracklist'], ['cover', 'tracklist', 'credits', 'artwork']] as const) {
      const panels = insertPanels(insert, pages);
      let edge = 0;
      for (const panel of panels) {
        expect(panel.rect.x, `${pages.length} Pages`).toBe(edge);
        edge = panel.rect.x + panel.rect.width;
      }
      expect(edge, `${pages.length} Pages`).toBe(insertSize(insert, pages.length).width);
    }
  });
});
