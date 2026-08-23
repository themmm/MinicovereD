import { describe, expect, it } from 'vitest';

import { A4, LETTER } from '../domain/paper.ts';
import { LIST_TOP_MM } from './tracklist-layout.ts';
import { rectsOverlap } from '../domain/units.ts';
import { DEFAULT_PART_DIMENSIONS, labelShape, PART_KINDS } from '../domain/parts.ts';
import type { PartDimensions, PartKind } from '../domain/parts.ts';
import type { Release } from '../domain/release.ts';
import type { Point, Rect } from '../domain/units.ts';
import {
  DEFAULT_TEMPLATE_PARAMS,
  renderSheets,
  TEMPLATE_TOGGLES,
  TEMPLATES,
} from './sheet-renderer.ts';
import type {
  DrawOp,
  PageRole,
  PartPlacement,
  PrintFace,
  ReleaseDesign,
  TextOp,
  SheetConfig,
  SheetLayout,
  SheetWarning,
  TemplateId,
  TemplateParams,
  TextMeasurer,
} from './sheet-renderer.ts';


/**
 * A deterministic stand-in for the browser's text metrics: half an em per Latin
 * character, a full em per CJK one. Nothing here depends on a real font, so the
 * geometry assertions below are about layout, not about Noto Sans.
 */
const testMeasurer: TextMeasurer = {
  widthMm: (text, style) =>
    [...text].reduce((width, char) => width + (/[⺀-鿿＀-￯]/.test(char) ? 1 : 0.5), 0) *
    style.sizeMm,
};

const aRelease = (overrides: Partial<Release> = {}): Release => ({
  id: 'r1',
  artist: 'Glen Campbell',
  album: 'Wichita Lineman',
  year: '1968',
  tracks: [
    { position: 1, title: 'Wichita Lineman' },
    { position: 2, title: 'Dreams of the Everyday Housewife' },
    { position: 3, title: 'Fate of Man' },
  ],
  ...overrides,
});

const aDesign = (
  release: Release = aRelease(),
  overrides: { templateId?: TemplateId; params?: Partial<TemplateParams> } = {},
): ReleaseDesign => ({
  release,
  templateId: overrides.templateId ?? 'classic',
  params: { ...DEFAULT_TEMPLATE_PARAMS, ...overrides.params },
});

/**
 * The seam at this project's default Part sizes, measured face-blind.
 *
 * Named apart from `renderSheets` rather than shadowing it, so that a call site
 * saying `renderSheets` is always the seam with everything spelled out —
 * measurement is injected, and that is the property the seam exists to have.
 * The two tests that need a different measurer say so at the call.
 *
 * The measurements are app-level from v2 and arrive beside the designs rather
 * than inside one, so a test that is not about them says nothing about them.
 * Five call sites are about them — two nudged Labels and three 1 mm Inserts out
 * of a project file — and pass their own.
 */
const renderSheetsAt = (
  designs: readonly ReleaseDesign[],
  config: SheetConfig,
  dimensions: PartDimensions = DEFAULT_PART_DIMENSIONS,
): readonly SheetLayout[] => renderSheets(designs, config, dimensions, testMeasurer);

const A4_SHEET: SheetConfig = { paper: A4, marginMm: 5, parts: PART_KINDS };

/**
 * Every Template there is, read off the registry rather than listed here.
 *
 * The invariants below hold for all of them — a Template sets type only in its
 * own faces, grounds its tracklist Page in a colour, keeps its heading clear of its
 * list — and a third Template should have to satisfy them on the day it is
 * added rather than on the day somebody remembers to extend this array. Where a
 * test really is about Classic against Full-bleed it names both, which is then
 * the signal that it wants revisiting.
 */
const TEMPLATE_IDS = Object.keys(TEMPLATES) as TemplateId[];

/**
 * The one warning of a given kind on a Sheet, narrowed to its own shape.
 *
 * `SheetWarning` is a union, so a test that wants `trackCount` or `shown` has
 * to say which member it is holding — and asserting that exactly one was
 * reported is the other half of what these tests are checking anyway.
 */
function onlyWarning<K extends SheetWarning['kind']>(
  sheet: SheetLayout | undefined,
  kind: K,
): Extract<SheetWarning, { kind: K }> {
  const found = (sheet?.warnings ?? []).filter((warning) => warning.kind === kind);
  expect(found, `warnings of kind ${kind}`).toHaveLength(1);
  return found[0] as Extract<SheetWarning, { kind: K }>;
}

const boundsOf = (sheet: SheetLayout, part: PartKind): Rect => {
  const placement = sheet.placements.find((candidate) => candidate.part === part);
  if (!placement) throw new Error(`no placement for ${part}`);
  return placement.bounds;
};

/**
 * The Insert of the first Sheet, which is where every fold and every Page is.
 *
 * Named apart from `boundsOf` because almost every test below wants the sections
 * rather than the box: the Insert is one Part carrying what v1 spread over two,
 * so "the Back Card" is now "the tracklist Page of the Insert".
 */
const insertOf = (sheet: SheetLayout | undefined): PartPlacement => {
  const placement = sheet?.placements.find((candidate) => candidate.part === 'insert');
  if (!placement) throw new Error('no Insert on this Sheet');
  return placement;
};

/** The Inner Flap or the Spine, in Part-local millimetres. */
const sectionOf = (placement: PartPlacement, panel: 'inner-flap' | 'spine'): Rect => {
  const found = (placement.panels ?? []).find((candidate) => candidate.panel === panel);
  if (!found) throw new Error(`the Insert has no ${panel}`);
  return found.rect;
};

/** Every Page of the Insert, in reading order along the strip. */
const pagesOf = (placement: PartPlacement): Array<{ page: number; role: PageRole; rect: Rect }> =>
  (placement.panels ?? []).flatMap((panel) =>
    panel.panel === 'page' ? [{ page: panel.page, role: panel.role, rect: panel.rect }] : [],
  );

/** The first Page carrying `role`. The cover is Page 1 and is the Front Panel. */
const pageOf = (placement: PartPlacement, role: PageRole): Rect => {
  const found = pagesOf(placement).find((page) => page.role === role);
  if (!found) throw new Error(`the Insert has no ${role} Page`);
  return found.rect;
};

/**
 * Where a drawing op is anchored, which is what says which section it belongs to.
 *
 * Every op on the strip is now inside one of its sections, and the sections are
 * side by side along one axis — so the x of an op's anchor is what tells the
 * Front Panel's type from the tracklist Page's. A `fill-rect` is anchored at its
 * own top-left, which for a full-Page ground is the Page's left edge.
 */
const anchorOf = (op: DrawOp): Point => {
  switch (op.op) {
    case 'text':
      return op.at;
    case 'line':
      return op.from;
    case 'fill-polygon':
      // A polygon's first point, which for a Part outline is its top-left corner.
      return op.points[0] ?? { x: 0, y: 0 };
    default:
      return { x: op.rect.x, y: op.rect.y };
  }
};

/** Every op anchored inside `box`, which is how one section's drawing is picked out. */
const opsIn = (placement: PartPlacement, box: Rect): DrawOp[] =>
  placement.ops.filter((op) => {
    const { x, y } = anchorOf(op);
    return x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height;
  });

/** Just the type, anchored inside `box`. */
const textsIn = (placement: PartPlacement, box: Rect): TextOp[] =>
  opsIn(placement, box).flatMap((op) => (op.op === 'text' ? [op] : []));

/** Cover art, so a Release can have a back cover to print (ADR-0012's odd Page out). */
const ARTWORK = { dataUrl: 'data:image/png;base64,AAAA', widthPx: 600, heightPx: 600 } as const;

/**
 * A Release with credits, which is what takes an Insert to four Pages.
 *
 * With artwork too, and that matters: the fourth Page is the *odd Page out* and
 * carries the artwork, so a Release with credits and no artwork spends that Page
 * on a second tracklist Page instead. Both arrangements are asserted below; this
 * is the one ADR-0012's diagram draws.
 */
const withCredits = (release: Release = aRelease()): Release => ({
  ...creditsWithoutArtwork(release),
  artwork: ARTWORK,
});

/**
 * The same credits with no cover art, which is the arrangement where the odd Page
 * goes to the tracklist instead of to a back cover.
 */
const creditsWithoutArtwork = (release: Release = aRelease()): Release => ({
  ...release,
  credits: {
    people: [
      { role: 'Producer', name: 'Al De Lory' },
      { role: 'Written-By', name: 'Jimmy Webb' },
      { role: '', name: 'The Wrecking Crew' },
    ],
    label: 'Capitol',
    catalogNumber: 'ST-103',
    country: 'US',
    year: '1968',
    genres: ['Pop'],
    styles: ['Country'],
  },
});

/** The ticket's tolerance: Part bounding boxes within ±0.2 mm of the defaults. */
const expectMm = (actual: number, expected: number, what: string): void => {
  expect(Math.abs(actual - expected), `${what}: expected ${expected} mm, got ${actual} mm`).toBeLessThanOrEqual(0.2);
};

describe('SheetRenderer — Part geometry', () => {
  it('renders the two Parts of one Release at their physical defaults', () => {
    const [sheet] = renderSheetsAt([aDesign()], A4_SHEET);
    if (!sheet) throw new Error('no sheet rendered');

    // A two-Page Insert flat: Inner Flap 14 + Spine 5.5 + Front Panel 68 + one
    // 65 mm Page, height 79 (ADR-0012). Three tracks and no credits, so two
    // Pages is what the content asks for.
    const insert = boundsOf(sheet, 'insert');
    expectMm(insert.width, 152.5, 'Insert width');
    expectMm(insert.height, 79, 'Insert height');

    const label = boundsOf(sheet, 'label');
    expectMm(label.width, 35, 'Label width');
    expectMm(label.height, 52.5, 'Label height');
  });

  it('grows the strip to 282.5 mm once the Release has four Pages of content', () => {
    const [sheet] = renderSheetsAt([aDesign(withCredits())], A4_SHEET);
    if (!sheet) throw new Error('no sheet rendered');

    const insert = boundsOf(sheet, 'insert');
    // Turned, because 282.5 does not fit 200 mm of printable width (ADR-0014) —
    // so the *box* is swapped and the strip's own length is the box's height.
    expect(insertOf(sheet).turned).toBe(true);
    expectMm(insert.width, 79, 'turned Insert box width');
    expectMm(insert.height, 282.5, 'turned Insert box height');
  });

  it('puts both Parts of a single Release on one A4 Sheet', () => {
    const sheets = renderSheetsAt([aDesign()], A4_SHEET);

    expect(sheets).toHaveLength(1);
    expect(sheets[0]?.paper.name).toBe('A4');
    expect(sheets[0]?.placements.map((placement) => placement.part).sort()).toEqual([
      'insert',
      'label',
    ]);
  });

  it('keeps every Part inside the printable margin and clear of the others', () => {
    const [sheet] = renderSheetsAt([aDesign()], A4_SHEET);
    if (!sheet) throw new Error('no sheet rendered');
    const { placements } = sheet;

    for (const { part, bounds } of placements) {
      expect(bounds.x, `${part} left`).toBeGreaterThanOrEqual(5);
      expect(bounds.y, `${part} top`).toBeGreaterThanOrEqual(5);
      expect(bounds.x + bounds.width, `${part} right`).toBeLessThanOrEqual(A4.width - 5);
      expect(bounds.y + bounds.height, `${part} bottom`).toBeLessThanOrEqual(A4.height - 5);
    }

    for (const [index, a] of placements.entries()) {
      for (const b of placements.slice(index + 1)) {
        expect(rectsOverlap(a.bounds, b.bounds), `${a.part} overlaps ${b.part}`).toBe(false);
      }
    }
  });
});

describe('SheetRenderer — the Insert’s sections and its folds (ADR-0012)', () => {
  it('lays the strip out as Inner Flap 14, Spine 5.5, Front Panel 68, then Pages at 65', () => {
    const insert = insertOf(renderSheetsAt([aDesign(withCredits())], A4_SHEET)[0]);

    expectMm(sectionOf(insert, 'inner-flap').x, 0, 'Inner Flap x');
    expectMm(sectionOf(insert, 'inner-flap').width, 14, 'Inner Flap width');
    expectMm(sectionOf(insert, 'spine').x, 14, 'Spine x');
    expectMm(sectionOf(insert, 'spine').width, 5.5, 'Spine width');

    const pages = pagesOf(insert);
    expect(pages.map((page) => page.page)).toEqual([1, 2, 3, 4]);
    expect(pages.map((page) => page.rect.x)).toEqual([19.5, 87.5, 152.5, 217.5]);
    // Page 1 *is* the Front Panel, at the Front Panel's own 68 mm; the inner
    // Pages come out slightly narrower, as a book cover does.
    expect(pages.map((page) => page.rect.width)).toEqual([68, 65, 65, 65]);
    for (const page of pages) expectMm(page.rect.height, 79, `Page ${page.page} height`);
  });

  it('makes Page 1 the cover, then the tracklist, the credits and the artwork', () => {
    // ADR-0012's own diagram, in the ADR's order.
    const insert = insertOf(renderSheetsAt([aDesign(withCredits())], A4_SHEET)[0]);

    expect(pagesOf(insert).map((page) => page.role)).toEqual([
      'cover',
      'tracklist',
      'credits',
      'artwork',
    ]);
  });

  it('marks a cutting guide around every Part', () => {
    const [sheet] = renderSheetsAt([aDesign()], A4_SHEET);

    for (const placement of sheet?.placements ?? []) {
      const cuts = placement.guides.filter((guide) => guide.kind === 'cut');
      expect(cuts, `${placement.part} cutting guide`).toHaveLength(1);
      expect(cuts[0]?.closed).toBe(true);

      // The cut guide traces the Part: its extent is the Part's bounding box.
      const xs = (cuts[0]?.points ?? []).map((point) => point.x);
      const ys = (cuts[0]?.points ?? []).map((point) => point.y);
      expectMm(Math.min(...xs), 0, `${placement.part} cut left`);
      expectMm(Math.min(...ys), 0, `${placement.part} cut top`);
      expectMm(Math.max(...xs), placement.bounds.width, `${placement.part} cut right`);
      expectMm(Math.max(...ys), placement.bounds.height, `${placement.part} cut bottom`);
    }
  });

  it('marks fold guides on the Insert only, and none on the Label', () => {
    const [sheet] = renderSheetsAt([aDesign()], A4_SHEET);
    const foldsByPart = new Map(
      (sheet?.placements ?? []).map((placement) => [
        placement.part,
        placement.guides.filter((guide) => guide.kind === 'fold'),
      ]),
    );

    expect(foldsByPart.get('label')).toEqual([]);
    expect((foldsByPart.get('insert') ?? []).length).toBeGreaterThan(0);
  });

  it('creases a two-Page strip at 14, 19.5 and 87.5, and says which fold is which', () => {
    const insert = insertOf(renderSheetsAt([aDesign()], A4_SHEET)[0]);
    const folds = insert.guides.flatMap((guide) => (guide.kind === 'fold' ? [guide] : []));

    expect(folds.map((fold) => [fold.points[0]?.x, fold.fold])).toEqual([
      [14, 'case'],
      [19.5, 'case'],
      [87.5, 'fore-edge'],
    ]);
    for (const fold of folds) {
      expect(fold.closed).toBe(false);
      expectMm(fold.points[0]?.y ?? -1, 0, 'fold start');
      expectMm(fold.points[1]?.y ?? -1, 79, 'fold end');
    }
  });

  it('alternates fore-edge, spine, fore-edge along a four-Page strip', () => {
    // The whole of ADR-0012's fold table, which single-sided printing fixes: the
    // paper doubles back blank against blank at a fore-edge, and printed against
    // printed at the one spine the booklet pages on. The count being even is what
    // makes the last fold a fore-edge, so nothing blank is ever visible.
    const insert = insertOf(renderSheetsAt([aDesign(withCredits())], A4_SHEET)[0]);
    const folds = insert.guides.flatMap((guide) => (guide.kind === 'fold' ? [guide] : []));

    expect(folds.map((fold) => [fold.points[0]?.x, fold.fold])).toEqual([
      [14, 'case'],
      [19.5, 'case'],
      [87.5, 'fore-edge'],
      [152.5, 'spine'],
      [217.5, 'fore-edge'],
    ]);
    expect(folds.at(-1)?.fold).toBe('fore-edge');
    // Exactly one hinge, whatever the Page count.
    expect(folds.filter((fold) => fold.fold === 'spine')).toHaveLength(1);
  });

  it('puts a fold on every boundary between Pages, and nowhere else', () => {
    for (const release of [aRelease(), withCredits()]) {
      const insert = insertOf(renderSheetsAt([aDesign(release)], A4_SHEET)[0]);
      const pages = pagesOf(insert);
      const between = pages.slice(0, -1).map((page) => page.rect.x + page.rect.width);
      const pageFolds = insert.guides.flatMap((guide) =>
        guide.kind === 'fold' && guide.fold !== 'case' ? [guide.points[0]?.x] : [],
      );

      expect(pageFolds, `${pages.length} Pages`).toEqual(between);
    }
  });

  it('keeps every mark inside the printable area, guides included', () => {
    const [sheet] = renderSheetsAt([aDesign()], A4_SHEET);

    for (const placement of sheet?.placements ?? []) {
      const points = placement.guides.flatMap((guide) => guide.points);
      for (const point of points) {
        expect(placement.bounds.x + point.x, `${placement.part} guide left`).toBeGreaterThanOrEqual(5);
        expect(placement.bounds.y + point.y, `${placement.part} guide top`).toBeGreaterThanOrEqual(5);
        expect(placement.bounds.x + point.x, `${placement.part} guide right`).toBeLessThanOrEqual(A4.width - 5);
        expect(placement.bounds.y + point.y, `${placement.part} guide bottom`).toBeLessThanOrEqual(A4.height - 5);
      }
    }
  });

  it('cuts the diagonal corner notch into the Label outline', () => {
    const [sheet] = renderSheetsAt([aDesign()], A4_SHEET);
    const label = sheet?.placements.find((placement) => placement.part === 'label');
    const cut = label?.guides.find((guide) => guide.kind === 'cut');

    // Rectangle plus one cut corner: five points, and no point at the notched corner itself.
    expect(cut?.points).toHaveLength(5);
    expect(cut?.points.some((point) => point.x === 35 && point.y === 0)).toBe(false);
  });
});

describe('SheetRenderer — Release content', () => {
  it('prints every track of the Release on the tracklist Page', () => {
    const release = aRelease();
    const insert = insertOf(renderSheetsAt([aDesign(release)], A4_SHEET)[0]);
    const printed = textsIn(insert, pageOf(insert, 'tracklist')).map((op) => op.text);

    for (const track of release.tracks) {
      expect(printed.some((line) => line.startsWith(`${track.position}. `))).toBe(true);
    }
  });

  it('carries artist and album onto the Front Panel and the Spine', () => {
    const insert = insertOf(renderSheetsAt([aDesign()], A4_SHEET)[0]);

    const onFrontPanel = textsIn(insert, pageOf(insert, 'cover')).map((op) => op.text);
    expect(onFrontPanel).toContain('Glen Campbell');
    expect(onFrontPanel).toContain('Wichita Lineman');

    // The Spine reads along the case edge, so its line is rotated.
    const onSpine = textsIn(insert, sectionOf(insert, 'spine'));
    expect(onSpine).toHaveLength(1);
    expect(onSpine[0]?.text).toBe('Glen Campbell — Wichita Lineman');
    expect(onSpine[0]?.style.rotationDeg).toBe(-90);
  });

  it('prints the credits on their own Page, and the release facts above them', () => {
    // ADR-0013 on paper: the facts line ADR-0013's own example opens with, then
    // everyone the pressing credits, one to a line. The role is carried exactly
    // as the source wrote it, and a name with no role is set on its own.
    const insert = insertOf(renderSheetsAt([aDesign(withCredits())], A4_SHEET)[0]);
    const printed = textsIn(insert, pageOf(insert, 'credits')).map((op) => op.text);

    expect(printed.join(' ')).toContain('Capitol');
    expect(printed.join(' ')).toContain('ST-103');
    expect(printed).toContain('Producer — Al De Lory');
    expect(printed).toContain('Written-By — Jimmy Webb');
    expect(printed).toContain('The Wrecking Crew');
  });

  it('reprints the artwork on the back cover, and sets nothing over it', () => {
    // The odd Page out (ADR-0012). Nothing on top of it: the artwork is already
    // named on the cover and on the Spine, and a third caption would be the strip
    // saying the same words three times.
    const insert = insertOf(renderSheetsAt([aDesign(withCredits())], A4_SHEET)[0]);
    const back = pageOf(insert, 'artwork');
    const ops = opsIn(insert, back);

    expect(ops.filter((op) => op.op === 'image' && op.role === 'artwork')).toHaveLength(1);
    expect(textsIn(insert, back)).toEqual([]);
    // Edge to edge: a back cover is the whole Page.
    const image = ops.find((op) => op.op === 'image');
    expect(image?.op === 'image' ? image.rect : undefined).toEqual(back);
  });

  it('places the uploaded artwork on Front Panel and Label', () => {
    const [sheet] = renderSheetsAt([aDesign(aRelease({ artwork: ARTWORK }))], A4_SHEET);

    for (const part of ['insert', 'label'] as const) {
      const placement = sheet?.placements.find((candidate) => candidate.part === part);
      const images = (placement?.ops ?? []).filter((op) => op.op === 'image' && op.role === 'artwork');
      expect(images.length, `${part} artwork`).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('SheetRenderer — how many Pages, and what is on them (ADR-0012)', () => {
  const pageRoles = (release: Release, config: SheetConfig = A4_SHEET, pageCount?: number) =>
    pagesOf(
      insertOf(
        renderSheetsAt(
          [{ ...aDesign(release), ...(pageCount === undefined ? {} : { pageCount }) }],
          config,
        )[0],
      ),
    ).map((page) => page.role);

  it('gives a Release with no credits and no artwork exactly two Pages', () => {
    expect(pageRoles(aRelease())).toEqual(['cover', 'tracklist']);
  });

  it('goes to four once there are credits to print', () => {
    expect(pageRoles(withCredits())).toEqual(['cover', 'tracklist', 'credits', 'artwork']);
  });

  it('spends the odd Page on a second tracklist Page when there is no artwork', () => {
    // No back cover to fill it, so the list takes the Page rather than a blank
    // one being folded — and the credits still print, which is the point.
    expect(pageRoles(creditsWithoutArtwork())).toEqual([
      'cover',
      'tracklist',
      'tracklist',
      'credits',
    ]);
  });

  it('keeps a mixtape at two Pages however long its tracklist runs', () => {
    // No credits and no cover: there is nothing to put on a third Page, so the
    // list stays on one and shrinks — which is reported rather than hidden.
    const long = aRelease({
      tracks: Array.from({ length: 120 }, (_, index) => ({ position: index + 1, title: `Track ${index + 1}` })),
    });
    expect(pageRoles(long)).toEqual(['cover', 'tracklist']);
  });

  it('splits a long list across the tracklist Pages it gets, and loses no track', () => {
    const tracks = Array.from({ length: 60 }, (_, index) => ({
      position: index + 1,
      title: `Track ${index + 1}`,
    }));
    const insert = insertOf(
      renderSheetsAt([aDesign(creditsWithoutArtwork(aRelease({ tracks })))], A4_SHEET)[0],
    );
    const listPages = pagesOf(insert).filter((page) => page.role === 'tracklist');

    expect(listPages).toHaveLength(2);
    const printed = listPages.flatMap((page) => textsIn(insert, page.rect).map((op) => op.text));
    for (const track of tracks) {
      expect(printed.some((line) => line.startsWith(`${track.position}. `)), `track ${track.position}`).toBe(true);
    }
    // Dealt out evenly rather than filled Page by Page, so neither Page is empty.
    for (const page of listPages) {
      const lines = textsIn(insert, page.rect).filter((op) => /^\d+\. /.test(op.text));
      expect(lines.length, `Page ${page.page}`).toBeGreaterThan(0);
    }
  });

  it('lets the collector ask for two Pages when the content wanted four', () => {
    expect(pageRoles(withCredits(), A4_SHEET, 2)).toEqual(['cover', 'tracklist']);
  });

  it('lets the collector ask for four when the content wanted two, and fills them', () => {
    expect(pageRoles(aRelease({ artwork: ARTWORK }), A4_SHEET, 4)).toEqual([
      'cover',
      'tracklist',
      'tracklist',
      'artwork',
    ]);
  });

  it('refuses four Pages when nothing would go on them', () => {
    // Two tracks, no credits, no artwork: the interior cannot be filled three
    // ways without a blank Page, and no Page on the strip may be blank.
    const bare = aRelease({ tracks: [{ position: 1, title: 'One' }, { position: 2, title: 'Two' }] });
    expect(pageRoles(bare, A4_SHEET, 4)).toEqual(['cover', 'tracklist']);
  });

  it('never folds an odd number of Pages, whatever the content or the override', () => {
    for (const release of [aRelease(), withCredits(), aRelease({ artwork: ARTWORK })]) {
      for (const pageCount of [undefined, 2, 4]) {
        const roles = pageRoles(release, A4_SHEET, pageCount);
        expect(roles.length % 2, `override ${pageCount}`).toBe(0);
      }
    }
  });

  it('caps the strip at two Pages on Letter, at every margin, and says what was lost', () => {
    // 282.5 mm of strip against Letter's 279.4 mm long edge. No margin makes room
    // for it, so a Letter job never folds four — which nothing in ADR-0014
    // noticed, because its arithmetic only checked A4's 287.
    for (const marginMm of [0, 5]) {
      const config: SheetConfig = { paper: LETTER, marginMm, parts: PART_KINDS };
      expect(pageRoles(withCredits(), config), `${marginMm} mm margin`).toEqual([
        'cover',
        'tracklist',
      ]);
    }

    const short = onlyWarning(
      renderSheetsAt([aDesign(withCredits())], { paper: LETTER, marginMm: 5, parts: PART_KINDS })[0],
      'insert-pages-short',
    );
    expect(short).toMatchObject({
      wantedPages: 4,
      pages: 2,
      maxPages: 2,
      paperName: 'Letter',
      dropped: ['credits', 'artwork'],
    });
  });

  it('caps the strip on A4 above a 7.25 mm printable margin, and not at it', () => {
    // ADR-0014's 4.5 mm of slack, reached from the other side: 297 − 2 × 7.25 is
    // exactly 282.5. The margin control steps in half-millimetres, so 7.5 is the
    // first step that loses the fourth Page.
    const at = { paper: A4, marginMm: 7.25, parts: PART_KINDS } satisfies SheetConfig;
    const above = { paper: A4, marginMm: 7.5, parts: PART_KINDS } satisfies SheetConfig;

    expect(pageRoles(withCredits(), at)).toHaveLength(4);
    expect(pageRoles(withCredits(), above)).toHaveLength(2);
  });

  it('says nothing when every Page the content wanted was folded', () => {
    const [sheet] = renderSheetsAt([aDesign(withCredits())], A4_SHEET);
    expect((sheet?.warnings ?? []).filter((warning) => warning.kind === 'insert-pages-short')).toEqual([]);
  });

  it('never reports the tracklist as lost, because it is only ever squeezed', () => {
    // A list that loses a Page is a list set smaller, which `TypeBelowPrintFloor`
    // reports. What a collector actually loses is a credits Page or a back cover.
    const long = aRelease({
      artwork: ARTWORK,
      tracks: Array.from({ length: 60 }, (_, index) => ({ position: index + 1, title: `Track ${index + 1}` })),
    });
    const short = onlyWarning(
      renderSheetsAt([aDesign(long)], { paper: LETTER, marginMm: 5, parts: PART_KINDS })[0],
      'insert-pages-short',
    );

    expect(short.dropped).toEqual(['artwork']);
  });

  it('reports the shortfall once per Release rather than once per Sheet', () => {
    const five = Array.from({ length: 5 }, (_, index) =>
      aDesign(withCredits(aRelease({ id: `r${index}`, album: `Album ${index}` }))),
    );
    const sheets = renderSheetsAt(five, { paper: LETTER, marginMm: 5, parts: PART_KINDS });

    expect(sheets.length).toBeGreaterThan(1);
    const shortfalls = sheets
      .flatMap((sheet) => sheet.warnings ?? [])
      .filter((warning) => warning.kind === 'insert-pages-short');
    expect(shortfalls).toHaveLength(5);
    expect(new Set(shortfalls.map((warning) => warning.releaseId)).size).toBe(5);
  });

  it('reports it even when the job does not print the Insert at all', () => {
    // The Pages are still Pages the collector will not have, and switching the
    // Insert off is not a decision about that.
    const [sheet] = renderSheetsAt([aDesign(withCredits())], {
      paper: LETTER,
      marginMm: 5,
      parts: ['label'],
    });

    expect(onlyWarning(sheet, 'insert-pages-short').dropped).toEqual(['credits', 'artwork']);
  });

  it('gives every Template a Page count decided by the content, not by taste', () => {
    // Choosing Full-bleed must not lengthen the paper (ticket 06's fit/taste
    // line). The one thing a Template does decide is whether it *has* a back
    // cover, which Minimal has not — and that is a fact about the drawing rather
    // than about the collector's preferences.
    for (const templateId of ['classic', 'fullbleed'] as const) {
      const roles = pagesOf(
        insertOf(renderSheetsAt([aDesign(withCredits(), { templateId })], A4_SHEET)[0]),
      ).map((page) => page.role);
      expect(roles, templateId).toEqual(['cover', 'tracklist', 'credits', 'artwork']);
    }

    // Minimal draws no artwork, so its odd Page goes to the list instead.
    const minimal = pagesOf(
      insertOf(renderSheetsAt([aDesign(withCredits(), { templateId: 'minimal' })], A4_SHEET)[0]),
    ).map((page) => page.role);
    expect(minimal).toEqual(['cover', 'tracklist', 'tracklist', 'credits']);
  });

  it('never hands a Template a back-cover Page it draws nothing on', () => {
    // The one way a blank Page could still be folded. A Template declares whether
    // it has a back cover; one that said yes and drew nothing would put a sheet of
    // white paper in the case.
    for (const templateId of TEMPLATE_IDS) {
      const insert = insertOf(
        renderSheetsAt([aDesign(withCredits(), { templateId })], A4_SHEET)[0],
      );
      for (const page of pagesOf(insert).filter((candidate) => candidate.role === 'artwork')) {
        expect(opsIn(insert, page.rect).length, `${templateId} back cover`).toBeGreaterThan(0);
      }
    }
  });
});

describe('SheetRenderer — a Part packed on its side (ADR-0014)', () => {
  it('leaves the Parts of an ordinary Release standing up', () => {
    // Two Pages is 152.5 mm, which fits 200 mm of printable width as it stands.
    const [sheet] = renderSheetsAt([aDesign()], A4_SHEET);

    expect(sheet?.placements.map((placement) => placement.turned)).toEqual([false, false]);
  });

  it('turns a four-Page Insert, which is the Part ADR-0014 was written for', () => {
    const [sheet] = renderSheetsAt([aDesign(withCredits())], A4_SHEET);
    if (!sheet) throw new Error('no sheet rendered');

    const insert = insertOf(sheet);
    // 282.5 across, against 200 mm of printable width; on its side it is
    // 79 × 282.5 and clears the 287 mm bed with 4.5 mm to spare.
    expect(insert.turned).toBe(true);
    expect(insert.bounds.width).toBe(79);
    expect(insert.bounds.height).toBe(282.5);

    // And the Label, which fits, stays as it is on the same Sheet.
    expect(sheet.placements.find((placement) => placement.part === 'label')?.turned).toBe(false);
  });

  it('keeps the drawing, the cut outline and the folds in the Part’s own upright millimetres', () => {
    const insert = insertOf(renderSheetsAt([aDesign(withCredits())], A4_SHEET)[0]);

    // The turn belongs to the Sheet. A Template is never asked which way up its
    // Part was packed, so everything here reads 282.5 across and 79 down — the
    // opposite way round from the bounds above.
    const cut = insert.guides.find((guide) => guide.kind === 'cut');
    expect(Math.max(...(cut?.points ?? []).map((point) => point.x))).toBe(282.5);
    expect(Math.max(...(cut?.points ?? []).map((point) => point.y))).toBe(79);

    expect(pageOf(insert, 'cover')).toEqual({ x: 19.5, y: 0, width: 68, height: 79 });

    const folds = insert.guides.filter((guide) => guide.kind === 'fold');
    expect(folds.map((fold) => fold.points[0]?.x)).toEqual([14, 19.5, 87.5, 152.5, 217.5]);
    expect(folds.every((fold) => fold.points[1]?.y === 79)).toBe(true);
  });

  it('lands two four-Page Inserts and five Labels on one A4 Sheet', () => {
    // ADR-0014's picture, drawn by the renderer rather than by the packer's own
    // rectangles: two turned Inserts side by side and the Labels in the column
    // that leaves. It needs both halves of ADR-0014 — the turn, and the column
    // under a placed rectangle — and it needs `DEFAULT_PART_GAP_MM` to be 3.5,
    // which is what ticket 08 spent to make the ADR's claim true.
    const two = Array.from({ length: 2 }, (_, index) =>
      aDesign(withCredits(aRelease({ id: `r${index}`, album: `Album ${index}` }))),
    );
    const sheets = renderSheetsAt(two, A4_SHEET);

    expect(sheets).toHaveLength(1);
    const inserts = (sheets[0]?.placements ?? []).filter((placement) => placement.part === 'insert');
    expect(inserts.map((placement) => placement.turned)).toEqual([true, true]);
    expect(inserts.map((placement) => placement.bounds.x)).toEqual([5, 87.5]);
  });

  it('fills the room under a Part once the Label is small enough to sit there', () => {
    // The other half of ADR-0014. On the Insert's 79 mm row a 35 mm Label leaves
    // room for another up to 40 mm tall once the 3.5 mm gap is taken off, so five
    // Releases at a 10 mm printable margin get five Labels onto a Sheet that has
    // room for only three rows.
    const nudged: PartDimensions = {
      ...DEFAULT_PART_DIMENSIONS,
      label: { ...DEFAULT_PART_DIMENSIONS.label, width: 30, height: 35 },
    };
    const five = Array.from({ length: 5 }, (_, index) =>
      aDesign(aRelease({ id: `r${index}`, album: `Album ${index}` })),
    );

    const sheets = renderSheetsAt(five, { paper: A4, marginMm: 10, parts: PART_KINDS }, nudged);
    const first = sheets[0]?.placements ?? [];
    const labels = first.filter((placement) => placement.part === 'label');
    const rows = new Set(
      first.filter((placement) => placement.part === 'insert').map((placement) => placement.bounds.y),
    );

    // More Labels than rows, which shelf packing alone cannot produce: every
    // rectangle on a shelf shares that shelf's top edge, so without a column the
    // fourth and fifth Labels would have gone to a Sheet of their own.
    expect(rows.size).toBe(3);
    expect(labels).toHaveLength(5);

    // Sharing a left edge, one under the other: a column, not a row.
    const columns = new Map<number, number>();
    for (const label of labels) columns.set(label.bounds.x, (columns.get(label.bounds.x) ?? 0) + 1);
    expect(columns.size, 'one column, not five').toBe(1);
    expect(Math.max(...columns.values())).toBe(5);
  });

  it('still refuses a Part that no turn can save, and says what to do about it', () => {
    // 500 mm of Front Panel is longer than A4 either way round. Only a
    // hand-edited project file reaches this: `readInsert` clamps each measurement
    // to 1–300 mm and nothing narrows an Insert to the paper.
    const enormous: PartDimensions = {
      ...DEFAULT_PART_DIMENSIONS,
      insert: { ...DEFAULT_PART_DIMENSIONS.insert, frontPanelWidth: 500 },
    };

    expect(() => renderSheetsAt([aDesign()], A4_SHEET, enormous)).toThrow(
      /the Insert of Wichita Lineman .* does not fit A4 with a printable margin of 5 mm, turned or not/,
    );
    // And the advice is the honest one: no margin rescues a 584.5 mm strip.
    expect(() => renderSheetsAt([aDesign()], A4_SHEET, enormous)).toThrow(
      /No margin makes room for it: A4 is too small\./,
    );
  });

  it('never refuses an Insert at any margin the control can reach', () => {
    // The case ADR-0014 said would actually happen, and now cannot: raising the
    // margin past 7.25 mm drops the strip to two Pages instead of making it
    // unplaceable, and a two-Page strip is 152.5 × 79. So a collector who raises
    // the margin loses a credits Page — reported — rather than the whole preview.
    for (const marginMm of [0, 5, 7.5, 12, 25]) {
      expect(
        () => renderSheetsAt([aDesign(withCredits())], { paper: A4, marginMm, parts: PART_KINDS }),
        `${marginMm} mm margin`,
      ).not.toThrow();
    }
  });
});

describe('SheetRenderer — Sheet configuration', () => {
  it('prints only the Parts the job asked for', () => {
    const sheets = renderSheetsAt([aDesign()], { ...A4_SHEET, parts: ['label'] });

    expect(sheets).toHaveLength(1);
    expect(sheets[0]?.placements.map((placement) => placement.part)).toEqual(['label']);
  });

  it('lays the Sheet out on Letter when asked', () => {
    const [sheet] = renderSheetsAt([aDesign()], { ...A4_SHEET, paper: LETTER });

    expect(sheet?.paper.id).toBe('letter');
    // Letter is shorter than A4, so the same Parts have to sit higher up.
    const lowest = Math.max(...(sheet?.placements ?? []).map((p) => p.bounds.y + p.bounds.height));
    expect(lowest).toBeLessThanOrEqual(LETTER.height - 5);
  });

  it('keeps Parts out of a widened printable margin', () => {
    const [sheet] = renderSheetsAt([aDesign()], { ...A4_SHEET, marginMm: 15 });

    for (const { part, bounds } of sheet?.placements ?? []) {
      expect(bounds.x, `${part} left`).toBeGreaterThanOrEqual(15);
      expect(bounds.y, `${part} top`).toBeGreaterThanOrEqual(15);
      expect(bounds.x + bounds.width, `${part} right`).toBeLessThanOrEqual(A4.width - 15);
      expect(bounds.y + bounds.height, `${part} bottom`).toBeLessThanOrEqual(A4.height - 15);
    }
  });

  it('draws each Release with its own content when several share a Sheet', () => {
    const first = aRelease({ id: 'a', artist: 'Glen Campbell', album: 'Wichita Lineman' });
    const second = aRelease({ id: 'b', artist: 'Cornelius', album: 'Fantasma' });

    const sheets = renderSheetsAt([aDesign(first), aDesign(second)], A4_SHEET);
    const placements = sheets.flatMap((sheet) => sheet.placements);

    expect(placements).toHaveLength(4);
    for (const releaseId of ['a', 'b']) {
      const own = placements.filter((placement) => placement.releaseId === releaseId);
      expect(own).toHaveLength(2);
      const printed = own.flatMap((placement) =>
        placement.ops.flatMap((op) => (op.op === 'text' ? [op.text] : [])),
      );
      const expected = releaseId === 'a' ? 'Wichita Lineman' : 'Fantasma';
      expect(printed.some((line) => line.includes(expected))).toBe(true);
    }
  });

  it('spreads a batch across Sheets rather than dropping Parts', () => {
    const designs = Array.from({ length: 8 }, (_, index) =>
      aDesign(aRelease({ id: `r${index}` })),
    );

    const sheets = renderSheetsAt(designs, A4_SHEET);
    const placements = sheets.flatMap((sheet) => sheet.placements);

    expect(placements).toHaveLength(16);
    expect(sheets.length).toBeGreaterThan(1);
  });
});

describe('SheetRenderer — Template parameters', () => {
  const opsFor = (design: ReleaseDesign, part: PartKind) => {
    const [sheet] = renderSheetsAt([design], A4_SHEET);
    return sheet?.placements.find((placement) => placement.part === part)?.ops ?? [];
  };

  // Kept for the Label, which is the one Part whose whole drawing is its Part.
  const textsOn = (design: ReleaseDesign, part: PartKind): string[] =>
    opsFor(design, part).flatMap((op) => (op.op === 'text' ? [op.text] : []));

  const logosOn = (design: ReleaseDesign, part: PartKind) =>
    opsFor(design, part).filter((op) => op.op === 'image' && op.role === 'logo');

  it('lets each Release choose its own Template', () => {
    const artwork = { dataUrl: 'data:image/png;base64,AAAA', widthPx: 600, heightPx: 600 };
    const classic = aDesign(aRelease({ id: 'a', artwork }), { templateId: 'classic' });
    const fullbleed = aDesign(aRelease({ id: 'b', artwork }), { templateId: 'fullbleed' });

    const artworkRect = (design: ReleaseDesign): Rect => {
      const op = opsFor(design, 'insert').find((candidate) => candidate.op === 'image' && candidate.role === 'artwork');
      if (op?.op !== 'image') throw new Error('no artwork drawn');
      return op.rect;
    };

    // Both bleed across the Front Panel's width; only Full-bleed takes the
    // bottom edge as well, because Classic spends it on the caption band.
    // Same Release, same Sheet.
    const banded = artworkRect(classic);
    const bleed = artworkRect(fullbleed);

    expectMm(banded.width, 68, 'Classic artwork width');
    expectMm(banded.height, 65, 'Classic artwork height');
    expectMm(bleed.width, 68, 'Full-bleed artwork width');
    expectMm(bleed.height, 79, 'Full-bleed artwork height');
  });

  it('paints with the colours the Release was given', () => {
    const green = aDesign(aRelease(), {
      params: { paperColor: '#eaffea', inkColor: '#003300', accentColor: '#007700' },
    });

    // Across both Parts rather than one Page alone: no single Page carries all
    // three colours any more, each grounding itself in one of them.
    const colours = new Set(
      PART_KINDS.flatMap((part) =>
        opsFor(green, part).flatMap((op) =>
          op.op === 'fill-rect' || op.op === 'fill-polygon'
            ? [op.color]
            : op.op === 'text'
              ? [op.style.color]
              : [],
        ),
      ),
    );

    expect(colours).toContain('#eaffea');
    expect(colours).toContain('#003300');
    expect(colours).toContain('#007700');
  });

  it('leaves the artwork clean when overlay text is switched off', () => {
    const withText = aDesign(aRelease(), { templateId: 'fullbleed' });
    const withoutText = aDesign(aRelease(), {
      templateId: 'fullbleed',
      params: { showOverlayText: false },
    });

    const insertOfDesign = (design: ReleaseDesign): PartPlacement =>
      insertOf(renderSheetsAt([design], A4_SHEET)[0]);
    const cleanInsert = insertOfDesign(withoutText);

    expect(textsIn(insertOfDesign(withText), pageOf(insertOfDesign(withText), 'cover')).map((op) => op.text)).toContain(
      'Glen Campbell',
    );
    expect(textsIn(cleanInsert, pageOf(cleanInsert, 'cover'))).toEqual([]);
    // The Spine still carries artist and album: it is not "over the cover".
    expect(textsIn(cleanInsert, sectionOf(cleanInsert, 'spine')).map((op) => op.text)).toContain(
      'Glen Campbell — Wichita Lineman',
    );
    // And the tracklist Page is untouched, or the list would vanish with it:
    // album, artist and one line per track.
    expect(textsIn(cleanInsert, pageOf(cleanInsert, 'tracklist'))).toHaveLength(
      2 + aRelease().tracks.length,
    );
  });

  it('puts the MiniDisc logo on Front Panel and Spine when it is enabled', () => {
    const design = aDesign(aRelease(), { params: { showLogo: true } });
    const insert = insertOf(renderSheetsAt([design], A4_SHEET)[0]);
    const logos = insert.ops.filter((op) => op.op === 'image' && op.role === 'logo');

    expect(logos).toHaveLength(2);
    const spine = sectionOf(insert, 'spine');
    const front = pageOf(insert, 'cover');
    const within = (rect: Rect, x: number): boolean => x >= rect.x && x <= rect.x + rect.width;

    expect(logos.some((op) => op.op === 'image' && within(spine, op.rect.x))).toBe(true);
    expect(logos.some((op) => op.op === 'image' && within(front, op.rect.x))).toBe(true);
  });

  it('leaves the logo off entirely when it is disabled', () => {
    const design = aDesign(aRelease(), { params: { showLogo: false } });

    expect(logosOn(design, 'insert')).toEqual([]);
    expect(textsOn(design, 'label')).not.toContain('');
  });

  it('keeps the logo inside the Part it sits on', () => {
    const design = aDesign(aRelease(), { params: { showLogo: true } });
    const insert = insertOf(renderSheetsAt([design], A4_SHEET)[0]);
    const { width, height } = insert.bounds;
    const logos = insert.ops.filter((op) => op.op === 'image' && op.role === 'logo');

    expect(logos, 'there are logos to check').toHaveLength(2);
    for (const op of logos) {
      if (op.op !== 'image') continue;
      expect(op.rect.x, 'logo left').toBeGreaterThanOrEqual(0);
      expect(op.rect.y, 'logo top').toBeGreaterThanOrEqual(0);
      expect(op.rect.x + op.rect.width, 'logo right').toBeLessThanOrEqual(width);
      expect(op.rect.y + op.rect.height, 'logo bottom').toBeLessThanOrEqual(height);
    }
  });

  it('never runs the Front Panel type through the logo, however long the name', () => {
    // The failure this guards: a wide artist, ellipsised to the full panel
    // width and centred, crossing a logo anchored in the bottom-right corner.
    const wordy = aRelease({
      artist: 'Godspeed You! Black Emperor',
      album: 'Lift Your Skinny Fists Like Antennas to Heaven',
    });
    const design = aDesign(wordy, { params: { showLogo: true, showOverlayText: true } });
    const insert = insertOf(renderSheetsAt([design], A4_SHEET)[0]);
    const ops = insert.ops;

    const logo = ops.find((op) => op.op === 'image' && op.role === 'logo' && !op.rotationDeg);
    if (logo?.op !== 'image') throw new Error('no upright logo on the Front Panel');

    const frontPanel = pageOf(insert, 'cover');

    for (const op of ops) {
      if (op.op !== 'text' || op.style.rotationDeg) continue;
      if (op.at.x < frontPanel.x) continue;

      const width = testMeasurer.widthMm(op.text, op.style);
      const left = op.style.align === 'center' ? op.at.x - width / 2 : op.at.x;
      const right = left + width;
      const overlapsHorizontally = right > logo.rect.x && left < logo.rect.x + logo.rect.width;
      const overlapsVertically =
        op.at.y + op.style.sizeMm > logo.rect.y && op.at.y < logo.rect.y + logo.rect.height;

      expect(
        overlapsHorizontally && overlapsVertically,
        `"${op.text}" runs into the logo`,
      ).toBe(false);
    }
  });

  it('turns the Spine logo with the Spine type, so both read the same way', () => {
    const insert = insertOf(renderSheetsAt([aDesign()], A4_SHEET)[0]);
    const spine = sectionOf(insert, 'spine');

    const spineLogo = opsIn(insert, spine).find((op) => op.op === 'image' && op.role === 'logo');
    const [spineText] = textsIn(insert, spine);

    expect(spineLogo?.op === 'image' && spineLogo.rotationDeg).toBe(-90);
    expect(spineText?.style.rotationDeg).toBe(-90);
  });

  it('keeps Spine type readable however dark the accent colour is', () => {
    const dark = aDesign(aRelease(), {
      params: { accentColor: '#101418', paperColor: '#0b0b0b', inkColor: '#0b0b0b' },
    });
    const insert = insertOf(renderSheetsAt([dark], A4_SHEET)[0]);
    const [spineText] = textsIn(insert, sectionOf(insert, 'spine'));

    // Dark paper on a dark accent would print the Spine as a solid block.
    expect(spineText?.style.color).toBe('#ffffff');
  });

  it('reads the Spine bottom-to-top, the way a shelved case is read', () => {
    const insert = insertOf(renderSheetsAt([aDesign()], A4_SHEET)[0]);
    const [spineText] = textsIn(insert, sectionOf(insert, 'spine'));

    expect(spineText?.style.rotationDeg).toBe(-90);
    expect(spineText?.text).toBe('Glen Campbell — Wichita Lineman');
  });
});

describe('SheetRenderer — Label dimensions', () => {
  const labelPlacement = (label: {
    width: number;
    height: number;
    notch: boolean;
    notchSize: number;
  }) => {
    const [sheet] = renderSheetsAt([aDesign()], A4_SHEET, { ...DEFAULT_PART_DIMENSIONS, label });
    const placement = sheet?.placements.find((candidate) => candidate.part === 'label');
    if (!placement) throw new Error('no Label placed');
    return placement;
  };

  it('cuts the Label to whatever size the Release is set to', () => {
    const classic = labelPlacement({ width: 35, height: 52.5, notch: true, notchSize: 6 });
    const full = labelPlacement({ width: 38, height: 54, notch: false, notchSize: 6 });

    expectMm(classic.bounds.width, 35, 'Classic width');
    expectMm(classic.bounds.height, 52.5, 'Classic height');
    expectMm(full.bounds.width, 38, 'Full width');
    expectMm(full.bounds.height, 54, 'Full height');
  });

  it('follows a size nudged in tenths of a millimetre', () => {
    const nudged = labelPlacement({ width: 36.4, height: 53.1, notch: true, notchSize: 6 });

    expectMm(nudged.bounds.width, 36.4, 'nudged width');
    expectMm(nudged.bounds.height, 53.1, 'nudged height');
  });

  it('puts the diagonal corner into the cutting guide, or squares it off', () => {
    const notched = labelPlacement({ width: 35, height: 52.5, notch: true, notchSize: 6 });
    const square = labelPlacement({ width: 35, height: 52.5, notch: false, notchSize: 6 });

    const cutOf = (placement: { guides: readonly { kind: string; points: readonly { x: number; y: number }[] }[] }) =>
      placement.guides.find((guide) => guide.kind === 'cut')?.points ?? [];

    expect(cutOf(notched)).toHaveLength(5);
    expect(cutOf(notched).some((point) => point.x === 35 && point.y === 0)).toBe(false);
    expect(cutOf(square)).toHaveLength(4);
    expect(cutOf(square)).toContainEqual({ x: 35, y: 0 });
  });
});

describe('SheetRenderer — tracklist overflow', () => {
  /**
   * Every line of type on the tracklist Page of a Release with `trackCount`
   * tracks.
   *
   * No credits and no artwork, so the strip stays at two Pages and the list has
   * exactly one Page to fit — which is the case this whole block is about. A
   * Release that could reach four Pages is a different question, and the block
   * above answers it.
   */
  const listPageText = (trackCount: number): Array<{ text: string; x: number; y: number; sizeMm: number }> => {
    const release = aRelease({
      tracks: Array.from({ length: trackCount }, (_, index) => ({
        position: index + 1,
        title: `Track ${index + 1}`,
      })),
    });
    const insert = insertOf(renderSheetsAt([aDesign(release)], A4_SHEET)[0]);
    return textsIn(insert, pageOf(insert, 'tracklist')).map((op) => ({
      text: op.text,
      x: op.at.x,
      y: op.at.y,
      sizeMm: op.style.sizeMm,
    }));
  };

  const trackLines = (trackCount: number) =>
    listPageText(trackCount).filter((line) => /^\d+\./.test(line.text));

  it('prints all 25 tracks of a 25-track Release, in two columns', () => {
    const lines = trackLines(25);

    expect(lines).toHaveLength(25);
    expect(new Set(lines.map((line) => line.x)).size).toBe(2);
    for (let position = 1; position <= 25; position++) {
      expect(lines.some((line) => line.text.startsWith(`${position}.`)), `track ${position}`).toBe(true);
    }
  });

  it('keeps one column while one column will do', () => {
    expect(new Set(trackLines(12).map((line) => line.x)).size).toBe(1);
  });

  it('shrinks the type rather than losing a track', () => {
    const modest = trackLines(25);
    const enormous = trackLines(70);

    expect(enormous).toHaveLength(70);
    expect(enormous[0]?.sizeMm).toBeLessThan(modest[0]?.sizeMm ?? 0);
  });

  it('keeps every track inside the Page it is on', () => {
    const insert = insertOf(
      renderSheetsAt(
        [
          aDesign(
            aRelease({
              tracks: Array.from({ length: 70 }, (_, index) => ({
                position: index + 1,
                title: `Track ${index + 1}`,
              })),
            }),
          ),
        ],
        A4_SHEET,
      )[0],
    );
    const page = pageOf(insert, 'tracklist');

    for (const op of textsIn(insert, page)) {
      expect(op.at.y + op.style.sizeMm, op.text).toBeLessThanOrEqual(page.y + page.height);
      // Inside the Page's own left edge, not merely inside the strip: a list that
      // spilled left would run over the Front Panel rather than off the paper.
      expect(op.at.x, op.text).toBeGreaterThanOrEqual(page.x);
    }
  });

  it('passes Unicode titles through to the Part unchanged', () => {
    const release = aRelease({
      artist: 'コーネリアス',
      album: 'ファンタズマ',
      tracks: [
        { position: 1, title: '夢の中で' },
        { position: 2, title: 'Grüße aus Köln' },
        { position: 3, title: 'Ærø · Łódź' },
      ],
    });
    const [sheet] = renderSheetsAt([aDesign(release)], A4_SHEET);
    const printed = (sheet?.placements ?? [])
      .flatMap((placement) => placement.ops)
      .flatMap((op) => (op.op === 'text' ? [op.text] : []));

    // A trim by code unit, not code point, is what puts a lone surrogate on
    // paper; a replacement character never appears in the string itself.
    expect(printed.some((line) => /[\uD800-\uDFFF]/.test(line))).toBe(false);
    expect(printed).toContain('1. 夢の中で');
    expect(printed).toContain('2. Grüße aus Köln');
    expect(printed.some((line) => line.includes('ファンタズマ'))).toBe(true);
  });
});

describe('SheetRenderer — warnings about what was drawn', () => {
  const sheetFor = (trackCount: number) =>
    renderSheetsAt(
      [
        aDesign(
          aRelease({
            album: 'Everything At Once',
            tracks: Array.from({ length: trackCount }, (_, index) => ({
              position: index + 1,
              title: `Track ${index + 1}`,
            })),
          }),
        ),
      ],
      A4_SHEET,
    )[0];

  it('says nothing when the tracklist fits at a printable size', () => {
    expect(sheetFor(25)?.warnings).toBeUndefined();
  });

  it('reports type that had to shrink past what a printer holds', () => {
    const warning = onlyWarning(sheetFor(200), 'type-below-print-floor');

    expect(warning.releaseTitle).toBe('Everything At Once');
    expect(warning.trackCount).toBe(200);
    expect(warning.sizeMm).toBeLessThan(warning.floorMm);
  });

  it('warns once per Release, from the one Page that carries the list', () => {
    // Two Parts are drawn, and the Insert has a Front Panel and a tracklist Page
    // on it; only one of the two has a list.
    const sheet = sheetFor(200);

    expect(sheet?.placements).toHaveLength(2);
    expect(sheet?.warnings).toHaveLength(1);
  });

  it('warns once for a list split over two Pages, not once per Page', () => {
    // A list spread over two Pages measures itself twice, and two warnings for
    // one Release would read as two problems. What is reported is the Release's
    // whole track count and the smallest size any Page settled on.
    const insert = renderSheetsAt(
      [
        aDesign(
          creditsWithoutArtwork(
            aRelease({
              album: 'Everything At Once',
              tracks: Array.from({ length: 400 }, (_, index) => ({
                position: index + 1,
                title: `Track ${index + 1}`,
              })),
            }),
          ),
        ),
      ],
      A4_SHEET,
    )[0];
    const warning = onlyWarning(insert, 'type-below-print-floor');

    expect(pagesOf(insertOf(insert)).filter((page) => page.role === 'tracklist')).toHaveLength(2);
    expect(warning.trackCount).toBe(400);
  });

  it('reports nothing when the job does not print the Insert at all', () => {
    const sheets = renderSheetsAt(
      [
        aDesign(
          aRelease({
            tracks: Array.from({ length: 200 }, (_, index) => ({
              position: index + 1,
              title: `Track ${index + 1}`,
            })),
          }),
        ),
      ],
      { ...A4_SHEET, parts: ['label'] },
    );

    expect(sheets[0]?.warnings).toBeUndefined();
  });
});

describe('SheetRenderer — the Spine, which cuts rather than wraps', () => {
  /*
   * The Spine is one line by design, so a line that does not fit loses its end
   * — the only warning here that reports missing content. The type does not
   * shrink to buy room (SPINE_SIZE_MM in templates/shared.ts says why), so
   * these check both halves of that decision: the report, and the size holding.
   *
   * `testMeasurer` gives every Latin character half an em, so at 2.9 mm each is
   * 1.45 mm. The Spine has `79 - 2 * 3 - (4.2 + 3)` = 65.8 mm with the logo on
   * and 73 mm with it off, which is 45 and 50 characters.
   */
  const TOO_LONG = 'Lift Your Skinny Fists Like Antennas to Heaven';
  const spineOf = (sheet: SheetLayout | undefined): string => {
    const insert = insertOf(sheet);
    // The Spine's line is the one rotated text op inside the Spine section.
    const found = textsIn(insert, sectionOf(insert, 'spine')).find(
      (op) => op.style.rotationDeg === -90,
    );
    if (!found) throw new Error('no Spine text');
    return found.text;
  };
  const sheetFor = (
    release: Partial<Release>,
    overrides: { templateId?: TemplateId; params?: Partial<TemplateParams> } = {},
  ): SheetLayout | undefined =>
    renderSheetsAt([aDesign(aRelease(release), overrides)], A4_SHEET)[0];

  it('says nothing when the whole line fits on the edge', () => {
    // 'Glen Campbell — Wichita Lineman' is 31 characters, so 44.95 of 65.8 mm.
    expect(sheetFor({})?.warnings).toBeUndefined();
  });

  it('reports the line it could not fit, and the one it drew instead', () => {
    const sheet = sheetFor({ album: TOO_LONG });
    const warning = onlyWarning(sheet, 'spine-truncated');

    expect(warning.line).toBe(`Glen Campbell — ${TOO_LONG}`);
    expect(warning.shown).not.toBe(warning.line);
    expect(warning.shown.endsWith('…')).toBe(true);
    expect(warning.releaseTitle).toBe(TOO_LONG);
  });

  it('describes the string that is actually on the Part', () => {
    // The point of returning the warning with the drawing: the two cannot
    // disagree, because the reported string is the drawn one.
    const sheet = sheetFor({ album: TOO_LONG });

    expect(onlyWarning(sheet, 'spine-truncated').shown).toBe(spineOf(sheet));
  });

  it('holds the type at 2.9 mm rather than shrinking toward Sony’s 2.469', () => {
    // The decision itself. Shrinking to the 7 pt floor buys 17 % more
    // characters and costs the shelf legibility 2.9 mm was chosen for, so the
    // renderer reports instead of giving way — however far over the line is.
    const barely = onlyWarning(
      sheetFor({ album: 'Wichita Lineman and Other Songs' }),
      'spine-truncated',
    );
    const hopeless = onlyWarning(sheetFor({ album: TOO_LONG.repeat(3) }), 'spine-truncated');

    expect(barely.sizeMm).toBe(2.9);
    expect(hopeless.sizeMm).toBe(2.9);
  });

  it('gives the line the logo’s room back when the logo is switched off', () => {
    // 48 characters: 69.6 mm, over the 65.8 the logo leaves and under the 73
    // it does not. Geometry, not a threshold — which is why it is asserted.
    const album = 'Wichita Lineman, and Other Songs';
    expect(`Glen Campbell — ${album}`).toHaveLength(48);

    expect(onlyWarning(sheetFor({ album }), 'spine-truncated').kind).toBe('spine-truncated');
    expect(sheetFor({ album }, { params: { showLogo: false } })?.warnings).toBeUndefined();
  });

  it('reports it from Full-bleed too, which draws the same Spine', () => {
    const sheet = sheetFor({ album: TOO_LONG }, { templateId: 'fullbleed' });

    expect(onlyWarning(sheet, 'spine-truncated').shown).toBe(spineOf(sheet));
  });

  it('says nothing for an empty line, however little room the edge has', () => {
    // A project file may carry a 1 mm Insert (`MIN_PART_MM`), which leaves the
    // Spine a negative width — `ellipsise` then returns a bare ellipsis for
    // anything at all, and a Release with nothing to say has lost nothing.
    const sheets = renderSheetsAt(
      [aDesign(aRelease({ artist: '', album: '' }))],
      { ...A4_SHEET, parts: ['insert'] },
      { ...DEFAULT_PART_DIMENSIONS, insert: { ...DEFAULT_PART_DIMENSIONS.insert, height: 1 } },
    );

    // The Spine's warning specifically, not "no warnings at all": a 1 mm Insert
    // has a 1 mm tracklist Page on it too, and that one really does report itself
    // — the type on it has shrunk past anything a printer holds. Which is exactly
    // the difference between a warning about lost content and one about small
    // content, and this test is about the first.
    expect(
      (sheets[0]?.warnings ?? []).filter((warning) => warning.kind === 'spine-truncated'),
    ).toEqual([]);
  });

  it('reports nothing when the job does not print the Insert at all', () => {
    const sheets = renderSheetsAt([aDesign(aRelease({ album: TOO_LONG }))], {
      ...A4_SHEET,
      parts: ['label'],
    });

    expect(sheets[0]?.warnings).toBeUndefined();
  });
});

describe('SheetRenderer — the Template’s faces reach the paper', () => {
  /**
   * A measurer that answers differently per face, which is the only way this
   * seam can tell a stack that was chosen from one that was declared and
   * ignored.
   *
   * The factors are deliberately further apart than the real faces: measured in
   * a browser, Archivo Narrow sets the Spine's line 20.4 % narrower than Noto
   * Sans, where `condensed` here is 42 % narrower than `grotesque`. Exaggerating
   * it is what keeps the assertions below about plumbing rather than about
   * metrics — a real-metric margin this test cannot see would make a failure
   * look like a rounding accident.
   */
  const FACE_WIDTH: Readonly<Record<PrintFace, number>> = {
    sans: 0.5,
    serif: 0.5,
    slab: 0.55,
    grotesque: 0.6,
    condensed: 0.35,
    humanist: 0.5,
  };

  /** Every question the layout asked, so what was measured can be compared to what was drawn. */
  const recordingMeasurer = (): { measure: TextMeasurer; asked: Array<[string, PrintFace]> } => {
    const asked: Array<[string, PrintFace]> = [];
    return {
      asked,
      measure: {
        widthMm: (text, style) => {
          asked.push([text, style.face]);
          return [...text].length * style.sizeMm * FACE_WIDTH[style.face];
        },
      },
    };
  };

  const textOpsOf = (sheet: SheetLayout | undefined, part: PartKind): TextOp[] =>
    (sheet?.placements.find((placement) => placement.part === part)?.ops ?? []).flatMap((op) =>
      op.op === 'text' ? [op] : [],
    );

  it('sets every piece of type in a face the drawing Template names', () => {
    for (const templateId of TEMPLATE_IDS) {
      const faces = TEMPLATES[templateId].faces;
      const [sheet] = renderSheetsAt([aDesign(aRelease(), { templateId })], A4_SHEET);

      const used = new Set(
        PART_KINDS.flatMap((part) => textOpsOf(sheet, part)).map((op) => op.style.face),
      );
      expect(used.size, `${templateId} draws type at all`).toBeGreaterThan(0);
      expect(
        [...used].filter((face) => !Object.values(faces).includes(face)),
        `${templateId} may only set type in its own faces`,
      ).toEqual([]);
    }
  });

  it('gives each role the face it was assigned', () => {
    const { display, text, spine } = TEMPLATES.classic.faces;
    const insert = insertOf(renderSheetsAt([aDesign()], A4_SHEET)[0]);

    // The Spine is the one line on the strip that reads sideways up the edge.
    const [spineOp] = textsIn(insert, sectionOf(insert, 'spine'));
    expect(spineOp?.style.face, 'the Spine').toBe(spine);

    // The Front Panel's caption is display type; the tracklist is not.
    const front = textsIn(insert, pageOf(insert, 'cover'));
    expect(front.length, 'the Front Panel is captioned').toBeGreaterThan(0);
    expect(front.map((op) => op.style.face), 'the Front Panel').toEqual(front.map(() => display));

    const tracks = textsIn(insert, pageOf(insert, 'tracklist')).filter((op) =>
      /^\d+\. /.test(op.text),
    );
    expect(tracks.length, 'tracks were drawn').toBe(3);
    expect(tracks.map((op) => op.style.face), 'the tracklist').toEqual(tracks.map(() => text));

    // Classic is the Template whose three roles are three different faces, so
    // this also says the roles are not quietly collapsing into one.
    expect(new Set([display, text, spine]).size).toBe(3);
  });

  it('measures the same Release to different widths under two Templates', () => {
    // The proof that a stack reached the paper rather than being declared:
    // Classic sets the Spine in the narrow face and keeps a 48-character line
    // that Full-bleed's wider one has to cut. Same Release, same 5.5 mm edge,
    // same 2.9 mm type — only the face differs.
    const album = 'Wichita Lineman, and Other Songs';
    expect(`Glen Campbell — ${album}`).toHaveLength(48);

    const sheetFor = (templateId: TemplateId): SheetLayout | undefined => {
      const [sheet] = renderSheets(
        [aDesign(aRelease({ album }), { templateId })],
        { ...A4_SHEET, parts: ['insert'] },
        DEFAULT_PART_DIMENSIONS,
        recordingMeasurer().measure,
      );
      return sheet;
    };

    const classic = sheetFor('classic');
    const fullbleed = sheetFor('fullbleed');
    const spineTextOf = (sheet: SheetLayout | undefined): string | undefined => {
      const insert = insertOf(sheet);
      return textsIn(insert, sectionOf(insert, 'spine')).find(
        (op) => op.style.rotationDeg === -90,
      )?.text;
    };

    expect(spineTextOf(classic), 'the narrow face keeps the line').toBe(`Glen Campbell — ${album}`);
    expect(spineTextOf(fullbleed), 'the wide one cuts it').toMatch(/…$/);
    expect(classic?.warnings).toBeUndefined();
    expect(onlyWarning(fullbleed, 'spine-truncated').shown).toBe(spineTextOf(fullbleed));
  });

  it('measures in the face it then draws in', () => {
    // The failure this rules out is the expensive one: text fitted against one
    // face and drawn in another is trimmed to a width it never had, and nothing
    // about the layout looks wrong until it is on paper.
    for (const templateId of TEMPLATE_IDS) {
      const { measure, asked } = recordingMeasurer();
      const [sheet] = renderSheets(
        [aDesign(aRelease(), { templateId })],
        A4_SHEET,
        DEFAULT_PART_DIMENSIONS,
        measure,
      );

      const measured = new Set(asked.map(([text, face]) => `${face} ${text}`));
      const drawn = PART_KINDS.flatMap((part) => textOpsOf(sheet, part));
      expect(drawn.length, `${templateId} drew type`).toBeGreaterThan(0);
      expect(
        drawn
          .filter((op) => !measured.has(`${op.style.face} ${op.text}`))
          .map((op) => `${op.style.face}: ${op.text}`),
        `${templateId} drew type it never measured in that face`,
      ).toEqual([]);
    }
  });
});

describe('SheetRenderer — Classic’s artwork, which bleeds three edges', () => {
  const artwork = { dataUrl: 'data:image/png;base64,AAAA', widthPx: 600, heightPx: 600 };

  const frontPanel = (params: Partial<TemplateParams> = {}) => {
    const insert = insertOf(
      renderSheetsAt([aDesign(aRelease({ artwork }), { params })], {
        ...A4_SHEET,
        parts: ['insert'],
      })[0],
    );
    // The cover Page is the Front Panel (ADR-0012), and the only artwork on a
    // two-Page strip is the one on it: no credits and no fourth Page, so no back
    // cover to confuse with it.
    const panel = pageOf(insert, 'cover');
    const ops = opsIn(insert, panel);

    const art = ops.find((op) => op.op === 'image' && op.role === 'artwork');
    if (art?.op !== 'image') throw new Error('no artwork on the Front Panel');
    const captions = ops.flatMap((op) => (op.op === 'text' && !op.style.rotationDeg ? [op] : []));
    return { panel, art: art.rect, captions, ops };
  };

  it('runs the artwork to the top, the left and the right of the panel', () => {
    const { panel, art } = frontPanel();

    expectMm(art.x, panel.x, 'artwork left');
    expectMm(art.y, panel.y, 'artwork top');
    expectMm(art.x + art.width, panel.x + panel.width, 'artwork right');
  });

  it('stops it short of the bottom, which is the edge the type needs', () => {
    // No bleed allowance anywhere: the artwork edge is the cut line, so the
    // fourth edge is given up rather than shared.
    const { panel, art, captions } = frontPanel();

    const artBottom = art.y + art.height;
    expect(artBottom).toBeLessThan(panel.y + panel.height);
    expect(captions.length, 'artist and album are on the panel').toBe(2);
    for (const caption of captions) {
      expect(caption.at.y, caption.text).toBeGreaterThanOrEqual(artBottom);
    }
  });

  it('paints the panel with paper first, so the band under the artwork is paper', () => {
    const { panel, ops } = frontPanel({ paperColor: '#fffbea' });

    const paper = ops.find(
      (op) =>
        op.op === 'fill-rect' &&
        op.color === '#fffbea' &&
        Math.abs(op.rect.x - panel.x) < 0.001 &&
        Math.abs(op.rect.width - panel.width) < 0.001,
    );
    expect(paper, 'a paper fill covering the whole panel').toBeDefined();
  });

  it('draws the old inset square again when the design asks for one', () => {
    // v1's Front Panel, kept reachable rather than deleted: a square inset by
    // the same 3 mm on all four sides, type below it.
    const { panel, art } = frontPanel({ insetArtwork: true });

    expectMm(art.width, art.height, 'the inset artwork is square');
    expectMm(art.x - panel.x, 3, 'left inset');
    expectMm(art.y - panel.y, 3, 'top inset');
    expectMm(panel.x + panel.width - (art.x + art.width), 3, 'right inset');
  });

  it('captions the panel identically either way, at the default dimensions', () => {
    // Which is why the parameter is a fair comparison rather than a different
    // design: at 68 × 79 the bled artwork ends exactly where the square did.
    const bled = frontPanel();
    const inset = frontPanel({ insetArtwork: true });

    expect(bled.captions.map((op) => [op.text, op.at.y, op.style.sizeMm])).toEqual(
      inset.captions.map((op) => [op.text, op.at.y, op.style.sizeMm]),
    );
  });

  it('keeps the caption clear of the logo, which shares the band with it', () => {
    // The collision the caption's own width arithmetic exists to prevent: the
    // logo takes the bottom-right corner, so a caption measured against the
    // whole panel runs straight through the mark.
    const { panel, captions } = frontPanel({ showLogo: true });
    // `FRONT_LOGO_WIDTH` and `PAD` in templates/shared.ts, which the seam does
    // not export — stated here so the assertion says what it is holding.
    const logoLeft = panel.x + panel.width - 3 - 9;

    expect(captions).toHaveLength(2);
    for (const op of captions) {
      const half = testMeasurer.widthMm(op.text, op.style) / 2;
      expect(op.at.x + half, op.text).toBeLessThanOrEqual(logoLeft);
    }
  });

  it('captions the panel even when type over the artwork is switched off', () => {
    // `showOverlayText` governs type drawn *over* artwork — the Full-bleed
    // Front Panel and Label. This caption is beside it, and switching the
    // toggle off used to leave the whole 14 mm band blank.
    const { captions } = frontPanel({ showOverlayText: false });

    expect(captions.map((op) => op.text)).toEqual(['Glen Campbell', 'Wichita Lineman']);
  });

  it('draws no negative rectangle on the smallest Insert a project file may carry', () => {
    // A 1 mm Insert is `MIN_PART_MM`, so a file can hold one — the Page width has
    // a floor of its own (`PAGE_WIDTH_RANGE`) and 30 is as small as it goes.
    // Unclamped, the bled artwork would be 13 mm shorter than nothing.
    for (const insetArtwork of [false, true]) {
      const [sheet] = renderSheetsAt(
        [aDesign(aRelease({ artwork }), { params: { insetArtwork } })],
        { ...A4_SHEET, parts: ['insert'] },
        {
          ...DEFAULT_PART_DIMENSIONS,
          insert: { innerFlapWidth: 1, spineWidth: 1, frontPanelWidth: 1, pageWidth: 30, height: 1 },
        },
      );
      const art = sheet?.placements[0]?.ops.find((op) => op.op === 'image' && op.role === 'artwork');
      if (art?.op !== 'image') throw new Error('no artwork');

      expect(art.rect.width, `inset ${insetArtwork}: width`).toBeGreaterThanOrEqual(0);
      expect(art.rect.height, `inset ${insetArtwork}: height`).toBeGreaterThanOrEqual(0);
    }
  });

  it('leaves Full-bleed alone, whose artwork bleeds on all four edges anyway', () => {
    const insert = insertOf(
      renderSheetsAt(
        [aDesign(aRelease({ artwork }), { templateId: 'fullbleed', params: { insetArtwork: true } })],
        { ...A4_SHEET, parts: ['insert'] },
      )[0],
    );
    const panel = pageOf(insert, 'cover');
    const art = opsIn(insert, panel).find((op) => op.op === 'image' && op.role === 'artwork');
    if (art?.op !== 'image') throw new Error('no artwork on the Front Panel');

    expect(art.rect).toEqual(panel);
  });
});

describe('SheetRenderer — a Template reads the toggles it declares, and no others', () => {
  /**
   * Every op of every Part, as one comparable string.
   *
   * Coarse on purpose: this is asking "did flipping that switch change anything
   * at all", so it has to see a moved rectangle as readily as a dropped one.
   */
  const drawingOf = (templateId: TemplateId, params: Partial<TemplateParams>): string => {
    const release = aRelease({
      artwork: { dataUrl: 'data:image/png;base64,AAAA', widthPx: 600, heightPx: 600 },
    });
    const [sheet] = renderSheetsAt([aDesign(release, { templateId, params })], A4_SHEET);
    return JSON.stringify(sheet?.placements.map((placement) => placement.ops));
  };

  /**
   * The declaration held against the drawing, both ways round.
   *
   * `Template.toggles` is what the Design panel filters on, so a Template that
   * declares a control it ignores puts a dead switch in front of the collector,
   * and one that reads a toggle it did not declare hides a live one. Neither
   * is visible in a screenshot, and both are exactly one wrong array element
   * away — which is why this is asserted rather than reviewed.
   *
   * `TEMPLATE_TOGGLES` rather than each Template's own list drives the loop, so
   * a Template that drops a toggle from its declaration is still asked about
   * that toggle — and answers the other way round.
   */
  for (const templateId of TEMPLATE_IDS) {
    const declared = TEMPLATES[templateId].toggles;

    for (const toggle of TEMPLATE_TOGGLES) {
      const reads = declared.includes(toggle);
      it(`${templateId} ${reads ? 'reads' : 'ignores'} ${toggle}, as it declares`, () => {
        const on = drawingOf(templateId, { [toggle]: true });
        const off = drawingOf(templateId, { [toggle]: false });

        if (reads) expect(on).not.toEqual(off);
        else expect(on).toEqual(off);
      });
    }
  }
});

describe('SheetRenderer — each Template draws its own tracklist', () => {
  /** What every Template holds clear at the edges of a Part (`PAD` in templates/shared.ts). */
  const PAD_MM = 3;

  /** A dark design, so reversed-out type is white in both Templates. */
  const DARK: Partial<TemplateParams> = {
    paperColor: '#fffbea',
    inkColor: '#101820',
    accentColor: '#7a2f18',
  };
  /** And a light one, where reversing out means dark type instead. */
  const LIGHT: Partial<TemplateParams> = {
    paperColor: '#ffffff',
    inkColor: '#f3ead8',
    accentColor: '#ffd966',
  };

  const timed = (count: number): Release =>
    aRelease({
      tracks: Array.from({ length: count }, (_, index) => ({
        position: index + 1,
        title: `Track ${index + 1}`,
        lengthMs: 200_000 + index * 1000,
      })),
    });

  /** A tracklist row: the numbered title, or the time set beside it. */
  const isListLine = (op: TextOp): boolean => /^\d+\. /.test(op.text) || /^\d+:\d\d/.test(op.text);

  /**
   * The tracklist Page of a Release's Insert, and the drawing on it.
   *
   * This is what v1's Back Card became: one Page of the strip rather than a Part
   * of its own. The Release is deliberately one that stays at two Pages — no
   * credits, no artwork — so there is exactly one tracklist Page and it is the
   * Page every assertion below is about.
   *
   * `page` is the Page's own rectangle in Part-local millimetres, which starts at
   * x = 87.5 rather than at the origin. Every box assertion here is against that
   * rectangle rather than against zero, which is the one thing a Page has that a
   * Part did not.
   */
  const listPage = (templateId: TemplateId, params = DARK, release = aRelease()) => {
    const [sheet] = renderSheetsAt([aDesign(release, { templateId, params })], {
      ...A4_SHEET,
      parts: ['insert'],
    });
    const insert = insertOf(sheet);
    const page = pageOf(insert, 'tracklist');
    const ops = opsIn(insert, page);
    return { sheet, insert, page, ops, texts: textsIn(insert, page) };
  };

  it('grounds the tracklist Page in a colour the Release chose, edge to edge', () => {
    for (const [templateId, colour] of [
      ['classic', DARK.accentColor],
      ['fullbleed', DARK.inkColor],
      // Minimal grounds in the ink, as Full-bleed does, but for the opposite
      // reason: there is no artwork here for the ink to have been a scrim over,
      // so the Page is simply the Front Panel with paper and ink exchanged.
      ['minimal', DARK.inkColor],
    ] as const) {
      const { ops, page } = listPage(templateId);
      const ground = ops[0];

      expect(ground?.op, templateId).toBe('fill-rect');
      if (ground?.op !== 'fill-rect') throw new Error('no ground');
      expect(ground.color, templateId).toBe(colour);
      // The whole Page and no more: a ground that spilled would run over the
      // Front Panel beside it rather than off the paper.
      expect(ground.rect, templateId).toEqual(page);
    }
  });

  it('reverses every line out of the ground it sits on', () => {
    for (const templateId of TEMPLATE_IDS) {
      const dark = listPage(templateId, DARK).texts.map((op) => op.style.color);
      const light = listPage(templateId, LIGHT).texts.map((op) => op.style.color);

      expect(dark.length, templateId).toBeGreaterThan(0);
      expect([...new Set(dark)], `${templateId} on a dark ground`).toEqual(['#ffffff']);
      expect([...new Set(light)], `${templateId} on a light ground`).toEqual(['#111111']);
    }
  });

  it('bands Full-bleed’s heading and leaves Classic’s and Minimal’s bare', () => {
    // The structural half of the difference, which colour alone would not
    // catch: Classic is one flat ground, Full-bleed is a ground plus a bar, and
    // Minimal — which grounds in the same colour Full-bleed does — is the flat
    // one, so this is also what tells those two cards apart.
    const classicFills = listPage('classic').ops.filter((op) => op.op === 'fill-rect');
    const minimalFills = listPage('minimal').ops.filter((op) => op.op === 'fill-rect');
    const { ops, page } = listPage('fullbleed');
    const fullbleedFills = ops.filter((op) => op.op === 'fill-rect');

    expect(classicFills, 'Classic grounds the card and stops').toHaveLength(1);
    expect(minimalFills, 'Minimal grounds the card and stops').toHaveLength(1);
    expect(fullbleedFills, 'Full-bleed grounds it and bands the top').toHaveLength(2);

    const band = fullbleedFills[1];
    if (band?.op !== 'fill-rect') throw new Error('no band');
    expect(band.color).toBe(DARK.accentColor);
    // Across the top of its own Page, which starts at x = 87.5 on the strip.
    expect(band.rect.x).toBe(page.x);
    expect(band.rect.y).toBe(page.y);
    expect(band.rect.width).toBe(page.width);
    expect(band.rect.height).toBeLessThan(page.height / 3);
  });

  it('chooses the ink per ground, not once for the whole card', () => {
    // A light accent over a dark ink is the case a single `readableInkFor` call
    // cannot survive: Full-bleed's band wants dark type and its list wants
    // white, from the same two parameters.
    const MIXED: Partial<TemplateParams> = {
      paperColor: '#ffffff',
      inkColor: '#101820',
      accentColor: '#ffd966',
    };
    const isTrack = (op: TextOp): boolean => /^\d+\. /.test(op.text);

    const fullbleed = listPage('fullbleed', MIXED).texts;
    expect(fullbleed.filter((op) => !isTrack(op)).map((op) => op.style.color)).toEqual([
      '#111111',
      '#111111',
    ]);
    expect([...new Set(fullbleed.filter(isTrack).map((op) => op.style.color))]).toEqual(['#ffffff']);

    // Classic has one ground, so it has one ink — which is the contrast that
    // makes the assertion above about the band rather than about luck.
    expect([...new Set(listPage('classic', MIXED).texts.map((op) => op.style.color))]).toEqual([
      '#111111',
    ]);
  });

  it('leaves the lonely hairline rule behind', () => {
    for (const templateId of TEMPLATE_IDS) {
      expect(
        listPage(templateId).ops.filter((op) => op.op === 'line'),
        `${templateId} draws no rule`,
      ).toEqual([]);
    }
  });

  it('draws three visibly different cards for one Release', () => {
    const classic = listPage('classic');
    const fullbleed = listPage('fullbleed');
    const minimal = listPage('minimal');

    // No two of the three draw the same card, which is the whole claim; the
    // assertions after it are what each pair actually differs *in*, so a
    // failure says which difference was lost rather than only that one was.
    expect(classic.ops).not.toEqual(fullbleed.ops);
    expect(classic.ops).not.toEqual(minimal.ops);
    expect(fullbleed.ops).not.toEqual(minimal.ops);

    // Different ground, so Classic is not the colour the other two are.
    expect(classic.ops[0]).not.toEqual(fullbleed.ops[0]);
    expect(classic.ops[0]).not.toEqual(minimal.ops[0]);
    // Different alignment: a title page centres its heading, a poster ranges it left.
    const alignments = (card: { texts: TextOp[] }) => [
      ...new Set(card.texts.filter((op) => !/^\d+\./.test(op.text)).map((op) => op.style.align)),
    ];
    expect(alignments(classic)).toEqual(['center']);
    expect(alignments(fullbleed)).toEqual(['left']);
    expect(alignments(minimal)).toEqual(['left']);
    // And different type, which is what ticket 02 bought. Minimal against the
    // other two is the strong case: it shares no face with either of them.
    const faces = (card: { texts: TextOp[] }) => new Set(card.texts.map((op) => op.style.face));
    expect([...faces(classic)].some((face) => !faces(fullbleed).has(face))).toBe(true);
    expect([...faces(minimal)].filter((face) => faces(classic).has(face))).toEqual([]);
    expect([...faces(minimal)].filter((face) => faces(fullbleed).has(face))).toEqual([]);

    // Full-bleed and Minimal share a ground, so the thing that separates them
    // is the heading: Full-bleed names the artist first, Minimal the record.
    const headings = (card: { texts: TextOp[] }) =>
      card.texts.filter((op) => !isListLine(op)).map((op) => op.text);
    expect(headings(fullbleed)).toEqual(['Glen Campbell', 'Wichita Lineman']);
    expect(headings(minimal)).toEqual(['Wichita Lineman', 'Glen Campbell']);
  });

  it('sets each card only in the faces its own Template names', () => {
    for (const templateId of TEMPLATE_IDS) {
      const declared = Object.values(TEMPLATES[templateId].faces);
      const used = listPage(templateId).texts.map((op) => op.style.face);

      expect(used.length, templateId).toBeGreaterThan(0);
      expect(used.filter((face) => !declared.includes(face)), templateId).toEqual([]);
    }
  });

  it('prints a playing time beside every track that has one', () => {
    for (const templateId of TEMPLATE_IDS) {
      const { texts } = listPage(templateId, DARK, timed(10));
      const times = texts.filter((op) => /^\d+:\d\d$/.test(op.text));

      expect(times, `${templateId} sets ten times`).toHaveLength(10);
      expect(times.map((op) => op.text), templateId).toContain('3:20');
      expect([...new Set(times.map((op) => op.style.align))], templateId).toEqual(['right']);
    }
  });

  it('prints no time at all for a Release that has none', () => {
    for (const templateId of TEMPLATE_IDS) {
      const { texts } = listPage(templateId, DARK, aRelease());
      expect(texts.filter((op) => /^\d+:\d\d$/.test(op.text)), templateId).toEqual([]);
    }
  });

  it('keeps 25 timed tracks in two columns, times and all', () => {
    for (const templateId of TEMPLATE_IDS) {
      const { texts } = listPage(templateId, DARK, timed(25));
      const lines = texts.filter((op) => /^\d+\. /.test(op.text));
      const times = texts.filter((op) => /^\d+:\d\d$/.test(op.text));

      expect(lines, `${templateId} keeps every track`).toHaveLength(25);
      expect(times, `${templateId} keeps every time`).toHaveLength(25);
      expect(new Set(lines.map((op) => op.at.x)).size, `${templateId} columns`).toBe(2);
      expect(new Set(times.map((op) => op.at.x)).size, `${templateId} time columns`).toBe(2);
    }
  });

  it('shrinks and then warns from either Template, exactly as before', () => {
    for (const templateId of TEMPLATE_IDS) {
      const modest = listPage(templateId, DARK, timed(25));
      const enormous = listPage(templateId, DARK, timed(200));

      expect(modest.sheet?.warnings, `${templateId} at 25`).toBeUndefined();
      const warning = onlyWarning(enormous.sheet, 'type-below-print-floor');
      expect(warning.trackCount, templateId).toBe(200);
      expect(warning.sizeMm, templateId).toBeLessThan(warning.floorMm);

      const smaller = enormous.texts.filter((op) => /^\d+\. /.test(op.text))[0]?.style.sizeMm ?? 0;
      const bigger = modest.texts.filter((op) => /^\d+\. /.test(op.text))[0]?.style.sizeMm ?? 0;
      expect(smaller, `${templateId} shrank`).toBeLessThan(bigger);
    }
  });

  it('sets the times at the size the list shrank to, not the size it started at', () => {
    // The failure `layOutTracklist` hands the whole style back to prevent, one
    // cell over: a time drawn from a style the fit never saw is a time that
    // does not match the list it belongs to, and only paper shows it.
    for (const templateId of TEMPLATE_IDS) {
      const { texts } = listPage(templateId, DARK, timed(200));
      const listSize = texts.find((op) => /^\d+\. /.test(op.text))?.style.sizeMm ?? 0;
      const timeSizes = [...new Set(texts.filter((op) => /^\d+:\d\d$/.test(op.text)).map((op) => op.style.sizeMm))];

      expect(listSize, `${templateId} shrank`).toBeLessThan(2.4);
      expect(timeSizes, `${templateId} sets its times at the fitted size`).toEqual([listSize]);
    }
  });

  it('starts every Template’s list no higher up the Page than the Page count assumes', () => {
    // `LIST_TOP_MM` is the box the *count* is decided against, and its comment
    // claims 16 mm is the most generous of the Templates. If one of them ever
    // started its list above that, the count would be derived against less room
    // than that Template actually has — and it would be handed a Page it had
    // nothing to fill. Asserted rather than reviewed, because the claim is in a
    // comment and comments do not fail.
    for (const templateId of TEMPLATE_IDS) {
      const { texts, page } = listPage(templateId, DARK, timed(10));
      const firstTrack = texts.find((op) => /^\d+\. /.test(op.text));

      expect(firstTrack, `${templateId} drew a list`).toBeDefined();
      expect(
        (firstTrack?.at.y ?? 0) - page.y,
        `${templateId} starts its list at or below LIST_TOP_MM`,
      ).toBeGreaterThanOrEqual(LIST_TOP_MM);
    }
  });

  it('keeps the heading clear of the first track', () => {
    // Every millimetre in the Back Card layout comments is load-bearing and
    // none of them was pinned: a heading one line too low, or a list top one
    // line too high, prints the album through track 1.
    for (const templateId of TEMPLATE_IDS) {
      const { texts } = listPage(templateId, DARK, timed(10));
      const heading = texts.filter((op) => !isListLine(op));
      const firstTrack = texts.find((op) => /^\d+\. /.test(op.text));

      expect(heading.length, `${templateId} has a heading`).toBeGreaterThan(0);
      expect(firstTrack, `${templateId} has a list`).toBeDefined();
      // Air, not merely no overlap. Ink that ends 0.1 mm above the first track
      // satisfies "clear of" and prints as one block; the three Templates leave
      // 5.6, 6.8 and 4.6 mm, so 2 is a floor none of them is near.
      const lowest = Math.max(...heading.map((op) => op.at.y + op.style.sizeMm));
      expect((firstTrack?.at.y ?? 0) - lowest, `${templateId} air under the heading`)
        .toBeGreaterThanOrEqual(2);
    }
  });

  it('keeps the heading’s own two lines apart, not merely clear of the list', () => {
    // Ink that ends where the next line's ink begins prints as one block, and
    // every other assertion here — inside the card, clear of the list, in the
    // Template's own faces, reversed out of the ground — holds while it does.
    // The three Templates leave 1.0, 1.0 and 1.2 mm between their two lines.
    for (const templateId of TEMPLATE_IDS) {
      const heading = listPage(templateId, DARK, timed(10))
        .texts.filter((op) => !isListLine(op))
        .sort((first, second) => first.at.y - second.at.y);

      expect(heading.length, `${templateId} sets two heading lines`).toBe(2);
      const [above, below] = heading;
      expect(
        (below?.at.y ?? 0) - ((above?.at.y ?? 0) + (above?.style.sizeMm ?? 0)),
        `${templateId} air between the heading lines`,
      ).toBeGreaterThanOrEqual(0.8);
    }
  });

  it('keeps Full-bleed’s masthead inside the band drawn for it', () => {
    // The band test above only bounds the bar at a third of the card, which is
    // 26 mm of slack; this is the assertion that ties the two lines to it.
    const { ops, texts } = listPage('fullbleed');
    const band = ops.filter((op) => op.op === 'fill-rect')[1];
    if (band?.op !== 'fill-rect') throw new Error('no band');

    const heading = texts.filter((op) => !isListLine(op));
    expect(heading).toHaveLength(2);
    for (const op of heading) {
      expect(op.at.y + op.style.sizeMm, op.text).toBeLessThanOrEqual(band.rect.height);
    }

    // And the list starts below the band, which is the other edge of it: a bar
    // grown past the list top prints the first tracks inside the masthead, and
    // both of them still look right on their own.
    const firstTrack = texts.find((op) => /^\d+\. /.test(op.text));
    expect(firstTrack, 'the list was drawn').toBeDefined();
    expect(band.rect.height).toBeLessThanOrEqual(firstTrack?.at.y ?? 0);
  });

  it('sets no line wider than the Page it is on', () => {
    for (const templateId of TEMPLATE_IDS) {
      const { texts, page } = listPage(templateId, DARK, timed(10));
      const room = page.width - 2 * PAD_MM;

      for (const op of texts) {
        const width = testMeasurer.widthMm(op.text, op.style);
        expect(width, `${templateId}: ${op.text}`).toBeLessThanOrEqual(room + 0.001);
      }
    }
  });

  it('keeps every mark on the Page, times included', () => {
    for (const templateId of TEMPLATE_IDS) {
      const { texts, page } = listPage(templateId, DARK, timed(70));

      for (const op of texts) {
        expect(op.at.y + op.style.sizeMm, `${templateId}: ${op.text}`).toBeLessThanOrEqual(
          page.y + page.height,
        );
        // The Page's own edges, not the strip's: a mark that ran left would land
        // on the Front Panel rather than off the paper.
        expect(op.at.x, `${templateId}: ${op.text}`).toBeGreaterThanOrEqual(page.x);
        expect(op.at.x, `${templateId}: ${op.text}`).toBeLessThanOrEqual(page.x + page.width);
      }
    }
  });
});

describe('SheetRenderer — Minimal, which sets type and nothing else', () => {
  /** What Minimal holds clear at the edges of a Part (`PAD` in templates/shared.ts). */
  const PAD_MM = 3;
  /** The Label's own margin, which is tighter than a J-Card's. */
  const LABEL_PAD_MM = 2.5;

  const artwork = { dataUrl: 'data:image/png;base64,AAAA', widthPx: 600, heightPx: 600 };

  const sheetOf = (
    release: Release = aRelease(),
    params: Partial<TemplateParams> = {},
    dimensions = DEFAULT_PART_DIMENSIONS,
  ): SheetLayout => {
    const [sheet] = renderSheetsAt(
      [aDesign(release, { templateId: 'minimal', params })],
      A4_SHEET,
      dimensions,
    );
    if (!sheet) throw new Error('no Sheet');
    return sheet;
  };

  const partOf = (sheet: SheetLayout, part: PartKind): PartPlacement => {
    const placement = sheet.placements.find((each) => each.part === part);
    if (!placement) throw new Error(`no ${part}`);
    return placement;
  };

  const textsOf = (sheet: SheetLayout, part: PartKind): TextOp[] =>
    partOf(sheet, part).ops.flatMap((op) => (op.op === 'text' ? [op] : []));

  /**
   * The Front Panel's type: the type anchored on the cover Page.
   *
   * By Page rather than by "not rotated", which is what this said when the
   * Front Panel was one of three panels — the tracklist Page is upright too now,
   * so rotation no longer tells the Front Panel from anything else.
   */
  const frontTexts = (sheet: SheetLayout): TextOp[] => {
    const insert = insertOf(sheet);
    return textsIn(insert, pageOf(insert, 'cover'));
  };

  const panelOf = (sheet: SheetLayout, panel: 'inner-flap' | 'spine' | 'front-panel'): Rect => {
    const insert = insertOf(sheet);
    // The Front Panel *is* Page 1 (ADR-0012), which is why it is asked for by
    // role rather than by name.
    return panel === 'front-panel' ? pageOf(insert, 'cover') : sectionOf(insert, panel);
  };

  /**
   * The rectangle a text op's ink actually occupies, which is what has to be
   * inside a Part — `at` is only the anchor, and where the ink falls relative
   * to it is `align`'s business. Every op this Template draws is `baseline:
   * 'top'`, so the vertical half is the size.
   */
  const inkBox = (op: TextOp): { left: number; right: number; top: number; bottom: number } => {
    const width = testMeasurer.widthMm(op.text, op.style);
    const left =
      op.style.align === 'left' ? op.at.x : op.style.align === 'right' ? op.at.x - width : op.at.x - width / 2;
    return { left, right: left + width, top: op.at.y, bottom: op.at.y + op.style.sizeMm };
  };

  /** The title block, which is the only type on the Front Panel set at 700. */
  const headlineFor = (album: string): TextOp[] =>
    frontTexts(sheetOf(aRelease({ album }))).filter((op) => op.style.weight === 700);

  /**
   * The three surfaces this Template sets type on, each with its own type.
   *
   * The Front Panel, the tracklist Page and the Label — which is what "every
   * Part" came to when there were three Parts. Two of the three are now Pages of
   * one Part, and the rules below hold across all three all the same: that is the
   * point of them.
   */
  const surfacesOf = (sheet: SheetLayout): ReadonlyArray<readonly [string, TextOp[]]> => {
    const insert = insertOf(sheet);
    return [
      ['the Front Panel', frontTexts(sheet)],
      ['the tracklist Page', textsIn(insert, pageOf(insert, 'tracklist'))],
      ['the Label', textsOf(sheet, 'label')],
    ];
  };

  /** The one line at the foot of the Front Panel and of the Label. */
  const footerOf = (sheet: SheetLayout, part: PartKind): string | undefined =>
    (part === 'insert' ? frontTexts(sheet) : textsOf(sheet, part)).find((op) =>
      /^\d+ tracks?\b/.test(op.text),
    )?.text;

  it('draws no artwork on any Part, and no tint standing in for it', () => {
    // The ticket's first line. Asserting "no image with role artwork" alone
    // would pass for Classic and Full-bleed too, because a Release with no
    // artwork produces no image there either — what it produces is
    // `artworkOrPlaceholder`'s flat tint of the ink, which `withAlpha` writes
    // as an `rgba(…)`. Every colour Minimal paints in is one the collector
    // picked, and those are opaque hexes, so a translucent fill anywhere on one
    // of its Parts is a placeholder or a scrim and nothing else.
    const params = { paperColor: '#fffbea', inkColor: '#101820', accentColor: '#7a2f18' };
    const translucent = (op: { op: string; color?: string }): boolean =>
      (op.color ?? '').startsWith('rgba(');
    const sheet = sheetOf(aRelease(), params);

    for (const part of PART_KINDS) {
      const ops = partOf(sheet, part).ops;
      expect(
        ops.filter((op) => op.op === 'image' && op.role === 'artwork'),
        `${part} draws artwork`,
      ).toEqual([]);
      expect(
        ops.filter((op) => (op.op === 'fill-rect' || op.op === 'fill-polygon') && translucent(op)),
        `${part} tints where a sleeve would go`,
      ).toEqual([]);
    }

    // The control: the same Release under Classic does produce that fill, so
    // the assertion above is looking for something that exists.
    const [classic] = renderSheetsAt(
      [aDesign(aRelease(), { templateId: 'classic', params })],
      { ...A4_SHEET, parts: ['insert'] },
    );
    expect(
      (classic?.placements[0]?.ops ?? []).filter((op) => op.op === 'fill-rect' && translucent(op)),
      'Classic tints the panel a Release has no artwork for',
    ).toHaveLength(1);

    // And no image at all on the Label, which has no Spine to carry a logo — nor
    // anywhere on the strip but the Spine, which the test below is about.
    expect(partOf(sheet, 'label').ops.filter((op) => op.op === 'image')).toEqual([]);
    const insert = insertOf(sheet);
    expect(opsIn(insert, pageOf(insert, 'tracklist')).filter((op) => op.op === 'image')).toEqual([]);
  });

  it('paints only in the three colours the design chose', () => {
    // This is what "no placeholder" comes to in pixels. A tint standing in for
    // artwork is `withAlpha(ink, 0.1)` and Full-bleed's scrim is
    // `withAlpha(ink, 0.62)`; both are a fourth colour that no swatch names, so
    // a Template that paints only in the three cannot be drawing either.
    const params = { paperColor: '#fffbea', inkColor: '#101820', accentColor: '#7a2f18' };
    const chosen = new Set(Object.values(params));
    const sheet = sheetOf(aRelease(), params);

    for (const part of PART_KINDS) {
      const fills = partOf(sheet, part).ops.flatMap((op) =>
        op.op === 'fill-rect' || op.op === 'fill-polygon' ? [op.color] : [],
      );
      expect(fills.length, `${part} is painted at all`).toBeGreaterThan(0);
      expect(fills.filter((color) => !chosen.has(color)), part).toEqual([]);
    }
  });

  it('ignores artwork a Release happens to have', () => {
    // The Template is chosen per Release, so a looked-up Release with a sleeve
    // can be put into Minimal. Half-using the picture would be the worst of
    // both; the design is that it is not used.
    const without = sheetOf(aRelease());
    const with_ = sheetOf(aRelease({ artwork }));

    for (const part of PART_KINDS) {
      expect(partOf(with_, part).ops, part).toEqual(partOf(without, part).ops);
    }
  });

  it('keeps the MiniDisc logo on the Spine and off the Front Panel', () => {
    // "Type and nothing else" cannot mean dropping the Spine's logo: a shelved
    // case has to be identifiable and ADR-0004 puts the mark there. It can and
    // does mean dropping the second placement, which is the only mark on this
    // Template that is not type.
    const insert = partOf(sheetOf(), 'insert');
    const images = insert.ops.flatMap((op) => (op.op === 'image' ? [op] : []));
    const spine = panelOf(sheetOf(), 'spine');

    expect(images, 'one logo, on the Spine').toHaveLength(1);
    expect(images[0]?.role).toBe('logo');
    expect(images[0]?.rect.x).toBeGreaterThanOrEqual(spine.x);
    expect((images[0]?.rect.x ?? 0) + (images[0]?.rect.width ?? 0)).toBeLessThanOrEqual(
      spine.x + spine.width,
    );

    // And the toggle still switches off the one that is left.
    expect(
      partOf(sheetOf(aRelease(), { showLogo: false }), 'insert').ops.filter(
        (op) => op.op === 'image',
      ),
    ).toEqual([]);
  });

  it('captions every Part when type over the artwork is switched off', () => {
    // `showOverlayText` governs type drawn *over* artwork, and this Template has
    // no artwork for type to be over — so none of its type is gated on it. The
    // same reasoning ticket 03 applied to Classic's Front Panel caption.
    const sheet = sheetOf(aRelease(), { showOverlayText: false });

    for (const [part, texts] of surfacesOf(sheet)) {
      const printed = texts.map((op) => op.text).join(' ');
      expect(printed, `${part} names the record`).toContain('Wichita Lineman');
      expect(printed, `${part} names the artist`).toContain('Glen Campbell');
    }
  });

  it('draws the same Parts whether or not the inset square is asked for', () => {
    // `insetArtwork` is Classic's artwork as a square. There is no artwork here
    // to inset, so the toggle has nothing to reach — and the Design panel shows
    // it for every Template, so "nothing to reach" has to mean "changes
    // nothing" rather than "changes something unintended".
    for (const part of PART_KINDS) {
      expect(partOf(sheetOf(aRelease(), { insetArtwork: true }), part).ops, part).toEqual(
        partOf(sheetOf(aRelease(), { insetArtwork: false }), part).ops,
      );
    }
  });

  it('names the record first on every Part', () => {
    // The Template's one ordering, and the thing that separates its tracklist
    // Page from Full-bleed's, which grounds in the same colour and ranges left too.
    const sheet = sheetOf();

    for (const [part, texts] of surfacesOf(sheet)) {
      const artistAt = texts.findIndex((op) => op.text === 'Glen Campbell');
      expect(texts[0]?.text.startsWith('Wichita'), `${part} opens with the album`).toBe(true);
      expect(artistAt, `${part} names the artist after it`).toBeGreaterThan(0);
    }
  });

  it('sets the title as large as it fits, and smaller when it will not', () => {
    // The whole answer to "no artwork": the space a sleeve would have taken is
    // spent on the title rather than left empty.
    const short = headlineFor('Home');
    const long = headlineFor('The Rise and Fall of Ziggy Stardust and the Spiders from Mars');

    expect(short.map((op) => op.text), 'a short title needs no wrap').toEqual(['Home']);
    expect(short[0]?.style.sizeMm, 'and gets the largest size there is').toBe(11);
    expect(long[0]?.style.sizeMm, 'a long one gives up size').toBeLessThan(11);
    expect(long[0]?.style.sizeMm, 'but never past the floor').toBeGreaterThanOrEqual(4.5);
    expect(long.length, 'and takes no more than three lines').toBeLessThanOrEqual(3);
  });

  it('stops close to the largest size that fits, not at a handful of sizes', () => {
    // The shrink step is what makes the ladder fine enough that two titles of
    // different lengths get the type each of them actually has room for. A
    // coarse step still terminates and still fits inside the panel — it just
    // sets a 46-character title as small as a 61-character one, and every other
    // assertion here survives that.
    const sizes = [
      ...new Set(
        [
          'Home',
          'Wichita Lineman',
          'Selected Ambient Works 85–92',
          'Lift Your Skinny Fists Like Antennas to Heaven',
          'The Rise and Fall of Ziggy Stardust and the Spiders from Mars',
          'A Very Long Album Title That Simply Refuses To Stop Going On And On And On',
        ].map((album) => headlineFor(album)[0]?.style.sizeMm ?? 0),
      ),
    ];

    expect(sizes.length, `six titles, sizes ${sizes.join(', ')}`).toBeGreaterThanOrEqual(4);
    expect(Math.max(...sizes), 'the shortest gets the ceiling').toBe(11);
    expect(Math.min(...sizes), 'the longest gets the floor').toBe(4.5);
  });

  it('wraps the title rather than cutting it', () => {
    const lines = headlineFor('Selected Ambient Works 85–92').map((op) => op.text);

    expect(lines.length, 'it wrapped').toBeGreaterThan(1);
    expect(lines.join(' '), 'and lost nothing doing it').toBe('Selected Ambient Works 85–92');
    expect(lines.some((line) => line.includes('…'))).toBe(false);
  });

  it('ellipsises the title only once shrinking has run out', () => {
    // Every line of one size, so what is on the Part is a title that gave up
    // size first and words last — and says so, because a line that simply stops
    // is a cut the collector has no way of seeing.
    const album = Array.from({ length: 60 }, (_, index) => `Word${index}`).join(' ');
    const lines = headlineFor(album);

    expect(lines).toHaveLength(3);
    expect(lines[0]?.style.sizeMm, 'it went all the way to the floor').toBe(4.5);
    expect(lines[2]?.text, 'and said what it could not fit').toMatch(/…$/);
    // The words past the third line are gathered onto it, and gathering is a
    // join with spaces. Without them the line is still words at its start and
    // runs two of them together at each place the wrap had broken, which the
    // ellipsis then hides — so the check is that what is printed is a run of
    // the title rather than a re-spelling of it.
    const shown = (lines[2]?.text ?? '').replace('…', '');
    expect(shown.length, 'there is something on the third line').toBeGreaterThan(10);
    expect(album.includes(shown), `"${shown}" is a run of the title`).toBe(true);
  });

  it('cuts a word too wide for the panel rather than shrinking the title for it', () => {
    // `wrapText` will not break inside a word, so no size above the floor makes
    // an over-long word fit. Shrinking for it would set every *other* line of
    // the title smaller to no purpose, which is the trade `SPINE_SIZE_MM`
    // refuses on the Spine for the same reason.
    const room = panelOf(sheetOf(), 'front-panel').width - 2 * PAD_MM;
    const lines = headlineFor('Anticonstitutionnellementsupercalifragilistic Blues');

    expect(lines.map((op) => op.text.endsWith('…')), 'the long word is cut, the short one is not')
      .toEqual([true, false]);
    expect(lines[1]?.text).toBe('Blues');
    expect(lines[0]?.style.sizeMm, 'and the title keeps the size it asked for').toBe(11);
    for (const op of lines) {
      expect(testMeasurer.widthMm(op.text, op.style), op.text).toBeLessThanOrEqual(room + 0.001);
    }
  });

  it('keeps every mark of the Front Panel inside the Front Panel’s margins', () => {
    // The box the ink occupies, not the point it is anchored at. `at` plus a
    // width says nothing on its own: `align: 'right'` at x = 3 puts the whole
    // 62 mm title off the left edge of the Part, and every assertion phrased as
    // "at.x is inside the panel" still holds while it does.
    for (const album of ['Home', 'Selected Ambient Works 85–92', 'The Rise and Fall of Ziggy Stardust and the Spiders from Mars']) {
      const sheet = sheetOf(aRelease({ album }));
      const panel = panelOf(sheet, 'front-panel');
      const texts = frontTexts(sheet);

      expect(texts.length, `${album}: the panel is set at all`).toBeGreaterThan(0);
      for (const op of texts) {
        const box = inkBox(op);
        expect(box.left, `${album}: ${op.text} left`).toBeGreaterThanOrEqual(panel.x + PAD_MM - 0.001);
        expect(box.right, `${album}: ${op.text} right`).toBeLessThanOrEqual(panel.x + panel.width - PAD_MM + 0.001);
        expect(box.top, `${album}: ${op.text} top`).toBeGreaterThanOrEqual(panel.y + PAD_MM - 0.001);
        expect(box.bottom, `${album}: ${op.text} bottom`).toBeLessThanOrEqual(panel.y + panel.height - PAD_MM + 0.001);
      }
    }
  });

  it('keeps the title clear of the footer, however many lines it takes', () => {
    // The leading is the one number the block's own arithmetic hides: the
    // artist hangs off the block's bottom, so a leading loose enough to push
    // the pair into the footer moves both and leaves every mark on the Part.
    const sheet = sheetOf(aRelease({ album: 'The Rise and Fall of Ziggy Stardust and the Spiders from Mars' }));
    const texts = frontTexts(sheet);
    const footer = texts.find((op) => /^\d+ tracks?\b/.test(op.text));
    const above = texts.filter((op) => op !== footer);

    expect(footer, 'there is a footer to run into').toBeDefined();
    expect(above.length).toBeGreaterThan(1);
    expect(Math.max(...above.map((op) => op.at.y + op.style.sizeMm))).toBeLessThanOrEqual(
      footer?.at.y ?? 0,
    );
  });

  it('keeps the title clear of the artist under it, however many lines it takes', () => {
    // The Front Panel's version of the Back Card invariant: the artist hangs off
    // the title's last line, so a wrap that grew by one line and a gap that did
    // not would print the two through each other.
    for (const album of ['Home', 'Selected Ambient Works 85–92', 'A B C D E F G H I J K L M N']) {
      const texts = frontTexts(sheetOf(aRelease({ album })));
      const title = texts.filter((op) => op.style.weight === 700);
      const artist = texts.find((op) => op.text === 'Glen Campbell');

      const lowest = Math.max(...title.map((op) => op.at.y + op.style.sizeMm));
      expect(artist, album).toBeDefined();
      expect(lowest, album).toBeLessThanOrEqual(artist?.at.y ?? 0);
    }
  });

  it('sets the title’s lines under one another rather than through one another', () => {
    // The leading is the one number in the headline block that nothing else
    // constrains: the artist hangs off the block's own bottom, so a leading too
    // tight moves both and keeps every mark on the Part while printing the
    // title through itself.
    const lines = headlineFor('Selected Ambient Works Volume II');

    expect(lines.length, 'it took more than one line').toBeGreaterThan(1);
    for (const [index, line] of lines.slice(1).entries()) {
      const above = lines[index];
      expect(line.at.y, line.text).toBeGreaterThanOrEqual((above?.at.y ?? 0) + (above?.style.sizeMm ?? 0));
    }
  });

  it('puts the facts at the foot of the Part, which is what makes the space between air', () => {
    // Two anchors, top and bottom. A footer drawn anywhere else leaves the
    // panel a block of type with the rest of the Part after it, which is the
    // unfinished look the whole Template exists to avoid — and every other
    // assertion here would still pass.
    const sheet = sheetOf();
    const panel = panelOf(sheet, 'front-panel');

    const front = frontTexts(sheet).find((op) => /^\d+ tracks?\b/.test(op.text));
    expect(front, 'the Front Panel says what is on the disc').toBeDefined();
    expect(front?.at.y, 'and says it at the foot').toBeGreaterThan(
      panel.y + panel.height * 0.75,
    );
    expect((front?.at.y ?? 0) + (front?.style.sizeMm ?? 0)).toBeLessThanOrEqual(panel.y + panel.height);

    const label = textsOf(sheet, 'label').find((op) => /^\d+ tracks?\b/.test(op.text));
    const { height } = DEFAULT_PART_DIMENSIONS.label;
    expect(label?.at.y, 'and so does the Label').toBeGreaterThan(height * 0.75);
    expect((label?.at.y ?? 0) + (label?.style.sizeMm ?? 0)).toBeLessThanOrEqual(height);
  });

  it('promotes the artist into the title when a Release has no album', () => {
    // The Release this Template exists for is the one somebody typed, and a
    // half-typed one is a real state: a name and a list, no title yet. Leaving
    // the largest type on the Part blank is the failed-download look again.
    const sheet = sheetOf(aRelease({ album: '' }));

    for (const [part, texts] of [
      ['label', textsOf(sheet, 'label')],
    ] as const) {
      const named = texts.filter((op) => op.text === 'Glen Campbell');
      expect(named, `${part} names the artist exactly once`).toHaveLength(1);
      expect(texts[0]?.text, `${part} names it in the title`).toBe('Glen Campbell');
      expect(texts.some((op) => op.text === ''), `${part} draws no empty line`).toBe(false);
    }

    // The Front Panel wraps its title, so the name arrives in pieces — and once
    // rather than twice, which is the half that would break if the artist were
    // promoted into the title and left in its own line as well.
    const front = frontTexts(sheet);
    const headline = front.filter((op) => op.style.weight === 700);
    expect(headline.map((op) => op.text).join(' '), 'the Front Panel title').toBe('Glen Campbell');
    expect(front.filter((op) => op.style.weight !== 700).map((op) => op.text)).toEqual(['3 tracks']);
    expect(front.some((op) => op.text === ''), 'no empty line').toBe(false);

    // And it really is set as a title, not as the small line the artist usually
    // gets under one.
    expect(headline[0]?.style.sizeMm).toBe(11);
  });

  it('says how many tracks there are, and how long they run when every one says', () => {
    const timed = aRelease({
      tracks: [
        { position: 1, title: 'One More Time', lengthMs: 320840 },
        { position: 2, title: 'Aerodynamic', lengthMs: 207533 },
      ],
    });
    const sheet = sheetOf(timed);

    // On the Front Panel and on the Label: the two surfaces that would otherwise
    // be a name on an empty field.
    expect(footerOf(sheet, 'insert')).toBe('2 tracks · 8:48');
    expect(footerOf(sheet, 'label')).toBe('2 tracks · 8:48');
  });

  it('says nothing about a running time when one track is missing its own', () => {
    const partly = aRelease({
      tracks: [
        { position: 1, title: 'One More Time', lengthMs: 320840 },
        { position: 2, title: 'Aerodynamic' },
      ],
    });

    expect(footerOf(sheetOf(partly), 'insert')).toBe('2 tracks');
  });

  it('still looks finished for a Release with no times at all, which is the mixtape', () => {
    // The Template exists for Releases nobody looked up, and those have no
    // durations. The footer has to be worth drawing without them.
    expect(footerOf(sheetOf(), 'insert')).toBe('3 tracks');
    expect(footerOf(sheetOf(aRelease({ tracks: [{ position: 1, title: 'Only' }] })), 'insert')).toBe(
      '1 track',
    );
  });

  it('says nothing at all about a Release with no tracks, rather than “0 tracks”', () => {
    // A zero would be a claim about a record instead of the absence of one —
    // the same reason `formatTrackLength` refuses to print 0:00.
    const empty = sheetOf(aRelease({ tracks: [] }));

    expect(footerOf(empty, 'insert')).toBeUndefined();
    expect(footerOf(empty, 'label')).toBeUndefined();
    // And the Part is still a Part: the name is on it.
    expect(frontTexts(empty).map((op) => op.text).join(' ')).toContain('Wichita');
  });

  it('grounds the tracklist Page in the ink the Front Panel sets its type in', () => {
    // Minimal's one gesture: the two faces of the case are the same card, the
    // second one printed the other way round.
    const params = { paperColor: '#fffbea', inkColor: '#101820', accentColor: '#7a2f18' };
    const sheet = sheetOf(aRelease(), params);

    const insert = insertOf(sheet);
    const front = opsIn(insert, pageOf(insert, 'cover')).find((op) => op.op === 'fill-rect');
    expect(front?.op === 'fill-rect' ? front.color : undefined, 'the Front Panel is paper').toBe(
      params.paperColor,
    );
    expect([...new Set(frontTexts(sheet).map((op) => op.style.color))], 'set in the ink').toEqual([
      params.inkColor,
    ]);

    const listBox = pageOf(insert, 'tracklist');
    const back = opsIn(insert, listBox)[0];
    expect(
      back?.op === 'fill-rect' ? back.color : undefined,
      'the tracklist Page is that ink',
    ).toBe(params.inkColor);
    expect([...new Set(textsIn(insert, listBox).map((op) => op.style.color))]).toEqual(['#ffffff']);
  });

  it('makes the Label a chip of the accent, cut to the corner the cartridge needs', () => {
    const params = { paperColor: '#fffbea', inkColor: '#101820', accentColor: '#7a2f18' };
    const label = partOf(sheetOf(aRelease(), params), 'label');
    const chip = label.ops[0];

    expect(chip?.op, 'the chip is the Part’s own outline').toBe('fill-polygon');
    if (chip?.op !== 'fill-polygon') throw new Error('no chip');
    expect(chip.color).toBe(params.accentColor);
    expect(chip.points).toEqual(labelShape(DEFAULT_PART_DIMENSIONS.label).outline);

    // Reversed out of it, chosen rather than configured: a light accent would
    // otherwise take the same white type a dark one does.
    expect([...new Set(textsOf(sheetOf(aRelease(), params), 'label').map((op) => op.style.color))])
      .toEqual(['#ffffff']);
    expect([
      ...new Set(
        textsOf(sheetOf(aRelease(), { ...params, accentColor: '#ffd966' }), 'label').map(
          (op) => op.style.color,
        ),
      ),
    ]).toEqual(['#111111']);
  });

  it('holds the Label’s heading clear of the diagonal the notch cuts', () => {
    // The cut runs x = (width − notch) + y from the top edge down to y = notch,
    // so the room a line has is tightest at its own top and opens as it
    // descends. Reserving the notch's whole width from every line would be
    // simpler and would cost 6 mm of a 35 mm sticker to a corner 6 mm deep.
    const { width, notchSize } = DEFAULT_PART_DIMENSIONS.label;
    const long = aRelease({
      artist: 'A Band With A Very Long Name Indeed',
      album: 'And An Album Longer Still',
    });
    const texts = textsOf(sheetOf(long), 'label');
    const heading = texts.filter((op) => !/^\d+ tracks?\b/.test(op.text));
    const rightOf = (op: TextOp): number => op.at.x + testMeasurer.widthMm(op.text, op.style);

    expect(heading, 'the album and the artist').toHaveLength(2);
    for (const op of heading) {
      const cut = Math.min(width - LABEL_PAD_MM, width - notchSize + op.at.y);
      expect(rightOf(op), op.text).toBeLessThanOrEqual(cut);
    }

    // Both lines are long enough to be cut to their measure, so the album —
    // which starts inside the band — has to end further left than the artist a
    // line below it. That difference is the per-line room; one reserve for the
    // whole block would put them at the same millimetre.
    const [album, artist] = heading;
    if (!album || !artist) throw new Error('no heading');
    expect(album.text, 'the album was cut to its room').toMatch(/…$/);
    expect(artist.text, 'so was the artist').toMatch(/…$/);
    expect(rightOf(album)).toBeLessThan(rightOf(artist));

    // And the artist is cut at the margin rather than at the corner: it runs
    // past the limit the album had, which one reserve for the whole block
    // could not produce however the two lines happened to round.
    expect(rightOf(artist), 'the artist gets the whole measure').toBeGreaterThan(
      width - notchSize + LABEL_PAD_MM,
    );
    expect(rightOf(artist)).toBeLessThanOrEqual(width - LABEL_PAD_MM);

    // The two lines sit under one another, and the whole heading stays inside
    // the Label's own margins — the same box check the Front Panel gets.
    expect(artist.at.y).toBeGreaterThanOrEqual(album.at.y + album.style.sizeMm);
    for (const op of texts) {
      const box = inkBox(op);
      expect(box.left, op.text).toBeGreaterThanOrEqual(LABEL_PAD_MM - 0.001);
      expect(box.top, op.text).toBeGreaterThanOrEqual(LABEL_PAD_MM - 0.001);
      expect(box.bottom, op.text).toBeLessThanOrEqual(
        DEFAULT_PART_DIMENSIONS.label.height - LABEL_PAD_MM + 0.001,
      );
    }

    // The footer is at the other end of the Label and gets the full measure,
    // which is what says the reserve above is about the notch and not a margin.
    const [footer] = texts.filter((op) => /^\d+ tracks?\b/.test(op.text));
    expect(footer?.at.x).toBe(LABEL_PAD_MM);
    expect((footer?.at.y ?? 0) + (footer?.style.sizeMm ?? 0)).toBeLessThanOrEqual(
      DEFAULT_PART_DIMENSIONS.label.height,
    );
  });

  it('reserves the corner that is actually cut, not the one the file asked for', () => {
    // `labelNotchDepth` clamps a notch to half the shorter edge, because a
    // bigger one would fold the outline through itself. The type has to reserve
    // from the clamped depth too: reserving 100 mm on a 35 mm sticker would
    // leave nothing but an ellipsis beside a corner that was only ever 17.5 mm.
    const label = { width: 35, height: 52.5, notch: true, notchSize: 100 };
    const sheet = sheetOf(aRelease(), {}, { ...DEFAULT_PART_DIMENSIONS, label });
    const [album] = textsOf(sheet, 'label');
    if (!album) throw new Error('no album line');

    const clamped = Math.min(label.notchSize, label.width / 2, label.height / 2);
    expect(clamped).toBe(17.5);
    expect(album.at.x + testMeasurer.widthMm(album.text, album.style)).toBeLessThanOrEqual(
      label.width - clamped + album.at.y,
    );
    expect(album.text, 'and there is still a name on the chip').not.toBe('…');
  });

  it('spends one face on all three roles, which is a decision and not an omission', () => {
    // The roles exist so a Template's voice is more than a single choice; this
    // is the Template that declines to spend them, and the other two are what
    // say the collapse was chosen rather than forgotten.
    expect(new Set(Object.values(TEMPLATES.minimal.faces)).size, 'Minimal').toBe(1);
    expect(TEMPLATES.minimal.faces.display, 'and it is the universal one').toBe('sans');
    expect(new Set(Object.values(TEMPLATES.classic.faces)).size, 'Classic').toBe(3);
    expect(new Set(Object.values(TEMPLATES.fullbleed.faces)).size, 'Full-bleed').toBe(2);
  });

  it('draws no negative rectangle on the smallest Insert a project file may carry', () => {
    // A 1 mm Insert is `MIN_PART_MM`, so a file can hold one. The title fit
    // shrinks against the room it has, and this is also what says that loop
    // terminates when there is none: an unbounded one would hang the suite here
    // rather than fail it.
    const sheet = sheetOf(aRelease(), {}, {
      ...DEFAULT_PART_DIMENSIONS,
      insert: { innerFlapWidth: 1, spineWidth: 1, frontPanelWidth: 1, pageWidth: 30, height: 1 },
    });

    const insert = partOf(sheet, 'insert');
    for (const op of insert.ops) {
      if (op.op !== 'fill-rect') continue;
      expect(op.rect.width).toBeGreaterThanOrEqual(0);
      expect(op.rect.height).toBeGreaterThanOrEqual(0);
    }
    // Every op on the strip rather than the ones anchored on the cover Page: at
    // 1 mm a section is narrower than its own `PAD`, so the Front Panel's type is
    // anchored past the Page's right edge. That is the degenerate case working as
    // intended — the drawing is clipped to the Part by `drawPlacement` — and it is
    // why this one test asks the Part rather than the Page.
    expect(
      insert.ops.filter((op) => op.op === 'text').length,
      'and still sets something',
    ).toBeGreaterThan(0);
  });
});
