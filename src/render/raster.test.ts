import { describe, expect, it } from 'vitest';

import { A4 } from '../domain/paper.ts';
import { DEFAULT_PART_DIMENSIONS } from '../domain/parts.ts';
import { renderCalibrationSheet } from './calibration.ts';
import type { SheetLayout } from './layout.ts';
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

function recordingContext(): Canvas2D & { readonly calls: Call[] } {
  const calls: Call[] = [];
  const record =
    (method: string) =>
    (...args: unknown[]): void => {
      calls.push({ method, args: args.filter((arg): arg is number => typeof arg === 'number') });
    };

  return {
    calls,
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
    setLineDash: record('setLineDash'),
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
      part: 'back-card',
      bounds: { x: 0, y: 0, width: 100, height: 100 },
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
    const { layouts } = renderCalibrationSheet(
      { paper: A4, marginMm: 5 },
      DEFAULT_PART_DIMENSIONS,
      { widthMm: (text, style) => text.length * style.sizeMm * 0.5 },
    );
    const context = recordingContext();
    const [first] = layouts;
    if (!first) throw new Error('the calibration sheet rendered no pages');

    drawSheet(context, first, EXPORT_DPI);

    expect(first.placements).toEqual([]);
    expect(context.calls.filter((call) => call.method === 'fillText').length).toBeGreaterThan(5);
    expect(context.calls.filter((call) => call.method === 'stroke').length).toBeGreaterThan(5);
  });
});
