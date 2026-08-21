/**
 * A Release is the metadata unit a design is made from: artist, album,
 * tracklist, cover image and supplementary info (CONTEXT.md). It arrives
 * either from a metadata lookup or by hand — the domain type does not care.
 */

export interface Track {
  /** 1-based position on the Release, as printed on the Back Card. */
  readonly position: number;
  readonly title: string;
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
 * Counts the Releases this session has started by hand, so two started in the
 * same millisecond are still two Releases. It resets on reload, which is why
 * the clock is in the id as well: a fresh count cannot collide with an id
 * already sitting in a saved project.
 */
let startedByHand = 0;

/**
 * An id for a Release nobody looked up.
 *
 * A looked-up Release is identified by its MusicBrainz id. One typed in from a
 * shelf — a mixtape, a promo, anything the database has never heard of — has
 * nothing to be identified by, so it is given something that cannot be
 * mistaken for an MBID.
 */
export function newReleaseId(): string {
  startedByHand += 1;
  return `hand-${Date.now().toString(36)}-${startedByHand}`;
}

/** A Release with nothing in it yet: the first thing an empty workspace makes. */
export function blankRelease(): Release {
  return { id: newReleaseId(), artist: '', album: '', tracks: [] };
}
