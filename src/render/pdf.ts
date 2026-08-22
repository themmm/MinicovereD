import { PDFDocument } from 'pdf-lib';

import type { Size } from '../domain/units.ts';
import { mmToPt } from '../domain/units.ts';

/**
 * PDF export. Each Sheet is one page at its exact paper size in millimetres,
 * carrying one 300 DPI raster placed edge to edge — so a Part cut out of the
 * print physically fits the case (spec: exact-mm PDF at 300 DPI).
 */

export interface PdfPage {
  /** Paper size in mm. The page is created at exactly this size. */
  readonly size: Size;
  /** The Sheet rasterised at export DPI, as PNG bytes. */
  readonly png: Uint8Array;
}

export async function buildPdf(pages: readonly PdfPage[]): Promise<Uint8Array> {
  if (pages.length === 0) throw new Error('minicovered: cannot export a PDF with no Sheets');

  const document = await PDFDocument.create();
  document.setTitle('MinicovereD');
  document.setCreator('MinicovereD');
  document.setProducer('MinicovereD');

  for (const { size, png } of pages) {
    const widthPt = mmToPt(size.width);
    const heightPt = mmToPt(size.height);
    const page = document.addPage([widthPt, heightPt]);
    const image = await document.embedPng(png);
    page.drawImage(image, { x: 0, y: 0, width: widthPt, height: heightPt });
  }

  return document.save();
}
