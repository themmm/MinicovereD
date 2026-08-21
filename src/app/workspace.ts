import { A4, DEFAULT_PRINTABLE_MARGIN_MM } from '../domain/paper.ts';
import { DEFAULT_PART_DIMENSIONS, PART_KINDS } from '../domain/parts.ts';
import type { Release } from '../domain/release.ts';
import { parseTracklist } from '../domain/tracklist.ts';
import { createCanvasTextMeasurer, fontsReady } from '../render/canvas-text-measurer.ts';
import { renderSheets } from '../render/sheet-renderer.ts';
import type { ReleaseDesign, SheetConfig } from '../render/sheet-renderer.ts';
import { el } from './dom.ts';
import { createReleaseForm } from './release-form.ts';
import { createSheetControls } from './sheet-controls.ts';
import { createSheetPreview } from './sheet-preview.ts';

/**
 * The workspace: a Release on the left, the Sheets it packs onto on the right.
 * It owns the state and nothing else — the form, the Sheet controls and the
 * preview each know only their own slice.
 */

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

export function createWorkspace(): HTMLElement {
  let release = EXAMPLE_RELEASE;
  let sheetConfig: SheetConfig = {
    paper: A4,
    marginMm: DEFAULT_PRINTABLE_MARGIN_MM,
    parts: PART_KINDS,
  };

  const measure = createCanvasTextMeasurer();
  const preview = createSheetPreview();

  const design = (): ReleaseDesign => ({
    release,
    templateId: 'classic',
    dimensions: DEFAULT_PART_DIMENSIONS,
  });

  function refresh(): void {
    if (sheetConfig.parts.length === 0) {
      preview.show([], fileNameFor(release));
      return;
    }
    try {
      preview.show(renderSheets([design()], sheetConfig, measure), fileNameFor(release));
    } catch (error) {
      preview.showProblem(error instanceof Error ? error.message : String(error));
    }
  }

  const form = createReleaseForm(release, (changes) => {
    release = { ...release, ...changes };
    refresh();
  });

  const controls = createSheetControls(sheetConfig, (changes) => {
    sheetConfig = { ...sheetConfig, ...changes };
    refresh();
  });

  // Fonts are bundled but still load asynchronously; measuring before they are
  // ready would lay the Sheet out against a fallback face.
  void fontsReady().then(refresh);

  return el(
    'div',
    { class: 'workspace' },
    el('div', { class: 'workspace__column' }, form, controls),
    preview.element,
  );
}

function fileNameFor(release: Release): string {
  const stem = [release.artist, release.album].filter(Boolean).join(' - ') || 'mdcovergen';
  return `${stem.replace(/[\\/:*?"<>|]/g, '_')}.pdf`;
}
