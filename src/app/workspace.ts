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
import {
  addToQueue,
  moveInQueue,
  queueDesigns,
  readyEntry,
  removeFromQueue,
  replaceInQueue,
} from '../queue/release-queue.ts';
import type { QueueEntry } from '../queue/release-queue.ts';
import { renderCalibrationSheet } from '../render/calibration.ts';
import { createCanvasTextMeasurer, fontsReady, onFontsLoaded } from '../render/canvas-text-measurer.ts';
import { DEFAULT_TEMPLATE_PARAMS, renderSheets } from '../render/sheet-renderer.ts';
import type { ReleaseDesign, SheetConfig } from '../render/sheet-renderer.ts';
import { createDesignControls } from './design-controls.ts';
import { clear, el } from './dom.ts';
import { createLabelControls } from './label-controls.ts';
import { createProjectControls } from './project-controls.ts';
import { createQueuePanel } from './queue-panel.ts';
import { createReleaseForm } from './release-form.ts';
import { createReleaseSearch } from './release-search.ts';
import { createSheetControls } from './sheet-controls.ts';
import { createSheetPreview } from './sheet-preview.ts';

/**
 * The workspace: a queue of Releases on the left, the Sheets they pack onto on
 * the right. It owns the state — and, since ADR-0001 puts that state nowhere
 * but this browser, saving it.
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

const exampleDesign = (): ReleaseDesign => ({
  release: EXAMPLE_RELEASE,
  templateId: 'classic',
  params: DEFAULT_TEMPLATE_PARAMS,
  dimensions: DEFAULT_PART_DIMENSIONS,
});

export function createWorkspace(): HTMLElement {
  let queue: QueueEntry[] = [readyEntry(exampleDesign())];
  let selectedId: string = EXAMPLE_RELEASE.id;
  let sheetConfig: SheetConfig = {
    paper: A4,
    marginMm: DEFAULT_PRINTABLE_MARGIN_MM,
    parts: PART_KINDS,
  };

  const project = (): Project => ({ designs: queueDesigns(queue), sheet: sheetConfig });
  const selected = (): QueueEntry | undefined =>
    queue.find((entry) => entry.design.release.id === selectedId) ?? queue[0];

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
          selected()?.design.dimensions ?? DEFAULT_PART_DIMENSIONS,
          measure,
        );
        preview.show(layouts, 'mdcovergen-calibration.pdf');
      },
    },
  });
  const preview = createSheetPreview({ actions: [calibrationButton] });

  const projectControls = createProjectControls(project, (imported) => {
    applyProject(imported);
    projectControls.report(
      `Opened ${imported.designs.length} ${
        imported.designs.length === 1 ? 'Release' : 'Releases'
      }. Your previous work has been replaced.`,
    );
  });

  const saveSoon = debounceSave(store, AUTOSAVE_DELAY_MS, (error) => {
    projectControls.report(
      `Could not save to this browser: ${errorMessage(error)}. Export a project file to be safe.`,
    );
  });

  const queuePanel = createQueuePanel({
    select: (releaseId) => {
      selectedId = releaseId;
      renderControls();
      refresh();
    },
    move: (releaseId, offset) => {
      queue = moveInQueue(queue, releaseId, offset);
      changed();
    },
    remove: (releaseId) => {
      queue = removeFromQueue(queue, releaseId);
      if (queue.length === 0) queue = [readyEntry(exampleDesign())];
      // Removing what was selected moves the form to whatever is left.
      if (!queue.some((entry) => entry.design.release.id === selectedId)) {
        selectedId = queue[0]?.design.release.id ?? '';
        selectionChanged();
        return;
      }
      changed();
    },
  });

  const controlsColumn = el('div', { class: 'workspace__column' });

  /** Set the moment the collector touches anything, so a late restore cannot undo it. */
  let edited = false;

  function refresh(): void {
    queuePanel.show(queue, selectedId);
    try {
      preview.show(renderSheets(queueDesigns(queue), sheetConfig, measure), fileNameFor(queue));
    } catch (error) {
      preview.showProblem(errorMessage(error));
    }
  }

  /**
   * A change to the design being edited. Deliberately does *not* rebuild the
   * controls: they already show what the collector just typed, and replacing
   * the field they are typing into takes the caret with it.
   */
  function changed(): void {
    edited = true;
    refresh();
    saveSoon(project());
  }

  /** A change to *which* Release is being edited, which the controls must follow. */
  function selectionChanged(): void {
    renderControls();
    changed();
  }

  /** Replaces the selected entry, leaving the rest of the queue alone. */
  function updateSelected(change: (design: ReleaseDesign) => ReleaseDesign): void {
    queue = replaceInQueue(queue, selectedId, (entry) => ({
      // Editing a failed entry by hand is what completes it.
      status: 'ready',
      design: change(entry.design),
    }));
    changed();
  }

  /** Rebuilds the controls from the state, rather than teaching each one to be told. */
  function renderControls(): void {
    const entry = selected();
    if (!entry) return;
    selectedId = entry.design.release.id;
    const { design } = entry;

    const form = createReleaseForm(design.release, (edit) => {
      updateSelected((current) => ({ ...current, release: edit(current.release) }));
    });

    const search = createReleaseSearch(
      metadata,
      (found) => {
        // A looked-up Release joins the queue and becomes the one being edited.
        queue = addToQueue(queue, readyEntry({ ...design, release: found }));
        selectedId = found.id;
        selectionChanged();
      },
      (entries) => {
        const before = queue.length;
        for (const resolvedEntry of entries) queue = addToQueue(queue, resolvedEntry);
        const added = queue.length - before;
        if (added > 0) selectedId = entries[0]?.design.release.id ?? selectedId;
        if (added < entries.length) {
          projectControls.report(
            `${entries.length - added} of those Releases were already in the queue.`,
          );
        }
        selectionChanged();
      },
    );

    const designControls = createDesignControls(
      { templateId: design.templateId, params: design.params },
      (change) => {
        updateSelected((current) => ({
          ...current,
          templateId: change.templateId ?? current.templateId,
          params: change.params ?? current.params,
        }));
      },
    );

    const labelControls = createLabelControls(design.dimensions.label, (label: LabelDimensions) => {
      updateSelected((current) => ({
        ...current,
        dimensions: { ...current.dimensions, label },
      }));
    });

    const sheetControls = createSheetControls(sheetConfig, (changes) => {
      sheetConfig = { ...sheetConfig, ...changes };
      changed();
    });

    clear(controlsColumn);
    controlsColumn.append(
      search,
      queuePanel.element,
      form.element,
      designControls,
      labelControls,
      sheetControls,
      projectControls.element,
    );
    queuePanel.show(queue, selectedId);
  }

  function applyProject(next: Project): void {
    if (next.designs.length > 0) {
      queue = next.designs.map(readyEntry);
      selectedId = queue[0]?.design.release.id ?? '';
    }
    sheetConfig = next.sheet;
    selectionChanged();
  }

  // A reload leaves at most one debounce window of work unwritten; asking for
  // it on the way out closes that.
  window.addEventListener('pagehide', () => saveSoon.flush());

  renderControls();
  refresh();

  // Fonts are bundled but still load asynchronously, and a unicode-range subset
  // is not fetched until text in that range is drawn. Measuring before one
  // arrives sizes the Sheet against a fallback face, so redraw when any lands.
  void fontsReady().then(refresh);
  onFontsLoaded(refresh);

  // Whatever this browser last held, if anything.
  void store
    .load()
    .then((saved) => {
      if (!saved || saved.designs.length === 0) return;
      // Reading the store is asynchronous, and a fast typist can be mid-word
      // before it answers. Their edit wins; the saved copy is already theirs.
      if (edited) return;
      applyProject(saved);
      projectControls.report(
        `Restored ${saved.designs.length} ${
          saved.designs.length === 1 ? 'Release' : 'Releases'
        } from this browser.`,
      );
    })
    .catch((error: unknown) => {
      projectControls.report(
        `Could not read this browser's saved work: ${errorMessage(error)}. Starting fresh.`,
      );
    });

  return el('div', { class: 'workspace' }, controlsColumn, preview.element);
}

/** Names the file after the queue: one Release by name, several by count. */
function fileNameFor(queue: readonly QueueEntry[]): string {
  const [first] = queue;
  if (queue.length === 1 && first) {
    const { artist, album } = first.design.release;
    const stem = [artist, album].filter(Boolean).join(' - ') || 'mdcovergen';
    return `${stem.replace(/[\\/:*?"<>|]/g, '_')}.pdf`;
  }
  return `mdcovergen-${queue.length}-releases.pdf`;
}
