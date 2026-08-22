/**
 * The slices of the MusicBrainz responses this adapter reads. Everything is optional, because the fixtures show real releases
 * missing dates, labels and even track titles — a Release is normalised out of
 * whatever is actually there.
 */

export interface MbArtistCredit {
  readonly name?: string;
  readonly joinphrase?: string;
}

export interface MbTrack {
  readonly title?: string;
  /**
   * Playing time in milliseconds, as this pressing has it.
   *
   * Separate from the recording's own length, and different from it on real
   * data: a recording is shared between releases, a track belongs to one of
   * them, and Discovery's "Aerodynamic" is 207533 here against 207626 there.
   */
  readonly length?: number;
  readonly recording?: { readonly title?: string; readonly length?: number };
}

export interface MbMedium {
  readonly tracks?: readonly MbTrack[];
}

export interface MbLabelInfo {
  readonly label?: { readonly name?: string };
  readonly 'catalog-number'?: string;
}

export interface MbRelease {
  readonly id?: string;
  readonly title?: string;
  readonly date?: string;
  readonly country?: string;
  readonly score?: number;
  readonly 'artist-credit'?: readonly MbArtistCredit[];
  readonly 'label-info'?: readonly MbLabelInfo[];
  readonly media?: readonly MbMedium[];
  readonly 'track-count'?: number;
}

export interface MbSearchResponse {
  readonly count?: number;
  readonly releases?: readonly MbRelease[];
}
