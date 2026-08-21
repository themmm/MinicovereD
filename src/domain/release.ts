/**
 * A Release is the metadata unit a design is made from: artist, album,
 * tracklist, cover image and supplementary info (CONTEXT.md). It arrives
 * either from a metadata lookup or by hand — the domain type does not care.
 */

export interface Track {
  /** 1-based position on the Release, as printed on the Back Card. */
  readonly position: number;
  readonly title: string;
  readonly durationMs?: number;
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

/** Total running time in ms, or undefined when any track is missing a duration. */
export function totalDurationMs(release: Release): number | undefined {
  let total = 0;
  for (const track of release.tracks) {
    if (track.durationMs === undefined) return undefined;
    total += track.durationMs;
  }
  return total;
}

export function formatDuration(durationMs: number): string {
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
