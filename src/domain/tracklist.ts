import type { Track } from './release.ts';

/**
 * Manual tracklist entry: one track per line. Collectors paste lists that
 * already carry numbering in half a dozen shapes ("1.", "01 -", "3)"), so a
 * leading number is treated as numbering and dropped — the printed position
 * always comes from the line's place in the list.
 */
const LEADING_NUMBER = /^\s*\d{1,3}\s*[.):\-–—]\s+/;

/**
 * Parses the textarea into Tracks, carrying `lengthMs` over from `previous`
 * for any title that survived the edit.
 *
 * The textarea shows titles and nothing else, so everything it cannot show is
 * lost the moment it is parsed — and a looked-up Release arrives with a playing
 * time per track. Without this, fixing one typo strips the whole duration
 * column off the Back Card, which is not what "editing a title" means.
 *
 * Matched by title rather than by position, because inserting a line moves
 * every position after it and the times belong to the tracks. Two tracks with
 * the same title both take the first one's time; that is a real list ("Untitled"
 * twice) and guessing between them is worse than being consistent.
 */
export function parseTracklist(text: string, previous: readonly Track[] = []): Track[] {
  const lengths = new Map<string, number>();
  for (const track of previous) {
    if (track.lengthMs !== undefined && !lengths.has(track.title)) {
      lengths.set(track.title, track.lengthMs);
    }
  }

  return text
    .split('\n')
    .map((line) => line.replace(LEADING_NUMBER, '').trim())
    .filter((title) => title.length > 0)
    .map((title, index) => {
      const lengthMs = lengths.get(title);
      return { position: index + 1, title, ...(lengthMs !== undefined ? { lengthMs } : {}) };
    });
}

/** The inverse, for putting a parsed tracklist back into the textarea. */
export function formatTracklist(tracks: readonly Track[]): string {
  return tracks.map((track) => `${track.position}. ${track.title}`).join('\n');
}

/**
 * A Track's playing time as it goes on a Part: `m:ss`, and `h:mm:ss` once there
 * is an hour of it. The leading unit is never padded, which is how a sleeve
 * prints a time and how a player shows one.
 *
 * Rounded to the nearest second rather than truncated, because MusicBrainz
 * rounds and MusicBrainz is where the number came from — a card that truncated
 * would disagree with the page the collector looked the release up on.
 *
 * Anything that is not a positive finite number of milliseconds has no time to
 * print rather than `0:00`. A Release typed in from a shelf has none at all,
 * and a zero would print as a claim about one.
 */
export function formatTrackLength(lengthMs: number | undefined): string | undefined {
  if (lengthMs === undefined || !Number.isFinite(lengthMs) || lengthMs <= 0) return undefined;

  const total = Math.round(lengthMs / 1000);
  const pad = (value: number): string => String(value).padStart(2, '0');
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);

  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}
