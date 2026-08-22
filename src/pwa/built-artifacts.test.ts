import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The two shapes of the app, asserted rather than measured by hand (ADR-0002).
 *
 * Both claims here were true when ticket 02 bundled five more faces and both
 * were checked with `ls` and `stat`, which is exactly the kind of check that
 * stops being run. Every face inlines into the single-file build as a base64
 * data URI, so the cost of one is roughly a third more than its woff2 — a
 * budget that only a person remembers is a budget that gets spent.
 *
 * Skipped without a build, the way the workbox checks in
 * `src/attribution/attributions.test.ts` are: `npm run build` is what produces
 * the artifact these describe, and a checkout has none.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SINGLE_FILE = join(repoRoot, 'dist', 'singlefile', 'index.html');
const PWA_ASSETS = join(repoRoot, 'dist', 'pwa', 'assets');

/**
 * The ceiling the v2 spec sets on the double-clickable file. Bytes, not "about
 * 4 MB": the number is only useful if it is the one a filesystem reports.
 */
const CEILING_BYTES = 4 * 1024 * 1024;

const BUILT = existsSync(SINGLE_FILE) && existsSync(PWA_ASSETS);

const singleFile = (): string => readFileSync(SINGLE_FILE, 'utf8');

describe('the built artifacts (ADR-0002)', () => {
  it.skipIf(!BUILT)('keeps the single-file build under its ceiling (needs `npm run build`)', () => {
    const bytes = statSync(SINGLE_FILE).size;
    const headroom = CEILING_BYTES - bytes;

    expect(
      bytes,
      `dist/singlefile/index.html is ${bytes.toLocaleString()} bytes, ` +
        `${headroom < 0 ? `${(-headroom).toLocaleString()} over` : `${headroom.toLocaleString()} under`} ` +
        `the ${CEILING_BYTES.toLocaleString()}-byte ceiling`,
    ).toBeLessThanOrEqual(CEILING_BYTES);
  });

  it.skipIf(!BUILT)('carries the same faces in both builds, with no PWA-only set', () => {
    // The failure this rules out is the one ticket 02 named as the easiest to
    // ship: a face that resolves in the hosted build and 404s in the
    // double-clickable one, or the reverse. Counting is enough to catch it,
    // because the two builds read the same `fonts.css`.
    const hosted = readdirSync(PWA_ASSETS).filter((name) => name.endsWith('.woff2'));
    const inlined = singleFile().match(/data:font\/woff2/g) ?? [];

    expect(hosted.length, 'woff2 files in dist/pwa/assets').toBeGreaterThan(0);
    expect(inlined.length, 'woff2 data URIs in the single file').toBe(hosted.length);
  });

  it.skipIf(!BUILT)('leaves the single file nothing to fetch', () => {
    // A font referenced by path rather than inlined would work when served and
    // fail on a double-click, which is the one thing this build exists to avoid.
    const external = singleFile().match(/url\((?!['"]?data:)[^)]{0,120}woff2/g) ?? [];

    expect(external, 'font references that are not data URIs').toEqual([]);
  });
});
