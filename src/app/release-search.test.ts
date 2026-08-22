import { describe, expect, it } from 'vitest';

import { describeBatch, describeQuery, parseBatchLines, parseQuery } from './release-search.ts';

describe('reading a pasted batch', () => {
  it('takes one Release per line, as Artist — Album', () => {
    const wanted = parseBatchLines('Daft Punk — Discovery\nCornelius — Fantasma');

    expect(wanted.map(({ artist, album }) => [artist, album])).toEqual([
      ['Daft Punk', 'Discovery'],
      ['Cornelius', 'Fantasma'],
    ]);
  });

  it('accepts an en dash, a hyphen or a tab, because people paste all three', () => {
    const wanted = parseBatchLines('A – One\nB - Two\nC\tThree');

    expect(wanted.map(({ album }) => album)).toEqual(['One', 'Two', 'Three']);
  });

  it('splits at the first separator only, so a dash in the title survives', () => {
    const [wanted] = parseBatchLines('Godspeed You! Black Emperor — F♯A♯∞ — Deluxe Edition');

    expect(wanted?.artist).toBe('Godspeed You! Black Emperor');
    expect(wanted?.album).toBe('F♯A♯∞ — Deluxe Edition');
  });

  it('leaves a hyphenated name alone, since only a spaced dash separates', () => {
    const [wanted] = parseBatchLines('Jean-Michel Jarre — Oxygène');

    expect(wanted?.artist).toBe('Jean-Michel Jarre');
    expect(wanted?.album).toBe('Oxygène');
  });

  it('skips blank lines rather than searching for nothing', () => {
    expect(parseBatchLines('\n  \nA — B\n\n')).toHaveLength(1);
  });

  it('gives two different lines two ids, so the queue can tell them apart', () => {
    const ids = parseBatchLines('A — B\nC — D').map(({ id }) => id);

    expect(new Set(ids).size).toBe(2);
  });

  it('gives the same line the same id, so pasting it twice queues one Release', () => {
    // The id becomes the Release id of a lookup that finds nothing. Keyed by
    // position, the same unfindable line twice would put two identical rows in
    // the queue for the collector to complete by hand.
    const ids = parseBatchLines('A — B\nA — B').map(({ id }) => id);

    expect(new Set(ids).size).toBe(1);
  });

  it('separates on a figure dash and a minus sign too, because people paste them', () => {
    const wanted = parseBatchLines('A ‒ One\nB − Two');

    expect(wanted.map(({ album }) => album)).toEqual(['One', 'Two']);
  });
});

describe('saying how a batch went', () => {
  it('reports what joined the queue', () => {
    expect(describeBatch(5, 0, 0)).toBe('Added 5 Releases.');
    expect(describeBatch(1, 0, 0)).toBe('Added 1 Release.');
  });

  it('counts what was already queued separately from what was added', () => {
    // Two searches finding one pressing is a real case, and the collector
    // should not be told five were added when three were.
    expect(describeBatch(3, 2, 0)).toBe('Added 3 Releases; 2 were already in the queue.');
    expect(describeBatch(3, 1, 0)).toBe('Added 3 Releases; 1 was already in the queue.');
  });

  it('says which ones still need a hand', () => {
    expect(describeBatch(4, 0, 1)).toBe(
      'Added 4 Releases; 1 could not be found and needs completing by hand.',
    );
    expect(describeBatch(4, 0, 2)).toBe(
      'Added 4 Releases; 2 could not be found and need completing by hand.',
    );
  });

  it('admits when a whole batch was already queued', () => {
    expect(describeBatch(0, 2, 0)).toBe('Nothing new to add; 2 were already in the queue.');
  });

  it('counts the three clauses as a partition, never overlapping', () => {
    // `failed` is counted over what was added, so a re-run of a batch that had
    // one failure says nothing new needs a hand — because nothing new arrived.
    expect(describeBatch(0, 5, 0)).toBe('Nothing new to add; 5 were already in the queue.');
  });

  it('says all three things at once when all three happened', () => {
    expect(describeBatch(3, 1, 1)).toBe(
      'Added 3 Releases; 1 was already in the queue; 1 could not be found and needs completing by hand.',
    );
  });
});

describe('reading the one search field', () => {
  it('reads Artist — Album as two fields, by the same rule the batch uses', () => {
    expect(parseQuery('Glen Campbell — Wichita Lineman')).toEqual({
      kind: 'fielded',
      artist: 'Glen Campbell',
      album: 'Wichita Lineman',
    });
  });

  it('reads a bare title as a title, never as an artist', () => {
    // The whole reason SearchQuery needed a third case: routed into `artist`
    // this would ask MusicBrainz for an artist called "wichita lineman".
    expect(parseQuery('wichita lineman')).toEqual({ kind: 'text', text: 'wichita lineman' });
  });

  it('keeps a hyphenated name out of the fielded case', () => {
    // Only a spaced dash separates, so this is one artist and not a query.
    expect(parseQuery('Jean-Michel Jarre')).toEqual({ kind: 'text', text: 'Jean-Michel Jarre' });
  });

  it('treats a line whose separator leaves one side empty as a title', () => {
    // "Artist — " is not an artist and a release; it is someone mid-typing.
    expect(parseQuery('Glen Campbell — ').kind).toBe('text');
  });

  it('takes an MBID on its own', () => {
    const mbid = '4f2e6a1b-3c4d-5e6f-7a8b-9c0d1e2f3a4b';
    expect(parseQuery(mbid)).toEqual({ kind: 'mbid', mbid });
  });

  it('takes an MBID out of a pasted MusicBrainz URL, and lowercases it', () => {
    expect(parseQuery('https://musicbrainz.org/release/4F2E6A1B-3C4D-5E6F-7A8B-9C0D1E2F3A4B')).toEqual({
      kind: 'mbid',
      mbid: '4f2e6a1b-3c4d-5e6f-7a8b-9c0d1e2f3a4b',
    });
  });

  it('prefers an MBID over reading the same line as a query', () => {
    // A URL is full of dashes and slashes; searching for one would find nothing.
    expect(parseQuery('release — 4f2e6a1b-3c4d-5e6f-7a8b-9c0d1e2f3a4b').kind).toBe('mbid');
  });

  it('reads several lines as a batch, using the batch parser itself', () => {
    const parsed = parseQuery('Daft Punk — Discovery\nCornelius — Fantasma');

    expect(parsed.kind).toBe('batch');
    expect(parsed.kind === 'batch' && parsed.requests.map((r) => r.album)).toEqual([
      'Discovery',
      'Fantasma',
    ]);
  });

  it('ignores blank lines when deciding whether a paste is a batch', () => {
    expect(parseQuery('\n  \nGlen Campbell — Wichita Lineman\n\n').kind).toBe('fielded');
  });

  it('says nothing about an empty field', () => {
    expect(parseQuery('   ').kind).toBe('empty');
    expect(describeQuery({ kind: 'empty' })).toBe('');
  });

  it('names the case it read, so a wrong reading is visible before a request', () => {
    // At one request a second (ADR-0006), finding out afterwards is expensive.
    expect(describeQuery(parseQuery('wichita lineman'))).toMatch(/release title/i);
    expect(describeQuery(parseQuery('A — B'))).toMatch(/artist and release/i);
    expect(describeQuery(parseQuery('A — B\nC — D'))).toMatch(/batch/i);
  });
});
