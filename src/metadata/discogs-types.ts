/**
 * The slice of a Discogs release response this adapter reads (ADR-0013).
 *
 * Everything is optional for the same reason the MusicBrainz types are: real
 * releases are missing dates, labels and catalogue numbers, and a Credits block
 * is normalised out of whatever is actually there.
 *
 * **`notes` has no field here on purpose.** ADR-0013 measured what Discogs puts
 * in it — matrix runouts, label variants, "Manufactured In England" — and
 * decided it is not liner notes; leaving it out of the type means reading it
 * would not compile. It is also not `Release.notes`, which is the collector's
 * own field and currently holds a label and a catalogue number: the two share a
 * name and nothing else.
 */

/**
 * One credited artist. Discogs sends the same shape for the release's own
 * artists and for its `extraartists`; only the second are credits.
 */
export interface DiscogsArtist {
  readonly name?: string;
  /**
   * The name as *this* release credits it — Discogs calls it the artist name
   * variation, and it is set when the sleeve spells somebody differently from
   * the way the database files them. Preferred to `name` when it is there,
   * because what goes on a card is what is printed on the sleeve: the same
   * choice `trackLengthMs` makes between a pressing's length and a recording's.
   */
  readonly anv?: string;
  /** What they did: "Producer", "Engineer", "Music By [All Tracks By]". */
  readonly role?: string;
}

export interface DiscogsLabel {
  readonly name?: string;
  /** The catalogue number, spelled `catno` by Discogs. */
  readonly catno?: string;
}

export interface DiscogsRelease {
  readonly extraartists?: readonly DiscogsArtist[];
  readonly labels?: readonly DiscogsLabel[];
  readonly country?: string;
  /** A date, and not always a whole one: "1987-08-17", "1999-03-00", "1987". */
  readonly released?: string;
  readonly genres?: readonly string[];
  readonly styles?: readonly string[];
}
