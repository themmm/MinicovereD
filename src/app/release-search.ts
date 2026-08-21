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

/** `Artist — Album` per line; an en or em dash, a hyphen, or a tab all separate. */
export function parseBatchLines(text: string): BatchRequest[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line, index) => {
      const [artist = '', album = ''] = line.split(/\s+[—–-]\s+|\t+/, 2);
      return { id: `batch-${index}-${line}`, artist: artist.trim(), album: album.trim() };
    });
}

export function createReleaseSearch(
  adapter: MetadataAdapter,
  onResolved: (release: Release) => void,
  onBatchResolved: (entries: readonly QueueEntry[]) => void,
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

  function setBusy(active: boolean, message: string): void {
    busy = active;
    submit.toggleAttribute('disabled', active);
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
    // A queue of one: resolveBatch reports a failure as an outcome rather than
    // throwing, which is the same path ticket 09's batch will take.
    const [outcome] = await adapter.resolveBatch([{ id: summary.mbid, mbid: summary.mbid }], (progress) => {
      status.textContent = progress.current
        ? `Fetching “${summary.album}” — ${progress.done} of ${progress.total} done…`
        : `Fetched ${progress.done} of ${progress.total}.`;
    });

    if (!outcome?.release) {
      setBusy(false, `Could not fetch that release: ${outcome?.error ?? 'unknown error'}`);
      return;
    }
    onResolved(outcome.release);
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
    batchButton.setAttribute('disabled', '');
    try {
      const entries = await resolveBatchIntoQueue(adapter, wanted, (progress) => {
        status.textContent = progress.current
          ? `Looking up ${progress.current} — ${progress.done} of ${progress.total} done…`
          : `Looked up ${progress.done} of ${progress.total}.`;
      });
      onBatchResolved(entries);

      const failed = entries.filter((entry) => entry.status === 'failed').length;
      setBusy(
        false,
        failed === 0
          ? `Added ${entries.length} Releases to the queue.`
          : `Added ${entries.length} Releases; ${failed} could not be found and need completing by hand.`,
      );
      batchInput.value = '';
    } catch (error) {
      setBusy(false, `That batch failed: ${errorMessage(error)}`);
    } finally {
      batchButton.removeAttribute('disabled');
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
