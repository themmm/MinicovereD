import { afterEach, describe, expect, it, vi } from 'vitest';

import { createFetchHttpClient } from './http.ts';

/** Records what was handed to `fetch`, and answers however the test wants. */
function stubFetch(respond: (init: RequestInit) => Promise<Response>): { readonly calls: RequestInit[] } {
  const calls: RequestInit[] = [];
  vi.stubGlobal('fetch', (_url: string, init: RequestInit) => {
    calls.push(init);
    return respond(init);
  });
  return { calls };
}

const ok = async (): Promise<Response> => new Response('{}', { status: 200 });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the fetch HTTP client', () => {
  it('drops the headers a browser will not let script set (ADR-0006)', async () => {
    const { calls } = stubFetch(ok);

    await createFetchHttpClient().get('https://musicbrainz.org/ws/2/release', {
      headers: { 'User-Agent': 'minicovered/0.1.0', Accept: 'application/json' },
    });

    // Sending them anyway risks a preflight MusicBrainz does not answer.
    expect(calls[0]?.headers).toEqual({ Accept: 'application/json' });
  });

  it('gives up on a request that is accepted and then never answered', async () => {
    stubFetch(
      (init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );

    // Without this the batch behind it waits for as long as the mirror does.
    await expect(
      createFetchHttpClient().get('https://coverartarchive.org/release/x/front-1200', {
        timeoutMs: 25,
      }),
    ).rejects.toThrow();
  });

  it('asks for no deadline when none was given, rather than inventing one', async () => {
    const { calls } = stubFetch(ok);

    await createFetchHttpClient().get('https://musicbrainz.org/ws/2/release');

    expect(calls[0]?.signal).toBeUndefined();
  });

  it('reports the status rather than throwing on it, so callers can decide', async () => {
    stubFetch(async () => new Response('slow down', { status: 503 }));

    const response = await createFetchHttpClient().get('https://musicbrainz.org/ws/2/release');

    expect(response.ok).toBe(false);
    expect(response.status).toBe(503);
    expect(await response.text()).toBe('slow down');
  });
});
