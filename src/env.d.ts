/**
 * True in the single-file build (ADR-0002). Replaced at build time by Vite's
 * `define`, so the branch it guards is eliminated from the other build.
 */
declare const __SELF_CONTAINED_BUILD__: boolean;
