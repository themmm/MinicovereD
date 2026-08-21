import { A4, DEFAULT_PRINTABLE_MARGIN_MM } from '../domain/paper.ts';
import { DEFAULT_PART_DIMENSIONS, PART_KINDS } from '../domain/parts.ts';
import type { LabelDimensions } from '../domain/parts.ts';
import type { Release } from '../domain/release.ts';
import { parseTracklist } from '../domain/tracklist.ts';
import { errorMessage } from '../errors.ts';
import { createFetchHttpClient } from '../metadata/http.ts';
import { createMetadataAdapter } from '../metadata/metadata-adapter.ts';
import type { Project } from '../persist/project-file.ts';
import { createIndexedDbStore, debounceSave } from '../persist/project-store.ts';
import { renderCalibrationSheet } from '../render/calibration.ts';
import { createCanvasTextMeasurer, fontsReady, onFontsLoaded } from '../render/canvas-text-measurer.ts';
import { DEFAULT_TEMPLATE_PARAMS, renderSheets } from '../render/sheet-renderer.ts';
import type { ReleaseDesign, SheetConfig } from '../render/sheet-renderer.ts';
import { createDesignControls } from './design-controls.ts';
import { clear, el } from './dom.ts';
import { createLabelControls } from './label-controls.ts';
import { createProjectControls } from './project-controls.ts';
import { createReleaseForm } from './release-form.ts';
import { createReleaseSearch } from './release-search.ts';
import { createSheetControls } from './sheet-controls.ts';
import { createSheetPreview } from './sheet-preview.ts';

/**
 * The workspace: a Release on the left, the Sheets it packs onto on the right.
 * It owns the state — and, since ADR-0001 puts that state nowhere but this
 * browser, saving it.
 */

/** Long enough that typing does not write on every keystroke, short enough to survive a reload. */
const AUTOSAVE_DELAY_MS = 600;

/**
 * What a first-time visitor opens on, so the live preview shows something
 * immediately. Ticket 10 replaces it with the empty state that walks them to
 * their own first Release. A returning visitor gets their own work instead.
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
  let design: ReleaseDesign = {
    release: EXAMPLE_RELEASE,
    templateId: 'classic',
    params: DEFAULT_TEMPLATE_PARAMS,
    dimensions: DEFAULT_PART_DIMENSIONS,
  };
  let sheetConfig: SheetConfig = {
    paper: A4,
    marginMm: DEFAULT_PRINTABLE_MARGIN_MM,
    parts: PART_KINDS,
  };

  const project = (): Project => ({ designs: [design], sheet: sheetConfig });

  const measure = createCanvasTextMeasurer();
  const metadata = createMetadataAdapter({ http: createFetchHttpClient() });
  const store = createIndexedDbStore();

  const calibrationButton = el('button', {
    class: 'button',
    text: 'Calibration sheet',
    attrs: { type: 'button' },
    on: {
      click: () => {
        // Not a Release: the ruler you check the printer against before
        // trusting anything else this app produced.
        const { layouts } = renderCalibrationSheet(
          { paper: sheetConfig.paper, marginMm: sheetConfig.marginMm },
          design.dimensions,
          measure,
        );
        preview.show(layouts, 'mdcovergen-calibration.pdf');
      },
    },
  });
  const preview = createSheetPreview({ actions: [calibrationButton] });

  const projectControls = createProjectControls(project, (imported) => {
    apply(imported);
    // Say what was opened, not what the file held. A project file may carry a
    // whole queue; this workspace shows one Release until ticket 09 lands, and
    // claiming otherwise would be a lie the collector pays for later.
    projectControls.report(
      imported.designs.length > 1
        ? `Opened the first of ${imported.designs.length} Releases in that file — this version shows one at a time. Your previous work has been replaced.`
        : 'Opened that project. Your previous work has been replaced.',
    );
  });

  const saveSoon = debounceSave(store, AUTOSAVE_DELAY_MS, (error) => {
    projectControls.report(
      `Could not save to this browser: ${errorMessage(error)}. Export a project file to be safe.`,
    );
  });

  const controlsColumn = el('div', { class: 'workspace__column' });

  /** Set the moment the collector touches anything, so a late restore cannot undo it. */
  let edited = false;

  function refresh(): void {
    try {
      preview.show(renderSheets([design], sheetConfig, measure), fileNameFor(design.release));
    } catch (error) {
      preview.showProblem(errorMessage(error));
    }
  }

  function changed(): void {
    edited = true;
    refresh();
    saveSoon(project());
  }

  /** Rebuilds the controls from the state, rather than teaching each one to be told. */
  function renderControls(): void {
    const form = createReleaseForm(design.release, (edit) => {
      design = { ...design, release: edit(design.release) };
      changed();
    });

    const search = createReleaseSearch(metadata, (found) => {
      // A looked-up Release keeps its MusicBrainz id, which is what later
      // tickets identify it by.
      design = { ...design, release: found };
      form.setRelease(found);
      changed();
    });

    const designControls = createDesignControls(
      { templateId: design.templateId, params: design.params },
      (change) => {
        design = {
          ...design,
          templateId: change.templateId ?? design.templateId,
          params: change.params ?? design.params,
        };
        changed();
      },
    );

    const labelControls = createLabelControls(design.dimensions.label, (label: LabelDimensions) => {
      design = { ...design, dimensions: { ...design.dimensions, label } };
      changed();
    });

    const sheetControls = createSheetControls(sheetConfig, (changes) => {
      sheetConfig = { ...sheetConfig, ...changes };
      changed();
    });

    clear(controlsColumn);
    controlsColumn.append(
      search,
      form.element,
      designControls,
      labelControls,
      sheetControls,
      projectControls.element,
    );
  }

  function apply(next: Project): void {
    const [first] = next.designs;
    if (first) design = first;
    sheetConfig = next.sheet;
    renderControls();
    changed();
  }

  // A reload leaves at most one debounce window of work unwritten; asking for
  // it on the way out closes that.
  window.addEventListener('pagehide', () => saveSoon.flush());

  renderControls();

  // Fonts are bundled but still load asynchronously, and a unicode-range subset
  // is not fetched until text in that range is drawn. Measuring before one
  // arrives sizes the Sheet against a fallback face, so redraw when any lands.
  void fontsReady().then(refresh);
  onFontsLoaded(refresh);

  // Whatever this browser last held, if anything. A first visit gets the
  // example; a returning one gets its own work back.
  void store
    .load()
    .then((saved) => {
      if (!saved || saved.designs.length === 0) return;
      // Reading the store is asynchronous, and a fast typist can be mid-word
      // before it answers. Their edit wins; the saved copy is already theirs.
      if (edited) return;
      apply(saved);
      projectControls.report('Restored your work from this browser.');
    })
    .catch((error: unknown) => {
      projectControls.report(
        `Could not read this browser's saved work: ${errorMessage(error)}. Starting fresh.`,
      );
    });

  return el('div', { class: 'workspace' }, controlsColumn, preview.element);
}

function fileNameFor(release: Release): string {
  const stem = [release.artist, release.album].filter(Boolean).join(' - ') || 'mdcovergen';
  return `${stem.replace(/[\\/:*?"<>|]/g, '_')}.pdf`;
}
