import { buildPdf } from '../render/pdf.ts';
import { EXPORT_DPI, rasterizeSheet, sheetToPng } from '../render/raster.ts';
import type { SheetLayout, SheetWarning } from '../render/sheet-renderer.ts';
import { errorMessage } from '../errors.ts';
import { clear, el } from './dom.ts';

/**
 * The Sheet check, and the export (ADR-0010 item 3).
 *
 * The Sheet stopped being the design surface and became a verification step:
 * paper, printable margin, what packed onto how many Sheets, cutting guides.
 * It is the one view where a sheet of paper is genuinely the subject, which is
 * why it is also the one view that keeps the neutral mount — colour judgement
 * against a neutral surround belongs here rather than beside the Parts.
 *
 * Preview and export still call the same rasteriser with different DPI, so what
 * is on screen is what comes out of the printer. That property is why this
 * module can be demoted without anything being lost.
 */

/** Sharp enough on screen without rasterising eight megapixels per keystroke. */
export const PREVIEW_DPI = 140;

/** Firefox and Safari need the anchor in the document and the URL alive after the click. */
const DOWNLOAD_URL_LIFETIME_MS = 30_000;

export interface SheetPreview {
  /** The body of the check: the mount, the pager, the facts, the warnings. */
  readonly element: HTMLElement;
  /** Lives in the actions row, not in here — Export is not part of the check. */
  readonly exportButton: HTMLButtonElement;
  /**
   * Show `sheets`, keeping the current Sheet where it still exists.
   *
   * `whenEmpty` says why there is nothing, when there is nothing. There is
   * more than one reason — no Releases queued, or no Parts chosen — and only
   * the caller knows which.
   */
  show(sheets: readonly SheetLayout[], fileName: string, whenEmpty?: string): void;
  /** Report a problem instead of a stale Sheet. */
  showProblem(message: string): void;
  /**
   * Called with the line for the closed fold's header, every time it changes.
   *
   * The cost ADR-0010 accepts is that a collector who never opens this never
   * sees how their Parts were packed. The mitigation is that the numbers that
   * matter are on the header, so the packing is legible without opening
   * anything.
   */
  onSummary(listener: (summary: string) => void): void;
}

export interface SheetPreviewOptions {
  /** Buttons shown beside Export, in order. */
  readonly actions?: readonly HTMLElement[];
}

export function createSheetPreview({ actions = [] }: SheetPreviewOptions = {}): SheetPreview {
  const canvas = el('canvas', { class: 'preview__canvas' });
  const status = el('p', { class: 'preview__status', attrs: { role: 'status' }, text: '' });
  // No live region here: the status line above already announces every redraw,
  // and two of them talk over each other.
  const warnings = el('ul', { class: 'warnings' });
  const sheetLabel = el('span', { class: 'pager__label', text: '' });

  let sheets: readonly SheetLayout[] = [];
  let fileName = 'minicovered.pdf';
  let sheetIndex = 0;
  let redrawToken = 0;
  let summaryListener: (summary: string) => void = () => {};

  const exportButton = el('button', {
    class: 'button button--primary',
    text: 'Export PDF',
    attrs: { type: 'button' },
    on: { click: () => void exportPdf() },
  });
  const previous = el('button', {
    class: 'button button--tiny',
    text: '‹',
    attrs: { type: 'button', 'aria-label': 'Previous Sheet' },
    on: { click: () => turnTo(sheetIndex - 1) },
  });
  const next = el('button', {
    class: 'button button--tiny',
    text: '›',
    attrs: { type: 'button', 'aria-label': 'Next Sheet' },
    on: { click: () => turnTo(sheetIndex + 1) },
  });
  const pager = el('div', { class: 'pager' }, previous, sheetLabel, next);
  const actionBar = el('div', { class: 'preview__actions' }, ...actions);

  function turnTo(index: number): void {
    sheetIndex = Math.min(Math.max(index, 0), Math.max(sheets.length - 1, 0));
    void redraw();
  }

  /** The closed header's line: how many Sheets, of what, at what margin. */
  function announceSummary(): void {
    const [first] = sheets;
    if (!first) {
      summaryListener('nothing to print');
      return;
    }
    const parts = sheets.reduce((total, sheet) => total + sheet.placements.length, 0);
    const count = sheets.length;
    summaryListener(
      `${count} × ${first.paper.name} · ${parts} ${parts === 1 ? 'Part' : 'Parts'} · ` +
        `margin ${first.marginMm.toFixed(1)} mm`,
    );
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

    // Every warning in the whole job, named by its Release. The Part band shows
    // the selected Release's warnings at their cause (ADR-0010 item 5), which
    // leaves the other Releases' warnings with nowhere else to be — and a
    // tracklist that shrank past legibility is not a thing to find out after
    // printing.
    clear(warnings);
    const all = sheets.flatMap((each) => each.warnings ?? []);
    for (const warning of all) {
      warnings.appendChild(el('li', { class: 'warnings__item', text: describeWarning(warning) }));
    }
    warnings.hidden = all.length === 0;

    sheetLabel.textContent = `Sheet ${sheetIndex + 1} of ${sheets.length}`;
    pager.hidden = sheets.length < 2;
    previous.toggleAttribute('disabled', sheetIndex === 0);
    next.toggleAttribute('disabled', sheetIndex >= sheets.length - 1);
    announceSummary();
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
      status.textContent = `Export failed: ${errorMessage(error)}`;
    } finally {
      exportButton.removeAttribute('disabled');
    }
  }

  const element = el(
    'div',
    { class: 'check' },
    el('div', { class: 'check__head' }, pager, actionBar),
    el('div', { class: 'preview__frame' }, canvas),
    status,
    warnings,
  );
  pager.hidden = true;

  /** Nothing to show: say so, and take the last Sheet off the screen with it. */
  function showNothing(message: string): void {
    redrawToken++;
    sheets = [];
    exportButton.setAttribute('disabled', '');
    pager.hidden = true;
    warnings.hidden = true;
    status.textContent = message;
    // Leaving the previous raster up would show a Sheet that is no longer
    // being described by anything on the page.
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    canvas.width = 0;
    canvas.height = 0;
    announceSummary();
  }

  return {
    element,
    exportButton,
    show(nextSheets, nextFileName, whenEmpty) {
      sheets = nextSheets;
      fileName = nextFileName;
      sheetIndex = Math.min(sheetIndex, Math.max(sheets.length - 1, 0));
      if (sheets.length === 0) {
        showNothing(whenEmpty ?? 'Nothing to print — choose at least one Part.');
        return;
      }
      exportButton.removeAttribute('disabled');
      void redraw();
    },
    showProblem: showNothing,
    onSummary(listener) {
      summaryListener = listener;
      announceSummary();
    },
  };
}

/** The wording lives here, not in the geometry that noticed the problem. */
function describeWarning(warning: SheetWarning): string {
  const { releaseTitle, trackCount, sizeMm, floorMm } = warning;
  return (
    `${releaseTitle}: ${trackCount} tracks only fit at ${sizeMm.toFixed(2)} mm type, below the ` +
    `${floorMm.toFixed(2)} mm a printer reliably holds. Every track is there, but they may not be legible.`
  );
}

function download(bytes: Uint8Array, fileName: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
  const link = el('a', { class: 'visually-hidden', attrs: { href: url, download: fileName } });
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_URL_LIFETIME_MS);
}
