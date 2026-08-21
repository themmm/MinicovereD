import type { Release } from '../domain/release.ts';
import { errorMessage } from '../errors.ts';
import type { MetadataAdapter, ReleaseSummary, SearchResults } from '../metadata/metadata-adapter.ts';
import { resolveBatchIntoQueue } from '../queue/batch.ts';
import type { BatchRequest } from '../queue/batch.ts';
import type { QueueEntry } from '../queue/release-queue.ts';
import { clear, el } from './dom.ts';

/**
 * Search MusicBrainz, pick a pressing, and hand the resolved Release to the
 * form — where every field stays editable, because database errors should not
 * end up on paper.
 */

/**
 * `Artist — Album` per line; an en or em dash, a hyphen, or a tab all separate.
 *
 * Only the *first* separator splits the line: “F♯A♯∞ — Deluxe Edition” is one
 * album title, and a spaced dash is the only kind that separates, so
 * Jean-Michel Jarre keeps his name. Em, en and figure dashes, the minus sign
 * and a hyphen all separate, because people paste all of them.
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
    .map((line) => {
      const [, artist = line, album = ''] = /^(.*?)(?:\s+[—–‒−-]\s+|\t+)(.*)$/.exec(line) ?? [];
      return { id: `batch-${line}`, artist: artist.trim(), album: album.trim() };
    });
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

export function createReleaseSearch(
  adapter: MetadataAdapter,
  onResolved: (release: Release) => void,
  /** Adds the entries to the queue and answers which of them were new. */
  onBatchResolved: (entries: readonly QueueEntry[]) => readonly QueueEntry[],
): HTMLElement {
  const artist = el('input', {
    class: 'field__input',
    attrs: { type: 'search', id: 'search-artist', placeholder: 'Daft Punk' },
  });
  const album = el('input', {
    class: 'field__input',
    attrs: { type: 'search', id: 'search-album', placeholder: 'Discovery' },
  });
  const status = el('p', { class: 'search__status', attrs: { role: 'status' }, text: '' });
  const results = el('ul', { class: 'results' });
  const submit = el('button', { class: 'button button--primary', text: 'Search', attrs: { type: 'submit' } });

  let busy = false;

  /**
   * The one place that decides whether this panel is working. Everything it
   * can start is disabled together — a batch running with the Search button
   * still lit is a button that silently does nothing.
   */
  function setBusy(active: boolean, message: string): void {
    busy = active;
    submit.toggleAttribute('disabled', active);
    batchButton.toggleAttribute('disabled', active);
    results.toggleAttribute('inert', active);
    status.textContent = message;
  }

  async function search(): Promise<void> {
    if (busy) return;
    const query = { artist: artist.value.trim(), album: album.value.trim() };
    if (!query.artist && !query.album) {
      setBusy(false, 'Type an artist or an album to search for.');
      return;
    }

    clear(results);
    setBusy(true, 'Searching MusicBrainz…');
    try {
      const found = await adapter.search(query);
      setBusy(false, describe(found));
      for (const summary of found.releases) results.appendChild(resultRow(summary));
    } catch (error) {
      setBusy(false, `Search failed: ${errorMessage(error)}`);
    }
  }

  function resultRow(summary: ReleaseSummary): HTMLElement {
    const facts = [
      summary.year,
      summary.country,
      summary.trackCount ? `${summary.trackCount} tracks` : undefined,
      summary.label,
    ].filter((fact): fact is string => !!fact);

    return el(
      'li',
      { class: 'result' },
      el(
        'button',
        {
          class: 'result__pick',
          attrs: { type: 'button' },
          on: { click: () => void pick(summary) },
        },
        el('span', { class: 'result__title', text: `${summary.artist} — ${summary.album}` }),
        el('span', { class: 'result__facts', text: facts.join(' · ') }),
      ),
    );
  }

  async function pick(summary: ReleaseSummary): Promise<void> {
    if (busy) return;
    setBusy(true, `Fetching “${summary.album}”…`);
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
      setBusy(false, `Could not fetch that release: ${errorMessage(error)}`);
      return;
    }

    if (!outcome?.release) {
      setBusy(false, `Could not fetch that release: ${outcome?.error ?? 'unknown error'}`);
      return;
    }
    setBusy(
      false,
      `Filled in “${outcome.release.album}”${
        outcome.release.artwork ? ' with cover art' : ' — no cover art on file'
      }. Every field stays editable.`,
    );
  }

  const batchInput = el('textarea', {
    class: 'field__input field__input--area',
    attrs: {
      rows: 4,
      id: 'search-batch',
      placeholder: 'Daft Punk — Discovery\nCornelius — Fantasma\nGlen Campbell — Wichita Lineman',
    },
  });

  const batchButton = el('button', {
    class: 'button',
    text: 'Look up all',
    attrs: { type: 'button' },
    on: { click: () => void lookUpBatch() },
  });

  async function lookUpBatch(): Promise<void> {
    if (busy) return;
    const wanted = parseBatchLines(batchInput.value);
    if (wanted.length === 0) {
      setBusy(false, 'Put one Release per line, as “Artist — Album”.');
      return;
    }

    clear(results);
    setBusy(true, `Looking up ${wanted.length} Releases, one a second…`);
    try {
      const entries = await resolveBatchIntoQueue(adapter, wanted, (progress) => {
        status.textContent = progress.current
          ? `Looking up ${progress.current} — ${progress.done} of ${progress.total} done…`
          : `Looked up ${progress.done} of ${progress.total}.`;
      });
      const added = onBatchResolved(entries);
      setBusy(
        false,
        describeBatch(
          added.length,
          entries.length - added.length,
          added.filter((entry) => entry.status === 'failed').length,
        ),
      );
      batchInput.value = '';
    } catch (error) {
      setBusy(false, `That batch failed: ${errorMessage(error)}`);
    }
  }

  const form = el(
    'form',
    {
      class: 'panel',
      on: {
        submit: (event) => {
          event.preventDefault();
          void search();
        },
      },
    },
    el('h2', { class: 'panel__title', text: 'Find a Release' }),
    el('p', {
      class: 'panel__hint',
      text: 'Metadata and cover art come from MusicBrainz and the Cover Art Archive. No account, no API key.',
    }),
    el(
      'div',
      { class: 'field-row' },
      el(
        'label',
        { class: 'field', attrs: { for: 'search-artist' } },
        el('span', { class: 'field__label', text: 'Artist' }),
        artist,
      ),
      el(
        'label',
        { class: 'field', attrs: { for: 'search-album' } },
        el('span', { class: 'field__label', text: 'Album' }),
        album,
      ),
    ),
    submit,
    el(
      'label',
      { class: 'field', attrs: { for: 'search-batch' } },
      el('span', { class: 'field__label', text: 'Or look up a batch — one Release per line' }),
      batchInput,
    ),
    batchButton,
    status,
    results,
  );

  return form;
}

/** Says how many matched, and admits when the list is only the closest few. */
function describe({ releases, total }: SearchResults): string {
  if (releases.length === 0) {
    return 'No releases matched. Try fewer words, or enter the Release by hand below.';
  }
  const noun = total === 1 ? 'release' : 'releases';
  return total > releases.length
    ? `${total} ${noun} matched — showing the closest ${releases.length}.`
    : `${total} ${noun} found.`;
}
