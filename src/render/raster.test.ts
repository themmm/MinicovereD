import { describe, expect, it } from 'vitest';

import { A4 } from '../domain/paper.ts';
import { DEFAULT_PART_DIMENSIONS } from '../domain/parts.ts';
import { renderCalibrationSheet } from './calibration.ts';
import type { PartPlacement, SheetLayout } from './layout.ts';
import { drawSheet, EXPORT_DPI } from './raster.ts';
import type { Canvas2D } from './raster.ts';

/**
 * A recording stand-in for the browser's 2D context — a system boundary, so
 * faking it is fair game. It exists to check the one thing that decides whether
 * a print physically fits: that a millimetre in the layout model becomes the
 * right number of pixels on the page.
 */
interface Call {
  readonly method: string;
  readonly args: readonly number[];
}

function recordingContext(): Canvas2D & { readonly calls: Call[]; readonly dashes: number[][] } {
  const calls: Call[] = [];
  // `setLineDash` takes an array, and `calls` keeps only the numeric arguments —
  // so the pattern itself needs its own record. It is the whole of how a fold
  // guide says which fold it is on the printed Sheet.
  const dashes: number[][] = [];
  const record =
    (method: string) =>
    (...args: unknown[]): void => {
      calls.push({ method, args: args.filter((arg): arg is number => typeof arg === 'number') });
    };

  return {
    calls,
    dashes,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    font: '',
    textAlign: 'left',
    textBaseline: 'top',
    save: record('save'),
    restore: record('restore'),
    translate: record('translate'),
    rotate: record('rotate'),
    beginPath: record('beginPath'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    closePath: record('closePath'),
    fill: record('fill'),
    stroke: record('stroke'),
    clip: record('clip'),
    fillRect: record('fillRect'),
    fillText: record('fillText'),
    setLineDash: (segments: readonly number[]): void => {
      dashes.push([...segments]);
      record('setLineDash')(segments);
    },
    drawImage: record('drawImage'),
  };
}

/** One Part, 100 mm wide, sitting at the paper's top-left corner. */
const HUNDRED_MM_PART: SheetLayout = {
  paper: A4,
  marginMm: 0,
  placements: [
    {
      releaseId: 'r1',
      part: 'insert',
      bounds: { x: 0, y: 0, width: 100, height: 100 },
      turned: false,
      ops: [{ op: 'fill-rect', rect: { x: 0, y: 0, width: 100, height: 100 }, color: '#fff' }],
      guides: [],
    },
  ],
};

describe('rasterising a Sheet', () => {
  it('draws a 100 mm span as 1181.1 px at 300 DPI', () => {
    const context = recordingContext();

    drawSheet(context, HUNDRED_MM_PART, EXPORT_DPI);

    // 100 mm is 3.937… inches; at 300 DPI that is 1181.1 px.
    const partFill = context.calls.filter((call) => call.method === 'fillRect').at(-1);
    expect(partFill?.args[2]).toBeCloseTo(1181.1, 1);
    expect(partFill?.args[3]).toBeCloseTo(1181.1, 1);
  });

  it('paints the page itself at the A4 pixel size 300 DPI implies', () => {
    const context = recordingContext();

    drawSheet(context, HUNDRED_MM_PART, EXPORT_DPI);

    const pageFill = context.calls.find((call) => call.method === 'fillRect');
    expect(pageFill?.args).toEqual([0, 0, 2480, 3508]);
  });

  it('scales linearly with DPI, so the preview and the export are the same drawing', () => {
    const at300 = recordingContext();
    const at150 = recordingContext();

    drawSheet(at300, HUNDRED_MM_PART, 300);
    drawSheet(at150, HUNDRED_MM_PART, 150);

    const width = (context: ReturnType<typeof recordingContext>): number =>
      context.calls.filter((call) => call.method === 'fillRect').at(-1)?.args[2] ?? 0;
    expect(width(at300) / width(at150)).toBeCloseTo(2, 6);
  });

  it('offsets a Part by its position on the Sheet', () => {
    const context = recordingContext();

    drawSheet(
      context,
      { ...HUNDRED_MM_PART, placements: HUNDRED_MM_PART.placements.map((p) => ({ ...p, bounds: { ...p.bounds, x: 5, y: 5 } })) },
      EXPORT_DPI,
    );

    // 5 mm at 300 DPI is 59.06 px.
    const translate = context.calls.find((call) => call.method === 'translate');
    expect(translate?.args[0]).toBeCloseTo(59.06, 1);
    expect(translate?.args[1]).toBeCloseTo(59.06, 1);
  });

  it('clips a Part to its cutting guide, so nothing prints outside what gets cut', () => {
    const context = recordingContext();
    const [placement] = HUNDRED_MM_PART.placements;
    if (!placement) throw new Error('fixture has no placement');

    drawSheet(context, {
      ...HUNDRED_MM_PART,
      placements: [
        {
          ...placement,
          guides: [
            {
              kind: 'cut',
              closed: true,
              points: [
                { x: 0, y: 0 },
                { x: 100, y: 0 },
                { x: 100, y: 100 },
                { x: 0, y: 100 },
              ],
            },
          ],
        },
      ],
    }, EXPORT_DPI);

    const clipAt = context.calls.findIndex((call) => call.method === 'clip');
    const fillAt = context.calls.map((call) => call.method).lastIndexOf('fillRect');
    expect(clipAt, 'the Part is clipped').toBeGreaterThan(-1);
    expect(fillAt, 'content is drawn inside the clip').toBeGreaterThan(clipAt);
  });
});

/**
 * Where the ink actually landed, in device pixels.
 *
 * The recording context above keeps the transform calls but not the transform,
 * so this replays them: `save`/`restore` push and pop, `translate` and `rotate`
 * compose, and the last `fillRect` is mapped through whatever was in force when
 * it was issued. Asserting the box on the page rather than the calls that
 * produced it is what makes a turn in the wrong direction fail — it draws the
 * same two calls with the same two numbers, off the paper.
 */
function lastFillOnPage(calls: readonly Call[]): { x: number; y: number; width: number; height: number } {
  type Matrix = readonly [number, number, number, number, number, number];
  const identity: Matrix = [1, 0, 0, 1, 0, 0];
  let m: Matrix = identity;
  const stack: Matrix[] = [];
  let box = { x: 0, y: 0, width: 0, height: 0 };

  for (const call of calls) {
    const [a, b, c, d, e, f] = m;
    if (call.method === 'save') stack.push(m);
    else if (call.method === 'restore') m = stack.pop() ?? identity;
    else if (call.method === 'translate') {
      const [tx = 0, ty = 0] = call.args;
      m = [a, b, c, d, a * tx + c * ty + e, b * tx + d * ty + f];
    } else if (call.method === 'rotate') {
      const [angle = 0] = call.args;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      m = [a * cos + c * sin, b * cos + d * sin, c * cos - a * sin, d * cos - b * sin, e, f];
    } else if (call.method === 'fillRect') {
      const [x = 0, y = 0, width = 0, height = 0] = call.args;
      const corners = [
        [x, y],
        [x + width, y],
        [x + width, y + height],
        [x, y + height],
      ].map(([px = 0, py = 0]) => [a * px + c * py + e, b * px + d * py + f] as const);
      const xs = corners.map(([px]) => px);
      const ys = corners.map(([, py]) => py);
      box = {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
      };
    }
  }
  return box;
}

describe('rasterising the three kinds of fold (ADR-0012)', () => {
  /**
   * A strip with one of each fold on it, drawn at export resolution.
   *
   * The dash patterns are in millimetres and are scaled to pixels like
   * everything else, so the assertions below are about the *relationships*
   * between the three — which is what a collector reads — rather than about the
   * three literals, which would be the constant restated.
   */
  const FOLDED: SheetLayout = {
    paper: A4,
    marginMm: 0,
    placements: [
      {
        releaseId: 'r1',
        part: 'insert',
        bounds: { x: 0, y: 0, width: 282.5, height: 79 },
        turned: false,
        ops: [],
        guides: [
          { kind: 'cut', points: [{ x: 0, y: 0 }, { x: 282.5, y: 0 }, { x: 282.5, y: 79 }, { x: 0, y: 79 }], closed: true },
          { kind: 'fold', fold: 'case', points: [{ x: 14, y: 0 }, { x: 14, y: 79 }], closed: false },
          { kind: 'fold', fold: 'fore-edge', points: [{ x: 87.5, y: 0 }, { x: 87.5, y: 79 }], closed: false },
          { kind: 'fold', fold: 'spine', points: [{ x: 152.5, y: 0 }, { x: 152.5, y: 79 }], closed: false },
        ],
      },
    ],
  };

  /** Every non-empty dash pattern the sheet asked for, in the order asked. */
  const patternsOf = (layout: SheetLayout): number[][] => {
    const context = recordingContext();
    drawSheet(context, layout, EXPORT_DPI);
    return context.dashes.filter((pattern) => pattern.length > 0);
  };

  it('gives each kind of fold its own dash pattern', () => {
    // Three folds, three patterns, and no two the same: a collector has to fold
    // the fore-edges away from the printed side and the spine toward it, and the
    // Sheet is the only instruction they get.
    const patterns = patternsOf(FOLDED);

    expect(patterns).toHaveLength(3);
    expect(new Set(patterns.map((pattern) => pattern.join(','))).size, 'three distinct patterns').toBe(3);
  });

  it('leaves the cut outline solid, so no fold can be mistaken for a cut line', () => {
    const context = recordingContext();
    drawSheet(context, FOLDED, EXPORT_DPI);

    // Solid strokes outnumber dashed ones here, and not only because of the cut:
    // each fold is drawn twice, once as a solid white halo under the mark and once
    // as the mark itself. So the count to expect is one empty pattern for the cut
    // plus one per fold — four — against three non-empty ones.
    expect(context.dashes.filter((pattern) => pattern.length === 0)).toHaveLength(4);
    expect(patternsOf(FOLDED)).toHaveLength(3);
    // And no fold is drawn solid, which is what would let one be cut along.
    expect(patternsOf(FOLDED).every((pattern) => pattern.length >= 2)).toBe(true);
  });

  it('marks the spine as a dash-dot, which is the fold that reverses', () => {
    const [, foreEdge, spine] = patternsOf(FOLDED);

    // A dash-dot has four segments where a plain dash has two: that is what the
    // drafting convention for a reversed fold looks like, and it is what makes
    // the hinge tellable from the two creases either side of it at a glance.
    expect(foreEdge).toHaveLength(2);
    expect(spine).toHaveLength(4);
  });

  it('gives the fore-edge a longer dash than the case folds it shares a strip with', () => {
    const [caseFold, foreEdge] = patternsOf(FOLDED);

    // The case folds keep the fine dash the J-Card's two folds have always had,
    // and the fore-edge is the commonest crease on the strip, so it is the one
    // that has to read at a glance.
    expect(caseFold?.[0]).toBeGreaterThan(0);
    expect(foreEdge?.[0]).toBeGreaterThan(caseFold?.[0] ?? Infinity);
  });

  it('scales the pattern with the resolution, like every other length', () => {
    const at300 = patternsOf(FOLDED);
    const at150 = (() => {
      const context = recordingContext();
      drawSheet(context, FOLDED, EXPORT_DPI / 2);
      return context.dashes.filter((pattern) => pattern.length > 0);
    })();

    expect(at300[0]?.[0]).toBeCloseTo((at150[0]?.[0] ?? 0) * 2, 6);
  });
});

describe('rasterising a Part packed on its side (ADR-0014)', () => {
  /** An Insert-shaped Part: 282.5 × 79 mm of drawing inside a 79 × 282.5 box. */
  const turnedPart: SheetLayout = {
    paper: A4,
    marginMm: 5,
    placements: [
      {
        releaseId: 'r1',
        part: 'insert',
        bounds: { x: 5, y: 5, width: 79, height: 282.5 },
        turned: true,
        ops: [{ op: 'fill-rect', rect: { x: 0, y: 0, width: 282.5, height: 79 }, color: '#123456' }],
        guides: [],
      },
    ],
  };

  const px = (mm: number): number => (mm * EXPORT_DPI) / 25.4;

  /** The one placement above, with something about it changed. */
  const variant = (changes: Partial<PartPlacement>): SheetLayout => {
    const [placement] = turnedPart.placements;
    if (!placement) throw new Error('fixture has no placement');
    return { ...turnedPart, placements: [{ ...placement, ...changes }] };
  };

  it('lands the Part inside the box it was packed into', () => {
    const context = recordingContext();

    drawSheet(context, turnedPart, EXPORT_DPI);

    const drawn = lastFillOnPage(context.calls);
    expect(drawn.x).toBeCloseTo(px(5), 6);
    expect(drawn.y).toBeCloseTo(px(5), 6);
    // 282.5 mm of drawing, 79 mm across the page: the Part is on its side.
    expect(drawn.width).toBeCloseTo(px(79), 6);
    expect(drawn.height).toBeCloseTo(px(282.5), 6);
  });

  it('turns it clockwise, so its left edge is the one at the top of the Sheet', () => {
    const context = recordingContext();

    drawSheet(context, turnedPart, EXPORT_DPI);

    const rotations = context.calls.filter((call) => call.method === 'rotate');
    expect(rotations).toHaveLength(1);
    expect(rotations[0]?.args[0]).toBeCloseTo(Math.PI / 2, 9);
  });

  it('leaves a Part that was not turned alone', () => {
    const context = recordingContext();

    drawSheet(
      context,
      variant({ turned: false, bounds: { x: 5, y: 5, width: 282.5, height: 79 } }),
      EXPORT_DPI,
    );

    expect(context.calls.filter((call) => call.method === 'rotate')).toHaveLength(0);
    const drawn = lastFillOnPage(context.calls);
    expect(drawn.width).toBeCloseTo(px(282.5), 6);
    expect(drawn.height).toBeCloseTo(px(79), 6);
  });

  it('turns the cut outline with the drawing, so the clip still fits the Part', () => {
    const context = recordingContext();
    const outline = [
      { x: 0, y: 0 },
      { x: 282.5, y: 0 },
      { x: 282.5, y: 79 },
      { x: 0, y: 79 },
    ];

    drawSheet(context, variant({ guides: [{ kind: 'cut', points: outline, closed: true }] }), EXPORT_DPI);

    // The clip is traced before the rotation is undone, so the outline's own
    // 282.5 mm run comes out as the tall side of the box on the page.
    const clipAt = context.calls.findIndex((call) => call.method === 'clip');
    expect(clipAt).toBeGreaterThan(-1);
    const rotateAt = context.calls.findIndex((call) => call.method === 'rotate');
    expect(rotateAt).toBeGreaterThan(-1);
    expect(rotateAt).toBeLessThan(clipAt);
  });
});

describe('rasterising the calibration sheet', () => {
  it('draws the 100 mm test square as 1181.1 px at export resolution', () => {
    // The whole page exists to be measured with a ruler, so this is the one
    // claim worth checking in pixels rather than in millimetres.
    const { layouts } = renderCalibrationSheet(
      { paper: A4, marginMm: 5 },
      DEFAULT_PART_DIMENSIONS,
      { widthMm: (text, style) => text.length * style.sizeMm * 0.5 },
    );
    const context = recordingContext();
    const [first] = layouts;
    if (!first) throw new Error('the calibration sheet rendered no pages');

    drawSheet(context, first, EXPORT_DPI);

    const horizontalRuns: number[] = [];
    for (const [index, call] of context.calls.entries()) {
      const next = context.calls[index + 1];
      if (call.method !== 'moveTo' || next?.method !== 'lineTo') continue;
      const from = call.args[0];
      const to = next.args[0];
      if (from !== undefined && to !== undefined) horizontalRuns.push(Math.abs(to - from));
    }

    expect(horizontalRuns.some((run) => Math.abs(run - 1181.1) < 0.5)).toBe(true);
  });

  it('draws Sheet-level marks even though the calibration sheet has no Parts', () => {
    const { layouts, figures } = renderCalibrationSheet(
      { paper: A4, marginMm: 5 },
      DEFAULT_PART_DIMENSIONS,
      { widthMm: (text, style) => text.length * style.sizeMm * 0.5 },
    );
    const context = recordingContext();
    const [first] = layouts;
    if (!first) throw new Error('the calibration sheet rendered no pages');

    drawSheet(context, first, EXPORT_DPI);

    // Nothing on this page is a Part, so a renderer that only drew placements
    // would produce a blank sheet. Every outline has to appear as a real path.
    expect(first.placements).toEqual([]);
    const moves = context.calls.filter((call) => call.method === 'moveTo');
    for (const figure of figures.filter((candidate) => candidate.sheet === 0)) {
      const x = figure.bounds.x * (EXPORT_DPI / 25.4);
      const y = figure.bounds.y * (EXPORT_DPI / 25.4);
      expect(
        moves.some(
          (move) => Math.abs((move.args[0] ?? 0) - x) < 0.5 && Math.abs((move.args[1] ?? 0) - y) < 0.5,
        ),
        `${figure.label} outline drawn`,
      ).toBe(true);
    }
  });
});
