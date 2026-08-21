import { describe, expect, it } from 'vitest';

import { describeBatch, parseBatchLines } from './release-search.ts';

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

  it('gives every line an id of its own, even two identical ones', () => {
    const ids = parseBatchLines('A — B\nA — B').map(({ id }) => id);

    expect(new Set(ids).size).toBe(2);
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

  it('says all three things at once when all three happened', () => {
    expect(describeBatch(3, 1, 1)).toBe(
      'Added 3 Releases; 1 was already in the queue; 1 could not be found and needs completing by hand.',
    );
  });
});
