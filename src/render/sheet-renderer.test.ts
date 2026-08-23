import { describe, expect, it } from 'vitest';

import { A4, LETTER } from '../domain/paper.ts';
import { rectsOverlap } from '../domain/units.ts';
import { DEFAULT_PART_DIMENSIONS, jCardSize, partShape, PART_KINDS } from '../domain/parts.ts';
import type { JCardPanel, PartDimensions, PartKind } from '../domain/parts.ts';
import type { Release } from '../domain/release.ts';
import type { Rect } from '../domain/units.ts';
import {
  DEFAULT_TEMPLATE_PARAMS,
  renderSheets,
  TEMPLATE_TOGGLES,
  TEMPLATES,
} from './sheet-renderer.ts';
import type {
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
 * Five call sites are about them — two nudged Labels and three 1 mm J-Cards out
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
 * own faces, grounds its Back Card in a colour, keeps its heading clear of its
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

/** The ticket's tolerance: Part bounding boxes within ±0.2 mm of the defaults. */
const expectMm = (actual: number, expected: number, what: string): void => {
  expect(Math.abs(actual - expected), `${what}: expected ${expected} mm, got ${actual} mm`).toBeLessThanOrEqual(0.2);
};

describe('SheetRenderer — Part geometry', () => {
  it('renders the three Parts of one Release at their physical defaults', () => {
    const [sheet] = renderSheetsAt([aDesign()], A4_SHEET);
    if (!sheet) throw new Error('no sheet rendered');

    // J-Card unfolded: Inner Flap 14 + Spine 5.5 + Front Panel 68, height 79 (ADR-0005).
    const jcard = boundsOf(sheet, 'jcard');
    expectMm(jcard.width, 87.5, 'J-Card width');
    expectMm(jcard.height, 79, 'J-Card height');

    const backCard = boundsOf(sheet, 'back-card');
    expectMm(backCard.width, 69, 'Back Card width');
    expectMm(backCard.height, 79, 'Back Card height');

    const label = boundsOf(sheet, 'label');
    expectMm(label.width, 35, 'Label width');
    expectMm(label.height, 52.5, 'Label height');
  });

  it('puts all three Parts of a single Release on one A4 Sheet', () => {
    const sheets = renderSheetsAt([aDesign()], A4_SHEET);

    expect(sheets).toHaveLength(1);
    expect(sheets[0]?.paper.name).toBe('A4');
    expect(sheets[0]?.placements.map((placement) => placement.part).sort()).toEqual([
      'back-card',
      'jcard',
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

describe('SheetRenderer — J-Card panels and guides', () => {
  it('folds the J-Card into Inner Flap 14, Spine 5.5 and Front Panel 68', () => {
    const [sheet] = renderSheetsAt([aDesign()], A4_SHEET);
    const jcard = sheet?.placements.find((placement) => placement.part === 'jcard');
    const panels = Object.fromEntries((jcard?.panels ?? []).map((panel) => [panel.panel, panel.rect]));

    expectMm(panels['inner-flap']?.x ?? -1, 0, 'Inner Flap x');
    expectMm(panels['inner-flap']?.width ?? -1, 14, 'Inner Flap width');
    expectMm(panels['spine']?.x ?? -1, 14, 'Spine x');
    expectMm(panels['spine']?.width ?? -1, 5.5, 'Spine width');
    expectMm(panels['front-panel']?.x ?? -1, 19.5, 'Front Panel x');
    expectMm(panels['front-panel']?.width ?? -1, 68, 'Front Panel width');
    for (const panel of Object.values(panels)) expectMm(panel.height, 79, 'panel height');
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

  it('marks fold guides on the J-Card only, at both panel boundaries', () => {
    const [sheet] = renderSheetsAt([aDesign()], A4_SHEET);
    const foldsByPart = new Map(
      (sheet?.placements ?? []).map((placement) => [
        placement.part,
        placement.guides.filter((guide) => guide.kind === 'fold'),
      ]),
    );

    expect(foldsByPart.get('back-card')).toEqual([]);
    expect(foldsByPart.get('label')).toEqual([]);

    const folds = foldsByPart.get('jcard') ?? [];
    expect(folds).toHaveLength(2);
    const foldXs = folds.map((fold) => fold.points[0]?.x ?? -1).sort((a, b) => a - b);
    expectMm(foldXs[0] ?? -1, 14, 'first fold');
    expectMm(foldXs[1] ?? -1, 19.5, 'second fold');

    for (const fold of folds) {
      expect(fold.closed).toBe(false);
      expectMm(fold.points[0]?.y ?? -1, 0, 'fold start');
      expectMm(fold.points[1]?.y ?? -1, 79, 'fold end');
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
  it('prints every track of the Release on the Back Card', () => {
    const release = aRelease();
    const [sheet] = renderSheetsAt([aDesign(release)], A4_SHEET);
    const backCard = sheet?.placements.find((placement) => placement.part === 'back-card');
    const printed = (backCard?.ops ?? []).flatMap((op) => (op.op === 'text' ? [op.text] : []));

    for (const track of release.tracks) {
      expect(printed.some((line) => line.startsWith(`${track.position}. `))).toBe(true);
    }
  });

  it('carries artist and album onto Front Panel and Spine', () => {
    const [sheet] = renderSheetsAt([aDesign()], A4_SHEET);
    const jcard = sheet?.placements.find((placement) => placement.part === 'jcard');
    const texts = (jcard?.ops ?? []).flatMap((op) => (op.op === 'text' ? [op] : []));

    const frontPanel = jcard?.panels?.find((panel) => panel.panel === 'front-panel')?.rect;
    const spine = jcard?.panels?.find((panel) => panel.panel === 'spine')?.rect;
    if (!frontPanel || !spine) throw new Error('J-Card has no panels');

    const within = (rect: Rect, x: number): boolean => x >= rect.x && x <= rect.x + rect.width;
    const onFrontPanel = texts.filter((op) => within(frontPanel, op.at.x)).map((op) => op.text);
    expect(onFrontPanel).toContain('Glen Campbell');
    expect(onFrontPanel).toContain('Wichita Lineman');

    // The Spine reads along the case edge, so its line is rotated.
    const onSpine = texts.filter((op) => within(spine, op.at.x) && !within(frontPanel, op.at.x));
    expect(onSpine).toHaveLength(1);
    expect(onSpine[0]?.text).toBe('Glen Campbell — Wichita Lineman');
    expect(onSpine[0]?.style.rotationDeg).toBe(-90);
  });

  it('places the uploaded artwork on Front Panel and Label', () => {
    const artwork = { dataUrl: 'data:image/png;base64,AAAA', widthPx: 600, heightPx: 600 };
    const [sheet] = renderSheetsAt([aDesign(aRelease({ artwork }))], A4_SHEET);

    for (const part of ['jcard', 'label'] as const) {
      const placement = sheet?.placements.find((candidate) => candidate.part === part);
      const images = (placement?.ops ?? []).filter((op) => op.op === 'image' && op.role === 'artwork');
      expect(images, `${part} artwork`).toHaveLength(1);
    }
  });
});

describe('SheetRenderer — a Part packed on its side (ADR-0014)', () => {
  /**
   * A J-Card the width of a Sheet. Nothing in the app draws one — the Insert
   * that will is ticket 08 — but a project file can: `readDimensions` clamps
   * each measurement to 1–300 mm and nothing narrows a J-Card to the paper, so
   * this is a Queue a collector can already open.
   */
  const WIDE_JCARD: PartDimensions = {
    ...DEFAULT_PART_DIMENSIONS,
    jcard: { ...DEFAULT_PART_DIMENSIONS.jcard, frontPanelWidth: 250 },
  };

  it('leaves every Part standing up at the measurements the app ships with', () => {
    const [sheet] = renderSheetsAt([aDesign()], A4_SHEET);

    expect(sheet?.placements.map((placement) => placement.turned)).toEqual([false, false, false]);
  });

  it('turns a J-Card too wide for the paper rather than refusing it', () => {
    const [sheet] = renderSheetsAt([aDesign()], A4_SHEET, WIDE_JCARD);
    if (!sheet) throw new Error('no sheet rendered');

    const jcard = sheet.placements.find((placement) => placement.part === 'jcard');
    // 14 + 5.5 + 250 is 269.5 across, against 200 mm of printable width; on its
    // side it is 79 × 269.5 and clears the 287 mm bed.
    expect(jcard?.turned).toBe(true);
    expect(jcard?.bounds.width).toBe(79);
    expect(jcard?.bounds.height).toBe(269.5);

    // And the Parts that fit stay as they are, on the same Sheet.
    for (const part of ['back-card', 'label'] as const) {
      expect(sheet.placements.find((placement) => placement.part === part)?.turned).toBe(false);
    }
  });

  it('keeps the drawing, the cut outline and the folds in the Part’s own upright millimetres', () => {
    const [sheet] = renderSheetsAt([aDesign()], A4_SHEET, WIDE_JCARD);
    const jcard = sheet?.placements.find((placement) => placement.part === 'jcard');
    if (!jcard) throw new Error('no J-Card');

    // The turn belongs to the Sheet. A Template is never asked which way up its
    // Part was packed, so everything here reads 269.5 across and 79 down — the
    // opposite way round from the bounds above.
    const cut = jcard.guides.find((guide) => guide.kind === 'cut');
    expect(Math.max(...(cut?.points ?? []).map((point) => point.x))).toBe(269.5);
    expect(Math.max(...(cut?.points ?? []).map((point) => point.y))).toBe(79);

    const frontPanel = jcard.panels?.find((panel) => panel.panel === 'front-panel');
    expect(frontPanel?.rect).toEqual({ x: 19.5, y: 0, width: 250, height: 79 });

    const folds = jcard.guides.filter((guide) => guide.kind === 'fold');
    expect(folds.map((fold) => fold.points[0]?.x)).toEqual([14, 19.5]);
    expect(folds.every((fold) => fold.points[1]?.y === 79)).toBe(true);
  });

  it('fills the room under a Part once the Label is small enough to sit there', () => {
    // The other half of ADR-0014, and the one a collector can reach today. On
    // the J-Card's 79 mm row a 35 mm Label leaves room for another up to 40 mm
    // tall once the 4 mm gap is taken off, so five Releases of J-Cards and
    // Labels at a 10 mm printable margin come off one Sheet instead of two.
    // 37.5 mm is where that starts: any taller and two of them do not fit.
    const nudged: PartDimensions = {
      ...DEFAULT_PART_DIMENSIONS,
      label: { ...DEFAULT_PART_DIMENSIONS.label, width: 30, height: 35 },
    };
    const five = Array.from({ length: 5 }, (_, index) =>
      aDesign(aRelease({ id: `r${index}`, album: `Album ${index}` })),
    );

    const sheets = renderSheetsAt(
      five,
      { paper: A4, marginMm: 10, parts: ['jcard', 'label'] },
      nudged,
    );

    expect(sheets).toHaveLength(1);
    expect(sheets[0]?.placements).toHaveLength(10);

    // Two Labels sharing a left edge, one under the other: a column, not a row.
    const labels = (sheets[0]?.placements ?? []).filter((placement) => placement.part === 'label');
    const columns = new Map<number, number>();
    for (const label of labels) columns.set(label.bounds.x, (columns.get(label.bounds.x) ?? 0) + 1);
    expect(Math.max(...columns.values())).toBeGreaterThan(1);
  });

  it('still refuses a Part that no turn can save, and says what to do about it', () => {
    // 500 mm of Front Panel is longer than A4 either way round.
    const enormous: PartDimensions = {
      ...DEFAULT_PART_DIMENSIONS,
      jcard: { ...DEFAULT_PART_DIMENSIONS.jcard, frontPanelWidth: 500 },
    };

    expect(() => renderSheetsAt([aDesign()], A4_SHEET, enormous)).toThrow(
      /the J-Card of Wichita Lineman .* does not fit A4 with a printable margin of 5 mm, turned or not/,
    );
    // And the advice is the honest one: no margin rescues a 519.5 mm strip.
    expect(() => renderSheetsAt([aDesign()], A4_SHEET, enormous)).toThrow(
      /No margin makes room for it: A4 is too small\./,
    );
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

    expect(placements).toHaveLength(6);
    for (const releaseId of ['a', 'b']) {
      const own = placements.filter((placement) => placement.releaseId === releaseId);
      expect(own).toHaveLength(3);
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

    expect(placements).toHaveLength(24);
    expect(sheets.length).toBeGreaterThan(1);
  });
});

describe('SheetRenderer — Template parameters', () => {
  const opsFor = (design: ReleaseDesign, part: 'jcard' | 'back-card' | 'label') => {
    const [sheet] = renderSheetsAt([design], A4_SHEET);
    return sheet?.placements.find((placement) => placement.part === part)?.ops ?? [];
  };

  const textsOn = (design: ReleaseDesign, part: 'jcard' | 'back-card' | 'label'): string[] =>
    opsFor(design, part).flatMap((op) => (op.op === 'text' ? [op.text] : []));

  const logosOn = (design: ReleaseDesign, part: 'jcard' | 'back-card' | 'label') =>
    opsFor(design, part).filter((op) => op.op === 'image' && op.role === 'logo');

  it('lets each Release choose its own Template', () => {
    const artwork = { dataUrl: 'data:image/png;base64,AAAA', widthPx: 600, heightPx: 600 };
    const classic = aDesign(aRelease({ id: 'a', artwork }), { templateId: 'classic' });
    const fullbleed = aDesign(aRelease({ id: 'b', artwork }), { templateId: 'fullbleed' });

    const artworkRect = (design: ReleaseDesign): Rect => {
      const op = opsFor(design, 'jcard').find((candidate) => candidate.op === 'image' && candidate.role === 'artwork');
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

    // Across all three Parts rather than the Back Card alone, which used to
    // carry all three colours and now grounds itself in one of them.
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

    expect(textsOn(withText, 'jcard')).toContain('Glen Campbell');
    expect(textsOn(withoutText, 'jcard')).not.toContain('Glen Campbell');
    // The Spine still carries artist and album: it is not "over the cover".
    expect(textsOn(withoutText, 'jcard')).toContain('Glen Campbell — Wichita Lineman');
    // And the Back Card is untouched, or the tracklist would vanish with it:
    // album, artist and one line per track.
    expect(textsOn(withoutText, 'back-card')).toHaveLength(2 + aRelease().tracks.length);
  });

  it('puts the MiniDisc logo on Front Panel and Spine when it is enabled', () => {
    const design = aDesign(aRelease(), { params: { showLogo: true } });
    const [sheet] = renderSheetsAt([design], A4_SHEET);
    const jcard = sheet?.placements.find((placement) => placement.part === 'jcard');
    const panels = Object.fromEntries((jcard?.panels ?? []).map((p) => [p.panel, p.rect]));
    const logos = (jcard?.ops ?? []).filter((op) => op.op === 'image' && op.role === 'logo');

    expect(logos).toHaveLength(2);
    const within = (rect: { x: number; width: number }, x: number): boolean =>
      x >= rect.x && x <= rect.x + rect.width;
    const spine = panels['spine'];
    const front = panels['front-panel'];
    if (!spine || !front) throw new Error('J-Card has no panels');

    expect(logos.some((op) => op.op === 'image' && within(spine, op.rect.x))).toBe(true);
    expect(logos.some((op) => op.op === 'image' && within(front, op.rect.x))).toBe(true);
  });

  it('leaves the logo off entirely when it is disabled', () => {
    const design = aDesign(aRelease(), { params: { showLogo: false } });

    expect(logosOn(design, 'jcard')).toEqual([]);
  });

  it('keeps the logo inside the Part it sits on', () => {
    const design = aDesign(aRelease(), { params: { showLogo: true } });
    const [sheet] = renderSheetsAt([design], A4_SHEET);
    const jcard = sheet?.placements.find((placement) => placement.part === 'jcard');
    const { width, height } = jCardSize(DEFAULT_PART_DIMENSIONS.jcard);
    const logos = (jcard?.ops ?? []).filter((op) => op.op === 'image' && op.role === 'logo');

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
    const [sheet] = renderSheetsAt([design], A4_SHEET);
    const jcard = sheet?.placements.find((placement) => placement.part === 'jcard');
    const ops = jcard?.ops ?? [];

    const logo = ops.find((op) => op.op === 'image' && op.role === 'logo' && !op.rotationDeg);
    if (logo?.op !== 'image') throw new Error('no upright logo on the Front Panel');

    const frontPanel = jcard?.panels?.find((panel) => panel.panel === 'front-panel')?.rect;
    if (!frontPanel) throw new Error('J-Card has no Front Panel');

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
    const [sheet] = renderSheetsAt([aDesign()], A4_SHEET);
    const jcard = sheet?.placements.find((placement) => placement.part === 'jcard');
    const spine = jcard?.panels?.find((panel) => panel.panel === 'spine')?.rect;
    if (!spine) throw new Error('J-Card has no Spine');

    const onSpine = (x: number): boolean => x >= spine.x && x <= spine.x + spine.width;
    const spineLogo = (jcard?.ops ?? []).find(
      (op) => op.op === 'image' && op.role === 'logo' && onSpine(op.rect.x),
    );
    const spineText = (jcard?.ops ?? []).find((op) => op.op === 'text' && onSpine(op.at.x));

    expect(spineLogo?.op === 'image' && spineLogo.rotationDeg).toBe(-90);
    expect(spineText?.op === 'text' && spineText.style.rotationDeg).toBe(-90);
  });

  it('keeps Spine type readable however dark the accent colour is', () => {
    const dark = aDesign(aRelease(), {
      params: { accentColor: '#101418', paperColor: '#0b0b0b', inkColor: '#0b0b0b' },
    });
    const [sheet] = renderSheetsAt([dark], A4_SHEET);
    const jcard = sheet?.placements.find((placement) => placement.part === 'jcard');
    const spine = jcard?.panels?.find((panel) => panel.panel === 'spine')?.rect;
    if (!spine) throw new Error('J-Card has no Spine');

    const spineText = (jcard?.ops ?? []).find(
      (op) => op.op === 'text' && op.at.x >= spine.x && op.at.x <= spine.x + spine.width,
    );

    // Dark paper on a dark accent would print the Spine as a solid block.
    expect(spineText?.op === 'text' && spineText.style.color).toBe('#ffffff');
  });

  it('reads the Spine bottom-to-top, the way a shelved case is read', () => {
    const [sheet] = renderSheetsAt([aDesign()], A4_SHEET);
    const jcard = sheet?.placements.find((placement) => placement.part === 'jcard');
    const spine = jcard?.panels?.find((panel) => panel.panel === 'spine')?.rect;
    if (!spine) throw new Error('J-Card has no Spine');

    const spineText = (jcard?.ops ?? []).find(
      (op) => op.op === 'text' && op.at.x >= spine.x && op.at.x <= spine.x + spine.width,
    );

    expect(spineText?.op).toBe('text');
    expect(spineText?.op === 'text' && spineText.style.rotationDeg).toBe(-90);
    expect(spineText?.op === 'text' && spineText.text).toBe('Glen Campbell — Wichita Lineman');
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
  const backCardText = (trackCount: number): Array<{ text: string; x: number; y: number; sizeMm: number }> => {
    const release = aRelease({
      tracks: Array.from({ length: trackCount }, (_, index) => ({
        position: index + 1,
        title: `Track ${index + 1}`,
      })),
    });
    const [sheet] = renderSheetsAt([aDesign(release)], A4_SHEET);
    const backCard = sheet?.placements.find((placement) => placement.part === 'back-card');
    return (backCard?.ops ?? []).flatMap((op) =>
      op.op === 'text' ? [{ text: op.text, x: op.at.x, y: op.at.y, sizeMm: op.style.sizeMm }] : [],
    );
  };

  const trackLines = (trackCount: number) =>
    backCardText(trackCount).filter((line) => /^\d+\./.test(line.text));

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

  it('keeps every track inside the Back Card', () => {
    const [sheet] = renderSheetsAt(
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
    );
    const backCard = sheet?.placements.find((placement) => placement.part === 'back-card');
    if (!backCard) throw new Error('no Back Card');

    for (const op of backCard.ops) {
      if (op.op !== 'text') continue;
      expect(op.at.y + op.style.sizeMm, op.text).toBeLessThanOrEqual(backCard.bounds.height);
      expect(op.at.x, op.text).toBeGreaterThanOrEqual(0);
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

  it('warns once per Release, from the Back Card that carries the list', () => {
    // Three Parts are drawn; only one of them has a tracklist on it.
    const sheet = sheetFor(200);

    expect(sheet?.placements).toHaveLength(3);
    expect(sheet?.warnings).toHaveLength(1);
  });

  it('reports nothing when the job does not print the Back Card at all', () => {
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
    const jcard = sheet?.placements.find((placement) => placement.part === 'jcard');
    const panels = jcard?.panels?.find((bounds) => bounds.panel === 'spine')?.rect;
    if (!jcard || !panels) throw new Error('no Spine');
    // The Spine's line is the one rotated text op inside the Spine panel.
    const found = jcard.ops.find(
      (op) =>
        op.op === 'text' &&
        op.style.rotationDeg === -90 &&
        op.at.x > panels.x &&
        op.at.x < panels.x + panels.width,
    );
    if (found?.op !== 'text') throw new Error('no Spine text');
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
    // A project file may carry a 1 mm J-Card (`MIN_PART_MM`), which leaves the
    // Spine a negative width — `ellipsise` then returns a bare ellipsis for
    // anything at all, and a Release with nothing to say has lost nothing.
    const sheets = renderSheetsAt(
      [aDesign(aRelease({ artist: '', album: '' }))],
      { ...A4_SHEET, parts: ['jcard'] },
      { ...DEFAULT_PART_DIMENSIONS, jcard: { ...DEFAULT_PART_DIMENSIONS.jcard, height: 1 } },
    );

    expect(sheets[0]?.warnings).toBeUndefined();
  });

  it('reports nothing when the job does not print the J-Card at all', () => {
    const sheets = renderSheetsAt(
      [aDesign(aRelease({ album: TOO_LONG }))],
      { ...A4_SHEET, parts: ['back-card', 'label'] },
    );

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
    const [sheet] = renderSheetsAt([aDesign()], A4_SHEET);

    // The Spine is the one line on the J-Card that reads sideways up the edge.
    const spineOp = textOpsOf(sheet, 'jcard').find(
      (op) => op.style.rotationDeg === -90 && op.text.startsWith('Glen Campbell — '),
    );
    expect(spineOp?.style.face, 'the Spine').toBe(spine);

    // The Front Panel's caption is display type; the tracklist under the rule is not.
    const upright = textOpsOf(sheet, 'jcard').filter((op) => !op.style.rotationDeg);
    expect(upright.length, 'the Front Panel is captioned').toBeGreaterThan(0);
    expect(upright.map((op) => op.style.face), 'the Front Panel').toEqual(
      upright.map(() => display),
    );

    const tracks = textOpsOf(sheet, 'back-card').filter((op) => /^\d+\. /.test(op.text));
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
        { ...A4_SHEET, parts: ['jcard'] },
        DEFAULT_PART_DIMENSIONS,
        recordingMeasurer().measure,
      );
      return sheet;
    };

    const classic = sheetFor('classic');
    const fullbleed = sheetFor('fullbleed');
    const spineTextOf = (sheet: SheetLayout | undefined): string | undefined =>
      textOpsOf(sheet, 'jcard').find(
        (op) => op.style.rotationDeg === -90 && op.text.startsWith('Glen Campbell'),
      )?.text;

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
    const [sheet] = renderSheetsAt(
      [aDesign(aRelease({ artwork }), { params })],
      { ...A4_SHEET, parts: ['jcard'] },
    );
    const jcard = sheet?.placements.find((placement) => placement.part === 'jcard');
    const panel = jcard?.panels?.find((each) => each.panel === 'front-panel')?.rect;
    if (!jcard || !panel) throw new Error('no Front Panel');

    const art = jcard.ops.find((op) => op.op === 'image' && op.role === 'artwork');
    if (art?.op !== 'image') throw new Error('no artwork on the J-Card');
    const captions = jcard.ops.flatMap((op) =>
      op.op === 'text' && !op.style.rotationDeg && op.at.x >= panel.x ? [op] : [],
    );
    return { panel, art: art.rect, captions, ops: jcard.ops };
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

  it('draws no negative rectangle on the smallest J-Card a project file may carry', () => {
    // A 1 mm J-Card is `MIN_PART_MM`, so a file can hold one. Unclamped, the
    // bled artwork would be 13 mm shorter than nothing.
    for (const insetArtwork of [false, true]) {
      const [sheet] = renderSheetsAt(
        [aDesign(aRelease({ artwork }), { params: { insetArtwork } })],
        { ...A4_SHEET, parts: ['jcard'] },
        {
          ...DEFAULT_PART_DIMENSIONS,
          jcard: { innerFlapWidth: 1, spineWidth: 1, frontPanelWidth: 1, height: 1 },
        },
      );
      const art = sheet?.placements[0]?.ops.find((op) => op.op === 'image' && op.role === 'artwork');
      if (art?.op !== 'image') throw new Error('no artwork');

      expect(art.rect.width, `inset ${insetArtwork}: width`).toBeGreaterThanOrEqual(0);
      expect(art.rect.height, `inset ${insetArtwork}: height`).toBeGreaterThanOrEqual(0);
    }
  });

  it('leaves Full-bleed alone, whose artwork bleeds on all four edges anyway', () => {
    const [sheet] = renderSheetsAt(
      [aDesign(aRelease({ artwork }), { templateId: 'fullbleed', params: { insetArtwork: true } })],
      { ...A4_SHEET, parts: ['jcard'] },
    );
    const jcard = sheet?.placements.find((placement) => placement.part === 'jcard');
    const panel = jcard?.panels?.find((each) => each.panel === 'front-panel')?.rect;
    const art = jcard?.ops.find((op) => op.op === 'image' && op.role === 'artwork');
    if (!panel || art?.op !== 'image') throw new Error('no artwork on the Front Panel');

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

  const backCard = (templateId: TemplateId, params = DARK, release = aRelease()) => {
    const [sheet] = renderSheetsAt(
      [aDesign(release, { templateId, params })],
      { ...A4_SHEET, parts: ['back-card'] },
    );
    const placement = sheet?.placements.find((each) => each.part === 'back-card');
    if (!placement) throw new Error('no Back Card');
    const texts = placement.ops.flatMap((op) => (op.op === 'text' ? [op] : []));
    return { sheet, placement, ops: placement.ops, texts };
  };

  it('grounds the Back Card in a colour the Release chose, edge to edge', () => {
    for (const [templateId, colour] of [
      ['classic', DARK.accentColor],
      ['fullbleed', DARK.inkColor],
      // Minimal grounds in the ink, as Full-bleed does, but for the opposite
      // reason: there is no artwork here for the ink to have been a scrim over,
      // so the card is simply the Front Panel with paper and ink exchanged.
      ['minimal', DARK.inkColor],
    ] as const) {
      const { ops, placement } = backCard(templateId);
      const ground = ops[0];

      expect(ground?.op, templateId).toBe('fill-rect');
      if (ground?.op !== 'fill-rect') throw new Error('no ground');
      expect(ground.color, templateId).toBe(colour);
      expect(ground.rect, templateId).toEqual({
        x: 0,
        y: 0,
        width: placement.bounds.width,
        height: placement.bounds.height,
      });
    }
  });

  it('reverses every line out of the ground it sits on', () => {
    for (const templateId of TEMPLATE_IDS) {
      const dark = backCard(templateId, DARK).texts.map((op) => op.style.color);
      const light = backCard(templateId, LIGHT).texts.map((op) => op.style.color);

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
    const classicFills = backCard('classic').ops.filter((op) => op.op === 'fill-rect');
    const minimalFills = backCard('minimal').ops.filter((op) => op.op === 'fill-rect');
    const { ops, placement } = backCard('fullbleed');
    const fullbleedFills = ops.filter((op) => op.op === 'fill-rect');

    expect(classicFills, 'Classic grounds the card and stops').toHaveLength(1);
    expect(minimalFills, 'Minimal grounds the card and stops').toHaveLength(1);
    expect(fullbleedFills, 'Full-bleed grounds it and bands the top').toHaveLength(2);

    const band = fullbleedFills[1];
    if (band?.op !== 'fill-rect') throw new Error('no band');
    expect(band.color).toBe(DARK.accentColor);
    expect(band.rect.x).toBe(0);
    expect(band.rect.y).toBe(0);
    expect(band.rect.width).toBe(placement.bounds.width);
    expect(band.rect.height).toBeLessThan(placement.bounds.height / 3);
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

    const fullbleed = backCard('fullbleed', MIXED).texts;
    expect(fullbleed.filter((op) => !isTrack(op)).map((op) => op.style.color)).toEqual([
      '#111111',
      '#111111',
    ]);
    expect([...new Set(fullbleed.filter(isTrack).map((op) => op.style.color))]).toEqual(['#ffffff']);

    // Classic has one ground, so it has one ink — which is the contrast that
    // makes the assertion above about the band rather than about luck.
    expect([...new Set(backCard('classic', MIXED).texts.map((op) => op.style.color))]).toEqual([
      '#111111',
    ]);
  });

  it('leaves the lonely hairline rule behind', () => {
    for (const templateId of TEMPLATE_IDS) {
      expect(
        backCard(templateId).ops.filter((op) => op.op === 'line'),
        `${templateId} draws no rule`,
      ).toEqual([]);
    }
  });

  it('draws three visibly different cards for one Release', () => {
    const classic = backCard('classic');
    const fullbleed = backCard('fullbleed');
    const minimal = backCard('minimal');

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
      const used = backCard(templateId).texts.map((op) => op.style.face);

      expect(used.length, templateId).toBeGreaterThan(0);
      expect(used.filter((face) => !declared.includes(face)), templateId).toEqual([]);
    }
  });

  it('prints a playing time beside every track that has one', () => {
    for (const templateId of TEMPLATE_IDS) {
      const { texts } = backCard(templateId, DARK, timed(10));
      const times = texts.filter((op) => /^\d+:\d\d$/.test(op.text));

      expect(times, `${templateId} sets ten times`).toHaveLength(10);
      expect(times.map((op) => op.text), templateId).toContain('3:20');
      expect([...new Set(times.map((op) => op.style.align))], templateId).toEqual(['right']);
    }
  });

  it('prints no time at all for a Release that has none', () => {
    for (const templateId of TEMPLATE_IDS) {
      const { texts } = backCard(templateId, DARK, aRelease());
      expect(texts.filter((op) => /^\d+:\d\d$/.test(op.text)), templateId).toEqual([]);
    }
  });

  it('keeps 25 timed tracks in two columns, times and all', () => {
    for (const templateId of TEMPLATE_IDS) {
      const { texts } = backCard(templateId, DARK, timed(25));
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
      const modest = backCard(templateId, DARK, timed(25));
      const enormous = backCard(templateId, DARK, timed(200));

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
      const { texts } = backCard(templateId, DARK, timed(200));
      const listSize = texts.find((op) => /^\d+\. /.test(op.text))?.style.sizeMm ?? 0;
      const timeSizes = [...new Set(texts.filter((op) => /^\d+:\d\d$/.test(op.text)).map((op) => op.style.sizeMm))];

      expect(listSize, `${templateId} shrank`).toBeLessThan(2.4);
      expect(timeSizes, `${templateId} sets its times at the fitted size`).toEqual([listSize]);
    }
  });

  it('keeps the heading clear of the first track', () => {
    // Every millimetre in the Back Card layout comments is load-bearing and
    // none of them was pinned: a heading one line too low, or a list top one
    // line too high, prints the album through track 1.
    for (const templateId of TEMPLATE_IDS) {
      const { texts } = backCard(templateId, DARK, timed(10));
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
      const heading = backCard(templateId, DARK, timed(10))
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
    const { ops, texts } = backCard('fullbleed');
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

  it('sets no line wider than the card it is on', () => {
    for (const templateId of TEMPLATE_IDS) {
      const { texts, placement } = backCard(templateId, DARK, timed(10));
      const room = placement.bounds.width - 2 * PAD_MM;

      for (const op of texts) {
        const width = testMeasurer.widthMm(op.text, op.style);
        expect(width, `${templateId}: ${op.text}`).toBeLessThanOrEqual(room + 0.001);
      }
    }
  });

  it('keeps every mark on the card, times included', () => {
    for (const templateId of TEMPLATE_IDS) {
      const { texts, placement } = backCard(templateId, DARK, timed(70));

      for (const op of texts) {
        expect(op.at.y + op.style.sizeMm, `${templateId}: ${op.text}`).toBeLessThanOrEqual(
          placement.bounds.height,
        );
        expect(op.at.x, `${templateId}: ${op.text}`).toBeGreaterThanOrEqual(0);
        expect(op.at.x, `${templateId}: ${op.text}`).toBeLessThanOrEqual(placement.bounds.width);
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
   * The Front Panel's type, which is the J-Card's upright type: the Spine's one
   * line and the Inner Flap's caption both read sideways.
   */
  const frontTexts = (sheet: SheetLayout): TextOp[] =>
    textsOf(sheet, 'jcard').filter((op) => !op.style.rotationDeg);

  const panelOf = (sheet: SheetLayout, panel: JCardPanel): Rect => {
    const rect = partOf(sheet, 'jcard').panels?.find((each) => each.panel === panel)?.rect;
    if (!rect) throw new Error(`no ${panel}`);
    return rect;
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

  /** The one line at the foot of the Front Panel and of the Label. */
  const footerOf = (sheet: SheetLayout, part: PartKind): string | undefined =>
    (part === 'jcard' ? frontTexts(sheet) : textsOf(sheet, part)).find((op) =>
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
      { ...A4_SHEET, parts: ['jcard'] },
    );
    expect(
      (classic?.placements[0]?.ops ?? []).filter((op) => op.op === 'fill-rect' && translucent(op)),
      'Classic tints the panel a Release has no artwork for',
    ).toHaveLength(1);

    // And no image at all on the two Parts that have no Spine to carry a logo.
    expect(partOf(sheet, 'back-card').ops.filter((op) => op.op === 'image')).toEqual([]);
    expect(partOf(sheet, 'label').ops.filter((op) => op.op === 'image')).toEqual([]);
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
    const jcard = partOf(sheetOf(), 'jcard');
    const images = jcard.ops.flatMap((op) => (op.op === 'image' ? [op] : []));
    const spine = panelOf(sheetOf(), 'spine');

    expect(images, 'one logo, on the Spine').toHaveLength(1);
    expect(images[0]?.role).toBe('logo');
    expect(images[0]?.rect.x).toBeGreaterThanOrEqual(spine.x);
    expect((images[0]?.rect.x ?? 0) + (images[0]?.rect.width ?? 0)).toBeLessThanOrEqual(
      spine.x + spine.width,
    );

    // And the toggle still switches off the one that is left.
    expect(
      partOf(sheetOf(aRelease(), { showLogo: false }), 'jcard').ops.filter(
        (op) => op.op === 'image',
      ),
    ).toEqual([]);
  });

  it('captions every Part when type over the artwork is switched off', () => {
    // `showOverlayText` governs type drawn *over* artwork, and this Template has
    // no artwork for type to be over — so none of its type is gated on it. The
    // same reasoning ticket 03 applied to Classic's Front Panel caption.
    const sheet = sheetOf(aRelease(), { showOverlayText: false });

    for (const [part, texts] of [
      ['jcard', frontTexts(sheet)],
      ['back-card', textsOf(sheet, 'back-card')],
      ['label', textsOf(sheet, 'label')],
    ] as const) {
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
    // The Template's one ordering, and the thing that separates its Back Card
    // from Full-bleed's, which grounds in the same colour and ranges left too.
    const sheet = sheetOf();

    for (const [part, texts] of [
      ['jcard', frontTexts(sheet)],
      ['back-card', textsOf(sheet, 'back-card')],
      ['label', textsOf(sheet, 'label')],
    ] as const) {
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
      ['back-card', textsOf(sheet, 'back-card')],
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

    // On the Front Panel and on the Label: the two Parts that would otherwise
    // be a name on an empty field.
    expect(footerOf(sheet, 'jcard')).toBe('2 tracks · 8:48');
    expect(footerOf(sheet, 'label')).toBe('2 tracks · 8:48');
  });

  it('says nothing about a running time when one track is missing its own', () => {
    const partly = aRelease({
      tracks: [
        { position: 1, title: 'One More Time', lengthMs: 320840 },
        { position: 2, title: 'Aerodynamic' },
      ],
    });

    expect(footerOf(sheetOf(partly), 'jcard')).toBe('2 tracks');
  });

  it('still looks finished for a Release with no times at all, which is the mixtape', () => {
    // The Template exists for Releases nobody looked up, and those have no
    // durations. The footer has to be worth drawing without them.
    expect(footerOf(sheetOf(), 'jcard')).toBe('3 tracks');
    expect(footerOf(sheetOf(aRelease({ tracks: [{ position: 1, title: 'Only' }] })), 'jcard')).toBe(
      '1 track',
    );
  });

  it('says nothing at all about a Release with no tracks, rather than “0 tracks”', () => {
    // A zero would be a claim about a record instead of the absence of one —
    // the same reason `formatTrackLength` refuses to print 0:00.
    const empty = sheetOf(aRelease({ tracks: [] }));

    expect(footerOf(empty, 'jcard')).toBeUndefined();
    expect(footerOf(empty, 'label')).toBeUndefined();
    // And the Part is still a Part: the name is on it.
    expect(frontTexts(empty).map((op) => op.text).join(' ')).toContain('Wichita');
  });

  it('grounds the Back Card in the ink the Front Panel sets its type in', () => {
    // Minimal's one gesture: the two faces of the case are the same card, the
    // second one printed the other way round.
    const params = { paperColor: '#fffbea', inkColor: '#101820', accentColor: '#7a2f18' };
    const sheet = sheetOf(aRelease(), params);

    const front = partOf(sheet, 'jcard').ops.find((op) => op.op === 'fill-rect');
    expect(front?.op === 'fill-rect' ? front.color : undefined, 'the J-Card is paper').toBe(
      params.paperColor,
    );
    expect([...new Set(frontTexts(sheet).map((op) => op.style.color))], 'set in the ink').toEqual([
      params.inkColor,
    ]);

    const back = partOf(sheet, 'back-card').ops[0];
    expect(back?.op === 'fill-rect' ? back.color : undefined, 'the Back Card is that ink').toBe(
      params.inkColor,
    );
    expect([...new Set(textsOf(sheet, 'back-card').map((op) => op.style.color))]).toEqual([
      '#ffffff',
    ]);
  });

  it('makes the Label a chip of the accent, cut to the corner the cartridge needs', () => {
    const params = { paperColor: '#fffbea', inkColor: '#101820', accentColor: '#7a2f18' };
    const label = partOf(sheetOf(aRelease(), params), 'label');
    const chip = label.ops[0];

    expect(chip?.op, 'the chip is the Part’s own outline').toBe('fill-polygon');
    if (chip?.op !== 'fill-polygon') throw new Error('no chip');
    expect(chip.color).toBe(params.accentColor);
    expect(chip.points).toEqual(partShape('label', DEFAULT_PART_DIMENSIONS).outline);

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

  it('draws no negative rectangle on the smallest J-Card a project file may carry', () => {
    // A 1 mm J-Card is `MIN_PART_MM`, so a file can hold one. The title fit
    // shrinks against the room it has, and this is also what says that loop
    // terminates when there is none: an unbounded one would hang the suite here
    // rather than fail it.
    const sheet = sheetOf(aRelease(), {}, {
      ...DEFAULT_PART_DIMENSIONS,
      jcard: { innerFlapWidth: 1, spineWidth: 1, frontPanelWidth: 1, height: 1 },
    });

    for (const op of partOf(sheet, 'jcard').ops) {
      if (op.op !== 'fill-rect') continue;
      expect(op.rect.width).toBeGreaterThanOrEqual(0);
      expect(op.rect.height).toBeGreaterThanOrEqual(0);
    }
    expect(frontTexts(sheet).length, 'and still sets something').toBeGreaterThan(0);
  });
});
