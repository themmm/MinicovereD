import { DEFAULT_PART_DIMENSIONS } from '../domain/parts.ts';
import type { Release } from '../domain/release.ts';
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
  /** Why the lookup failed, for the collector to judge whether to retry. */
  readonly error?: string;
}

export function readyEntry(design: ReleaseDesign): QueueEntry {
  return { status: 'ready', design };
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
 * What the renderer prints: every entry in queue order, failed ones included.
 * A failed lookup that the collector completed by hand is an ordinary Release,
 * and one they left blank is a card to write on.
 */
export function queueDesigns(queue: readonly QueueEntry[]): ReleaseDesign[] {
  return queue.map((entry) => entry.design);
}
