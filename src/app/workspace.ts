import { A4, DEFAULT_PRINTABLE_MARGIN_MM } from '../domain/paper.ts';
import { DEFAULT_PART_DIMENSIONS, PART_KINDS } from '../domain/parts.ts';
import type { LabelDimensions } from '../domain/parts.ts';
import { blankRelease } from '../domain/release.ts';
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
import { createEmptyState } from './empty-state.ts';
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

/** What a Release is designed with until the collector changes any of it. */
const DEFAULT_DESIGN = {
  templateId: 'classic',
  params: DEFAULT_TEMPLATE_PARAMS,
  dimensions: DEFAULT_PART_DIMENSIONS,
} as const satisfies Omit<ReleaseDesign, 'release'>;

export function createWorkspace(): HTMLElement {
  // Nothing until the collector has something. A first visit is the empty
  // state; a returning one is whatever this browser saved.
  let queue: QueueEntry[] = [];
  let selectedId = '';
  let sheetConfig: SheetConfig = {
    paper: A4,
    marginMm: DEFAULT_PRINTABLE_MARGIN_MM,
    parts: PART_KINDS,
  };

  const project = (): Project => ({ entries: queue, sheet: sheetConfig });
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
      imported.entries.length === 0
        ? // A readable file can still hold no Releases. Saying "your work has
          // been replaced" when nothing was is the one thing not to do here.
          'That project had no Releases in it, so your queue is untouched. Its Sheet settings were applied.'
        : `Opened ${imported.entries.length} ${
            imported.entries.length === 1 ? 'Release' : 'Releases'
          }. Your previous work has been replaced.`,
    );
  });

  const saveSoon = debounceSave(store, AUTOSAVE_DELAY_MS, (error) => {
    projectControls.report(
      `Could not save to this browser: ${errorMessage(error)}. Export a project file to be safe.`,
    );
  });

  const queuePanel = createQueuePanel({
    addByHand: () => startReleaseByHand(),
    select: (releaseId) => {
      selectedId = releaseId;
      showSelectedRelease();
      refresh();
    },
    move: (releaseId, offset) => {
      queue = moveInQueue(queue, releaseId, offset);
      changed();
    },
    remove: (releaseId) => {
      queue = removeFromQueue(queue, releaseId);
      // Removing what was selected moves the form to whatever is left — and
      // removing the last one is allowed to leave nothing, which is the empty
      // state again rather than an error.
      if (!queue.some((entry) => entry.design.release.id === selectedId)) {
        selectedId = queue[0]?.design.release.id ?? '';
        selectionChanged();
        return;
      }
      changed();
    },
  });

  const controlsColumn = el('div', { class: 'workspace__column' });
  /** Holds only the panels that show the selected Release, and is the only part rebuilt. */
  const releasePanels = el('div', { class: 'workspace__panels' });

  /** Set the moment the collector touches anything, so a late restore cannot undo it. */
  let edited = false;

  function refresh(): void {
    queuePanel.show(queue, selectedId);
    try {
      preview.show(
        renderSheets(queueDesigns(queue), sheetConfig, measure),
        fileNameFor(queue),
        queue.length === 0 ? 'No Sheets yet — start with a Release.' : undefined,
      );
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

  /** A change to *which* Release is being edited, which the form must follow. */
  function selectionChanged(): void {
    showSelectedRelease();
    changed();
  }

  /**
   * A Release of the collector's own, ready to type into. Reachable from the
   * empty state and from the Queue, because a mixtape is not something a
   * database can be asked for — and neither is a second one.
   */
  function startReleaseByHand(): void {
    const release = blankRelease();
    queue = addToQueue(queue, readyEntry({ ...DEFAULT_DESIGN, release }));
    selectedId = release.id;
    selectionChanged();
    // The form is the whole point of pressing the button; land the caret in it
    // rather than making them go and find it.
    controlsColumn.querySelector<HTMLInputElement>('#field-artist')?.focus();
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

  /**
   * Searching is not a view of the selected Release, so it is built once and
   * outlives every selection change. Rebuilding it would throw away the
   * results on screen, the batch still being typed, and — because a lookup
   * reports its outcome after handing the Releases over — the very sentence
   * saying how the batch went.
   */
  const search = createReleaseSearch(
    metadata,
    (found) => {
      // A looked-up Release joins the queue and becomes the one being edited,
      // keeping the design settings of whichever Release was on screen, so a
      // second lookup matches the first rather than reverting to plain.
      const settings = selected()?.design ?? DEFAULT_DESIGN;
      queue = addToQueue(queue, readyEntry({ ...settings, release: found }));
      selectedId = found.id;
      selectionChanged();
    },
    (entries) => {
      const added: QueueEntry[] = [];
      for (const entry of entries) {
        // addToQueue refuses a Release already queued, so the queue growing is
        // what "this one is new" means.
        const grown = addToQueue(queue, entry);
        if (grown.length > queue.length) added.push(entry);
        queue = grown;
      }
      if (added.length > 0) selectedId = added[0]?.design.release.id ?? selectedId;
      selectionChanged();
      // The search panel says how it went, in the panel the collector pressed —
      // and it needs what actually joined the queue, not what was looked up.
      return added;
    },
  );

  /**
   * The Sheet is a property of the print job, not of the Release being edited,
   * so these controls are built once alongside the search panel — and are told
   * when a configuration arrives from somewhere else.
   */
  const sheetControls = createSheetControls(sheetConfig, (changes) => {
    sheetConfig = { ...sheetConfig, ...changes };
    changed();
  });

  /**
   * First in the column, because onboarding below the fold is not onboarding.
   * It swaps with the Queue panel rather than sitting alongside it: an empty
   * list saying "nothing queued yet" is the same sentence twice.
   */
  const emptyState = createEmptyState(startReleaseByHand);

  controlsColumn.append(
    emptyState.element,
    search,
    queuePanel.element,
    releasePanels,
    sheetControls.element,
    projectControls.element,
  );

  /**
   * Rebuilds the panels that *are* a view of the selected Release.
   *
   * Only those: detaching a node takes the focus inside it with it, so
   * rebuilding the whole column would blow away the caret and the queue's
   * scroll position on every selection change — which is most of what the
   * collector does.
   */
  function showSelectedRelease(): void {
    const entry = selected();
    emptyState.element.hidden = !!entry;
    queuePanel.element.hidden = !entry;
    clear(releasePanels);
    if (!entry) {
      selectedId = '';
      return;
    }
    selectedId = entry.design.release.id;
    const { design } = entry;

    const form = createReleaseForm(design.release, (edit) => {
      updateSelected((current) => ({ ...current, release: edit(current.release) }));
    });

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

    releasePanels.append(form.element, designControls, labelControls);
    // No `queuePanel.show` here: every caller refreshes straight afterwards,
    // and rendering the list twice destroys the focus in it twice.
  }

  function applyProject(next: Project): void {
    if (next.entries.length > 0) {
      // Entries, not designs: an entry that still needs completing by hand
      // comes back still flagged, because that flag is the collector's to-do
      // list and a reload should not quietly tick it off.
      queue = [...next.entries];
      selectedId = queue[0]?.design.release.id ?? '';
    }
    sheetConfig = next.sheet;
    sheetControls.show(sheetConfig);
    selectionChanged();
  }

  // A reload leaves at most one debounce window of work unwritten; asking for
  // it on the way out closes that.
  window.addEventListener('pagehide', () => saveSoon.flush());

  showSelectedRelease();
  refresh();

  // Fonts are bundled but still load asynchronously, and a unicode-range subset
  // is not fetched until text in that range is drawn. Measuring before one
  // arrives sizes the Sheet against a fallback face, so redraw when any lands.
  void fontsReady().then(refresh);
  onFontsLoaded(refresh);

  // Whatever this browser last held, if anything. Until this settles, the
  // empty state does not offer to start anything: an edit beats a late
  // restore, so a click made before the answer arrives would discard a queue
  // the collector was never shown.
  emptyState.setRestoring(true);
  void store
    .load()
    .then((saved) => {
      if (!saved) return;
      // Reading the store is asynchronous, and a fast typist can be mid-word
      // before it answers. Their edit wins; the saved copy is already theirs.
      if (edited) return;
      applyProject(saved);
      // An empty queue is a real thing to have saved — the collector printed
      // their sheets and cleared it. Their paper and margin still come back;
      // there is just nothing to announce.
      if (saved.entries.length === 0) return;
      const needing = saved.entries.filter((entry) => entry.status === 'failed').length;
      projectControls.report(
        `Restored ${saved.entries.length} ${
          saved.entries.length === 1 ? 'Release' : 'Releases'
        } from this browser${needing > 0 ? `, ${needing} still needing a hand` : ''}.`,
      );
    })
    .catch((error: unknown) => {
      projectControls.report(
        `Could not read this browser's saved work: ${errorMessage(error)}. Starting fresh.`,
      );
    })
    .finally(() => emptyState.setRestoring(false));

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
