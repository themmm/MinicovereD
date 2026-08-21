import { buildPdf } from '../render/pdf.ts';
import { EXPORT_DPI, rasterizeSheet, sheetToPng } from '../render/raster.ts';
import type { SheetLayout } from '../render/sheet-renderer.ts';
import { el } from './dom.ts';

/**
 * Live preview of the packed Sheets, and the export that turns them into one
 * PDF. Preview and export call the same rasteriser with different DPI, so what
 * is on screen is what comes out of the printer.
 */

/** Sharp enough on screen without rasterising eight megapixels per keystroke. */
const PREVIEW_DPI = 140;

/** Firefox and Safari need the anchor in the document and the URL alive after the click. */
const DOWNLOAD_URL_LIFETIME_MS = 30_000;

export interface SheetPreview {
  readonly element: HTMLElement;
  /** Show `sheets`, keeping the current page where it still exists. */
  show(sheets: readonly SheetLayout[], fileName: string): void;
  /** Report a problem instead of a stale Sheet. */
  showProblem(message: string): void;
}

export function createSheetPreview(): SheetPreview {
  const canvas = el('canvas', { class: 'preview__canvas' });
  const status = el('p', { class: 'preview__status', attrs: { role: 'status' }, text: '' });
  const sheetLabel = el('span', { class: 'pager__label', text: '' });

  let sheets: readonly SheetLayout[] = [];
  let fileName = 'mdcovergen.pdf';
  let sheetIndex = 0;
  let redrawToken = 0;

  const exportButton = el('button', {
    class: 'button button--primary',
    text: 'Export PDF',
    on: { click: () => void exportPdf() },
  });
  const previous = el('button', {
    class: 'button',
    text: '‹',
    attrs: { 'aria-label': 'Previous Sheet' },
    on: { click: () => turnTo(sheetIndex - 1) },
  });
  const next = el('button', {
    class: 'button',
    text: '›',
    attrs: { 'aria-label': 'Next Sheet' },
    on: { click: () => turnTo(sheetIndex + 1) },
  });
  const pager = el('div', { class: 'pager' }, previous, sheetLabel, next);

  function turnTo(index: number): void {
    sheetIndex = Math.min(Math.max(index, 0), Math.max(sheets.length - 1, 0));
    void redraw();
  }

  async function redraw(): Promise<void> {
    const token = ++redrawToken;
    const sheet = sheets[sheetIndex];
    if (!sheet) return;

    const rendered = await rasterizeSheet(sheet, PREVIEW_DPI);
    if (token !== redrawToken) return;

    canvas.width = rendered.width;
    canvas.height = rendered.height;
    canvas.getContext('2d')?.drawImage(rendered, 0, 0);

    const parts = sheet.placements.length;
    status.textContent =
      `${sheet.paper.name} · ${parts} ${parts === 1 ? 'Part' : 'Parts'} on this Sheet · ` +
      `${sheet.marginMm} mm margin`;
    sheetLabel.textContent = `Sheet ${sheetIndex + 1} of ${sheets.length}`;
    pager.hidden = sheets.length < 2;
    previous.toggleAttribute('disabled', sheetIndex === 0);
    next.toggleAttribute('disabled', sheetIndex >= sheets.length - 1);
  }

  async function exportPdf(): Promise<void> {
    if (sheets.length === 0) return;
    exportButton.setAttribute('disabled', '');
    try {
      const pdfPages = [];
      for (const [index, sheet] of sheets.entries()) {
        status.textContent = `Rendering Sheet ${index + 1} of ${sheets.length} at ${EXPORT_DPI} DPI…`;
        pdfPages.push({ size: sheet.paper, png: await sheetToPng(sheet, EXPORT_DPI) });
      }
      download(await buildPdf(pdfPages), fileName);
      status.textContent = `Exported ${pdfPages.length} ${
        pdfPages.length === 1 ? 'Sheet' : 'Sheets'
      } at ${EXPORT_DPI} DPI`;
    } catch (error) {
      status.textContent = `Export failed: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      exportButton.removeAttribute('disabled');
    }
  }

  const element = el(
    'section',
    { class: 'panel preview' },
    el(
      'div',
      { class: 'preview__head' },
      el('h2', { class: 'panel__title', text: 'Preview' }),
      pager,
      exportButton,
    ),
    el('div', { class: 'preview__frame' }, canvas),
    status,
  );
  pager.hidden = true;

  return {
    element,
    show(nextSheets, nextFileName) {
      sheets = nextSheets;
      fileName = nextFileName;
      sheetIndex = Math.min(sheetIndex, Math.max(sheets.length - 1, 0));
      exportButton.toggleAttribute('disabled', sheets.length === 0);
      if (sheets.length === 0) {
        status.textContent = 'Nothing to print — choose at least one Part.';
        pager.hidden = true;
        return;
      }
      void redraw();
    },
    showProblem(message) {
      redrawToken++;
      sheets = [];
      exportButton.setAttribute('disabled', '');
      pager.hidden = true;
      status.textContent = message;
    },
  };
}

function download(bytes: Uint8Array, fileName: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
  const link = el('a', { class: 'visually-hidden', attrs: { href: url, download: fileName } });
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_URL_LIFETIME_MS);
}
