import { describe, expect, it } from 'vitest';

import { DEFAULT_PART_DIMENSIONS } from '../domain/parts.ts';
import type { Credits } from '../domain/release.ts';
import { DEFAULT_TEMPLATE_PARAMS } from '../render/sheet-renderer.ts';
import type { ReleaseDesign } from '../render/sheet-renderer.ts';
import {
  addToQueue,
  moveInQueue,
  queueDesigns,
  removeFromQueue,
  unresolvedEntry,
  withCreditsInQueue,
} from './release-queue.ts';
import type { QueueEntry } from './release-queue.ts';

const design = (id: string, album = `Album ${id}`): ReleaseDesign => ({
  release: { id, artist: `Artist ${id}`, album, tracks: [] },
  templateId: 'classic',
  params: DEFAULT_TEMPLATE_PARAMS,
  dimensions: DEFAULT_PART_DIMENSIONS,
});

const resolved = (id: string): QueueEntry => ({ status: 'ready', design: design(id) });

const ids = (queue: readonly QueueEntry[]): string[] =>
  queue.map((entry) => entry.design.release.id);

describe('the queue', () => {
  it('adds Releases in the order they were asked for', () => {
    const queue = [resolved('a'), resolved('b')];

    expect(ids(addToQueue(queue, resolved('c')))).toEqual(['a', 'b', 'c']);
  });

  it('refuses to add a Release already in it, so Parts stay tellable apart', () => {
    const queue = [resolved('a')];

    // renderSheets identifies Parts by Release id; two of the same would print
    // the same content twice.
    expect(ids(addToQueue(queue, resolved('a')))).toEqual(['a']);
  });

  it('removes by id and leaves the rest in order', () => {
    const queue = [resolved('a'), resolved('b'), resolved('c')];

    expect(ids(removeFromQueue(queue, 'b'))).toEqual(['a', 'c']);
  });

  it('ignores a removal of something that is not there', () => {
    const queue = [resolved('a')];

    expect(removeFromQueue(queue, 'zzz')).toEqual(queue);
  });

  it('moves an entry up and down', () => {
    const queue = [resolved('a'), resolved('b'), resolved('c')];

    expect(ids(moveInQueue(queue, 'c', -1))).toEqual(['a', 'c', 'b']);
    expect(ids(moveInQueue(queue, 'a', 1))).toEqual(['b', 'a', 'c']);
  });

  it('stays put at the ends rather than wrapping around', () => {
    const queue = [resolved('a'), resolved('b')];

    expect(ids(moveInQueue(queue, 'a', -1))).toEqual(['a', 'b']);
    expect(ids(moveInQueue(queue, 'b', 1))).toEqual(['a', 'b']);
  });

  it('never mutates the queue it was given', () => {
    const queue = [resolved('a'), resolved('b')];
    const before = ids(queue);

    addToQueue(queue, resolved('c'));
    removeFromQueue(queue, 'a');
    moveInQueue(queue, 'b', -1);

    expect(ids(queue)).toEqual(before);
  });
});

describe('an entry whose lookup failed', () => {
  it('is still a Release, editable by hand', () => {
    const entry = unresolvedEntry('mb-1', 'Cornelius', 'Fantasma', 'HTTP 404');

    expect(entry.status).toBe('failed');
    expect(entry.error).toBe('HTTP 404');
    expect(entry.design.release.artist).toBe('Cornelius');
    expect(entry.design.release.album).toBe('Fantasma');
    // What the collector typed is kept, so completing it by hand starts from
    // something rather than from nothing.
    expect(entry.design.release.tracks).toEqual([]);
  });

  it('takes its place in the queue like any other entry', () => {
    const queue = addToQueue([resolved('a')], unresolvedEntry('b', 'X', 'Y', 'timed out'));

    expect(ids(queue)).toEqual(['a', 'b']);
    expect(queue[1]?.status).toBe('failed');
  });

  it('becomes ready once its fields have been filled in', () => {
    const failed = unresolvedEntry('b', 'X', 'Y', 'timed out');
    const queue = addToQueue([], failed);

    const completed = queue.map((entry) =>
      entry.design.release.id === 'b'
        ? { status: 'ready' as const, design: { ...entry.design, release: { ...entry.design.release, tracks: [{ position: 1, title: 'One' }] } } }
        : entry,
    );

    expect(completed[0]?.status).toBe('ready');
    expect(completed[0]?.design.release.tracks).toHaveLength(1);
  });
});

describe('credits arriving for one Release in the queue', () => {
  const credits: Credits = {
    people: [{ role: 'Producer', name: 'Al De Lory' }],
    label: 'Capitol Records',
    genres: [],
    styles: [],
  };

  it('fills the hole they were fetched for, and nothing else', () => {
    const queue = [resolved('a'), resolved('b'), resolved('c')];

    const filled = withCreditsInQueue(queue, 'b', credits);

    expect(filled?.[1]?.design.release.credits).toEqual(credits);
    // The other entries are the same objects, not copies of them: a lookup
    // answering late must not look like an edit to anything it did not touch.
    expect(filled?.[0]).toBe(queue[0]);
    expect(filled?.[2]).toBe(queue[2]);
  });

  it('answers with nothing when the Release already has credits', () => {
    const mine: Credits = { people: [{ role: '', name: 'Me' }], genres: [], styles: [] };
    const entry = resolved('a');
    const queue = [
      { ...entry, design: { ...entry.design, release: { ...entry.design.release, credits: mine } } },
    ];

    // Nothing back, so the caller redraws nothing and saves nothing — and the
    // collector's own credits stay theirs.
    expect(withCreditsInQueue(queue, 'a', credits)).toBeUndefined();
  });

  it('answers with nothing for a Release that has left the queue', () => {
    // Removed while Discogs was still thinking about it.
    expect(withCreditsInQueue([resolved('a')], 'b', credits)).toBeUndefined();
    expect(withCreditsInQueue([], 'a', credits)).toBeUndefined();
  });

  it('leaves the Release it fills otherwise untouched', () => {
    const entry = resolved('a');
    const queue = [
      {
        ...entry,
        design: {
          ...entry.design,
          release: { ...entry.design.release, year: '1968', notes: 'Capitol · ST-103' },
        },
      },
    ];

    const release = withCreditsInQueue(queue, 'a', credits)?.[0]?.design.release;

    // The fields the collector can edit are not a second source's to write.
    expect(release?.year).toBe('1968');
    expect(release?.notes).toBe('Capitol · ST-103');
  });
});

describe('what the queue hands to the renderer', () => {
  it('is every entry, failed ones included, in queue order', () => {
    const queue = [resolved('a'), unresolvedEntry('b', 'X', 'Y', 'nope'), resolved('c')];

    // A failed lookup is still a Release the collector may want printed — they
    // completed it by hand, or they want the blank to write on.
    expect(queueDesigns(queue).map((entry) => entry.release.id)).toEqual(['a', 'b', 'c']);
  });

  it('reflects a reorder', () => {
    const queue = moveInQueue([resolved('a'), resolved('b')], 'b', -1);

    expect(queueDesigns(queue).map((entry) => entry.release.id)).toEqual(['b', 'a']);
  });
});
