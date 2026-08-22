import { describe, expect, it } from 'vitest';

import { describeBatch, describeQuery, parseBatchLines, parseQuery } from './release-search.ts';

/**
 * The two fields each line named, for the tests that are about separators.
 *
 * Throws rather than flattening when a line was not read as fielded. A reading
 * of `{ kind: 'fielded', artist: '', album: line }` would satisfy any assertion
 * about the fields alone, and it is exactly the shape the union is here to rule
 * out — so the kind is checked even where the test is about something else.
 */
const fields = (text: string): Array<[string, string]> =>
  parseBatchLines(text).map(({ query }) => {
    if (query.kind !== 'fielded') throw new Error(`read as ${query.kind}, not as two fields`);
    return [query.artist, query.album];
  });

describe('reading a pasted batch', () => {
  it('takes one Release per line, as Artist — Album', () => {
    expect(parseBatchLines('Daft Punk — Discovery\nCornelius — Fantasma').map(({ query }) => query)).toEqual([
      { kind: 'fielded', artist: 'Daft Punk', album: 'Discovery' },
      { kind: 'fielded', artist: 'Cornelius', album: 'Fantasma' },
    ]);
  });

  it('accepts an en dash, a hyphen or a tab, because people paste all three', () => {
    expect(fields('A – One\nB - Two\nC\tThree').map(([, album]) => album)).toEqual([
      'One',
      'Two',
      'Three',
    ]);
  });

  it('splits at the first separator only, so a dash in the title survives', () => {
    expect(fields('Godspeed You! Black Emperor — F♯A♯∞ — Deluxe Edition')[0]).toEqual([
      'Godspeed You! Black Emperor',
      'F♯A♯∞ — Deluxe Edition',
    ]);
  });

  it('leaves a hyphenated name alone, since only a spaced dash separates', () => {
    expect(fields('Jean-Michel Jarre — Oxygène')[0]).toEqual(['Jean-Michel Jarre', 'Oxygène']);
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
    expect(fields('A ‒ One\nB − Two').map(([, album]) => album)).toEqual(['One', 'Two']);
  });
});

describe('a pasted line that names no artist', () => {
  it('asks for exactly what the same line typed alone asks for', () => {
    // The v1 debt. `Loveless` pasted among five lines was read as an artist
    // called Loveless, while the same word typed on its own was read as a
    // title — one field, two rules, and the batch had the wrong one.
    const pasted = parseBatchLines(
      'Daft Punk — Discovery\nLoveless\nCornelius — Fantasma\nSpiderland\nBoards of Canada — Music Has the Right to Children',
    );

    expect(pasted[1]?.query).toEqual(parseQuery('Loveless'));
    expect(pasted[3]?.query).toEqual(parseQuery('Spiderland'));
  });

  it('is a title, never an artist', () => {
    expect(parseBatchLines('Loveless\nSpiderland').map(({ query }) => query)).toEqual([
      { kind: 'text', text: 'Loveless' },
      { kind: 'text', text: 'Spiderland' },
    ]);
  });

  it('is a title even when it is the only line in the paste', () => {
    // Reached through the batch parser rather than the field: a paste of one
    // line lands in the field, but `parseBatchLines` is public and a caller
    // with one line must get the same answer.
    expect(parseBatchLines('Loveless')[0]?.query).toEqual({ kind: 'text', text: 'Loveless' });
  });

  it('treats a half-typed separator as a title, in a batch as well as alone', () => {
    // "Artist — " is someone mid-typing, and the field has always read it as a
    // title. Pasted, it used to become the artist "Glen Campbell —".
    const [first] = parseBatchLines('Glen Campbell — \nA — B');

    expect(first?.query).toEqual(parseQuery('Glen Campbell — '));
    expect(first?.query.kind).toBe('text');
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
    expect(
      parsed.kind === 'batch' &&
        parsed.requests.map(({ query }) => (query.kind === 'fielded' ? query.album : query.text)),
    ).toEqual(['Discovery', 'Fantasma']);
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
