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
