import type { Mm } from '../../domain/units.ts';

/**
 * Type size the tracklist starts at, before any of it has to give way.
 *
 * On its own in this module because two sides need it and one of them must not
 * import the other. `shared.ts` sets a list at it; `insert-plan.ts` decides how
 * many Pages the strip needs by asking whether the list fits one at it — and
 * `shared.ts` reads `PageRole` from the layout model that the plan also reads,
 * so a constant living in either would put a cycle between them.
 *
 * The number has to be the same on both sides or the count is decided against a
 * size the list is never set at.
 */
export const TRACK_SIZE_MM: Mm = 2.4;
