import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { A4 } from '../domain/paper.ts';
import { ptToMm, pxPerMm, rasterSizePx } from '../domain/units.ts';
import { buildPdf } from './pdf.ts';

/** A real 2×2 PNG, so pdf-lib embeds an image rather than a placeholder. */
const PNG_2X2 = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFElEQVR4nGP8z4AATAxIYBQzMwMAYcMBQdRUEB4AAAAASUVORK5CYII=',
    'base64',
  ),
);

const pageSizeMm = async (bytes: Uint8Array, index: number): Promise<{ width: number; height: number }> => {
  const page = (await PDFDocument.load(bytes)).getPages()[index];
  if (!page) throw new Error(`no page ${index}`);
  const { width, height } = page.getSize();
  return { width: ptToMm(width), height: ptToMm(height) };
};

describe('PDF export', () => {
  it('writes an A4 page that parses back as 210 × 297 mm', async () => {
    const bytes = await buildPdf([{ size: A4, png: PNG_2X2 }]);
    const size = await pageSizeMm(bytes, 0);

    expect(size.width).toBeCloseTo(210, 4);
    expect(size.height).toBeCloseTo(297, 4);
  });

  it('writes a page at whatever millimetre size it is given', async () => {
    const bytes = await buildPdf([{ size: { width: 148, height: 210 }, png: PNG_2X2 }]);
    const size = await pageSizeMm(bytes, 0);

    expect(size.width).toBeCloseTo(148, 4);
    expect(size.height).toBeCloseTo(210, 4);
  });

  it('writes one page per Sheet, in order', async () => {
    const bytes = await buildPdf([
      { size: A4, png: PNG_2X2 },
      { size: { width: 148, height: 210 }, png: PNG_2X2 },
    ]);

    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
    expect((await pageSizeMm(bytes, 1)).width).toBeCloseTo(148, 4);
  });

  it('refuses to write a PDF with no pages rather than emitting an unopenable file', async () => {
    await expect(buildPdf([])).rejects.toThrow(/no Sheets/);
  });
});

describe('300 DPI raster geometry', () => {
  it('rasterises A4 to the pixel count 300 DPI implies', () => {
    // The well-known A4 @ 300 DPI size, independent of anything this code computes.
    expect(rasterSizePx(A4, 300)).toEqual({ width: 2480, height: 3508 });
  });

  it('rasterises a 100 mm span to 1181 px at 300 DPI', () => {
    expect(rasterSizePx({ width: 100, height: 100 }, 300).width).toBe(1181);
  });

  it('draws at an unrounded scale, so content cannot creep off the rasterised page', () => {
    // 300 DPI is 11.811… px/mm; rounding that would shift the far edge of an
    // A4 Sheet by most of a pixel.
    expect(pxPerMm(300)).toBeCloseTo(11.8110236, 6);
    expect(pxPerMm(300) * 25.4).toBeCloseTo(300, 9);
  });
});
