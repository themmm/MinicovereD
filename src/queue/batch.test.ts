import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { Clock, HttpClient, HttpResponse } from '../metadata/http.ts';
import { createMetadataAdapter } from '../metadata/metadata-adapter.ts';
import type { MetadataAdapter } from '../metadata/metadata-adapter.ts';
import { DEFAULT_DESIGN_CHOICE } from '../render/sheet-renderer.ts';
import type { DesignChoice } from '../render/sheet-renderer.ts';
import { resolveBatchIntoQueue } from './batch.ts';
import type { BatchProgress, BatchRequest } from './batch.ts';
import type { QueueEntry } from './release-queue.ts';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '..', 'metadata', '__fixtures__');
const fixture = (name: string): string => readFileSync(join(fixtures, name), 'utf8');

const DISCOVERY_MBID = '5ad66522-edce-3a77-b5fa-7956ee879239';

/** Replays recorded responses; anything unrecorded fails the test loudly. */
function recordedHttp(missing: readonly string[] = []): HttpClient & { readonly urls: string[] } {
  const urls: string[] = [];
  return {
    urls,
    async get(url: string): Promise<HttpResponse> {
      urls.push(url);
      const respond = (status: number, body: string): HttpResponse => ({
        ok: status >= 200 && status < 300,
        status,
        text: async () => body,
        bytes: async () => new TextEncoder().encode(body),
      });

      if (missing.some((term) => url.includes(encodeURIComponent(term)))) {
        return respond(200, fixture('search-miss.json'));
      }
      if (url.includes('/ws/2/release?')) return respond(200, fixture('search-hit.json'));
      if (url.includes(`/ws/2/release/${DISCOVERY_MBID}`)) {
        return respond(200, fixture('release-with-tracklist.json'));
      }
      if (url.includes('coverartarchive.org')) return respond(404, 'no cover');
      throw new Error(`test would have hit the network: ${url}`);
    },
  };
}

/** No real waiting: the throttle's clock belongs to the test. */
function testClock(): Clock & { readonly slept: number[] } {
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

const requests = (...queries: Array<[string, string]>): BatchRequest[] =>
  queries.map(([artist, album]) => ({
    id: `${artist}/${album}`,
    query: { kind: 'fielded', artist, album },
  }));

/**
 * Lines that named no artist, which the field reads as release titles.
 *
 * The id is prefixed the way `parseBatchLines` prefixes it, so that it differs
 * from the title — otherwise a progress line that fell back to the id would be
 * indistinguishable from one that named the title.
 */
const titles = (...names: readonly string[]): BatchRequest[] =>
  names.map((text) => ({ id: `batch-${text}`, query: { kind: 'text', text } }));

/**
 * `resolveBatchIntoQueue` on the design a first-ever Batch would carry.
 *
 * The design moved in front of the progress callback when the resolver stopped
 * hard-coding one, and only the last describe block below is about it — the
 * rest are about what a lookup does, and say nothing about how an Entry is
 * dressed.
 */
const resolveBatch = (
  adapter: MetadataAdapter,
  requests: readonly BatchRequest[],
  onProgress: (progress: BatchProgress) => void,
  design: DesignChoice = DEFAULT_DESIGN_CHOICE,
): Promise<QueueEntry[]> => resolveBatchIntoQueue(adapter, requests, design, onProgress);

describe('resolving a batch into the queue', () => {
  it('resolves every entry and reports progress as it goes', async () => {
    const http = recordedHttp();
    const adapter = createMetadataAdapter({ http, clock: testClock() });
    const progress: Array<{ done: number; total: number }> = [];

    const entries = await resolveBatch(
      adapter,
      requests(['Daft Punk', 'Discovery'], ['Daft Punk', 'Homework'], ['Daft Punk', 'Human After All']),
      (update) => progress.push({ done: update.done, total: update.total }),
    );

    expect(entries).toHaveLength(3);
    expect(entries.every((entry) => entry.status === 'ready')).toBe(true);
    expect(progress[0]).toEqual({ done: 0, total: 3 });
    expect(progress.at(-1)).toEqual({ done: 3, total: 3 });
  });

  it('keeps a failed lookup in the queue while the rest complete', async () => {
    const http = recordedHttp(['No Such Album Xyzzy']);
    const adapter = createMetadataAdapter({ http, clock: testClock() });

    const entries = await resolveBatch(
      adapter,
      requests(
        ['Daft Punk', 'Discovery'],
        ['Zzzqqxx Nonexistent', 'No Such Album Xyzzy'],
        ['Daft Punk', 'Homework'],
      ),
      () => {},
    );

    expect(entries.map((entry) => entry.status)).toEqual(['ready', 'failed', 'ready']);
    // The one that failed is still an editable Release carrying what was typed.
    const failed = entries[1];
    expect(failed?.design.release.artist).toBe('Zzzqqxx Nonexistent');
    expect(failed?.design.release.album).toBe('No Such Album Xyzzy');
    expect(failed?.error).toMatch(/nothing|no release|not found/i);
  });

  it('resolves a batch of five with one deliberate failure', async () => {
    const http = recordedHttp(['Not A Real Album']);
    const adapter = createMetadataAdapter({ http, clock: testClock() });

    const entries = await resolveBatch(
      adapter,
      requests(
        ['Daft Punk', 'Discovery'],
        ['Daft Punk', 'Homework'],
        ['Nobody', 'Not A Real Album'],
        ['Daft Punk', 'Human After All'],
        ['Daft Punk', 'Random Access Memories'],
      ),
      () => {},
    );

    expect(entries).toHaveLength(5);
    expect(entries.filter((entry) => entry.status === 'ready')).toHaveLength(4);
    expect(entries.filter((entry) => entry.status === 'failed')).toHaveLength(1);
  });

  it('keeps to one request per second across the whole batch', async () => {
    const http = recordedHttp();
    const clock = testClock();
    const adapter = createMetadataAdapter({ http, clock });

    await resolveBatch(
      adapter,
      requests(['Daft Punk', 'Discovery'], ['Daft Punk', 'Homework']),
      () => {},
    );

    // Every request after the first waits out the interval.
    const waits = clock.slept.filter((ms) => ms > 0);
    expect(waits.length).toBe(http.urls.length - 1);
    expect(Math.min(...waits)).toBe(1000);
  });

  it('gives every entry an id of its own, so the queue can tell them apart', async () => {
    const http = recordedHttp(['Missing One', 'Missing Two']);
    const adapter = createMetadataAdapter({ http, clock: testClock() });

    const entries = await resolveBatch(
      adapter,
      requests(['Nobody', 'Missing One'], ['Nobody', 'Missing Two']),
      () => {},
    );

    const ids = entries.map((entry) => entry.design.release.id);
    expect(new Set(ids).size).toBe(2);
  });

  it('names the entry it is working on, so progress is not just a number', async () => {
    const http = recordedHttp();
    const adapter = createMetadataAdapter({ http, clock: testClock() });
    const seen: string[] = [];

    await resolveBatch(
      adapter,
      requests(['Daft Punk', 'Discovery'], ['Daft Punk', 'Homework']),
      (update) => {
        if (update.current) seen.push(update.current);
      },
    );

    expect(seen).toContain('Daft Punk — Discovery');
    expect(seen).toContain('Daft Punk — Homework');
  });
});

describe('a request that named no artist', () => {
  it('searches the release index unfielded, exactly as one typed line does', async () => {
    // The v1 debt at the far end: a title routed into `artist` asks
    // MusicBrainz for an artist of that name and finds nothing, which is a
    // request out of a budget of one a second spent on a certain miss.
    const http = recordedHttp();
    const adapter = createMetadataAdapter({ http, clock: testClock() });

    await resolveBatch(adapter, titles('Loveless'), () => {});

    expect(http.urls[0]).toContain('query=%22Loveless%22');
    expect(http.urls[0]).not.toContain('artist');
  });

  it('leaves a title that found nothing in the album field, never the artist', async () => {
    const http = recordedHttp(['Loveless']);
    const adapter = createMetadataAdapter({ http, clock: testClock() });

    const [entry] = await resolveBatch(adapter, titles('Loveless'), () => {});

    // The card the collector completes by hand has the title where a title
    // goes, so all that is left to type is the artist.
    expect(entry?.status).toBe('failed');
    expect(entry?.design.release.album).toBe('Loveless');
    expect(entry?.design.release.artist).toBe('');
  });

  it('names itself by its title in progress, not by its id', async () => {
    const http = recordedHttp();
    const adapter = createMetadataAdapter({ http, clock: testClock() });
    const seen: string[] = [];

    await resolveBatch(adapter, titles('Loveless'), (update) => {
      if (update.current) seen.push(update.current);
    });

    expect(seen).toContain('Loveless');
  });
});

describe('the design a Batch dresses its Entries in', () => {
  /** Nothing a default would produce: a different Template and a different ground. */
  const chosen: DesignChoice = {
    templateId: 'minimal',
    params: { ...DEFAULT_DESIGN_CHOICE.params, paperColor: '#101820', showLogo: false },
  };

  it('gives every Entry the design it was handed, found and not found alike', async () => {
    // The asymmetry ticket 06 removes, at this end of it: for the whole of v1
    // a Batch produced plain Classic on white however the Queue on screen was
    // set, so pasting a shelf undid the design the collector had just chosen.
    const http = recordedHttp(['Nope']);
    const adapter = createMetadataAdapter({ http, clock: testClock() });

    const entries = await resolveBatch(
      adapter,
      [...requests(['Daft Punk', 'Discovery']), ...titles('Nope')],
      () => {},
      chosen,
    );

    // One of each, so a rule that only reached the successful path would show.
    expect(entries.map((entry) => entry.status)).toEqual(['ready', 'failed']);
    for (const entry of entries) {
      expect(entry.design.templateId, entry.design.release.album).toBe('minimal');
      expect(entry.design.params.paperColor, entry.design.release.album).toBe('#101820');
      expect(entry.design.params.showLogo, entry.design.release.album).toBe(false);
    }
  });

  it('gives an Entry whose lookup threw the same design as the rest', async () => {
    // The third path out of the loop, and the one nothing else here covers: a
    // search that fails outright is caught rather than searched-and-empty.
    const http: HttpClient = {
      get: () => Promise.reject(new Error('the network went away')),
    };
    const adapter = createMetadataAdapter({ http, clock: testClock() });

    const [entry] = await resolveBatch(adapter, titles('Anything'), () => {}, chosen);

    expect(entry?.status).toBe('failed');
    expect(entry?.error).toContain('the network went away');
    expect(entry?.design.templateId).toBe('minimal');
  });

  it('does not carry a Release from one Entry into another', async () => {
    // A tripwire rather than a proof. Every Entry is built by spreading the one
    // design object, and `DesignChoice` has no `release` field today, so spread
    // order cannot go wrong — this is here for the day it grows one.
    const http = recordedHttp(['One', 'Two']);
    const adapter = createMetadataAdapter({ http, clock: testClock() });

    const entries = await resolveBatch(adapter, titles('One', 'Two'), () => {}, chosen);

    expect(entries.map((entry) => entry.design.release.album)).toEqual(['One', 'Two']);
  });
});
