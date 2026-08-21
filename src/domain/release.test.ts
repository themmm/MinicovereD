import { describe, expect, it } from 'vitest';

import { blankRelease, newReleaseId } from './release.ts';

describe('a Release started by hand', () => {
  it('is blank but for an id, because every field is the collector’s to fill', () => {
    const release = blankRelease();

    expect(release.artist).toBe('');
    expect(release.album).toBe('');
    expect(release.tracks).toEqual([]);
    expect(release.artwork).toBeUndefined();
    expect(release.id).not.toBe('');
  });

  it('gets an id of its own each time, so two of them are two Releases', () => {
    // The queue tells Parts apart by Release id; two blanks sharing one would
    // print the same card twice.
    const ids = Array.from({ length: 50 }, () => newReleaseId());

    expect(new Set(ids).size).toBe(50);
  });

  it('is never mistakeable for a looked-up Release, which is named by its MBID', () => {
    expect(newReleaseId()).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/);
  });
});
