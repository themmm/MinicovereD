import { A4, DEFAULT_PRINTABLE_MARGIN_MM } from '../domain/paper.ts';
import { DEFAULT_PART_DIMENSIONS, PART_KINDS } from '../domain/parts.ts';
import type { LabelDimensions, PartDimensions } from '../domain/parts.ts';
import type { Release } from '../domain/release.ts';
import { parseTracklist } from '../domain/tracklist.ts';
import { createFetchHttpClient } from '../metadata/http.ts';
import { createMetadataAdapter } from '../metadata/metadata-adapter.ts';
import { createCanvasTextMeasurer, fontsReady } from '../render/canvas-text-measurer.ts';
import { renderCalibrationSheet } from '../render/calibration.ts';
import { DEFAULT_TEMPLATE_PARAMS, renderSheets } from '../render/sheet-renderer.ts';
import type {
  ReleaseDesign,
  SheetConfig,
  TemplateId,
  TemplateParams,
} from '../render/sheet-renderer.ts';
import { errorMessage } from '../errors.ts';
import { createDesignControls } from './design-controls.ts';
import { createLabelControls } from './label-controls.ts';
import { el } from './dom.ts';
import { createReleaseForm } from './release-form.ts';
import { createReleaseSearch } from './release-search.ts';
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
  let templateId: TemplateId = 'classic';
  let params: TemplateParams = DEFAULT_TEMPLATE_PARAMS;
  let dimensions: PartDimensions = DEFAULT_PART_DIMENSIONS;

  const measure = createCanvasTextMeasurer();
  const preview = createSheetPreview();
  const metadata = createMetadataAdapter({ http: createFetchHttpClient() });

  const design = (): ReleaseDesign => ({ release, templateId, params, dimensions });

  function refresh(): void {
    try {
      preview.show(renderSheets([design()], sheetConfig, measure), fileNameFor(release));
    } catch (error) {
      preview.showProblem(errorMessage(error));
    }
  }

  const form = createReleaseForm(release, (edit) => {
    release = edit(release);
    refresh();
  });

  // A looked-up Release replaces what the fields show, and stays editable. It
  // keeps its MusicBrainz id, which is what later tickets identify it by.
  const search = createReleaseSearch(metadata, (found) => {
    release = found;
    form.setRelease(release);
    refresh();
  });

  const designControls = createDesignControls({ templateId, params }, (change) => {
    templateId = change.templateId ?? templateId;
    params = change.params ?? params;
    refresh();
  });

  const labelControls = createLabelControls(dimensions.label, (label: LabelDimensions) => {
    dimensions = { ...dimensions, label };
    refresh();
  });

  const controls = createSheetControls(sheetConfig, (changes) => {
    sheetConfig = { ...sheetConfig, ...changes };
    refresh();
  });

  // The calibration sheet is not a Release: it is the ruler you check the
  // printer against before trusting anything else this app produced.
  preview.addAction('Calibration sheet', () => {
    const { layouts } = renderCalibrationSheet(
      { paper: sheetConfig.paper, marginMm: sheetConfig.marginMm },
      dimensions,
      measure,
    );
    preview.show(layouts, 'mdcovergen-calibration.pdf');
  });

  // Fonts are bundled but still load asynchronously; measuring before they are
  // ready would lay the Sheet out against a fallback face.
  void fontsReady().then(refresh);

  return el(
    'div',
    { class: 'workspace' },
    el(
      'div',
      { class: 'workspace__column' },
      search,
      form.element,
      designControls,
      labelControls,
      controls,
    ),
    preview.element,
  );
}

function fileNameFor(release: Release): string {
  const stem = [release.artist, release.album].filter(Boolean).join(' - ') || 'mdcovergen';
  return `${stem.replace(/[\\/:*?"<>|]/g, '_')}.pdf`;
}
