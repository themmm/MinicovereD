/**
 * A Release is the metadata unit a design is made from: artist, album,
 * tracklist, cover image and supplementary info (CONTEXT.md). It arrives
 * either from a metadata lookup or by hand — the domain type does not care.
 */

export interface Track {
  /** 1-based position on the Release, as printed on the Back Card. */
  readonly position: number;
  readonly title: string;
  /**
   * Playing time in milliseconds, when whatever produced this Release knew one.
   *
   * Optional because half the Releases this app prints are mixtapes typed in
   * from a shelf, which have no times at all — so the Back Card sets a duration
   * column when there is something to put in it and not otherwise. Milliseconds
   * because that is what MusicBrainz reports; the rounding to a printable
   * `m:ss` happens once, in `formatTrackLength`.
   */
  readonly lengthMs?: number;
}

/** Cover image, held as a data URL so a Release stays a single self-contained value. */
export interface Artwork {
  readonly dataUrl: string;
  readonly widthPx: number;
  readonly heightPx: number;
}

export interface Release {
  readonly id: string;
  readonly artist: string;
  readonly album: string;
  /** Supplementary info, e.g. "1998". Free text: reissue years and "n/a" are both real. */
  readonly year?: string;
  /** Further free text the collector wants on the Parts (label, catalogue number, notes). */
  readonly notes?: string;
  readonly tracks: readonly Track[];
  readonly artwork?: Artwork;
}

/**
 * An id for a Release nobody looked up.
 *
 * A looked-up Release is identified by its MusicBrainz id. One typed in from a
 * shelf — a mixtape, a promo, anything the database has never heard of — has
 * nothing to be identified by, so it is given something that cannot be
 * mistaken for an MBID.
 *
 * Random rather than counted, because a counter restarts with the page and two
 * tabs would then hand out the same ids. A duplicate would be caught — the
 * queue refuses one, and `readProjectFile` rejects a file carrying two — but
 * being caught means a saved project reported as unreadable, which is a large
 * price for an id. `randomUUID` wants a secure context, which `file://` is;
 * the fallback is there because a hard failure would be this button not
 * working at all, and an id is not a secret.
 */
export function newReleaseId(): string {
  const unique =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `hand-${unique}`;
}

/** A Release with nothing in it yet: the first thing an empty workspace makes. */
export function blankRelease(): Release {
  return { id: newReleaseId(), artist: '', album: '', tracks: [] };
}
