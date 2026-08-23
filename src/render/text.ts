import type { Mm } from '../domain/units.ts';
import type { TextStyle } from './layout.ts';

/**
 * How wide a piece of text will be. The browser answers this from the real
 * font metrics; tests answer it deterministically. Injecting it is what keeps
 * SheetRenderer a pure function of its inputs.
 */
export interface TextMeasurer {
  widthMm(text: string, style: TextStyle): Mm;
}

const ELLIPSIS = '…';

/**
 * `text` trimmed with an ellipsis until it fits `maxWidthMm`. Trimming happens
 * by code point, so a surrogate pair or a combining mark is never cut in half.
 */
export function ellipsise(
  text: string,
  style: TextStyle,
  maxWidthMm: Mm,
  measure: TextMeasurer,
): string {
  if (measure.widthMm(text, style) <= maxWidthMm) return text;

  const codePoints = [...text];
  for (let length = codePoints.length - 1; length > 0; length--) {
    const candidate = codePoints.slice(0, length).join('').trimEnd() + ELLIPSIS;
    if (measure.widthMm(candidate, style) <= maxWidthMm) return candidate;
  }
  return ELLIPSIS;
}

/**
 * `content` broken across as many lines as it takes to keep every one of them
 * inside `maxWidthMm`, greedily and on whitespace only.
 *
 * Greedy rather than balanced (Knuth-Plass, or even a two-line evener) because
 * the one thing this sets is a title hung from a left edge, where a short last
 * line is the shape the eye expects; balancing would be work spent making a
 * heading look like a paragraph.
 *
 * A word wider than `maxWidthMm` gets a line to itself and overhangs it, rather
 * than being broken: there is no hyphenation dictionary here, and a title cut
 * mid-word reads as damage. So the lines that come back are not a promise that
 * they fit — only that no break was made where one could have been avoided, and
 * the caller decides what to do about an overhang, because only the caller
 * knows whether it can shrink the type or has to ellipsise the line.
 */
export function wrapText(
  content: string,
  style: TextStyle,
  maxWidthMm: Mm,
  measure: TextMeasurer,
): string[] {
  const words = content.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line === '' ? word : `${line} ${word}`;
    // An empty line takes the word whatever it measures: there is nothing to
    // break before it, and pushing an empty line would open a gap in the block.
    if (line === '' || measure.widthMm(candidate, style) <= maxWidthMm) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  lines.push(line);
  return lines;
}
