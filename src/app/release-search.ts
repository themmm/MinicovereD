import type { Release } from '../domain/release.ts';
import { splitOnSeparator } from '../domain/separator.ts';
import { errorMessage } from '../errors.ts';
import type { MetadataAdapter, ReleaseSummary, SearchResults } from '../metadata/metadata-adapter.ts';
import { resolveBatchIntoQueue, searchQueryFor } from '../queue/batch.ts';
import type { BatchRequest, LineQuery } from '../queue/batch.ts';
import type { QueueEntry } from '../queue/release-queue.ts';
import type { DesignChoice } from '../render/sheet-renderer.ts';
import { clear, el } from './dom.ts';

/**
 * One field, and the entry point to everything (ADR-0010 item 6).
 *
 * It reads four things, and says which one it read before spending a request:
 * `Artist — Album`, a bare title, a MusicBrainz MBID or URL, and several lines
 * at once. There is one convention for all of them — `readLine` below, which
 * every line of a batch goes through too — because a second would be a second
 * thing to learn.
 */

/** A MusicBrainz identifier, on its own or inside a URL pasted from the site. */
const MBID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * `Artist — Album`, or nothing if the line names no artist.
 *
 * The absence is the point: a line with no separator is a title, and the
 * caller has to treat it as one rather than guessing which field it belongs in.
 */
function splitLine(line: string): { artist: string; album: string } | undefined {
  const split = splitOnSeparator(line);
  if (!split) return undefined;
  const [artist, album] = split;
  return { artist, album };
}

/**
 * How one line reads, and the only place that decision is made.
 *
 * A line names both fields or it names a release title, and which one it is
 * cannot depend on how the line arrived. It did: for the whole of v1 the batch
 * kept its own copy of this rule and put a line with no separator into
 * `artist`, so a pasted `Loveless` asked MusicBrainz for a band of that name
 * while the same word typed alone asked for the record. One rule needs one
 * place, and this is it.
 */
function readLine(line: string): LineQuery {
  const split = splitLine(line);
  if (split && split.artist && split.album) return { kind: 'fielded', ...split };
  return { kind: 'text', text: line };
}

/**
 * One request per line.
 *
 * The id is the line itself, not its position in the paste: a line that could
 * not be looked up becomes a Release under this id, and the same line twice is
 * one Release the queue keeps once — not two identical rows to complete by hand.
 */
export function parseBatchLines(text: string): BatchRequest[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => ({ id: `batch-${line}`, query: readLine(line) }));
}

/** What the field was read as. Shown to the collector before a request is spent. */
export type ParsedQuery =
  | { readonly kind: 'empty' }
  | { readonly kind: 'mbid'; readonly mbid: string }
  // How a line is searched, once the field has ruled out an MBID. Spelled the
  // same way here as in a batch, because it is the same reading.
  | LineQuery
  | { readonly kind: 'batch'; readonly requests: readonly BatchRequest[] };

/**
 * Reads the field.
 *
 * An MBID wins over everything, because it identifies a pressing exactly and
 * there is nothing to search for. Several lines are a batch. One line goes
 * through `readLine`, which is also where every line of a batch goes: a line
 * that names no artist is a title, never an artist, which is the case a
 * two-field form could not express.
 */
export function parseQuery(raw: string): ParsedQuery {
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) return { kind: 'empty' };
  if (lines.length > 1) return { kind: 'batch', requests: parseBatchLines(raw) };

  const line = lines[0] ?? '';
  const mbid = MBID.exec(line);
  if (mbid?.[0]) return { kind: 'mbid', mbid: mbid[0].toLowerCase() };

  return readLine(line);
}

/** How the reading reads, so the collector can correct it before it costs a request. */
export function describeQuery(parsed: ParsedQuery): string {
  switch (parsed.kind) {
    case 'empty':
      return '';
    case 'mbid':
      return `MBID · fetching ${parsed.mbid} directly, no search`;
    case 'fielded':
      return `Artist and release · artist “${parsed.artist}” and release “${parsed.album}”`;
    case 'text':
      return `Release title · searching for “${parsed.text}”`;
    case 'batch':
      return `Batch · ${parsed.requests.length} lines, one request a second`;
  }
}

/**
 * One sentence for what a batch actually did. The count that matters is what
 * joined the queue, not what was looked up: two searches can find the same
 * pressing, and the queue keeps one of it.
 */
export function describeBatch(added: number, duplicates: number, failed: number): string {
  // `failed` counts only entries that actually joined the queue, so the three
  // numbers partition the batch instead of overlapping.
  const clauses = [
    added === 0 ? 'Nothing new to add' : `Added ${added} ${added === 1 ? 'Release' : 'Releases'}`,
  ];
  if (duplicates > 0) {
    clauses.push(`${duplicates} ${duplicates === 1 ? 'was' : 'were'} already in the queue`);
  }
  if (failed > 0) {
    clauses.push(
      `${failed} could not be found and ${failed === 1 ? 'needs' : 'need'} completing by hand`,
    );
  }
  return `${clauses.join('; ')}.`;
}

export interface ReleaseSearch {
  /** The form. Lives in the header, and is the widest thing in it. */
  readonly find: HTMLElement;
  /** The result list, which expands under the header across the full width. */
  readonly hits: HTMLElement;
  /** Reopens a list that was closed. Sits in the header beside the field. */
  readonly reopen: HTMLButtonElement;
  /** Marks the row whose Release is the one on screen. */
  markInUse(releaseId: string): void;
  /**
   * Whether a Batch is running right now.
   *
   * The panel's other waits are its own business. This one is not: a Batch hands
   * its Entries over in one piece when the last lookup returns, and adds them to
   * whatever Queue it finds then — so a project applied while the lookups are
   * still running is not replaced by the Batch, it is merged with it. See
   * `project-arrival.ts`, which is what asks.
   */
  isBatchRunning(): boolean;
}

export function createReleaseSearch(
  adapter: MetadataAdapter,
  onResolved: (release: Release) => void,
  /** Adds the entries to the queue and answers which of them were new. */
  onBatchResolved: (entries: readonly QueueEntry[]) => readonly QueueEntry[],
  /**
   * What a Batch dresses its Entries in: the design of the last Release the
   * collector touched. Asked for rather than handed over, because this panel is
   * built once and outlives every Release there will ever be a design for.
   *
   * A single lookup does not need it — that one hands a bare Release over and
   * the workspace dresses it — but a Batch builds whole Entries, so the answer
   * has to reach `resolveBatchIntoQueue`.
   */
  designToCarry: () => DesignChoice,
): ReleaseSearch {
  const input = el('input', {
    class: 'field__input find__input',
    attrs: {
      type: 'search',
      id: 'q',
      'aria-label': 'Search MusicBrainz',
      placeholder: 'Artist — Album, an album title, or a MusicBrainz MBID',
    },
  });

  const parseLine = el('p', { class: 'parse', attrs: { role: 'status' } });
  const status = el('p', { class: 'search__status', attrs: { role: 'status' }, text: '' });
  const rows = el('ul', { class: 'rows' });
  const countLabel = el('span', { class: 'eyebrow__num' });

  const submit = el('button', {
    class: 'button button--primary',
    text: 'Search',
    attrs: { type: 'submit' },
  });

  const reopen = el('button', {
    class: 'button find__reopen',
    attrs: { type: 'button', hidden: 'true' },
    on: { click: () => setOpen(true) },
  });

  const closeButton = el('button', {
    class: 'button button--icon',
    text: '×',
    attrs: { type: 'button', 'aria-label': 'Close the result list', title: 'Close — Esc' },
    on: { click: () => setOpen(false) },
  });

  const hits = el(
    'div',
    { class: 'hits' },
    el(
      'div',
      { class: 'hits__clip' },
      el(
        'div',
        { class: 'wrap' },
        el(
          'div',
          { class: 'hits__inner' },
          el(
            'div',
            { class: 'hits__bar' },
            el(
              'p',
              { class: 'eyebrow hits__eyebrow' },
              countLabel,
              el('span', {
                class: 'eyebrow__tail',
                text: 'MusicBrainz · 1 request/s (ADR-0006)',
              }),
            ),
            closeButton,
          ),
          parseLine,
          rows,
          el('p', {
            class: 'micro prose hits__note',
            text:
              'Picking a Release fills every field below; nothing you edited by hand is ' +
              'overwritten. The list stays open — pick again if this is the wrong pressing.',
          }),
          status,
        ),
      ),
    ),
  );

  /**
   * What the panel is waiting for, if anything.
   *
   * A boolean would do for the panel's own guards, but one of the four waits
   * has to be legible from outside — so the state says *what* it is waiting
   * for, and there is one variable saying it rather than a flag beside a flag
   * that can disagree with it.
   */
  let pending: 'request' | 'batch' | undefined;
  const busy = (): boolean => pending !== undefined;
  let found: readonly ReleaseSummary[] = [];
  let inUse = '';

  /**
   * The list stays open after a pick, and closes only when it is asked to.
   *
   * The first guess is often the wrong pressing, and correcting it must not cost
   * a second search — which at one request a second is the difference between
   * fixing a mistake and waiting for permission to.
   */
  function setOpen(open: boolean): void {
    hits.toggleAttribute('data-open', open);
    reopen.toggleAttribute('hidden', open || found.length === 0);
    if (!open && found.length > 0) input.focus();
  }

  function setPending(next: 'request' | 'batch' | undefined, message: string): void {
    pending = next;
    submit.toggleAttribute('disabled', busy());
    rows.toggleAttribute('inert', busy());
    status.textContent = message;
  }

  function showParse(): void {
    parseLine.textContent = describeQuery(parseQuery(input.value));
  }
  input.addEventListener('input', showParse);

  /**
   * A pasted shelf.
   *
   * One field cannot hold several lines — an `<input>` collapses them to
   * spaces, so `A — B\nC — D` would arrive as one nonsense query and the batch
   * would be unreachable. The paste is where the lines still exist, so that is
   * where the batch is read: paste several and they are looked up as several,
   * paste one and it lands in the field like any other typing.
   *
   * This is also the gesture the feature was for. Nobody types a collection in.
   */
  input.addEventListener('paste', (event) => {
    const pasted = event.clipboardData?.getData('text') ?? '';
    const parsed = parseQuery(pasted);
    if (parsed.kind !== 'batch') return;
    event.preventDefault();
    // One at a time, and not only Batch against Batch: `run` and `pick` already
    // refuse while the panel is waiting, and there is one status line for all of
    // them to narrate into. Two Batches would be the worse case, because
    // `isBatchRunning` — which the workspace trusts to hold an import off —
    // could only describe whichever of them finished first.
    if (busy()) {
      status.textContent = 'Still working on the last one. Wait for it to finish, then paste again.';
      return;
    }
    input.value = '';
    parseLine.textContent = describeQuery(parsed);
    void lookUpBatch(parsed.requests);
  });

  function renderRows(): void {
    clear(rows);
    for (const summary of found) {
      const facts = [
        summary.year,
        summary.label,
        summary.country,
        summary.trackCount ? `${summary.trackCount} tracks` : undefined,
      ].filter((fact): fact is string => !!fact);

      const row = el(
        'button',
        {
          class: 'row',
          attrs: {
            type: 'button',
            ...(summary.mbid === inUse ? { 'aria-current': 'true' } : {}),
          },
          on: { click: () => void pick(summary) },
        },
        el('b', { text: `${summary.artist} — ${summary.album}` }),
        el('span', { text: facts.join(' · ') }),
        el('span', { class: 'use', text: 'in use' }),
      );
      rows.appendChild(el('li', {}, row));
    }
    countLabel.textContent = `${found.length} ${found.length === 1 ? 'Release' : 'Releases'}`;
    reopen.textContent = `${found.length} ${found.length === 1 ? 'hit' : 'hits'}`;
  }

  async function run(): Promise<void> {
    if (busy()) return;
    const parsed = parseQuery(input.value);
    showParse();

    if (parsed.kind === 'empty') {
      setOpen(true);
      setPending(undefined, 'Type an artist and a release, a title, or an MBID.');
      return;
    }
    if (parsed.kind === 'batch') {
      await lookUpBatch(parsed.requests);
      return;
    }
    if (parsed.kind === 'mbid') {
      await fetchDirectly(parsed.mbid);
      return;
    }

    // Whatever is left is one line's reading, and it becomes a MusicBrainz
    // query through the same converter every line of a batch goes through.
    found = [];
    renderRows();
    setOpen(true);
    setPending('request', 'Searching MusicBrainz…');
    try {
      const results = await adapter.search(searchQueryFor(parsed));
      found = results.releases;
      renderRows();
      setPending(undefined, describe(results));
    } catch (error) {
      setPending(undefined, `Search failed: ${errorMessage(error)}`);
    }
  }

  /** An MBID names one pressing, so there is nothing to search and nothing to choose. */
  async function fetchDirectly(mbid: string): Promise<void> {
    setOpen(true);
    setPending('request', `Fetching ${mbid}…`);
    try {
      const release = await adapter.resolve(mbid);
      onResolved(release);
      setPending(
        undefined,
        `Filled in “${release.album}”${
          release.artwork ? ' with cover art' : ' — no cover art on file'
        }. Every field stays editable.`,
      );
    } catch (error) {
      setPending(undefined, `Could not fetch that MBID: ${errorMessage(error)}`);
    }
  }

  async function pick(summary: ReleaseSummary): Promise<void> {
    if (busy()) return;
    setPending('request', `Fetching “${summary.album}”…`);
    // Whatever happens below, this panel has to end up usable again: handing a
    // Release to the workspace rebuilds a good deal of the page, and a throw in
    // there would otherwise leave the panel disabled until a reload.
    let outcome;
    try {
      // A queue of one: resolveBatch reports a failure as an outcome rather
      // than throwing, which is the same path the batch takes.
      [outcome] = await adapter.resolveBatch([{ id: summary.mbid, mbid: summary.mbid }], (progress) => {
        status.textContent = progress.current
          ? `Fetching “${summary.album}” — ${progress.done} of ${progress.total} done…`
          : `Fetched ${progress.done} of ${progress.total}.`;
      });
      if (outcome?.release) onResolved(outcome.release);
    } catch (error) {
      setPending(undefined, `Could not fetch that release: ${errorMessage(error)}`);
      return;
    }

    if (!outcome?.release) {
      setPending(undefined, `Could not fetch that release: ${outcome?.error ?? 'unknown error'}`);
      return;
    }
    setPending(
      undefined,
      `Filled in “${outcome.release.album}”${
        outcome.release.artwork ? ' with cover art' : ' — no cover art on file'
      }. Every field stays editable.`,
    );
  }

  async function lookUpBatch(requests: readonly BatchRequest[]): Promise<void> {
    setOpen(true);
    setPending('batch', `Looking up ${requests.length} Releases, one a second…`);
    try {
      const entries = await resolveBatchIntoQueue(adapter, requests, designToCarry(), (progress) => {
        status.textContent = progress.current
          ? `Looking up ${progress.current} — ${progress.done} of ${progress.total} done…`
          : `Looked up ${progress.done} of ${progress.total}.`;
      });
      const added = onBatchResolved(entries);
      setPending(
        undefined,
        describeBatch(
          added.length,
          entries.length - added.length,
          added.filter((entry) => entry.status === 'failed').length,
        ),
      );
      input.value = '';
      showParse();
    } catch (error) {
      setPending(undefined, `That batch failed: ${errorMessage(error)}`);
    }
  }

  const find = el(
    'form',
    {
      class: 'find',
      on: {
        submit: (event) => {
          event.preventDefault();
          void run();
        },
      },
    },
    el(
      'span',
      { class: 'find__box' },
      // Lucide's search glyph, vendored as inline SVG (ADR-0008): geometry from
      // a set, so the stroke weight and terminals match everything else.
      magnifier(),
      input,
    ),
    submit,
  );

  hits.addEventListener('keydown', (event) => {
    if ((event as KeyboardEvent).key === 'Escape') setOpen(false);
  });
  input.addEventListener('keydown', (event) => {
    if ((event as KeyboardEvent).key === 'Escape' && hits.hasAttribute('data-open')) {
      setOpen(false);
      event.stopPropagation();
    }
  });

  return {
    find,
    hits,
    reopen,
    isBatchRunning: () => pending === 'batch',
    markInUse(releaseId) {
      if (inUse === releaseId) return;
      inUse = releaseId;
      for (const row of rows.querySelectorAll('.row')) row.removeAttribute('aria-current');
      const index = found.findIndex((summary) => summary.mbid === releaseId);
      if (index >= 0) rows.children[index]?.firstElementChild?.setAttribute('aria-current', 'true');
    },
  };
}

function magnifier(): SVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2.2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', '11');
  circle.setAttribute('cy', '11');
  circle.setAttribute('r', '7');
  const handle = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  handle.setAttribute('d', 'm20 20-4.3-4.3');
  svg.append(circle, handle);
  return svg;
}

/** Says how many matched, and admits when the list is only the closest few. */
function describe({ releases, total }: SearchResults): string {
  if (releases.length === 0) {
    return 'No releases matched. Try fewer words, or start a Release by hand.';
  }
  const noun = total === 1 ? 'release' : 'releases';
  return total > releases.length
    ? `${total} ${noun} matched — showing the closest ${releases.length}.`
    : `${total} ${noun} found.`;
}
