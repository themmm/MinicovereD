import { errorMessage } from '../errors.ts';
import type { MetadataAdapter, SearchQuery } from '../metadata/metadata-adapter.ts';
import type { DesignChoice } from '../render/sheet-renderer.ts';
import { readyEntry, unresolvedEntry } from './release-queue.ts';
import type { QueueEntry } from './release-queue.ts';

/**
 * Resolving a batch of searches into queue entries.
 *
 * The one rule that matters: a lookup that finds nothing, or fails outright,
 * produces an entry rather than an exception. One missing album must not block
 * the other nine, and the collector should end up with a card they can complete
 * by hand rather than a gap they have to notice.
 */

/**
 * What one line asked for, as a search.
 *
 * A line names both fields, or it names a release title. There is deliberately
 * no third reading that names an artist and nothing else — a line with no
 * separator is a title, and a plain `artist` string could not tell that case
 * from a real artist, which is how a pasted `Loveless` came to be searched for
 * as a band.
 *
 * An MBID is not one of these, because it is not a search. The field resolves
 * one directly and decides that before it gets here; a paste does not, so an
 * MBID among several lines is searched as a title. That is what v1 did with it
 * too, and closing it is a ticket of its own.
 */
export type LineQuery =
  | { readonly kind: 'fielded'; readonly artist: string; readonly album: string }
  | { readonly kind: 'text'; readonly text: string };

export interface BatchRequest {
  /** The caller's own id for this entry, so progress can be matched to a row. */
  readonly id: string;
  /** How the line read — the same reading the field gives that line typed alone. */
  readonly query: LineQuery;
}

/**
 * The one place a line's reading becomes a MusicBrainz query.
 *
 * Shared with the single-line path in `release-search.ts`, and that sharing is
 * the point: it is what makes a pasted line and a typed line one search rather
 * than two searches that have to be kept in agreement by hand.
 */
export const searchQueryFor = (query: LineQuery): SearchQuery =>
  query.kind === 'fielded' ? { artist: query.artist, album: query.album } : { text: query.text };

/**
 * What the line named, in the two fields a Release has.
 *
 * A title goes in `album`, where a title goes, and the artist is left blank —
 * which is the one thing a title-only line is actually missing, and so the one
 * thing left to type on a card that has to be finished by hand.
 */
const namedIn = (query: LineQuery): { readonly artist: string; readonly album: string } =>
  query.kind === 'fielded'
    ? { artist: query.artist, album: query.album }
    : { artist: '', album: query.text };

export interface BatchProgress {
  readonly done: number;
  readonly total: number;
  /** The entry being looked up right now, named as the collector typed it. */
  readonly current?: string;
}

const describe = (request: BatchRequest): string => {
  const { artist, album } = namedIn(request.query);
  return [artist, album].filter(Boolean).join(' — ') || request.id;
};

export async function resolveBatchIntoQueue(
  adapter: MetadataAdapter,
  requests: readonly BatchRequest[],
  /**
   * What every Entry this Batch produces is dressed in — the design of the last
   * Release the collector touched, read once when the Batch starts.
   *
   * Read once rather than per Entry so a Batch of twenty-five comes back
   * looking like one set: a Template changed while the lookups are running
   * applies to what arrives after the Batch, not to the middle of it.
   */
  design: DesignChoice,
  onProgress: (progress: BatchProgress) => void,
): Promise<QueueEntry[]> {
  const entries: QueueEntry[] = [];
  onProgress({ done: 0, total: requests.length });

  for (const request of requests) {
    onProgress({ done: entries.length, total: requests.length, current: describe(request) });
    const { artist, album } = namedIn(request.query);

    try {
      const { releases } = await adapter.search(searchQueryFor(request.query));
      const best = releases[0];
      if (!best) {
        entries.push(
          unresolvedEntry(
            design,
            request.id,
            artist,
            album,
            'Nothing on MusicBrainz matched that search.',
          ),
        );
      } else {
        entries.push(readyEntry({ ...design, release: await adapter.resolve(best.mbid) }));
      }
    } catch (error) {
      // Reported as an entry, never thrown: the rest of the batch keeps going.
      entries.push(unresolvedEntry(design, request.id, artist, album, errorMessage(error)));
    }

    onProgress({ done: entries.length, total: requests.length });
  }

  return entries;
}
