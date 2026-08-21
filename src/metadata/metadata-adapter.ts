import type { Artwork, Release, Track } from '../domain/release.ts';
import { imageSize } from './image-size.ts';
import { systemClock } from './http.ts';
import type { Clock, HttpClient, HttpResponse } from './http.ts';
import type { MbArtistCredit, MbLabelInfo, MbRelease, MbSearchResponse } from './musicbrainz-types.ts';

/**
 * MetadataAdapter: MusicBrainz release search, release + tracklist fetch and
 * Cover Art Archive artwork, normalised into the Release domain type. No API
 * key, and every request goes through one throttle so the whole app keeps to
 * MusicBrainz's one-request-per-second policy.
 */

const MUSICBRAINZ = 'https://musicbrainz.org/ws/2';
const COVER_ART_ARCHIVE = 'https://coverartarchive.org';

/**
 * MusicBrainz asks clients to identify themselves. A browser will not let
 * `fetch` set User-Agent, so the header is sent for the environments that
 * allow it and the documented `client` query parameter carries the same
 * identity everywhere else.
 */
const CLIENT_ID = 'mdcovergen-0.1.0';
const USER_AGENT = 'mdcovergen/0.1.0 ( https://github.com/themmm/mdcovergen )';

/** MusicBrainz's published rate limit for anonymous clients. */
const MIN_REQUEST_INTERVAL_MS = 1000;

/**
 * MusicBrainz answers 503 when a client has been going too fast. That is a
 * "come back shortly", not a failure, so it is worth waiting out once or twice
 * before telling the collector their album could not be found.
 */
const RETRY_STATUSES = new Set([429, 503]);
const RETRY_ATTEMPTS = 2;
const RETRY_BACKOFF_MS = 2000;

/**
 * The Cover Art Archive's front-cover shortcuts, largest first. 1200 px covers
 * a 68 mm Front Panel at 300 DPI (803 px) without pulling a multi-megabyte scan
 * into a design that has to travel inside a project file.
 *
 * Deliberately not the JSON index at /release/{mbid}: that redirect chain ends
 * on an archive.org data node which answers without an
 * Access-Control-Allow-Origin header, so a browser can never read it. The
 * image URLs carry the header on every hop.
 */
const COVER_ART_SIZES = ['front-1200', 'front-500'] as const;

export interface SearchQuery {
  readonly artist?: string;
  readonly album?: string;
}

/** One row of search results: enough to tell two pressings apart before fetching either. */
export interface ReleaseSummary {
  readonly mbid: string;
  readonly artist: string;
  readonly album: string;
  readonly year?: string;
  readonly country?: string;
  readonly trackCount?: number;
  readonly label?: string;
}

export interface BatchRequest {
  /** The caller's own id for this queue entry, echoed back in the outcome. */
  readonly id: string;
  readonly mbid: string;
}

export interface BatchProgress {
  readonly done: number;
  readonly total: number;
  /** The entry being resolved right now, if any. */
  readonly current?: string;
}

/**
 * One entry's result. A failure is reported here rather than thrown, so one
 * missing album never blocks the other nine.
 */
export interface BatchOutcome {
  readonly id: string;
  readonly release?: Release;
  readonly error?: string;
}

export interface MetadataAdapter {
  search(query: SearchQuery): Promise<ReleaseSummary[]>;
  fetchRelease(mbid: string): Promise<Release>;
  fetchArtwork(mbid: string): Promise<Artwork | undefined>;
  /** Release plus artwork, with missing artwork treated as absent rather than fatal. */
  resolve(mbid: string): Promise<Release>;
  resolveBatch(
    requests: readonly BatchRequest[],
    onProgress: (progress: BatchProgress) => void,
  ): Promise<BatchOutcome[]>;
}

export interface MetadataAdapterOptions {
  readonly http: HttpClient;
  readonly clock?: Clock;
  readonly minRequestIntervalMs?: number;
}

/** Serialises calls and keeps at least `minIntervalMs` between them. */
function createThrottle(minIntervalMs: number, clock: Clock): <T>(task: () => Promise<T>) => Promise<T> {
  let queue: Promise<unknown> = Promise.resolve();
  let lastStartedAt = Number.NEGATIVE_INFINITY;

  return <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(async () => {
      const waitFor = lastStartedAt + minIntervalMs - clock.now();
      if (waitFor > 0) await clock.sleep(waitFor);
      lastStartedAt = clock.now();
      return task();
    });
    // Keep the chain alive even when a task rejects, or one failure would
    // wedge every request behind it.
    queue = run.catch(() => undefined);
    return run;
  };
}

function joinArtistCredit(credits: readonly MbArtistCredit[] | undefined): string {
  return (credits ?? []).map((credit) => `${credit.name ?? ''}${credit.joinphrase ?? ''}`).join('').trim();
}

function labelNote(labelInfo: readonly MbLabelInfo[] | undefined): string | undefined {
  const parts = (labelInfo ?? []).flatMap((info) =>
    [info.label?.name, info['catalog-number']].filter((value): value is string => !!value),
  );
  return parts.length > 0 ? [...new Set(parts)].join(' · ') : undefined;
}

const yearOf = (date: string | undefined): string | undefined => date?.slice(0, 4) || undefined;

function tracksOf(release: MbRelease): Track[] {
  const titles = (release.media ?? []).flatMap((medium) =>
    (medium.tracks ?? []).map((track) => track.title ?? track.recording?.title ?? ''),
  );
  // Numbered by position in the printed list, so a two-disc Release still
  // reads 1..n down the Back Card.
  return titles.map((title, index) => ({ position: index + 1, title }));
}

function toRelease(mbid: string, payload: MbRelease): Release {
  const notes = labelNote(payload['label-info']);
  return {
    id: mbid,
    artist: joinArtistCredit(payload['artist-credit']),
    album: payload.title ?? '',
    ...(yearOf(payload.date) ? { year: yearOf(payload.date) as string } : {}),
    ...(notes ? { notes } : {}),
    tracks: tracksOf(payload),
  };
}

function toSummary(payload: MbRelease): ReleaseSummary | undefined {
  if (!payload.id) return undefined;
  const label = labelNote(payload['label-info']);
  const year = yearOf(payload.date);
  return {
    mbid: payload.id,
    artist: joinArtistCredit(payload['artist-credit']),
    album: payload.title ?? '',
    ...(year ? { year } : {}),
    ...(payload.country ? { country: payload.country } : {}),
    ...(payload['track-count'] !== undefined ? { trackCount: payload['track-count'] } : {}),
    ...(label ? { label } : {}),
  };
}

/** Lucene query for the MusicBrainz search index, with the user's text escaped. */
function searchTerm(query: SearchQuery): string {
  const escape = (value: string): string => value.replace(/["\\]/g, '\\$&');
  const clauses = [
    query.artist?.trim() ? `artist:"${escape(query.artist.trim())}"` : undefined,
    query.album?.trim() ? `release:"${escape(query.album.trim())}"` : undefined,
  ].filter((clause): clause is string => !!clause);
  return clauses.join(' AND ');
}

function toDataUrl(bytes: Uint8Array, mime: string): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:${mime};base64,${btoa(binary)}`;
}

export function createMetadataAdapter(options: MetadataAdapterOptions): MetadataAdapter {
  const { http } = options;
  const clock = options.clock ?? systemClock;
  const throttle = createThrottle(options.minRequestIntervalMs ?? MIN_REQUEST_INTERVAL_MS, clock);

  const send = (url: string): Promise<HttpResponse> =>
    throttle(() => http.get(url, { 'User-Agent': USER_AGENT, Accept: 'application/json' }));

  async function request(url: string): Promise<HttpResponse> {
    let response = await send(url);
    for (let attempt = 0; attempt < RETRY_ATTEMPTS && RETRY_STATUSES.has(response.status); attempt++) {
      await clock.sleep(RETRY_BACKOFF_MS * (attempt + 1));
      response = await send(url);
    }
    return response;
  }

  async function getJson<T>(url: string, what: string): Promise<T> {
    const response = await request(url);
    if (!response.ok) {
      throw new Error(
        response.status === 503
          ? `MusicBrainz is asking us to slow down (HTTP 503). Try again in a moment.`
          : `${what}: HTTP ${response.status}`,
      );
    }
    return JSON.parse(await response.text()) as T;
  }

  const withClient = (url: string): string => `${url}&client=${CLIENT_ID}`;

  async function fetchRelease(mbid: string): Promise<Release> {
    const url = withClient(
      `${MUSICBRAINZ}/release/${encodeURIComponent(mbid)}?inc=artist-credits+recordings+labels&fmt=json`,
    );
    return toRelease(mbid, await getJson<MbRelease>(url, `release ${mbid}`));
  }

  /**
   * Cover art is optional. A Release with no front cover on file answers with
   * a non-2xx from the Archive, and that is reported as "no artwork" rather
   * than as a failure — the Release is still perfectly printable.
   */
  async function fetchArtwork(mbid: string): Promise<Artwork | undefined> {
    for (const size of COVER_ART_SIZES) {
      try {
        const response = await request(
          `${COVER_ART_ARCHIVE}/release/${encodeURIComponent(mbid)}/${size}`,
        );
        if (!response.ok) continue;

        const bytes = await response.bytes();
        const dimensions = imageSize(bytes);
        if (!dimensions) continue;

        return {
          dataUrl: toDataUrl(bytes, dimensions.mime),
          widthPx: dimensions.widthPx,
          heightPx: dimensions.heightPx,
        };
      } catch {
        // A transport failure reaching the Archive is still just "no artwork":
        // the release itself already came back, so the design is printable.
        continue;
      }
    }
    return undefined;
  }

  async function resolve(mbid: string): Promise<Release> {
    const release = await fetchRelease(mbid);
    const artwork = await fetchArtwork(mbid);
    return artwork ? { ...release, artwork } : release;
  }

  return {
    async search(query) {
      const term = searchTerm(query);
      if (!term) return [];
      const url = withClient(
        `${MUSICBRAINZ}/release?query=${encodeURIComponent(term)}&fmt=json&limit=25`,
      );
      const payload = await getJson<MbSearchResponse>(url, 'search');
      return (payload.releases ?? [])
        .map(toSummary)
        .filter((summary): summary is ReleaseSummary => !!summary);
    },

    fetchRelease,
    fetchArtwork,
    resolve,

    async resolveBatch(requests, onProgress) {
      const outcomes: BatchOutcome[] = [];
      onProgress({ done: 0, total: requests.length });

      for (const entry of requests) {
        onProgress({ done: outcomes.length, total: requests.length, current: entry.id });
        try {
          outcomes.push({ id: entry.id, release: await resolve(entry.mbid) });
        } catch (error) {
          // Reported, not thrown: one missing album must not block the rest.
          outcomes.push({
            id: entry.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        onProgress({ done: outcomes.length, total: requests.length });
      }
      return outcomes;
    },
  };
}
