import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { Release } from '../domain/release.ts';
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

/** ADR-0013's own release, which is also the one whose `notes` it measured. */
const DISCOGS_ID = 249504;
const discogsRelease: Recording = {
  match: (url) => url === `https://api.discogs.com/releases/${DISCOGS_ID}`,
  body: fixtureText('discogs-release-249504.json'),
};

const ALL: readonly Recording[] = [
  searchHit,
  searchMiss,
  releaseLookup,
  coverArt,
  // Recorded and answering, so that "resolve never asks Discogs" is a fact
  // about the adapter rather than about what the harness happens to allow.
  discogsRelease,
];

/**
 * The MusicBrainz release, with the `url-rels` block a release that has been
 * linked to Discogs comes back with.
 *
 * Written here rather than recorded: `release-with-tracklist.json` was recorded
 * before this adapter asked for `inc=url-rels`, and re-recording it means a live
 * request. Only `url.resource` is written, because that is the only field
 * `discogsIdOf` reads — a fuller block would be a claim about MusicBrainz's
 * response that nothing here can check. The Wikipedia relation is in front of
 * the Discogs one so that picking the right relation out of several is the
 * default case rather than a special test.
 */
const linkedTo = (resource: string): Recording => ({
  match: (url) => url.includes(`/ws/2/release/${DISCOVERY_MBID}`),
  body: JSON.stringify({
    ...(JSON.parse(fixtureText('release-with-tracklist.json')) as Record<string, unknown>),
    relations: [
      { url: { resource: 'https://en.wikipedia.org/wiki/Discovery_(Daft_Punk_album)' } },
      { url: { resource } },
    ],
  }),
});

const DISCOGS_URL = `https://www.discogs.com/release/${DISCOGS_ID}`;

/** A resolved Release MusicBrainz linked nothing for: no link, nothing to ask. */
const unlinkedRelease: Release = {
  id: DISCOVERY_MBID,
  artist: 'Daft Punk',
  album: 'Discovery',
  tracks: [],
};

/** A Release as `fetchCredits` needs one: identified, and carrying the link. */
const linkedRelease = (discogsId = DISCOGS_ID): Release => ({ ...unlinkedRelease, discogsId });

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
    expect(release.tracks[0]).toEqual({ position: 1, title: 'One More Time', lengthMs: 320840 });
    expect(release.tracks[13]).toEqual({ position: 14, title: 'Too Long', lengthMs: 600293 });
  });

  it('carries every track’s playing time off the recorded release', async () => {
    // The Back Card sets a duration column when there is something to put in
    // it, and this is the only place the numbers can come from: the adapter
    // dropped everything but position and title until now.
    const { adapter } = adapterOver();

    const release = await adapter.fetchRelease(DISCOVERY_MBID);

    expect(release.tracks.every((track) => (track.lengthMs ?? 0) > 0)).toBe(true);
    expect(release.tracks.map((track) => track.lengthMs).slice(0, 3)).toEqual([
      320840, 207533, 298333,
    ]);
  });

  it('prefers the pressing’s own length to the recording’s', async () => {
    // A recording is shared between releases and a track belongs to one of
    // them, so the two disagree by a second or so on real data — track 2 of
    // Discovery is 207533 on this pressing and 207626 on the recording. What
    // goes on the card is what is on the disc in the collector's hand.
    const { adapter } = adapterOver();

    const release = await adapter.fetchRelease(DISCOVERY_MBID);

    expect(release.tracks[1]?.lengthMs).toBe(207533);
  });

  it('falls back to the recording’s length, and then to no length at all', async () => {
    const payload = JSON.stringify({
      title: 'Handmade',
      media: [
        {
          tracks: [
            { title: 'Only the recording knows', recording: { length: 90_000 } },
            { title: 'Nobody knows' },
            { title: 'A length that is not one', length: 0 },
          ],
        },
      ],
    });
    const { adapter } = adapterOver([
      { match: (url) => url.includes('/ws/2/release/'), body: payload },
    ]);

    const release = await adapter.fetchRelease('handmade');

    expect(release.tracks.map((track) => track.lengthMs)).toEqual([90_000, undefined, undefined]);
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

describe('MetadataAdapter — the Discogs link', () => {
  it('asks MusicBrainz for the url relationships in the request it was already making', async () => {
    const { adapter, http } = adapterOver();

    await adapter.fetchRelease(DISCOVERY_MBID);

    // One request, not two: the link is free because `inc` takes a list.
    expect(http.urls).toHaveLength(1);
    expect(decodeURIComponent(http.urls[0] ?? '')).toContain(
      'inc=artist-credits+recordings+labels+url-rels',
    );
  });

  it('carries the Discogs release MusicBrainz linked, and nothing else about it', async () => {
    const { adapter } = adapterOver([linkedTo(DISCOGS_URL), coverArt]);

    const release = await adapter.resolve(DISCOVERY_MBID);

    expect(release.discogsId).toBe(DISCOGS_ID);
    // The link, not the credits: nothing is asked of Discogs while resolving.
    expect(release.credits).toBeUndefined();
  });

  it('leaves a Release MusicBrainz has not linked unlinked', async () => {
    // The recorded response, which carries no relations at all — the common
    // case, and an absence rather than a failure.
    const { adapter } = adapterOver();

    expect((await adapter.fetchRelease(DISCOVERY_MBID)).discogsId).toBeUndefined();
  });

  it('reads a Discogs URL that still carries its old slug', async () => {
    const { adapter } = adapterOver([
      linkedTo('https://www.discogs.com/Rick-Astley-Never-Gonna-Give-You-Up/release/249504'),
    ]);

    expect((await adapter.fetchRelease(DISCOVERY_MBID)).discogsId).toBe(DISCOGS_ID);
  });

  it('refuses a link to a Discogs master, which is not this pressing', async () => {
    // A master gathers every pressing of a record and has its own credits;
    // fetching one would put another release's producer on this card.
    const { adapter } = adapterOver([linkedTo('https://www.discogs.com/master/12345')]);

    expect((await adapter.fetchRelease(DISCOVERY_MBID)).discogsId).toBeUndefined();
  });

  it('refuses an address that only has discogs.com in its path', async () => {
    const { adapter } = adapterOver([
      linkedTo('https://example.com/discogs.com/release/249504'),
    ]);

    expect((await adapter.fetchRelease(DISCOVERY_MBID)).discogsId).toBeUndefined();
  });

  it('refuses an id too large to be exactly itself', async () => {
    // 2^53 and up round to a different integer, and an id that is not itself
    // would fetch somebody else's release.
    const { adapter } = adapterOver([
      linkedTo('https://www.discogs.com/release/9007199254740993'),
    ]);

    expect((await adapter.fetchRelease(DISCOVERY_MBID)).discogsId).toBeUndefined();
  });

  it('refuses a relation whose resource is not a URL at all', async () => {
    const { adapter } = adapterOver([linkedTo('discogs.com/release/249504')]);

    expect((await adapter.fetchRelease(DISCOVERY_MBID)).discogsId).toBeUndefined();
  });
});

describe('MetadataAdapter — Discogs credits', () => {
  it('normalises a Discogs release into credits and release facts (ADR-0013)', async () => {
    const { adapter } = adapterOver();

    expect(await adapter.fetchCredits(linkedRelease())).toEqual({
      people: [
        { role: 'Producer', name: 'Stock, Aitken & Waterman' },
        { role: 'Engineer', name: 'Mike Duffy' },
        { role: 'Design', name: 'Me Company' },
      ],
      label: 'RCA',
      catalogNumber: 'PB 41447',
      country: 'UK',
      year: '1987',
      genres: ['Electronic', 'Pop'],
      styles: ['Synth-pop'],
    });
  });

  it('never reads Discogs’ notes, whatever is in them (ADR-0013)', async () => {
    const { adapter } = adapterOver();

    const credits = await adapter.fetchCredits(linkedRelease());

    // The fixture's `notes` is the text ADR-0013 measured: matrix runouts and
    // label variants, which is not liner notes and must not reach a Release.
    const everything = JSON.stringify(credits);
    for (const phrase of ['Manufactured In England', 'Runouts', 'encircled', 'black label']) {
      expect(everything, phrase).not.toContain(phrase);
    }
  });

  it('leaves Release.notes to MusicBrainz, which is a different field of the same name', async () => {
    const { adapter } = adapterOver([linkedTo(DISCOGS_URL), coverArt, discogsRelease]);

    const release = await adapter.resolve(DISCOVERY_MBID);
    const credits = await adapter.fetchCredits(release);

    // MusicBrainz owns `notes`; Discogs owns the block. They never meet, which
    // is why a label the collector typed cannot be overwritten by a lookup.
    expect(release.notes).toContain('Virgin');
    expect(release.notes).not.toContain('RCA');
    expect(credits?.label).toBe('RCA');
  });

  it('reads the real shapes a Discogs response comes in', async () => {
    const { adapter } = adapterOver([
      { match: (url) => url.endsWith('/releases/1'), body: fixtureText('discogs-release-1.json') },
    ]);

    const credits = await adapter.fetchCredits(linkedRelease(1));

    // A March with no day recorded is still 1999, and Discogs' bracketed
    // qualifier on a role is carried rather than tidied away.
    expect(credits?.year).toBe('1999');
    expect(credits?.people).toEqual([
      { role: 'Music By [All Tracks By]', name: 'Jesper Dahlbäck' },
    ]);
    expect(credits?.label).toBe('Svek');
    expect(credits?.catalogNumber).toBe('SK032');
  });

  it('credits the name this release credits, when Discogs has one', async () => {
    const { adapter } = adapterOver([
      {
        match: (url) => url.endsWith('/releases/1'),
        body: JSON.stringify({
          extraartists: [{ name: 'Michael Stock', anv: 'Mike Stock', role: 'Producer' }],
        }),
      },
    ]);

    // What goes on a card is what is printed on the sleeve.
    expect((await adapter.fetchCredits(linkedRelease(1)))?.people).toEqual([
      { role: 'Producer', name: 'Mike Stock' },
    ]);
  });

  it('keeps one credit per role and name, however often Discogs lists it', async () => {
    const { adapter } = adapterOver([
      {
        match: (url) => url.endsWith('/releases/1'),
        body: JSON.stringify({
          extraartists: [
            { name: 'Mike Duffy', role: 'Engineer', tracks: 'A1' },
            { name: 'Mike Duffy', role: 'Engineer', tracks: 'B1' },
            { name: 'Mike Duffy', role: 'Mixed By' },
            { name: '', role: 'Producer' },
          ],
        }),
      },
    ]);

    // The same person in the same role twice is one credit — Discogs lists them
    // once per side. In a second role they are a second credit. A credit with
    // no name is not a credit.
    expect((await adapter.fetchCredits(linkedRelease(1)))?.people).toEqual([
      { role: 'Engineer', name: 'Mike Duffy' },
      { role: 'Mixed By', name: 'Mike Duffy' },
    ]);
  });

  it('never pairs one label’s name with another label’s number', async () => {
    const { adapter } = adapterOver([
      {
        match: (url) => url.endsWith('/releases/1'),
        body: JSON.stringify({ labels: [{ name: 'RCA', catno: '' }, { name: 'BMG', catno: 'PB 1' }] }),
      },
    ]);

    const credits = await adapter.fetchCredits(linkedRelease(1));

    // Both come off the same entry, so this release has a label and no number
    // rather than "RCA · PB 1", which is a real label beside a real number that
    // is not its own.
    expect(credits?.label).toBe('RCA');
    expect(credits?.catalogNumber).toBeUndefined();
  });

  it('takes a catalogue number from an entry that names no label', async () => {
    const { adapter } = adapterOver([
      {
        match: (url) => url.endsWith('/releases/1'),
        body: JSON.stringify({ labels: [{ catno: 'PB 41447' }, { name: 'RCA' }] }),
      },
    ]);

    // The first entry that says anything is the one read, and a number with no
    // label beside it is still a fact about the pressing.
    expect(await adapter.fetchCredits(linkedRelease(1))).toEqual({
      people: [],
      catalogNumber: 'PB 41447',
      genres: [],
      styles: [],
    });
  });

  it('reads no year out of a date that is not one', async () => {
    const { adapter } = adapterOver([
      {
        match: (url) => url.endsWith('/releases/1'),
        body: JSON.stringify({ released: 'unknown', country: 'UK' }),
      },
    ]);

    // Four digits or none: the first four characters of "unknown" would print
    // "unkn" on a card.
    expect((await adapter.fetchCredits(linkedRelease(1)))?.year).toBeUndefined();
  });

  it('reads `released` and not Discogs’ separate year', async () => {
    const { adapter } = adapterOver([
      {
        match: (url) => url.endsWith('/releases/1'),
        body: JSON.stringify({ released: '', year: 1987, country: 'UK' }),
      },
    ]);

    // ADR-0013 and the ticket both name `released`; nothing falls back.
    expect(await adapter.fetchCredits(linkedRelease(1))).toEqual({
      people: [],
      country: 'UK',
      genres: [],
      styles: [],
    });
  });

  it('reports no credits for a Discogs entry with nothing in it', async () => {
    const { adapter } = adapterOver([
      { match: (url) => url.endsWith('/releases/1'), body: JSON.stringify({ id: 1, notes: 'x' }) },
    ]);

    // An empty block would make every later "have the credits arrived?" yes.
    expect(await adapter.fetchCredits(linkedRelease(1))).toBeUndefined();
  });

  it('asks nothing at all when MusicBrainz linked nothing', async () => {
    const { adapter, http } = adapterOver();

    expect(await adapter.fetchCredits(unlinkedRelease)).toBeUndefined();
    expect(http.urls).toEqual([]);
  });

  it('never asks Discogs while a Release is resolving', async () => {
    const { adapter, http } = adapterOver([linkedTo(DISCOGS_URL), coverArt, discogsRelease]);

    await adapter.resolve(DISCOVERY_MBID);

    // Discogs is recorded and answering here, so this is the adapter's own
    // restraint rather than the harness's: credits are asked for once a Release
    // has resolved, and never as part of resolving it (ADR-0013).
    expect(http.urls.some((url) => url.includes('api.discogs.com'))).toBe(false);
  });

  it('sends no `client=` parameter to Discogs, which is MusicBrainz’s', async () => {
    const { adapter, http } = adapterOver();

    await adapter.fetchCredits(linkedRelease());

    expect(http.urls).toEqual([`https://api.discogs.com/releases/${DISCOGS_ID}`]);
  });
});

describe('MetadataAdapter — a Discogs failure costs nothing', () => {
  const failing = (recording: Partial<Recording>): Recording => ({
    match: (url) => url.includes('api.discogs.com'),
    body: 'no',
    ...recording,
  });

  /** Every way Discogs can fail to answer, and the one answer they all get. */
  const failures: ReadonlyArray<readonly [string, Recording]> = [
    ['429, this minute’s twenty-five spent', failing({ status: 429 })],
    ['503, Discogs asking for quiet', failing({ status: 503 })],
    ['404, an id MusicBrainz kept after Discogs dropped it', failing({ status: 404 })],
    ['a body that is not JSON', failing({ body: '<html>maintenance</html>' })],
  ];

  for (const [what, recording] of failures) {
    it(`reports no credits, not a failure, on ${what}`, async () => {
      const { adapter } = adapterOver([recording]);

      await expect(adapter.fetchCredits(linkedRelease())).resolves.toBeUndefined();
    });
  }

  it('reports no credits when Discogs cannot be reached at all', async () => {
    // A timeout aborts the request, which arrives as a rejection rather than
    // as a status. Nothing is waiting on this, so there is nothing to report.
    const http: HttpClient = {
      async get(url: string): Promise<HttpResponse> {
        if (url.includes('api.discogs.com')) throw new TypeError('Failed to fetch');
        throw new Error(`unexpected request: ${url}`);
      },
    };
    const adapter = createMetadataAdapter({ http, clock: testClock() });

    await expect(adapter.fetchCredits(linkedRelease())).resolves.toBeUndefined();
  });

  it('does not retry Discogs, unlike a MusicBrainz lookup', async () => {
    const { adapter, http } = adapterOver([failing({ status: 429 })]);

    await adapter.fetchCredits(linkedRelease());

    // Discogs counts requests over a moving minute, so waiting two seconds and
    // asking again spends a second request to be told the same thing.
    expect(http.urls).toHaveLength(1);
  });

  it('leaves the Release intact when Discogs never answers', async () => {
    const { adapter } = adapterOver([linkedTo(DISCOGS_URL), coverArt, failing({ status: 503 })]);

    const release = await adapter.resolve(DISCOVERY_MBID);
    const credits = await adapter.fetchCredits(release);

    expect(credits).toBeUndefined();
    expect(release.album).toBe('Discovery');
    expect(release.tracks).toHaveLength(14);
    expect(release.artwork?.widthPx).toBe(500);
    expect(release.discogsId).toBe(DISCOGS_ID);
  });
});

describe('MetadataAdapter — two services, two queues', () => {
  it('keeps Discogs to twenty-five requests a minute on a queue of its own', async () => {
    const { adapter, clock } = adapterOver();

    await adapter.search({ artist: 'Daft Punk' });
    await adapter.search({ artist: 'Daft Punk', album: 'Discovery' });
    await adapter.fetchCredits(linkedRelease());
    await adapter.fetchCredits(linkedRelease());

    // Two intervals, not one: MusicBrainz's second between its two requests and
    // Discogs' 2.4 s between its two. A single shared queue could only produce
    // one number here, and would be wrong at either — too fast for Discogs at
    // 1000, or 2.4× slower than it needs to be for MusicBrainz at 2400.
    expect([...new Set(clock.slept.filter((ms) => ms > 0))].sort((a, b) => a - b)).toEqual([
      1000, 2400,
    ]);
  });

  it('does not make a MusicBrainz request wait behind a Discogs one', async () => {
    const { adapter, clock } = adapterOver();

    await adapter.search({ artist: 'Daft Punk' });
    await adapter.fetchCredits(linkedRelease());
    await adapter.search({ artist: 'Daft Punk', album: 'Discovery' });

    // The credits request in the middle is not on this queue, so the second
    // search waits the one second it would have waited without it.
    expect(clock.slept.filter((ms) => ms > 0)).toEqual([1000]);
  });
});
