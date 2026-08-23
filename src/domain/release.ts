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

/**
 * One line of a credits block: what somebody did, and the name this pressing
 * credits them under.
 */
export interface Credit {
  /**
   * What they did, exactly as the source says it — `Producer`,
   * `Music By [All Tracks By]`, `Written-By`. Deliberately not tidied on the
   * way in: the brackets are Discogs' own qualifier on the role, dropping them
   * loses what they qualify, and how much of a role fits on a Part is a
   * question for whatever sets it rather than for the adapter that fetched it.
   */
  readonly role: string;
  readonly name: string;
}

/**
 * A pressing's credits and release facts: who worked on it, which label put it
 * out, where, when, and what it was filed as (ADR-0013).
 *
 * **One field rather than six loose ones, and that is the precedence rule.**
 * `year` and `notes` above belong to MusicBrainz and then to whatever the
 * collector types over it; everything in here belongs to the second source, and
 * nothing has to remember which is which because the shape says so. A second
 * source allowed to write `notes` would sooner or later replace a
 * "Capitol · ST-103" the collector typed with its own idea of the label — and
 * `Release.notes` is exactly where a label and a catalogue number already live.
 *
 * Not to be confused with Discogs' own `notes` field, which has the same name
 * and is a different thing: ADR-0013 measured it as matrix runouts and label
 * variants, and this app never reads it.
 */
export interface Credits {
  /**
   * Everyone the source lists as having worked on the pressing, in its order,
   * with each role-and-name pair kept once.
   *
   * "People" loosely. A sleeve credit is often a company — "Design — Me
   * Company" — and it is carried exactly as the release credits it, because
   * that is what a sleeve prints.
   */
  readonly people: readonly Credit[];
  /** The label that put this pressing out, e.g. "RCA". */
  readonly label?: string;
  /** This pressing's catalogue number at that label, e.g. "PB 41447". */
  readonly catalogNumber?: string;
  /** Where it came out, as the source names it: "UK", "Sweden", "US". */
  readonly country?: string;
  /**
   * The year of *this pressing*, four digits or absent, kept apart from
   * `Release.year` for the reason the whole block is one field: the two disagree
   * on a reissue, and the one the collector can edit has to stay the one they
   * edited.
   */
  readonly year?: string;
  readonly genres: readonly string[];
  readonly styles: readonly string[];
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
  /**
   * This pressing's id at Discogs, when MusicBrainz links one.
   *
   * MusicBrainz is what supplies it, and it has to be: Discogs' own search
   * endpoint needs credentials and ADR-0013 refuses to ask for an API key, so
   * the only way to reach a Discogs release is to follow a link that already
   * exists.
   *
   * Saved with the Release, and **read back by nothing yet**. Only a lookup asks
   * for credits (`requestCredits`), so a Release that comes out of a file keeps
   * its link and is never asked about again. It is persisted because the
   * credits block ADR-0012 puts on paper will want to be able to ask, and
   * because throwing away the one hard-won identifier and re-deriving it later
   * would cost a MusicBrainz request per Release to learn what this one already
   * knew.
   */
  readonly discogsId?: number;
  /**
   * Credits and release facts, once a second source has answered (ADR-0013).
   * Absent until then, absent for a pressing nothing links, and absent forever
   * on a mixtape — which is the common case, not an error.
   */
  readonly credits?: Credits;
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
