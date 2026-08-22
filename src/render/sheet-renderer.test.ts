import { describe, expect, it } from 'vitest';

import { A4, LETTER } from '../domain/paper.ts';
import { rectsOverlap } from '../domain/units.ts';
import { DEFAULT_PART_DIMENSIONS, jCardSize, PART_KINDS } from '../domain/parts.ts';
import type { PartKind } from '../domain/parts.ts';
import type { Release } from '../domain/release.ts';
import type { Rect } from '../domain/units.ts';
import { DEFAULT_TEMPLATE_PARAMS, renderSheets, TEMPLATES } from './sheet-renderer.ts';
import type {
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
  dimensions: DEFAULT_PART_DIMENSIONS,
});

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
    const [sheet] = renderSheets([design], A4_SHEET, testMeasurer);
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
    const [sheet] = renderSheets([aDesign()], A4_SHEET, testMeasurer);
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
    const [sheet] = renderSheets([dark], A4_SHEET, testMeasurer);
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

describe('SheetRenderer — Label dimensions', () => {
  const labelPlacement = (label: {
    width: number;
    height: number;
    notch: boolean;
    notchSize: number;
  }) => {
    const design: ReleaseDesign = {
      ...aDesign(),
      dimensions: { ...DEFAULT_PART_DIMENSIONS, label },
    };
    const [sheet] = renderSheets([design], A4_SHEET, testMeasurer);
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
    const [sheet] = renderSheets([aDesign(release)], A4_SHEET, testMeasurer);
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
    const [sheet] = renderSheets(
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
      testMeasurer,
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
    const [sheet] = renderSheets([aDesign(release)], A4_SHEET, testMeasurer);
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
    renderSheets(
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
      testMeasurer,
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
    const sheets = renderSheets(
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
      testMeasurer,
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
    renderSheets([aDesign(aRelease(release), overrides)], A4_SHEET, testMeasurer)[0];

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
    const sheets = renderSheets(
      [
        {
          ...aDesign(aRelease({ artist: '', album: '' })),
          dimensions: {
            ...DEFAULT_PART_DIMENSIONS,
            jcard: { ...DEFAULT_PART_DIMENSIONS.jcard, height: 1 },
          },
        },
      ],
      { ...A4_SHEET, parts: ['jcard'] },
      testMeasurer,
    );

    expect(sheets[0]?.warnings).toBeUndefined();
  });

  it('reports nothing when the job does not print the J-Card at all', () => {
    const sheets = renderSheets(
      [aDesign(aRelease({ album: TOO_LONG }))],
      { ...A4_SHEET, parts: ['back-card', 'label'] },
      testMeasurer,
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
      const [sheet] = renderSheets([aDesign(aRelease(), { templateId })], A4_SHEET, testMeasurer);

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
    const [sheet] = renderSheets([aDesign()], A4_SHEET, testMeasurer);

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
      const [sheet] = renderSheets([aDesign(aRelease(), { templateId })], A4_SHEET, measure);

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
    const [sheet] = renderSheets(
      [aDesign(aRelease({ artwork }), { params })],
      { ...A4_SHEET, parts: ['jcard'] },
      testMeasurer,
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
      const [sheet] = renderSheets(
        [
          {
            ...aDesign(aRelease({ artwork }), { params: { insetArtwork } }),
            dimensions: {
              ...DEFAULT_PART_DIMENSIONS,
              jcard: { innerFlapWidth: 1, spineWidth: 1, frontPanelWidth: 1, height: 1 },
            },
          },
        ],
        { ...A4_SHEET, parts: ['jcard'] },
        testMeasurer,
      );
      const art = sheet?.placements[0]?.ops.find((op) => op.op === 'image' && op.role === 'artwork');
      if (art?.op !== 'image') throw new Error('no artwork');

      expect(art.rect.width, `inset ${insetArtwork}: width`).toBeGreaterThanOrEqual(0);
      expect(art.rect.height, `inset ${insetArtwork}: height`).toBeGreaterThanOrEqual(0);
    }
  });

  it('leaves Full-bleed alone, whose artwork bleeds on all four edges anyway', () => {
    const [sheet] = renderSheets(
      [aDesign(aRelease({ artwork }), { templateId: 'fullbleed', params: { insetArtwork: true } })],
      { ...A4_SHEET, parts: ['jcard'] },
      testMeasurer,
    );
    const jcard = sheet?.placements.find((placement) => placement.part === 'jcard');
    const panel = jcard?.panels?.find((each) => each.panel === 'front-panel')?.rect;
    const art = jcard?.ops.find((op) => op.op === 'image' && op.role === 'artwork');
    if (!panel || art?.op !== 'image') throw new Error('no artwork on the Front Panel');

    expect(art.rect).toEqual(panel);
  });
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
    const [sheet] = renderSheets(
      [aDesign(release, { templateId, params })],
      { ...A4_SHEET, parts: ['back-card'] },
      testMeasurer,
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

  it('bands Full-bleed’s heading and leaves Classic’s bare', () => {
    // The structural half of the difference, which colour alone would not
    // catch: Classic is one flat ground, Full-bleed is a ground plus a bar.
    const classicFills = backCard('classic').ops.filter((op) => op.op === 'fill-rect');
    const { ops, placement } = backCard('fullbleed');
    const fullbleedFills = ops.filter((op) => op.op === 'fill-rect');

    expect(classicFills, 'Classic grounds the card and stops').toHaveLength(1);
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

  it('draws two visibly different cards for one Release', () => {
    const classic = backCard('classic');
    const fullbleed = backCard('fullbleed');

    // Different ground, so the two cards are not the same colour.
    expect(classic.ops[0]).not.toEqual(fullbleed.ops[0]);
    // Different alignment: a title page centres its heading, a poster ranges it left.
    const alignments = (card: { texts: TextOp[] }) => [
      ...new Set(card.texts.filter((op) => !/^\d+\./.test(op.text)).map((op) => op.style.align)),
    ];
    expect(alignments(classic)).toEqual(['center']);
    expect(alignments(fullbleed)).toEqual(['left']);
    // And different type, which is what ticket 02 bought.
    const faces = (card: { texts: TextOp[] }) => new Set(card.texts.map((op) => op.style.face));
    expect([...faces(classic)].some((face) => !faces(fullbleed).has(face))).toBe(true);
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
      const lowest = Math.max(...heading.map((op) => op.at.y + op.style.sizeMm));
      expect(lowest, `${templateId} heading bottom`).toBeLessThanOrEqual(firstTrack?.at.y ?? 0);
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
