import { A4, DEFAULT_PRINTABLE_MARGIN_MM } from '../domain/paper.ts';
import { DEFAULT_PART_DIMENSIONS, PART_KINDS } from '../domain/parts.ts';
import type { LabelDimensions } from '../domain/parts.ts';
import { blankRelease } from '../domain/release.ts';
import type { Credits, Release } from '../domain/release.ts';
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
  withCreditsInQueue,
} from '../queue/release-queue.ts';
import type { QueueEntry } from '../queue/release-queue.ts';
import { renderCalibrationSheet } from '../render/calibration.ts';
import { EXPORT_DPI } from '../render/raster.ts';
import { createCanvasTextMeasurer, fontsReady, onFontsLoaded } from '../render/canvas-text-measurer.ts';
import { DEFAULT_TEMPLATE_PARAMS, renderSheets } from '../render/sheet-renderer.ts';
import type { ReleaseDesign, SheetConfig } from '../render/sheet-renderer.ts';
import { createDesignControls } from './design-controls.ts';
import { clear, el } from './dom.ts';
import { createEmptyState } from './empty-state.ts';
import { createFold } from './fold.ts';
import { createLabelControls } from './label-controls.ts';
import { createPartBand } from './part-band.ts';
import { admitRestore, refuseImport } from './project-arrival.ts';
import type { SessionWork } from './project-arrival.ts';
import { createProjectControls } from './project-controls.ts';
import { createQueuePanel } from './queue-panel.ts';
import { createReleaseForm } from './release-form.ts';
import type { ReleaseForm } from './release-form.ts';
import { createReleaseSearch } from './release-search.ts';
import { createSheetControls } from './sheet-controls.ts';
import { createSheetPreview, PREVIEW_DPI } from './sheet-preview.ts';

/**
 * The workspace, laid out as ADR-0010 decides: search, the Release being
 * designed, its three Parts at one shared scale, and everything else folded
 * away with a summary on its header.
 *
 * The two-column arrangement this replaces put the controls beside a permanent
 * A4 Sheet, which meant the Front Panel was on screen at roughly 2× physical
 * size with two-thirds of the preview showing empty paper. The Parts are the
 * page now; the Sheet is a check.
 *
 * It owns the state — and, since ADR-0001 puts that state nowhere but this
 * browser, saving it.
 */

/** Long enough that typing does not write on every keystroke, short enough to survive a reload. */
const AUTOSAVE_DELAY_MS = 600;

/** What a Release is designed with until the collector changes any of it. */
const DEFAULT_DESIGN = {
  templateId: 'classic',
  params: DEFAULT_TEMPLATE_PARAMS,
  dimensions: DEFAULT_PART_DIMENSIONS,
} as const satisfies Omit<ReleaseDesign, 'release'>;

export interface Workspace {
  /** The search form. Lives in the header, because it is the entry point. */
  readonly find: HTMLElement;
  /** Reopens a closed result list. Beside the field. */
  readonly reopen: HTMLButtonElement;
  /** The result list, full-bleed under the header. */
  readonly hits: HTMLElement;
  /** Everything else. */
  readonly main: HTMLElement;
}

export function createWorkspace(): Workspace {
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
        preview.show(layouts, 'minicovered-calibration.pdf');
        outputFold.setOpen(true);
      },
    },
  });
  const preview = createSheetPreview();
  // Export sits in the band's head, beside the Parts it exports — not at the
  // bottom of a page the collector has to scroll to find (ADR-0010).
  const partBand = createPartBand({ actions: [preview.exportButton] });

  const projectControls = createProjectControls(project, (imported) => {
    // The file has been read and understood by now, and is still not applied:
    // a running Batch outranks it, because the Batch would append its Entries
    // to this project's Queue when it finishes (see project-arrival.ts).
    const refused = refuseImport(sessionWork());
    if (refused) {
      projectControls.report(refused);
      return;
    }
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

  /**
   * The Release on screen, named in display type.
   *
   * Not decoration: with the controls folded away, this is the only thing
   * saying which of several queued Releases the Parts below belong to.
   */
  const heroTitle = el('h2', { class: 'display' });
  const heroMeta = el('div', { class: 'hero__meta' });
  const hero = el(
    'section',
    { class: 'hero' },
    el('p', { class: 'eyebrow hero__eyebrow' }, el('span', { class: 'eyebrow__num', text: 'Release' })),
    heroTitle,
    heroMeta,
  );

  /**
   * The folds are built once and only their contents are replaced, so that a
   * fold the collector opened stays open when they select another Release.
   * Rebuilding the folds themselves would close them all on every selection.
   */
  const metadataFold = createFold({ index: '01', title: 'Metadata' });
  const designFold = createFold({ index: '02', title: 'Design' });
  const outputFold = createFold(
    { index: '03', title: 'Sheet check & output' },
    preview.element,
    el('div', { class: 'output__controls' }),
  );
  const outputControls = outputFold.body.querySelector('.output__controls') as HTMLElement;

  preview.onSummary((summary) => outputFold.setSummary(summary));

  const folds = el('div', { class: 'folds' }, metadataFold.element, designFold.element, outputFold.element);
  /**
   * The end of the page: the two things that put ink on paper, the two that move
   * a project, and the sentence that says the preview and the print are one
   * renderer — which is the claim the whole app rests on.
   */
  const actions = el(
    'div',
    { class: 'actions' },
    calibrationButton,
    projectControls.exportButton,
    projectControls.openButton,
    el('span', {
      class: 'micro prose actions__note',
      text: `Same renderer as the PDF — ${PREVIEW_DPI} DPI here, ${EXPORT_DPI} on export, identical geometry.`,
    }),
    projectControls.element,
  );

  /** Everything that is a view of a selected Release, hidden together when there is none. */
  const designSurface = el('div', { class: 'workspace__design' }, hero, partBand.element, folds, actions);

  /** Set the moment the collector touches anything, so a late restore cannot undo it. */
  let edited = false;

  /** The Release form on screen, for the one thing that arrives after it is built. */
  let releaseForm: ReleaseForm | undefined;

  /**
   * What this session has already done, for whatever has to decide that it may
   * not be replaced. The Batch is the search panel's to know about, so it is
   * asked rather than tracked twice.
   */
  function sessionWork(): SessionWork {
    return { edited, batchRunning: search.isBatchRunning() };
  }

  function refresh(): void {
    queuePanel.show(queue, selectedId);
    const entry = selected();
    showHero(entry);
    showSummaries(entry);
    // The result list stays open after a pick, so it has to say which of its
    // rows is the Release on screen — otherwise picking again to correct a
    // wrong pressing is a guess about what was picked the first time.
    search.markInUse(entry?.design.release.id ?? '');
    try {
      const sheets = renderSheets(queueDesigns(queue), sheetConfig, measure);
      preview.show(
        sheets,
        fileNameFor(queue),
        queue.length === 0 ? 'No Sheets yet — start with a Release.' : undefined,
      );
      partBand.show(sheets, entry);
    } catch (error) {
      preview.showProblem(errorMessage(error));
      partBand.show([], undefined);
    }
  }

  /**
   * The closed folds say what is inside them, on every change rather than only
   * when the selection moves.
   *
   * A summary is the whole reason a fold is allowed to be closed (ADR-0010 item
   * 6): it is what makes the contents known without opening it. One that still
   * reads "nothing filled in yet" over a Release with a tracklist in it is worse
   * than no summary at all, because it is read as current.
   */
  function showSummaries(entry: QueueEntry | undefined): void {
    if (!entry) return;
    const { release, templateId, dimensions } = entry.design;
    const named = [release.artist, release.album].filter(Boolean).join(' — ');
    metadataFold.setSummary(
      `${named || 'nothing filled in yet'} · ${release.tracks.length} ${
        release.tracks.length === 1 ? 'track' : 'tracks'
      }${release.credits ? ' · credits' : ''}`,
    );
    designFold.setSummary(
      `Template ${templateId} · Label ${dimensions.label.width} × ${dimensions.label.height} mm`,
    );
  }

  /** The hero follows every keystroke, because it is showing what is being typed. */
  function showHero(entry: QueueEntry | undefined): void {
    if (!entry) {
      heroTitle.textContent = '';
      heroMeta.textContent = '';
      return;
    }
    const { artist, album, year, notes, tracks, id } = entry.design.release;
    heroTitle.textContent = album || 'Untitled Release';
    clear(heroMeta);
    const facts = [
      artist || 'Unknown artist',
      year ? String(year) : '',
      notes ?? '',
      `${tracks.length} ${tracks.length === 1 ? 'track' : 'tracks'}`,
      // A looked-up Release is named by its MBID, one started by hand is not.
      id.startsWith('hand-') ? 'by hand' : `MusicBrainz ${id.slice(0, 4)}…${id.slice(-4)}`,
    ].filter((fact) => fact.length > 0);
    for (const fact of facts) heroMeta.appendChild(el('span', { text: fact }));
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
    // The form is the whole point of pressing the button, and it is now behind
    // a fold: open it before reaching for the field, or the caret lands in
    // something nobody can see.
    metadataFold.setOpen(true);
    metadataFold.body.querySelector<HTMLInputElement>('#field-artist')?.focus();
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
   * Credits for a Release that has just arrived from a lookup (ADR-0013).
   *
   * Asked for here rather than inside the lookup, and only for a Release a
   * lookup just produced. Nothing waits for the answer: the Release is already
   * in the queue and on screen, and Discogs has a queue of its own inside the
   * adapter, so an answer that is late, refused or never given costs the
   * collector nothing.
   *
   * "Only a lookup" is the whole rule, and it is why a restored project asks for
   * nothing. Reopening yesterday's work is not a lookup, and a queue of thirty
   * Releases would put thirty requests on the network the moment the page loaded
   * — which nobody asked for, and which would be a poor way to spend somebody
   * else's rate limit.
   */
  function requestCredits(release: Release): void {
    if (release.credits || release.discogsId === undefined) return;
    void metadata.fetchCredits(release).then((credits) => {
      if (credits) applyCredits(release.id, credits);
    });
  }

  /** Credits arriving for a Release that may no longer be selected, or queued at all. */
  function applyCredits(releaseId: string, credits: Credits): void {
    // Nothing back means nothing changed: the Release has gone, or it already
    // carries credits — the collector's own, or an earlier answer. Either
    // outranks this one.
    const filled = withCreditsInQueue(queue, releaseId, credits);
    if (!filled) return;
    queue = filled;

    // The one field, not the whole form: rebuilding it would take the caret out
    // of whatever the collector is typing into right now.
    if (releaseId === selectedId) releaseForm?.showCredits(credits);
    // `changed()` deliberately not called. It would mark the session as edited,
    // and a second source answering is not the collector changing something.
    // Nothing reaches here without a lookup having marked the session already,
    // so this is about what that flag means rather than about a bug it has.
    refresh();
    saveSoon(project());
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
      requestCredits(found);
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
      // One per Release this Batch resolved, which is not the same as one per
      // Release it added: a line that was already in the Queue was still
      // resolved, and the copy in the Queue may have come from a restored file
      // with no credits at all. `applyCredits` refuses to overwrite, so asking
      // for one that is already there costs a request and changes nothing.
      for (const entry of entries) requestCredits(entry.design.release);
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

  outputControls.append(sheetControls.element);

  /**
   * First on the page, because onboarding below the fold is not onboarding.
   * It swaps with the Queue panel rather than sitting alongside it: an empty
   * list saying "nothing queued yet" is the same sentence twice.
   */
  const emptyState = createEmptyState(startReleaseByHand);

  const main = el(
    'div',
    { class: 'workspace' },
    emptyState.element,
    queuePanel.element,
    designSurface,
  );

  /**
   * Refills the folds that *are* a view of the selected Release.
   *
   * Only those: detaching a node takes the focus inside it with it, so
   * rebuilding more than this would blow away the caret and the queue's scroll
   * position on every selection change — which is most of what the collector
   * does.
   */
  function showSelectedRelease(): void {
    const entry = selected();
    emptyState.element.hidden = !!entry;
    queuePanel.element.hidden = !entry;
    // Nothing to design is not an empty design surface: it is no design
    // surface, so the Parts band and every fold go with it.
    designSurface.hidden = !entry;

    clear(metadataFold.body);
    clear(designFold.body);
    releaseForm = undefined;
    if (!entry) {
      selectedId = '';
      return;
    }
    selectedId = entry.design.release.id;
    const { design } = entry;

    const form = createReleaseForm(design.release, (edit) => {
      updateSelected((current) => ({ ...current, release: edit(current.release) }));
    });
    releaseForm = form;

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

    metadataFold.body.appendChild(form.element);
    designFold.body.append(designControls, labelControls);
    // No summaries here: `refresh` sets them on every change, and every caller
    // of this function refreshes straight afterwards.
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
      // Reading the store is asynchronous, and by the time it answers a fast
      // typist can be mid-word and a pasted Batch can be halfway through its
      // lookups. Either way the work on screen is the newer of the two, and
      // this copy is already the collector's own.
      if (!admitRestore(sessionWork())) return;
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

  return { find: search.find, reopen: search.reopen, hits: search.hits, main };
}

/** Names the file after the queue: one Release by name, several by count. */
function fileNameFor(queue: readonly QueueEntry[]): string {
  const [first] = queue;
  if (queue.length === 1 && first) {
    const { artist, album } = first.design.release;
    const stem = [artist, album].filter(Boolean).join(' - ') || 'minicovered';
    return `${stem.replace(/[\\/:*?"<>|]/g, '_')}.pdf`;
  }
  return `minicovered-${queue.length}-releases.pdf`;
}
