import { hasCredits } from '../domain/credits.ts';
import type { Artwork, Credit, Credits, Release, Track } from '../domain/release.ts';
import { errorMessage } from '../errors.ts';
import { APP_VERSION } from '../version.ts';
import { imageSize } from './image-size.ts';
import { systemClock } from './http.ts';
import type { Clock, HttpClient, HttpResponse } from './http.ts';
import type { DiscogsRelease } from './discogs-types.ts';
import type {
  MbArtistCredit,
  MbLabelInfo,
  MbRelation,
  MbRelease,
  MbSearchResponse,
  MbTrack,
} from './musicbrainz-types.ts';

/**
 * MetadataAdapter: MusicBrainz release search, release + tracklist fetch and
 * Cover Art Archive artwork, normalised into the Release domain type — and,
 * once a Release has resolved, Discogs credits behind the same seam (ADR-0013).
 * No API key for either, and each service has a throttle it cannot get around.
 */

const MUSICBRAINZ = 'https://musicbrainz.org/ws/2';
const COVER_ART_ARCHIVE = 'https://coverartarchive.org';
const DISCOGS = 'https://api.discogs.com';

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
 * Discogs' published rate limit for anonymous clients, 25 requests a minute,
 * as an interval: 60000 / 25.
 *
 * **Its own queue, not MusicBrainz's.** 2.4 s apart is slower per request than
 * one a second, so a single shared queue would have to run at one of the two
 * intervals and would be wrong at either: at 1000 ms it breaks Discogs' limit,
 * and at 2400 ms it makes every MusicBrainz lookup in a batch wait more than
 * twice as long — to fetch credits that nothing waits for. Two queues also mean
 * a credits request in flight cannot hold up the next Release.
 */
const DISCOGS_MIN_REQUEST_INTERVAL_MS = 2400;

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
  /**
   * Credits and release facts for a Release that has *already* resolved
   * (ADR-0013), or nothing.
   *
   * Takes the whole Release rather than an id because the Discogs id is on it,
   * put there by MusicBrainz, and because this is then the one place that can
   * decide there is nothing to ask for — a Release with no link spends no
   * request. Never rejects: see `fetchCredits` below.
   */
  fetchCredits(release: Release): Promise<Credits | undefined>;
}

export interface MetadataAdapterOptions {
  readonly http: HttpClient;
  readonly clock?: Clock;
  /** MusicBrainz's and the Archive's queue. Defaults to one request a second. */
  readonly minRequestIntervalMs?: number;
  /** Discogs' own queue, which is a separate one. Defaults to 25 a minute. */
  readonly discogsMinRequestIntervalMs?: number;
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

/**
 * The year off the front of a date, or nothing.
 *
 * Four digits or none: both services send partial dates — MusicBrainz a bare
 * "2001", Discogs a "1999-03-00" for a March nobody recorded the day of — and
 * both are a year. Anything that does not start with four digits is not, and
 * printing the first four characters of it would put "unkn" on a card.
 */
const yearOf = (date: string | undefined): string | undefined =>
  /^(\d{4})/.exec(date ?? '')?.[1];

/**
 * A track's playing time, or nothing.
 *
 * The pressing's own length first: a recording is shared between releases and
 * a track belongs to one of them, so what goes on the card is what is on the
 * disc in the collector's hand. Anything that is not a positive finite number
 * of milliseconds is treated as absent, because a Release is normalised out of
 * whatever is actually there rather than out of what the schema promises — the
 * recorded fixtures already show real releases missing dates, labels and track
 * titles.
 */
function trackLengthMs(track: MbTrack): number | undefined {
  for (const candidate of [track.length, track.recording?.length]) {
    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) {
      return candidate;
    }
  }
  return undefined;
}

function tracksOf(release: MbRelease): Track[] {
  // A track with no title anywhere still occupies its position, so it gets a
  // visible placeholder rather than a numbered blank line on the tracklist Page.
  const found = (release.media ?? []).flatMap((medium) =>
    (medium.tracks ?? []).map((track) => ({
      title: track.title || track.recording?.title || '[untitled]',
      lengthMs: trackLengthMs(track),
    })),
  );
  // Numbered by position in the printed list, so a two-disc Release still
  // reads 1..n down the tracklist Page.
  return found.map(({ title, lengthMs }, index) => ({
    position: index + 1,
    title,
    ...(lengthMs !== undefined ? { lengthMs } : {}),
  }));
}

/**
 * This pressing's Discogs id, out of MusicBrainz's url relationships.
 *
 * Why MusicBrainz supplies it at all: Discogs' own search endpoint needs
 * credentials, and ADR-0013 refuses to ask for an API key — so the link has to
 * already exist somewhere, and MusicBrainz keeps one. It costs
 * no extra request either, because `inc=url-rels` rides along on the release
 * lookup that was happening anyway. The price is that a pressing MusicBrainz has
 * not linked gets no credits, which is an absence rather than a failure.
 *
 * Matched on the address rather than on MusicBrainz's `discogs` relationship
 * type. The address is what is actually needed; a relationship type can be
 * renamed; and requiring `/release/<digits>` on a discogs.com host is what stops
 * a link to a Discogs *master* — a different entity, with different credits —
 * being read as this pressing. Parsed with `URL` rather than by pattern so that
 * the host is the real host: `https://example.com/discogs.com/release/1` is not
 * a Discogs address and must not be read as one.
 */
function discogsIdOf(relations: readonly MbRelation[] | undefined): number | undefined {
  for (const relation of relations ?? []) {
    const resource = relation.url?.resource;
    if (!resource) continue;

    let address: URL;
    try {
      address = new URL(resource);
    } catch {
      continue;
    }
    if (address.hostname !== 'discogs.com' && !address.hostname.endsWith('.discogs.com')) continue;

    const digits = /(?:^|\/)release\/(\d+)\/?$/.exec(address.pathname)?.[1];
    if (!digits) continue;
    const id = Number(digits);
    // A path can hold more digits than a number can hold exactly, and an id
    // that is not exactly itself would fetch somebody else's release.
    if (Number.isSafeInteger(id) && id > 0) return id;
  }
  return undefined;
}

/**
 * A Discogs release response as a Credits block.
 *
 * Every field is normalised out of whatever is there.
 *
 * The label and the catalogue number both come off the **same** entry — the
 * first one that says anything — because a release can name several labels and
 * the number belongs to one of them. Reading the name from one entry and the
 * number from another would print a real label beside a real number that is not
 * its own, which is worse than printing neither.
 *
 * Discogs' `tracks` field on a credit, which scopes it to part of the record, is
 * not read, and it is why the same person in the same role can appear more than
 * once: this is a block about the release, so those are one credit.
 */
function creditsOf(payload: DiscogsRelease): Credits {
  const named = (values: readonly string[] | undefined): string[] =>
    (values ?? []).map((value) => value.trim()).filter((value) => !!value);

  const people: Credit[] = [];
  const seen = new Set<string>();
  for (const artist of payload.extraartists ?? []) {
    // The name as this release credits it, which is what a sleeve prints.
    const name = (artist.anv || artist.name || '').trim();
    const role = (artist.role ?? '').trim();
    if (!name) continue;
    // The same person in the same role twice is one credit — and Discogs does
    // send that, because it scopes a credit to a span of the record.
    const key = `${role}\u0000${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    people.push({ role, name });
  }

  const catalogue = (payload.labels ?? []).find(
    (entry) => !!(entry.name?.trim() || entry.catno?.trim()),
  );
  const label = catalogue?.name?.trim();
  const catalogNumber = catalogue?.catno?.trim();
  const country = payload.country?.trim();
  // The same reading `toRelease` gives a MusicBrainz date, and it copes with
  // Discogs' partial dates for the same reason: "1999-03-00" is a March nobody
  // recorded the day of, and the year is all that goes on a card.
  const year = yearOf(payload.released);

  return {
    people,
    ...(label ? { label } : {}),
    ...(catalogNumber ? { catalogNumber } : {}),
    ...(country ? { country } : {}),
    ...(year ? { year } : {}),
    // Trimmed as well as filtered, because `readCredits` trims and its docstring
    // promises a file and a keystroke produce the same block — " Pop " surviving
    // from one source and not the other would make that false.
    genres: named(payload.genres),
    styles: named(payload.styles),
  };
}

function toRelease(mbid: string, payload: MbRelease): Release {
  const notes = labelNote(payload['label-info']);
  const year = yearOf(payload.date);
  const discogsId = discogsIdOf(payload.relations);
  return {
    id: mbid,
    artist: joinArtistCredit(payload['artist-credit']),
    album: payload.title ?? '',
    ...(year ? { year } : {}),
    ...(notes ? { notes } : {}),
    tracks: tracksOf(payload),
    // The link, not the credits. Nothing is asked of Discogs until this
    // Release is in the collector's hands (ADR-0013).
    ...(discogsId !== undefined ? { discogsId } : {}),
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
  const discogsThrottle = createThrottle(
    options.discogsMinRequestIntervalMs ?? DISCOGS_MIN_REQUEST_INTERVAL_MS,
    clock,
  );

  const send = (url: string, timeoutMs: number): Promise<HttpResponse> =>
    throttle(() =>
      http.get(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        timeoutMs,
      }),
    );

  /**
   * Discogs, on its own queue and with no `client=` parameter — that one is
   * MusicBrainz's, and appending it here would be sending a stranger's query
   * string to a service that never asked for it.
   *
   * The User-Agent is sent as a courtesy identifier and nothing rests on it.
   * Discogs asks an application to name itself in one; a browser strips it
   * before it leaves (`http.ts`), which is ADR-0006's problem again and is why
   * the header is set here anyway, for a host that would allow it.
   *
   * It is **not** where the rate limit comes from — that would be inventing an
   * obstacle ADR-0013 went and measured the absence of. The 25 a minute
   * `DISCOGS_MIN_REQUEST_INTERVAL_MS` plans for is the *unauthenticated* rate,
   * and the reason this app runs at it is that ADR-0013 refuses to ask anyone
   * for a token. A read with no token and `access-control-allow-origin: *` are
   * what that ADR measured, and they are the whole of what this integration
   * needs.
   */
  const sendToDiscogs = (url: string): Promise<HttpResponse> =>
    discogsThrottle(() =>
      http.get(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        timeoutMs: METADATA_TIMEOUT_MS,
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
    // `url-rels` rides along rather than costing a request of its own, and it
    // is the only way to a Discogs release without an API key — see
    // `discogsIdOf`.
    const url = withClient(
      `${MUSICBRAINZ}/release/${encodeURIComponent(mbid)}?inc=artist-credits+recordings+labels+url-rels&fmt=json`,
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

  /**
   * Credits for a Release that has already resolved.
   *
   * **Never rejects, and nothing waits for it.** A 429, a 503, a timeout, an id
   * MusicBrainz kept after Discogs stopped serving the release, a body that is
   * not JSON, or no link at all: every one of them comes
   * back the same way, as no credits. By the time this is asked the Release is
   * already in the collector's hands, so there is nothing left for a failure to
   * spoil — and reporting one would be reporting a failure about a lookup that
   * succeeded. Which is also why it is not part of `resolve`.
   *
   * Not retried, unlike a MusicBrainz lookup. Discogs counts requests over a
   * moving sixty-second window, so a 429 says this minute's twenty-five are
   * spent and the two-second backoff that gets a MusicBrainz 503 answered would
   * buy nothing here. Cover art takes the same view for the same reason: a
   * retry is spent only on a request worth waiting for.
   */
  async function fetchCredits(release: Release): Promise<Credits | undefined> {
    const { discogsId } = release;
    if (discogsId === undefined) return undefined;

    try {
      const response = await sendToDiscogs(`${DISCOGS}/releases/${discogsId}`);
      if (!response.ok) return undefined;
      const credits = creditsOf(JSON.parse(await response.text()) as DiscogsRelease);
      // A Discogs entry with no credits, no label, no country and no genre has
      // nothing to record, and recording an empty block would make every later
      // "have the credits arrived?" answer yes.
      return hasCredits(credits) ? credits : undefined;
    } catch {
      return undefined;
    }
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
    fetchCredits,

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
