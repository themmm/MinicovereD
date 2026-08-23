import type { Credit, Credits, Release } from './release.ts';
import { splitOnSeparator } from './separator.ts';

/**
 * Credits as the collector edits them: one credit per line, `Role — Name`.
 *
 * The same convention the search field uses, from the same place
 * (`separator.ts`), and the same one ADR-0013 writes its example credits block
 * in — `Engineer — Mike Duffy`.
 */

/** A Credits block with nothing in it: what an edit starts from when none arrived. */
const NOTHING: Credits = { people: [], genres: [], styles: [] };

/**
 * Parses the textarea into credits, carrying the release facts over from
 * `previous`.
 *
 * This is the trap ticket 03 hit with playing times, in a second place: the
 * textarea shows a role and a name and nothing else, so the label, the
 * catalogue number, the country, the year, the genres and the styles that
 * arrived with them are gone the moment a typo is fixed unless they are carried
 * across explicitly. They are carried rather than shown because nothing puts
 * them on a Part yet, and six read-only fields for facts nobody can act on is a
 * worse form than one textarea.
 *
 * A line with no separator is a name with no role, never a role with no name:
 * a sleeve's "Photography" block is a list of names, and refusing it would make
 * the collector invent a role to satisfy a parser. A line with a role and no
 * name is dropped, because a role nobody filled is not a credit.
 */
export function parseCredits(text: string, previous: Credits = NOTHING): Credits {
  const people: Credit[] = [];
  for (const line of text.split('\n')) {
    // Split before trimming, because the trailing space is part of the
    // separator: `Producer — ` is a role halfway through being filled in, and
    // trimming first would turn it into a credit for somebody called
    // "Producer —". `splitOnSeparator` trims each half itself.
    const split = splitOnSeparator(line);
    if (split) {
      const [role, name] = split;
      if (name) people.push({ role, name });
      continue;
    }
    const name = line.trim();
    if (name) people.push({ role: '', name });
  }
  return { ...previous, people };
}

/** The inverse, for putting a parsed credits block back into the textarea. */
export function formatCredits(people: readonly Credit[]): string {
  return people.map((credit) => (credit.role ? `${credit.role} — ${credit.name}` : credit.name)).join('\n');
}

/**
 * Whether there is anything in a Credits block at all.
 *
 * A pressing whose Discogs entry lists no credits, no label, no country, no
 * year and no genre has nothing to record, and recording an empty block anyway
 * would make every later "have the credits arrived?" answer yes.
 */
export function hasCredits(credits: Credits): boolean {
  return (
    credits.people.length > 0 ||
    credits.genres.length > 0 ||
    credits.styles.length > 0 ||
    !!(credits.label ?? credits.catalogNumber ?? credits.country ?? credits.year)
  );
}

/**
 * The release facts on one line, for the form to say what arrived — the shape
 * ADR-0013's example opens with, `RCA · PB 41447 · UK 1987`, with the genres
 * after it.
 *
 * Country and year are joined by a space rather than by a separator because
 * together they are one fact about one pressing, which is how the ADR sets it
 * and how a sleeve prints it. This is not a Part's typesetting: what a credits
 * block looks like on paper belongs to whatever draws one.
 */
export function describeCredits(credits: Credits): string {
  const where = [credits.country, credits.year].filter(Boolean).join(' ');
  return [credits.label, credits.catalogNumber, where, ...credits.genres, ...credits.styles]
    .filter((fact) => !!fact)
    .join(' · ');
}

/**
 * Credits arriving after the Release they belong to.
 *
 * They fill a hole and never overwrite. A Release that already carries credits
 * carries either the collector's own typing or an earlier answer, and a second
 * source replying two seconds late is no reason to replace either — the same
 * rule `project-arrival.ts` states about a whole Project arriving late, at the
 * scale of one field. It is also what makes the precedence in `Credits` hold in
 * time as well as in shape: nothing this app fetches can overwrite something a
 * collector edited.
 */
export function withArrivedCredits(release: Release, credits: Credits): Release {
  return release.credits ? release : { ...release, credits };
}
