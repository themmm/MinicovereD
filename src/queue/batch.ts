import { DEFAULT_PART_DIMENSIONS } from '../domain/parts.ts';
import type { Release } from '../domain/release.ts';
import { errorMessage } from '../errors.ts';
import type { MetadataAdapter } from '../metadata/metadata-adapter.ts';
import { DEFAULT_TEMPLATE_PARAMS } from '../render/sheet-renderer.ts';
import type { ReleaseDesign } from '../render/sheet-renderer.ts';
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

export interface BatchRequest {
  /** The caller's own id for this entry, so progress can be matched to a row. */
  readonly id: string;
  readonly artist: string;
  readonly album: string;
}

export interface BatchProgress {
  readonly done: number;
  readonly total: number;
  /** The entry being looked up right now, named as the collector typed it. */
  readonly current?: string;
}

const describe = (request: BatchRequest): string =>
  [request.artist, request.album].filter(Boolean).join(' — ') || request.id;

export async function resolveBatchIntoQueue(
  adapter: MetadataAdapter,
  requests: readonly BatchRequest[],
  onProgress: (progress: BatchProgress) => void,
): Promise<QueueEntry[]> {
  const entries: QueueEntry[] = [];
  onProgress({ done: 0, total: requests.length });

  for (const request of requests) {
    onProgress({ done: entries.length, total: requests.length, current: describe(request) });

    try {
      const { releases } = await adapter.search({ artist: request.artist, album: request.album });
      const best = releases[0];
      if (!best) {
        entries.push(
          unresolvedEntry(
            request.id,
            request.artist,
            request.album,
            'Nothing on MusicBrainz matched that search.',
          ),
        );
      } else {
        entries.push(readyEntry(withDefaults(await adapter.resolve(best.mbid))));
      }
    } catch (error) {
      // Reported as an entry, never thrown: the rest of the batch keeps going.
      entries.push(unresolvedEntry(request.id, request.artist, request.album, errorMessage(error)));
    }

    onProgress({ done: entries.length, total: requests.length });
  }

  return entries;
}

/** A freshly looked-up Release starts on the defaults; the collector changes it from there. */
function withDefaults(release: Release): ReleaseDesign {
  return {
    release,
    templateId: 'classic',
    params: DEFAULT_TEMPLATE_PARAMS,
    dimensions: DEFAULT_PART_DIMENSIONS,
  };
}
