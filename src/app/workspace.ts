import { A4, DEFAULT_PRINTABLE_MARGIN_MM } from '../domain/paper.ts';
import { DEFAULT_PART_DIMENSIONS } from '../domain/parts.ts';
import type { Artwork, Release } from '../domain/release.ts';
import { formatTracklist, parseTracklist } from '../domain/tracklist.ts';
import { createCanvasTextMeasurer, fontsReady } from '../render/canvas-text-measurer.ts';
import { buildPdf } from '../render/pdf.ts';
import { EXPORT_DPI, rasterizeSheet, sheetToPng } from '../render/raster.ts';
import { renderSheets } from '../render/sheet-renderer.ts';
import type { ReleaseDesign, SheetConfig, SheetLayout } from '../render/sheet-renderer.ts';
import { el } from './dom.ts';
import { readArtwork } from './artwork.ts';

/**
 * The workspace: enter a Release by hand on the left, watch the Sheet build
 * itself on the right, export it as an exact-mm PDF. Preview and export read
 * the same layout model, so what is on screen is what comes out of the printer.
 */

/** Enough resolution for the preview to look sharp without rasterising 8 megapixels per keystroke. */
const PREVIEW_DPI = 140;

/**
 * The workspace opens on a worked example, so the live preview shows something
 * the moment the app loads. Ticket 10 replaces this with the empty state that
 * walks a first-time user to their own first Release.
 */
const EXAMPLE_RELEASE: Release = {
  id: 'release-1',
  artist: 'Glen Campbell',
  album: 'Wichita Lineman',
  year: '1968',
  notes: 'Capitol · ST-103',
  tracks: parseTracklist(
    [
      'Wichita Lineman',
      'Dreams of the Everyday Housewife',
      'Ann',
      'Reason to Believe',
      'You Better Sit Down Kids',
      'If You Go Away',
      'Fate of Man',
      'Words',
      'Baby Please Don’t Go',
      'That Keeps It Hangin’ On',
    ].join('\n'),
  ),
};

interface Field {
  readonly label: string;
  readonly key: 'artist' | 'album' | 'year' | 'notes';
  readonly placeholder: string;
}

const FIELDS: readonly Field[] = [
  { label: 'Artist', key: 'artist', placeholder: 'Glen Campbell' },
  { label: 'Album', key: 'album', placeholder: 'Wichita Lineman' },
  { label: 'Year', key: 'year', placeholder: '1968' },
  { label: 'Notes', key: 'notes', placeholder: 'Capitol · ST-103' },
];

export function createWorkspace(): HTMLElement {
  let release: Release = EXAMPLE_RELEASE;
  const sheetConfig: SheetConfig = { paper: A4, marginMm: DEFAULT_PRINTABLE_MARGIN_MM };
  const measure = createCanvasTextMeasurer();

  const canvas = el('canvas', { class: 'preview__canvas' });
  const status = el('p', { class: 'preview__status', attrs: { role: 'status' }, text: '' });
  const exportButton = el('button', {
    class: 'button button--primary',
    text: 'Export PDF',
    on: { click: () => void exportPdf() },
  });

  let layout: SheetLayout | undefined;
  let redrawToken = 0;

  const design = (): ReleaseDesign => ({
    release,
    templateId: 'classic',
    dimensions: DEFAULT_PART_DIMENSIONS,
  });

  async function redraw(): Promise<void> {
    const token = ++redrawToken;
    const [sheet] = renderSheets([design()], sheetConfig, measure);
    if (!sheet) return;
    layout = sheet;

    const rendered = await rasterizeSheet(sheet, PREVIEW_DPI);
    if (token !== redrawToken) return;

    const context = canvas.getContext('2d');
    canvas.width = rendered.width;
    canvas.height = rendered.height;
    context?.drawImage(rendered, 0, 0);
    status.textContent = `${sheet.paper.name} · ${sheet.placements.length} Parts · ${sheet.marginMm} mm margin`;
  }

  const scheduleRedraw = (): void => void redraw();

  function update(changes: Partial<Release>): void {
    release = { ...release, ...changes };
    scheduleRedraw();
  }

  async function exportPdf(): Promise<void> {
    if (!layout) return;
    exportButton.setAttribute('disabled', '');
    status.textContent = `Rendering at ${EXPORT_DPI} DPI…`;
    try {
      const png = await sheetToPng(layout, EXPORT_DPI);
      const pdf = await buildPdf([{ size: layout.paper, png }]);
      downloadPdf(pdf, fileNameFor(release));
      status.textContent = `Exported ${layout.paper.name} at ${EXPORT_DPI} DPI`;
    } catch (error) {
      status.textContent = `Export failed: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      exportButton.removeAttribute('disabled');
    }
  }

  const form = el('section', { class: 'panel form' });
  form.appendChild(el('h2', { class: 'panel__title', text: 'Release' }));
  form.appendChild(
    el('p', {
      class: 'panel__hint',
      text: 'Everything on the Sheet comes from here. Metadata lookup arrives in a later ticket.',
    }),
  );

  for (const field of FIELDS) {
    const input = el('input', {
      class: 'field__input',
      attrs: {
        type: 'text',
        placeholder: field.placeholder,
        id: `field-${field.key}`,
        value: release[field.key] ?? '',
      },
      on: {
        input: (event) => update({ [field.key]: (event.target as HTMLInputElement).value }),
      },
    });
    form.appendChild(
      el(
        'label',
        { class: 'field', attrs: { for: `field-${field.key}` } },
        el('span', { class: 'field__label', text: field.label }),
        input,
      ),
    );
  }

  const tracklist = el('textarea', {
    class: 'field__input field__input--area',
    attrs: {
      rows: 10,
      id: 'field-tracklist',
      placeholder: 'One track per line.\nLeading numbers are dropped.',
    },
    on: {
      input: (event) => update({ tracks: parseTracklist((event.target as HTMLTextAreaElement).value) }),
    },
  });
  tracklist.value = formatTracklist(release.tracks);
  form.appendChild(
    el(
      'label',
      { class: 'field', attrs: { for: 'field-tracklist' } },
      el('span', { class: 'field__label', text: 'Tracklist' }),
      tracklist,
    ),
  );

  const artworkName = el('span', { class: 'field__note', text: 'No artwork chosen' });
  const artworkInput = el('input', {
    class: 'field__file',
    attrs: { type: 'file', accept: 'image/*', id: 'field-artwork' },
    on: {
      change: (event) => {
        const file = (event.target as HTMLInputElement).files?.[0];
        if (!file) return;
        void readArtwork(file).then(
          (artwork: Artwork) => {
            artworkName.textContent = `${file.name} · ${artwork.widthPx}×${artwork.heightPx}`;
            update({ artwork });
          },
          (error: unknown) => {
            artworkName.textContent = `Could not read image: ${
              error instanceof Error ? error.message : String(error)
            }`;
          },
        );
      },
    },
  });
  form.appendChild(
    el(
      'div',
      { class: 'field' },
      el('span', { class: 'field__label', text: 'Artwork' }),
      // The native control renders its own text in the browser's locale, so it
      // is hidden behind a label that says what this app wants it to say.
      el(
        'label',
        { class: 'button', attrs: { for: 'field-artwork' } },
        'Choose image…',
        artworkInput,
      ),
      artworkName,
    ),
  );

  const preview = el(
    'section',
    { class: 'panel preview' },
    el(
      'div',
      { class: 'preview__head' },
      el('h2', { class: 'panel__title', text: 'Sheet' }),
      exportButton,
    ),
    el('p', {
      class: 'panel__hint',
      text: 'All three Parts on one A4 page, with cutting guides on every Part and fold guides on the J-Card.',
    }),
    el('div', { class: 'preview__frame' }, canvas),
    status,
  );

  const workspace = el('div', { class: 'workspace' }, form, preview);

  // Fonts are bundled but still load asynchronously; measuring before they are
  // ready would lay the Sheet out against a fallback face.
  void fontsReady().then(scheduleRedraw);

  return workspace;
}

function fileNameFor(release: Release): string {
  const stem = [release.artist, release.album].filter(Boolean).join(' - ') || 'mdcovergen';
  return `${stem.replace(/[\\/:*?"<>|]/g, '_')}.pdf`;
}

function downloadPdf(bytes: Uint8Array, fileName: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
  const link = el('a', { attrs: { href: url, download: fileName } });
  link.click();
  URL.revokeObjectURL(url);
}
