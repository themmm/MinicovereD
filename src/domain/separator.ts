/**
 * The separator, and the only one.
 *
 * Two fields the collector types into read a line the same way: the search
 * field reads `Artist — Album`, and the credits field reads `Role — Name`.
 * There is one convention for both because a second would be a second thing to
 * learn — the same argument `readLine` in `release-search.ts` makes for a
 * pasted line and a typed one, at the scale of two different fields.
 *
 * Only a *spaced* dash or a tab separates, and only the first one on the line.
 * That is what keeps `Jean-Michel Jarre` whole, `F♯A♯∞ — Deluxe Edition` one
 * title and `Written-By` one role. Em, en and figure dashes, the minus sign and
 * a plain ASCII hyphen all count, because people paste all five.
 */
const SEPARATOR = /^(.*?)(?:\s+[—–‒−-]\s+|\t+)(.*)$/;

/**
 * The two halves of a line, trimmed, or nothing if the line has no separator.
 *
 * The absence is the point, and every caller has to have an answer for it: a
 * search line with no separator is a release title rather than an artist, and a
 * credits line with no separator is a name rather than a role.
 */
export function splitOnSeparator(line: string): readonly [string, string] | undefined {
  const match = SEPARATOR.exec(line);
  if (!match) return undefined;
  return [(match[1] ?? '').trim(), (match[2] ?? '').trim()];
}
