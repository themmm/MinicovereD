import type { Track } from './release.ts';

/**
 * Manual tracklist entry: one track per line. Collectors paste lists that
 * already carry numbering in half a dozen shapes ("1.", "01 -", "3)"), so a
 * leading number is treated as numbering and dropped — the printed position
 * always comes from the line's place in the list.
 */
const LEADING_NUMBER = /^\s*\d{1,3}\s*[.):\-–—]\s+/;

export function parseTracklist(text: string): Track[] {
  return text
    .split('\n')
    .map((line) => line.replace(LEADING_NUMBER, '').trim())
    .filter((title) => title.length > 0)
    .map((title, index) => ({ position: index + 1, title }));
}

/** The inverse, for putting a parsed tracklist back into the textarea. */
export function formatTracklist(tracks: readonly Track[]): string {
  return tracks.map((track) => `${track.position}. ${track.title}`).join('\n');
}
