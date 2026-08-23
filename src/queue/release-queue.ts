import { withArrivedCredits } from '../domain/credits.ts';
import { DEFAULT_PART_DIMENSIONS } from '../domain/parts.ts';
import type { Credits, Release } from '../domain/release.ts';
import { DEFAULT_TEMPLATE_PARAMS } from '../render/sheet-renderer.ts';
import type { ReleaseDesign } from '../render/sheet-renderer.ts';

/**
 * The print queue: the Releases a collector is working through in one session.
 *
 * A lookup that failed does not leave a hole in it. The entry stays, carrying
 * what was typed, flagged for completing by hand — because one missing album
 * must not block the other nine, and because a blank card to write on is still
 * a card worth printing.
 */

export type QueueStatus = 'ready' | 'failed';

export interface QueueEntry {
  readonly status: QueueStatus;
  readonly design: ReleaseDesign;
  /**
   * Why the lookup failed, for the collector to judge whether to retry.
   *
   * Present only for the session the failure happened in. A saved project
   * records *that* an entry still needs a hand — that is the collector’s to-do
   * list, and losing it to a reload would lose the point of keeping the entry
   * at all — but not the reason, which is a statement about one moment on one
   * network. “Nothing on MusicBrainz matched” may be untrue by tomorrow, and a
   * stale cause presented as a current one is worse than no cause.
   */
  readonly error?: string;
}

export function readyEntry(design: ReleaseDesign): QueueEntry {
  return { status: 'ready', design };
}

/**
 * An entry restored from a saved project that was still waiting to be filled
 * in. It carries no `error`: see the note on {@link QueueEntry.error}.
 */
export function unfinishedEntry(design: ReleaseDesign): QueueEntry {
  return { status: 'failed', design };
}

/** An entry for a Release the lookup could not find, holding what was typed. */
export function unresolvedEntry(
  id: string,
  artist: string,
  album: string,
  error: string,
): QueueEntry {
  const release: Release = { id, artist, album, tracks: [] };
  return {
    status: 'failed',
    error,
    design: {
      release,
      templateId: 'classic',
      params: DEFAULT_TEMPLATE_PARAMS,
      dimensions: DEFAULT_PART_DIMENSIONS,
    },
  };
}

const indexOfRelease = (queue: readonly QueueEntry[], releaseId: string): number =>
  queue.findIndex((entry) => entry.design.release.id === releaseId);

/**
 * Adds an entry, unless its Release is already queued: SheetRenderer tells
 * Parts apart by Release id, so a duplicate would print the same content twice.
 */
export function addToQueue(queue: readonly QueueEntry[], entry: QueueEntry): QueueEntry[] {
  if (indexOfRelease(queue, entry.design.release.id) >= 0) return [...queue];
  return [...queue, entry];
}

export function removeFromQueue(queue: readonly QueueEntry[], releaseId: string): QueueEntry[] {
  return queue.filter((entry) => entry.design.release.id !== releaseId);
}

/** Moves one entry by `offset` places. At the ends it stays put rather than wrapping. */
export function moveInQueue(
  queue: readonly QueueEntry[],
  releaseId: string,
  offset: number,
): QueueEntry[] {
  const from = indexOfRelease(queue, releaseId);
  const to = from + offset;
  if (from < 0 || to < 0 || to >= queue.length) return [...queue];

  const moved = [...queue];
  const [entry] = moved.splice(from, 1);
  if (entry) moved.splice(to, 0, entry);
  return moved;
}

export function replaceInQueue(
  queue: readonly QueueEntry[],
  releaseId: string,
  replace: (entry: QueueEntry) => QueueEntry,
): QueueEntry[] {
  return queue.map((entry) => (entry.design.release.id === releaseId ? replace(entry) : entry));
}

/**
 * Credits arriving for one Release in the Queue — or nothing at all, if the
 * Queue is unchanged.
 *
 * Unchanged happens two ways, and neither is a failure: there is no such
 * Release any more, or that Release already carries credits and keeps them
 * (`withArrivedCredits`). Answering with nothing rather than with an equal Queue
 * is what lets the caller tell "filled a hole" from "arrived too late" — one
 * needs the Parts redrawn and the project saved, and the other must touch
 * neither, because a lookup answering late is not the collector editing
 * anything.
 */
export function withCreditsInQueue(
  queue: readonly QueueEntry[],
  releaseId: string,
  credits: Credits,
): QueueEntry[] | undefined {
  const index = indexOfRelease(queue, releaseId);
  if (index < 0) return undefined;

  const entry = queue[index];
  if (!entry) return undefined;
  const release = withArrivedCredits(entry.design.release, credits);
  if (release === entry.design.release) return undefined;

  // Only the one entry is rebuilt, and the rest are the same objects: a lookup
  // answering late must not look like a change to anything it did not touch.
  const filled = [...queue];
  filled[index] = { ...entry, design: { ...entry.design, release } };
  return filled;
}

/**
 * What the renderer prints: every entry in queue order, failed ones included.
 * A failed lookup that the collector completed by hand is an ordinary Release,
 * and one they left blank is a card to write on.
 */
export function queueDesigns(queue: readonly QueueEntry[]): ReleaseDesign[] {
  return queue.map((entry) => entry.design);
}
