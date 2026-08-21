import { describe, expect, it } from 'vitest';

import { A4 } from '../domain/paper.ts';
import { rectsOverlap } from '../domain/units.ts';
import { DEFAULT_PART_DIMENSIONS } from '../domain/parts.ts';
import type { PartKind } from '../domain/parts.ts';
import type { Release } from '../domain/release.ts';
import type { Rect } from '../domain/units.ts';
import { renderSheets } from './sheet-renderer.ts';
import type { ReleaseDesign, SheetConfig, SheetLayout, TextMeasurer } from './sheet-renderer.ts';

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

const aDesign = (release: Release = aRelease()): ReleaseDesign => ({
  release,
  templateId: 'classic',
  dimensions: DEFAULT_PART_DIMENSIONS,
});

const A4_SHEET: SheetConfig = { paper: A4, marginMm: 5 };

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
      const images = (placement?.ops ?? []).filter((op) => op.op === 'image');
      expect(images, `${part} artwork`).toHaveLength(1);
    }
  });
});
