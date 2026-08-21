/**
 * The network boundary. Everything the MetadataAdapter knows about HTTP is
 * this interface, which is why its tests can replay recorded responses and
 * never reach the live services.
 */

export interface HttpResponse {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
  bytes(): Promise<Uint8Array>;
}

export interface HttpRequest {
  readonly headers?: Readonly<Record<string, string>>;
  /**
   * Give up after this long. Nothing else bounds a request: a mirror that
   * accepts the connection and then never answers would otherwise hold a
   * batch open for as long as the collector is prepared to watch it.
   */
  readonly timeoutMs?: number;
}

export interface HttpClient {
  get(url: string, request?: HttpRequest): Promise<HttpResponse>;
}

/** A clock the throttle can be tested against without anyone waiting a second. */
export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/**
 * Header names browsers refuse to let script set. Passing them anyway risks a
 * CORS preflight that MusicBrainz does not answer, so they are dropped here
 * rather than in the adapter — which is free to state its intent, and does.
 */
const FORBIDDEN_HEADERS = new Set(['user-agent', 'referer', 'origin', 'host']);

export function createFetchHttpClient(): HttpClient {
  return {
    async get(url, request) {
      const safe = Object.fromEntries(
        Object.entries(request?.headers ?? {}).filter(
          ([name]) => !FORBIDDEN_HEADERS.has(name.toLowerCase()),
        ),
      );
      const response = await fetch(url, {
        headers: safe,
        mode: 'cors',
        // A signal, not a race: this aborts the request itself rather than
        // abandoning the promise and leaving the connection open behind it.
        ...(request?.timeoutMs === undefined
          ? {}
          : { signal: AbortSignal.timeout(request.timeoutMs) }),
      });
      return {
        ok: response.ok,
        status: response.status,
        text: () => response.text(),
        bytes: async () => new Uint8Array(await response.arrayBuffer()),
      };
    },
  };
}
