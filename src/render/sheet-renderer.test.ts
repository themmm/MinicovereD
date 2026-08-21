import { describe, expect, it } from 'vitest';

import { A4, LETTER } from '../domain/paper.ts';
import { rectsOverlap } from '../domain/units.ts';
import { DEFAULT_PART_DIMENSIONS, PART_KINDS } from '../domain/parts.ts';
import type { PartKind } from '../domain/parts.ts';
import type { Release } from '../domain/release.ts';
import type { Rect } from '../domain/units.ts';
import { DEFAULT_TEMPLATE_PARAMS, renderSheets } from './sheet-renderer.ts';
import type {
  ReleaseDesign,
  SheetConfig,
  SheetLayout,
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
  dimensions: DEFAULT_PART_DIMENSIONS,
});

const A4_SHEET: SheetConfig = { paper: A4, marginMm: 5, parts: PART_KINDS };

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
    const [sheet] = renderSheets([aDesign()], A4_SHEET, testMeasurer);
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
    const sheets = renderSheets([aDesign()], A4_SHEET, testMeasurer);

    expect(sheets).toHaveLength(1);
    expect(sheets[0]?.paper.name).toBe('A4');
    expect(sheets[0]?.placements.map((placement) => placement.part).sort()).toEqual([
      'back-card',
      'jcard',
      'label',
    ]);
  });

  it('keeps every Part inside the printable margin and clear of the others', () => {
    const [sheet] = renderSheets([aDesign()], A4_SHEET, testMeasurer);
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
    const [sheet] = renderSheets([aDesign()], A4_SHEET, testMeasurer);
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
    const [sheet] = renderSheets([aDesign()], A4_SHEET, testMeasurer);

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
    const [sheet] = renderSheets([aDesign()], A4_SHEET, testMeasurer);
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
    const [sheet] = renderSheets([aDesign()], A4_SHEET, testMeasurer);

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
    const [sheet] = renderSheets([aDesign()], A4_SHEET, testMeasurer);
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
    const [sheet] = renderSheets([aDesign(release)], A4_SHEET, testMeasurer);
    const backCard = sheet?.placements.find((placement) => placement.part === 'back-card');
    const printed = (backCard?.ops ?? []).flatMap((op) => (op.op === 'text' ? [op.text] : []));

    for (const track of release.tracks) {
      expect(printed.some((line) => line.startsWith(`${track.position}. `))).toBe(true);
    }
  });

  it('carries artist and album onto Front Panel and Spine', () => {
    const [sheet] = renderSheets([aDesign()], A4_SHEET, testMeasurer);
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
    const [sheet] = renderSheets([aDesign(aRelease({ artwork }))], A4_SHEET, testMeasurer);

    for (const part of ['jcard', 'label'] as const) {
      const placement = sheet?.placements.find((candidate) => candidate.part === part);
      const images = (placement?.ops ?? []).filter((op) => op.op === 'image' && op.role === 'artwork');
      expect(images, `${part} artwork`).toHaveLength(1);
    }
  });
});

describe('SheetRenderer — Sheet configuration', () => {
  it('prints only the Parts the job asked for', () => {
    const sheets = renderSheets([aDesign()], { ...A4_SHEET, parts: ['label'] }, testMeasurer);

    expect(sheets).toHaveLength(1);
    expect(sheets[0]?.placements.map((placement) => placement.part)).toEqual(['label']);
  });

  it('lays the Sheet out on Letter when asked', () => {
    const [sheet] = renderSheets([aDesign()], { ...A4_SHEET, paper: LETTER }, testMeasurer);

    expect(sheet?.paper.id).toBe('letter');
    // Letter is shorter than A4, so the same Parts have to sit higher up.
    const lowest = Math.max(...(sheet?.placements ?? []).map((p) => p.bounds.y + p.bounds.height));
    expect(lowest).toBeLessThanOrEqual(LETTER.height - 5);
  });

  it('keeps Parts out of a widened printable margin', () => {
    const [sheet] = renderSheets([aDesign()], { ...A4_SHEET, marginMm: 15 }, testMeasurer);

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

    const sheets = renderSheets([aDesign(first), aDesign(second)], A4_SHEET, testMeasurer);
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

    const sheets = renderSheets(designs, A4_SHEET, testMeasurer);
    const placements = sheets.flatMap((sheet) => sheet.placements);

    expect(placements).toHaveLength(24);
    expect(sheets.length).toBeGreaterThan(1);
  });
});

describe('SheetRenderer — Template parameters', () => {
  const opsFor = (design: ReleaseDesign, part: 'jcard' | 'back-card' | 'label') => {
    const [sheet] = renderSheets([design], A4_SHEET, testMeasurer);
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

    // Classic insets the artwork as a square inside the Front Panel;
    // Full-bleed runs it to the panel's edges. Same Release, same Sheet.
    const inset = artworkRect(classic);
    const bleed = artworkRect(fullbleed);

    expectMm(inset.width, 62, 'Classic artwork width');
    expectMm(inset.height, 62, 'Classic artwork height');
    expectMm(bleed.width, 68, 'Full-bleed artwork width');
    expectMm(bleed.height, 79, 'Full-bleed artwork height');
  });

  it('paints with the colours the Release was given', () => {
    const green = aDesign(aRelease(), {
      params: { paperColor: '#eaffea', inkColor: '#003300', accentColor: '#007700' },
    });

    const colours = new Set(
      opsFor(green, 'back-card').flatMap((op) =>
        op.op === 'fill-rect' ? [op.color] : op.op === 'text' ? [op.style.color] : op.op === 'line' ? [op.color] : [],
      ),
    );

    expect(colours).toContain('#eaffea');
    expect(colours).toContain('#003300');
    expect(colours).toContain('#007700');
  });

  it('leaves the artwork clean when cover text is switched off', () => {
    const withText = aDesign(aRelease(), { templateId: 'fullbleed' });
    const withoutText = aDesign(aRelease(), {
      templateId: 'fullbleed',
      params: { showCoverText: false },
    });

    expect(textsOn(withText, 'jcard')).toContain('Glen Campbell');
    expect(textsOn(withoutText, 'jcard')).not.toContain('Glen Campbell');
    // The Spine still carries artist and album: it is not "over the cover".
    expect(textsOn(withoutText, 'jcard')).toContain('Glen Campbell — Wichita Lineman');
    // And the Back Card is untouched, or the tracklist would vanish with it.
    expect(textsOn(withoutText, 'back-card').length).toBeGreaterThan(3);
  });

  it('puts the MiniDisc logo on Front Panel and Spine when it is enabled', () => {
    const design = aDesign(aRelease(), { params: { showLogo: true } });
    const [sheet] = renderSheets([design], A4_SHEET, testMeasurer);
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
    const [sheet] = renderSheets([design], A4_SHEET, testMeasurer);
    const jcard = sheet?.placements.find((placement) => placement.part === 'jcard');

    for (const op of jcard?.ops ?? []) {
      if (op.op !== 'image' || op.role !== 'logo') continue;
      expect(op.rect.x, 'logo left').toBeGreaterThanOrEqual(0);
      expect(op.rect.y, 'logo top').toBeGreaterThanOrEqual(0);
      expect(op.rect.x + op.rect.width, 'logo right').toBeLessThanOrEqual(87.5);
      expect(op.rect.y + op.rect.height, 'logo bottom').toBeLessThanOrEqual(79);
    }
  });

  it('reads the Spine bottom-to-top, the way a shelved case is read', () => {
    const [sheet] = renderSheets([aDesign()], A4_SHEET, testMeasurer);
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
