import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { createMetadataAdapter } from './metadata-adapter.ts';
import type { SearchQuery } from './metadata-adapter.ts';
import type { HttpClient, HttpResponse } from './http.ts';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__');
const fixtureBytes = (name: string): Uint8Array => new Uint8Array(readFileSync(join(fixtures, name)));
const fixtureText = (name: string): string => readFileSync(join(fixtures, name), 'utf8');

const DISCOVERY_MBID = '5ad66522-edce-3a77-b5fa-7956ee879239';

/**
 * Recorded responses, replayed by URL. Anything the adapter asks for that is
 * not recorded fails the test loudly — that is what makes "never touches the
 * live network" a property of the suite rather than a promise.
 */
interface Recording {
  readonly match: (url: string) => boolean;
  readonly status?: number;
  readonly body: string | Uint8Array;
}

function recordedHttp(recordings: readonly Recording[]): HttpClient & { readonly urls: string[] } {
  const urls: string[] = [];
  return {
    urls,
    async get(url: string): Promise<HttpResponse> {
      urls.push(url);
      const recording = recordings.find((candidate) => candidate.match(url));
      if (!recording) throw new Error(`test would have hit the network: ${url}`);

      const status = recording.status ?? 200;
      const body = recording.body;
      return {
        ok: status >= 200 && status < 300,
        status,
        text: async () => (typeof body === 'string' ? body : new TextDecoder().decode(body)),
        bytes: async () => (typeof body === 'string' ? new TextEncoder().encode(body) : body),
      };
    },
  };
}

const searchHit: Recording = {
  match: (url) => url.includes('/ws/2/release?') && url.includes('Daft'),
  body: fixtureText('search-hit.json'),
};
const searchMiss: Recording = {
  match: (url) => url.includes('/ws/2/release?') && url.includes('Zzzqqxx'),
  body: fixtureText('search-miss.json'),
};
const releaseLookup: Recording = {
  match: (url) => url.includes(`/ws/2/release/${DISCOVERY_MBID}`),
  body: fixtureText('release-with-tracklist.json'),
};
const coverArt: Recording = {
  match: (url) => url === `https://coverartarchive.org/release/${DISCOVERY_MBID}/front-1200`,
  body: fixtureBytes('cover-art-front.jpg'),
};

const ALL: readonly Recording[] = [searchHit, searchMiss, releaseLookup, coverArt];

/** No real waiting: the throttle's clock is under the test's control. */
function testClock(): { now: () => number; sleep: (ms: number) => Promise<void>; slept: number[] } {
  let time = 0;
  const slept: number[] = [];
  return {
    slept,
    now: () => time,
    sleep: async (ms: number) => {
      slept.push(ms);
      time += ms;
    },
  };
}

const adapterOver = (recordings: readonly Recording[] = ALL) => {
  const http = recordedHttp(recordings);
  const clock = testClock();
  return { adapter: createMetadataAdapter({ http, clock }), http, clock };
};

describe('MetadataAdapter — search', () => {
  it('normalises a search hit into Release summaries', async () => {
    const { adapter } = adapterOver();

    const { releases } = await adapter.search({ artist: 'Daft Punk', album: 'Discovery' });

    expect(releases).toHaveLength(3);
    expect(releases[0]).toMatchObject({
      mbid: DISCOVERY_MBID,
      artist: 'Daft Punk',
      album: 'Discovery',
      year: '2001',
      country: 'US',
    });
  });

  it('returns no results for a search miss instead of failing', async () => {
    const { adapter } = adapterOver();

    expect(await adapter.search({ artist: 'Zzzqqxx Nonexistent', album: 'No Such Album' })).toEqual({
      releases: [],
      total: 0,
    });
  });

  it('reports how many releases matched, not how many fit on a page', async () => {
    const { adapter } = adapterOver();

    // The recorded response says 31 matched; only three came back with it.
    const results = await adapter.search({ artist: 'Daft Punk', album: 'Discovery' });

    expect(results.total).toBe(31);
    expect(results.releases).toHaveLength(3);
  });

  it('identifies itself on every MusicBrainz request (ADR-0006)', async () => {
    const { adapter, http } = adapterOver();

    await adapter.search({ artist: 'Daft Punk' });
    await adapter.fetchRelease(DISCOVERY_MBID);

    const musicbrainz = http.urls.filter((url) => url.includes('musicbrainz.org'));
    expect(musicbrainz.length).toBeGreaterThan(1);
    expect(musicbrainz.every((url) => url.includes('client=minicovered-'))).toBe(true);
  });

  /**
   * The query these build, read off the URL.
   *
   * The fixtures answer only recorded URLs, so a query nothing was recorded for
   * is refused — which is the point of the harness. The URL is captured before
   * the refusal, so it is still the thing under test; `sent` throws away the
   * outcome and keeps the request.
   */
  const sent = async (query: SearchQuery): Promise<string> => {
    const { adapter, http } = adapterOver();
    await adapter.search(query).catch(() => undefined);
    return decodeURIComponent(http.urls[0] ?? '');
  };

  it('builds a fielded query from an artist and a release', async () => {
    expect(await sent({ artist: 'Daft Punk', album: 'Discovery' })).toContain(
      'artist:"Daft Punk" AND release:"Discovery"',
    );
  });

  it('sends an unfielded query as a phrase, so a bare title stays one search', async () => {
    // The third case the one search field needs: routed into `artist` this
    // would ask for an artist called "wichita lineman" and find nothing.
    const url = await sent({ text: 'wichita lineman' });

    expect(url).toContain('query="wichita lineman"');
    expect(url).not.toContain('artist:');
  });

  it('quotes an unfielded query so punctuation cannot become an operator', async () => {
    // "AC/DC" and "Discovery (Remastered)" are full of Lucene syntax, and a
    // syntax error costs a request out of a budget of one a second (ADR-0006).
    expect(await sent({ text: 'Discovery (Remastered) AC/DC' })).toContain(
      'query="Discovery (Remastered) AC/DC"',
    );
  });

  it('ignores the fielded clauses when an unfielded query is given', async () => {
    expect(await sent({ artist: 'ignored', text: 'wichita lineman' })).not.toContain('ignored');
  });
});

describe('MetadataAdapter — release and tracklist', () => {
  it('normalises a release into the Release domain type', async () => {
    const { adapter } = adapterOver();

    const release = await adapter.fetchRelease(DISCOVERY_MBID);

    expect(release.id).toBe(DISCOVERY_MBID);
    expect(release.artist).toBe('Daft Punk');
    expect(release.album).toBe('Discovery');
    expect(release.year).toBe('2001');
    expect(release.tracks).toHaveLength(14);
    expect(release.tracks[0]).toEqual({ position: 1, title: 'One More Time' });
    expect(release.tracks[13]).toEqual({ position: 14, title: 'Too Long' });
  });

  it('numbers tracks consecutively so the Back Card reads 1..n', async () => {
    const { adapter } = adapterOver();

    const release = await adapter.fetchRelease(DISCOVERY_MBID);

    expect(release.tracks.map((track) => track.position)).toEqual(
      Array.from({ length: 14 }, (_, index) => index + 1),
    );
  });

  it('carries the label into the supplementary notes', async () => {
    const { adapter } = adapterOver();

    expect((await adapter.fetchRelease(DISCOVERY_MBID)).notes).toContain('Virgin');
  });
});

describe('MetadataAdapter — cover art', () => {
  it('fetches the front cover and sizes it from the image itself', async () => {
    const { adapter } = adapterOver();

    const artwork = await adapter.fetchArtwork(DISCOVERY_MBID);

    expect(artwork?.widthPx).toBe(500);
    expect(artwork?.heightPx).toBe(500);
    expect(artwork?.dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true);
  });

  it('resolves a Release complete with its artwork', async () => {
    const { adapter } = adapterOver();

    const release = await adapter.resolve(DISCOVERY_MBID);

    expect(release.album).toBe('Discovery');
    expect(release.artwork?.widthPx).toBe(500);
  });

  it('returns a Release without artwork rather than failing when there is none', async () => {
    const { adapter } = adapterOver([
      releaseLookup,
      // The Archive answers a release with no front cover with a server error,
      // not a 404 — either way there is simply nothing to print.
      { match: (url) => url.includes('coverartarchive.org'), status: 500, body: 'no cover' },
    ]);

    const release = await adapter.resolve(DISCOVERY_MBID);

    expect(release.album).toBe('Discovery');
    expect(release.artwork).toBeUndefined();
  });

  it('falls back to the smaller front cover when the large one is missing', async () => {
    const { adapter, http } = adapterOver([
      releaseLookup,
      { match: (url) => url.endsWith('/front-1200'), status: 404, body: 'Not Found' },
      { match: (url) => url.endsWith('/front-500'), body: fixtureBytes('cover-art-front.jpg') },
    ]);

    expect((await adapter.fetchArtwork(DISCOVERY_MBID))?.widthPx).toBe(500);
    expect(http.urls.some((url) => url.endsWith('/front-500'))).toBe(true);
  });

  it('stops asking the Archive when it cannot be reached at all', async () => {
    const http: HttpClient & { urls: string[] } = {
      urls: [],
      async get(url: string): Promise<HttpResponse> {
        http.urls.push(url);
        if (url.includes('coverartarchive.org')) throw new TypeError('Failed to fetch');
        return {
          ok: true,
          status: 200,
          text: async () => fixtureText('release-with-tracklist.json'),
          bytes: async () => new Uint8Array(),
        };
      },
    };
    const adapter = createMetadataAdapter({ http, clock: testClock() });

    const release = await adapter.resolve(DISCOVERY_MBID);

    // Both sizes come off the same storage node, so the second request would
    // spend another deadline to learn what the first one already said.
    expect(http.urls.filter((url) => url.includes('coverartarchive.org'))).toHaveLength(1);
    expect(release.artwork).toBeUndefined();
    expect(release.album).toBe('Discovery');
  });

  it('never asks for the Archive JSON index, which browsers cannot read', async () => {
    const { adapter, http } = adapterOver();

    await adapter.fetchArtwork(DISCOVERY_MBID);

    // The index redirect chain ends without an Access-Control-Allow-Origin
    // header, so every artwork request has to be an image URL.
    expect(http.urls.every((url) => /\/front-\d+$/.test(url))).toBe(true);
  });
});

describe('MetadataAdapter — rate limiting', () => {
  it('waits out a 503 and tries again rather than reporting a missing album', async () => {
    let attempts = 0;
    const http: HttpClient = {
      async get(): Promise<HttpResponse> {
        attempts += 1;
        const rateLimited = attempts === 1;
        return {
          ok: !rateLimited,
          status: rateLimited ? 503 : 200,
          text: async () => (rateLimited ? 'slow down' : fixtureText('release-with-tracklist.json')),
          bytes: async () => new Uint8Array(),
        };
      },
    };
    const clock = testClock();
    const adapter = createMetadataAdapter({ http, clock });

    expect((await adapter.fetchRelease(DISCOVERY_MBID)).album).toBe('Discovery');
    expect(attempts).toBe(2);
    expect(clock.slept.some((ms) => ms >= 2000)).toBe(true);
  });

  it('gives up after a couple of tries and says why', async () => {
    const http: HttpClient = {
      async get(): Promise<HttpResponse> {
        return { ok: false, status: 503, text: async () => 'slow down', bytes: async () => new Uint8Array() };
      },
    };
    const adapter = createMetadataAdapter({ http, clock: testClock() });

    await expect(adapter.fetchRelease(DISCOVERY_MBID)).rejects.toThrow(/slow down|503/i);
  });
});

describe('MetadataAdapter — throttled queue', () => {
  it('processes the whole queue, reporting progress as it goes', async () => {
    const { adapter } = adapterOver();
    const progress: Array<{ done: number; total: number }> = [];

    const outcomes = await adapter.resolveBatch(
      [
        { id: 'a', mbid: DISCOVERY_MBID },
        { id: 'b', mbid: DISCOVERY_MBID },
        { id: 'c', mbid: DISCOVERY_MBID },
      ],
      (update) => progress.push({ done: update.done, total: update.total }),
    );

    expect(outcomes.map((outcome) => outcome.id)).toEqual(['a', 'b', 'c']);
    expect(outcomes.every((outcome) => outcome.release?.album === 'Discovery')).toBe(true);
    expect(progress.at(-1)).toEqual({ done: 3, total: 3 });
  });

  it('reports a failing item per item while the rest of the queue resolves', async () => {
    const { adapter } = adapterOver([
      releaseLookup,
      coverArt,
      { match: (url) => url.includes('/ws/2/release/00000000'), status: 404, body: 'Not Found' },
    ]);

    const outcomes = await adapter.resolveBatch(
      [
        { id: 'good-1', mbid: DISCOVERY_MBID },
        { id: 'broken', mbid: '00000000-0000-0000-0000-000000000000' },
        { id: 'good-2', mbid: DISCOVERY_MBID },
      ],
      () => {},
    );

    expect(outcomes.map((outcome) => outcome.id)).toEqual(['good-1', 'broken', 'good-2']);
    expect(outcomes[0]?.release?.album).toBe('Discovery');
    expect(outcomes[1]?.release).toBeUndefined();
    expect(outcomes[1]?.error).toMatch(/404/);
    expect(outcomes[2]?.release?.album).toBe('Discovery');
  });

  it('keeps to one request per second, as MusicBrainz asks', async () => {
    const { adapter, clock, http } = adapterOver();

    await adapter.resolveBatch(
      [
        { id: 'a', mbid: DISCOVERY_MBID },
        { id: 'b', mbid: DISCOVERY_MBID },
      ],
      () => {},
    );

    // Two requests per Release (the release, then its front cover), and every
    // one after the first waits out the interval.
    expect(http.urls.length).toBe(4);
    expect(clock.slept.filter((ms) => ms > 0)).toHaveLength(http.urls.length - 1);
    expect(Math.min(...clock.slept.filter((ms) => ms > 0))).toBe(1000);
  });
});
