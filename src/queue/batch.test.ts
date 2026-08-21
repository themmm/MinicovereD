import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { Clock, HttpClient, HttpResponse } from '../metadata/http.ts';
import { createMetadataAdapter } from '../metadata/metadata-adapter.ts';
import { resolveBatchIntoQueue } from './batch.ts';
import type { BatchRequest } from './batch.ts';

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
  queries.map(([artist, album]) => ({ id: `${artist}/${album}`, artist, album }));

describe('resolving a batch into the queue', () => {
  it('resolves every entry and reports progress as it goes', async () => {
    const http = recordedHttp();
    const adapter = createMetadataAdapter({ http, clock: testClock() });
    const progress: Array<{ done: number; total: number }> = [];

    const entries = await resolveBatchIntoQueue(
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

    const entries = await resolveBatchIntoQueue(
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

    const entries = await resolveBatchIntoQueue(
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

    await resolveBatchIntoQueue(
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

    const entries = await resolveBatchIntoQueue(
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

    await resolveBatchIntoQueue(
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
