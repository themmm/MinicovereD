import type { Artwork, Release, Track } from '../domain/release.ts';
import { errorMessage } from '../errors.ts';
import { APP_VERSION } from '../version.ts';
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
 * MusicBrainz requires an identifying User-Agent on every request, which a
 * browser will not let script set and ADR-0001 rules out adding a backend for.
 * ADR-0006 records what is done instead: send the header anyway for hosts that
 * allow it, carry `client=` as a best-effort identifier — MusicBrainz documents
 * that parameter for submissions, not lookups — and honour the rate limit
 * strictly, which is what the policy is actually protecting.
 */
const CLIENT_ID = `minicovered-${APP_VERSION}`;
const USER_AGENT = `minicovered/${APP_VERSION} ( https://github.com/themmm/MinicovereD )`;

/** How many search results to show at once. MusicBrainz reports the full count separately. */
const SEARCH_PAGE_SIZE = 25;

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
 * Nothing else bounds a request, so both services get a deadline.
 *
 * The numbers come from watching a live batch rather than from taste. The
 * Archive redirects to storage nodes that were observed failing after 10.8 s
 * and 20.3 s — and succeeding after 21.8 s, which is why the cover-art
 * deadline is generous rather than tight: a short one would throw away covers
 * that do arrive. What actually saves the batch is not retrying the second
 * size after the first could not be reached at all.
 */
const METADATA_TIMEOUT_MS = 15_000;
const COVER_ART_TIMEOUT_MS = 25_000;

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
  /**
   * A query with no field named — a bare album title, typically.
   *
   * Kept apart from `artist` and `album` rather than folded into either,
   * because routing it into one would search the wrong index: "wichita
   * lineman" put into `artist` asks MusicBrainz for an artist of that name and
   * finds nothing. When this is set the fielded clauses are ignored.
   */
  readonly text?: string;
}

/** What a search found: the page of results, and how many matched in total. */
export interface SearchResults {
  readonly releases: readonly ReleaseSummary[];
  /** Total matches on MusicBrainz, which may be more than were returned. */
  readonly total: number;
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

/**
 * Named for resolving, not batching: `src/queue/batch.ts` has its own
 * `BatchRequest`, which is what the collector typed. This one is what the
 * adapter needs once a pressing has been chosen.
 */
export interface ResolveRequest {
  /** The caller's own id for this queue entry, echoed back in the outcome. */
  readonly id: string;
  readonly mbid: string;
}

export interface ResolveProgress {
  readonly done: number;
  readonly total: number;
  /** The entry being resolved right now, if any. */
  readonly current?: string;
}

/**
 * One entry's result. A failure is reported here rather than thrown, so one
 * missing album never blocks the other nine.
 */
export interface ResolveOutcome {
  readonly id: string;
  readonly release?: Release;
  readonly error?: string;
}

export interface MetadataAdapter {
  search(query: SearchQuery): Promise<SearchResults>;
  fetchRelease(mbid: string): Promise<Release>;
  fetchArtwork(mbid: string): Promise<Artwork | undefined>;
  /** Release plus artwork, with missing artwork treated as absent rather than fatal. */
  resolve(mbid: string): Promise<Release>;
  resolveBatch(
    requests: readonly ResolveRequest[],
    onProgress: (progress: ResolveProgress) => void,
  ): Promise<ResolveOutcome[]>;
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
  // A track with no title anywhere still occupies its position, so it gets a
  // visible placeholder rather than a numbered blank line on the Back Card.
  const titles = (release.media ?? []).flatMap((medium) =>
    (medium.tracks ?? []).map((track) => track.title || track.recording?.title || '[untitled]'),
  );
  // Numbered by position in the printed list, so a two-disc Release still
  // reads 1..n down the Back Card.
  return titles.map((title, index) => ({ position: index + 1, title }));
}

function toRelease(mbid: string, payload: MbRelease): Release {
  const notes = labelNote(payload['label-info']);
  const year = yearOf(payload.date);
  return {
    id: mbid,
    artist: joinArtistCredit(payload['artist-credit']),
    album: payload.title ?? '',
    ...(year ? { year } : {}),
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

  // Unfielded, and quoted as a phrase. Quoted because a title is full of
  // characters Lucene reads as operators — "AC/DC", "Discovery (Remastered)",
  // "F♯A♯∞" — and one of those turning into a syntax error costs a request out
  // of a budget of one per second (ADR-0006). A phrase still matches inside a
  // longer name, so "wichita lineman" finds "Wichita Lineman (Expanded)".
  const text = query.text?.trim();
  if (text) return `"${escape(text)}"`;

  const clauses = [
    query.artist?.trim() ? `artist:"${escape(query.artist.trim())}"` : undefined,
    query.album?.trim() ? `release:"${escape(query.album.trim())}"` : undefined,
  ].filter((clause): clause is string => !!clause);
  return clauses.join(' AND ');
}

/** 32 KB at a time: enough to keep the work off the character-by-character path
 *  without overflowing the argument list of String.fromCharCode. */
const BASE64_CHUNK = 0x8000;

function toDataUrl(bytes: Uint8Array, mime: string): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + BASE64_CHUNK));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

export function createMetadataAdapter(options: MetadataAdapterOptions): MetadataAdapter {
  const { http } = options;
  const clock = options.clock ?? systemClock;
  const throttle = createThrottle(options.minRequestIntervalMs ?? MIN_REQUEST_INTERVAL_MS, clock);

  const send = (url: string, timeoutMs: number): Promise<HttpResponse> =>
    throttle(() =>
      http.get(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        timeoutMs,
      }),
    );

  /**
   * `retries` is spent only on requests worth waiting for. Cover art is
   * optional, and retrying two sizes twice each turns a Release with no cover
   * into six requests and thirteen seconds of apparently frozen progress.
   */
  async function request(
    url: string,
    retries = RETRY_ATTEMPTS,
    timeoutMs = METADATA_TIMEOUT_MS,
  ): Promise<HttpResponse> {
    let response = await send(url, timeoutMs);
    for (let attempt = 0; attempt < retries && RETRY_STATUSES.has(response.status); attempt++) {
      await clock.sleep(RETRY_BACKOFF_MS * (attempt + 1));
      response = await send(url, timeoutMs);
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
      let response: HttpResponse;
      try {
        response = await request(
          `${COVER_ART_ARCHIVE}/release/${encodeURIComponent(mbid)}/${size}`,
          0,
          COVER_ART_TIMEOUT_MS,
        );
      } catch {
        // Not "this size is missing" but "the Archive is not answering", and
        // the other size comes off the same storage node — asking for it would
        // spend another deadline to learn the same thing. The Release itself
        // already came back, so the design is printable without a picture.
        return undefined;
      }
      // A non-2xx *is* an answer: this size is not on file, but another may be.
      if (!response.ok) continue;

      try {
        const bytes = await response.bytes();
        const dimensions = imageSize(bytes);
        if (!dimensions) continue;

        return {
          dataUrl: toDataUrl(bytes, dimensions.mime),
          widthPx: dimensions.widthPx,
          heightPx: dimensions.heightPx,
        };
      } catch {
        // A body that will not finish arriving is a cover that cannot be printed.
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
      if (!term) return { releases: [], total: 0 };

      const url = withClient(
        `${MUSICBRAINZ}/release?query=${encodeURIComponent(term)}&fmt=json&limit=${SEARCH_PAGE_SIZE}`,
      );
      const payload = await getJson<MbSearchResponse>(url, 'search');
      const releases = (payload.releases ?? [])
        .map(toSummary)
        .filter((summary): summary is ReleaseSummary => !!summary);
      return { releases, total: payload.count ?? releases.length };
    },

    fetchRelease,
    fetchArtwork,
    resolve,

    async resolveBatch(requests, onProgress) {
      const outcomes: ResolveOutcome[] = [];
      onProgress({ done: 0, total: requests.length });

      for (const entry of requests) {
        onProgress({ done: outcomes.length, total: requests.length, current: entry.id });
        try {
          outcomes.push({ id: entry.id, release: await resolve(entry.mbid) });
        } catch (error) {
          // Reported, not thrown: one missing album must not block the rest.
          outcomes.push({ id: entry.id, error: errorMessage(error) });
        }
        onProgress({ done: outcomes.length, total: requests.length });
      }
      return outcomes;
    },
  };
}
