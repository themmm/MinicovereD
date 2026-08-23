import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { PRINT_FONT_STACKS } from '../render/raster.ts';
import {
  ATTRIBUTIONS,
  DATA_SOURCES,
  licenseTextFor,
  OWN_ARTWORK,
  PERMISSIVE_LICENSES,
  WORKBOX_MODULES,
} from './attributions.ts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

interface PackageManifest {
  readonly version: string;
  readonly license?: string;
  readonly dependencies?: Record<string, string>;
}

const readManifest = (packageName: string): PackageManifest =>
  JSON.parse(readFileSync(join(repoRoot, 'node_modules', packageName, 'package.json'), 'utf8'));

/**
 * Packages that reach the browser without being runtime dependencies.
 *
 * vite-plugin-pwa compiles workbox into the client bundle to register the
 * service worker, so it ships from a devDependency — `dist/pwa/assets/` holds
 * `workbox-window.prod.es5-*.js` and the generated `sw.js` pulls workbox
 * runtime chunks. ADR-0003 is a promise about what reaches the user, not about
 * which section of package.json a name sits in.
 *
 * Named rather than walked, for two reasons. Their manifests depend on
 * `@types/*` packages, which are declaration files and ship nothing — claiming
 * those would be a claim about the build that is not true. And walking would
 * not have found them anyway: four of the five arrive through `workbox-build`
 * inside vite-plugin-pwa, not through `workbox-window`'s own dependencies.
 *
 * A hand-kept list drifts, so it is not trusted on its own: the last test in
 * this file reads the names back out of a real build and fails if the two
 * disagree.
 */
const SHIPPED_VIA_BUILD: readonly string[] = WORKBOX_MODULES;

/** Every npm package that ships to the user, resolved from disk (no network, no npm CLI). */
function shippedPackages(): string[] {
  const seen = new Set<string>();

  const walk = (deps: Record<string, string> | undefined): void => {
    for (const name of Object.keys(deps ?? {})) {
      if (seen.has(name)) continue;
      seen.add(name);
      walk(readManifest(name).dependencies);
    }
  };

  const root = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as PackageManifest;
  walk(root.dependencies);
  for (const name of SHIPPED_VIA_BUILD) seen.add(name);
  return [...seen].sort();
}

/**
 * Directories that hold shipped files which are not code: `public/` is copied
 * into the build wholesale, and `assets/` and `src/` are reached by import.
 *
 * `src/` is in the list because the bundler does not care which directory a
 * file sits in — `src/attribution/licenses/*.txt` are already inlined by `?raw`
 * imports, and a font or an SVG dropped anywhere under `src/` would ship just
 * as silently.
 */
const ASSET_DIRECTORIES = ['assets', 'public', 'src'];

/** Source and test files are read as code, not shipped as assets. */
const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.css']);

/**
 * Recorded HTTP responses, read by tests with `readFileSync`. No bundler ever
 * sees them, so nothing in them ships — and the fixture README already records
 * where each was recorded from and why the artwork ones are generated rather
 * than real cover art (ADR-0003).
 */
const TEST_ONLY_DIRECTORY = '__fixtures__';

/**
 * The bundled license texts. They ship, imported by `?raw`, and they are not
 * anybody's asset to credit — they *are* the credit. That every allowlisted
 * license has its text, and the right one, is asserted separately below.
 */
const LICENSE_TEXTS = 'src/attribution/licenses/';

/** Every shipped file that is not code, repo-relative and slash-separated. */
function shippedAssets(): string[] {
  const found: string[] = [];

  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      // Dotfiles are the operating system's business, not the build's.
      if (entry.name.startsWith('.') || entry.name === TEST_ONLY_DIRECTORY) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (!CODE_EXTENSIONS.has(extname(entry.name))) {
        found.push(relative(repoRoot, path).split(sep).join('/'));
      }
    }
  };

  for (const directory of ASSET_DIRECTORIES) walk(join(repoRoot, directory));
  return found.sort();
}

/**
 * The workbox modules a real build contains, read back from the version stamps
 * workbox writes into its own code (`workbox:precaching:7.4.0` and friends).
 *
 * This is the check that actually holds — the list above is what keeps the
 * dialog right for anyone who has not built, and this is what catches that list
 * drifting when a plugin upgrade changes which modules are pulled in.
 */
function workboxModulesInBuild(): string[] {
  const found = new Set<string>();

  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.js')) {
        for (const [, module] of readFileSync(path, 'utf8').matchAll(/workbox:([a-z-]+):[\d.]+/g)) {
          found.add(`workbox-${module}`);
        }
      }
    }
  };

  walk(join(repoRoot, 'dist', 'pwa'));
  return [...found].sort();
}

const BUILT = existsSync(join(repoRoot, 'dist', 'pwa'));

/** Files some attribution entry says it covers. */
const attributedFiles = (): string[] => ATTRIBUTIONS.flatMap((entry) => entry.files ?? []);

const claimedPackages = (): string[] =>
  ATTRIBUTIONS.map((entry) => entry.packageName).filter((name): name is string => !!name);

/** A distinctive phrase from each license, so "shows the text" means the right text. */
const LICENSE_MARKERS: Readonly<Record<string, string>> = {
  MIT: 'MIT License',
  ISC: 'ISC License',
  'OFL-1.1': 'SIL OPEN FONT LICENSE',
  '0BSD': 'Permission to use, copy, modify, and/or distribute',
  Zlib: 'zlib License',
  'LicenseRef-PD-textlogo': 'below the threshold of originality',
};

/**
 * Where the app can send a request: `src/metadata` holds the only `fetch` in the
 * project and the only code that builds a URL for it, so every host it can reach
 * is named in a file in there.
 *
 * Comments are stripped before the hosts are read, because a URL in a sentence
 * is not a request — `discogsIdOf` explains itself with an address that must
 * never be fetched, which is exactly the case that would otherwise fail here.
 * A trailing `//` is only a comment when something separates it from what came
 * before, or `https://` would be stripped as one.
 */
function hostsTheAdapterSendsTo(): string[] {
  const directory = join(repoRoot, 'src', 'metadata');
  const found = new Set<string>();

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) continue;
    const code = withoutComments(readFileSync(join(directory, entry.name), 'utf8'));
    for (const [, host] of code.matchAll(/https:\/\/([a-z0-9.-]+)/g)) {
      if (host) found.add(registrableDomain(host));
    }
  }
  return [...found].filter((host) => !NOT_A_DATA_SOURCE.has(host)).sort();
}

/** Source with its comments gone. See `hostsTheAdapterSendsTo` for the `//` rule. */
const withoutComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[ \t])\/\/.*$/gm, '');

/**
 * A host that appears in a request but is not a service: the repository address
 * MinicovereD identifies itself with in its User-Agent (ADR-0006). It is sent,
 * never called.
 */
const NOT_A_DATA_SOURCE = new Set(['github.com']);

/**
 * `api.discogs.com` and `www.discogs.com` are one service credited once, so
 * hosts and credits are compared at the domain that identifies the service.
 */
const registrableDomain = (host: string): string => host.split('.').slice(-2).join('.');

/** Every non-test module under `src` that matches `pattern`, repo-relative. */
function modulesMatching(pattern: RegExp): string[] {
  const found: string[] = [];

  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) continue;
      if (pattern.test(withoutComments(readFileSync(path, 'utf8')))) {
        found.push(relative(repoRoot, path).split(sep).join('/'));
      }
    }
  };

  walk(join(repoRoot, 'src'));
  return found.sort();
}

/** SPDX expressions are compared normalised, since `(MIT AND Zlib)` and `MIT AND Zlib` are one license. */
const normaliseLicense = (license: string): string => license.replace(/[()]/g, '').trim();

describe('attribution manifest (ADR-0003)', () => {
  it('attributes every npm package that ships to the user', () => {
    const attributed = new Set(claimedPackages());
    expect(shippedPackages().filter((name) => !attributed.has(name))).toEqual([]);
  });

  it('claims a shipped package only when that package is actually installed', () => {
    const shipped = new Set(shippedPackages());
    expect(claimedPackages().filter((name) => !shipped.has(name))).toEqual([]);
  });

  it('states the installed version of every attributed package', () => {
    const wrong = ATTRIBUTIONS.filter(
      (entry) => entry.packageName && readManifest(entry.packageName).version !== entry.version,
    );
    expect(wrong.map((entry) => entry.name)).toEqual([]);
  });

  it('attributes the bundled MiniDisc logo with its trademark note (ADR-0004)', () => {
    const logo = ATTRIBUTIONS.find((entry) => entry.name === 'MiniDisc logo');

    expect(logo?.kind).toBe('asset');
    expect(logo?.note).toMatch(/trademark/i);
    // The license text has to say what "public domain" does not cover.
    expect(licenseTextFor('LicenseRef-PD-textlogo')).toMatch(/trademark/i);
  });

  it('states the license the installed package actually declares', () => {
    const wrong = ATTRIBUTIONS.filter((entry) => {
      if (!entry.packageName) return false;
      const declared = readManifest(entry.packageName).license;
      return declared === undefined || normaliseLicense(declared) !== entry.license;
    });
    expect(wrong.map((entry) => `${entry.name}: claims ${entry.license}`)).toEqual([]);
  });

  it('ships nothing under a license outside the permissive allowlist', () => {
    const allowed = new Set<string>(PERMISSIVE_LICENSES);
    const offenders = shippedPackages().filter((name) => {
      const declared = readManifest(name).license;
      return declared === undefined || !allowed.has(normaliseLicense(declared));
    });
    expect(offenders).toEqual([]);
  });

  it('names a copyright holder and a source URL for every entry', () => {
    const incomplete = ATTRIBUTIONS.filter(
      (entry) => !entry.copyright.trim() || !/^https?:\/\//.test(entry.url),
    );
    expect(incomplete.map((entry) => entry.name)).toEqual([]);
  });

  it('can show the full text of every license on the allowlist, offline', () => {
    for (const license of PERMISSIVE_LICENSES) {
      const text = licenseTextFor(license);
      // A composite expression such as `MIT AND Zlib` must show both licenses.
      for (const id of license.split(' AND ')) {
        expect(text, license).toContain(LICENSE_MARKERS[id] ?? `«no marker known for ${id}»`);
      }
    }
  });

  it('refuses to show a license it has no text for', () => {
    expect(() => licenseTextFor('Apache-2.0' as never)).toThrow(/no bundled license text/);
  });

  it('attributes the bundled fonts as OFL-1.1', () => {
    const fonts = ATTRIBUTIONS.filter((entry) => entry.kind === 'font');
    // Eight faces: JetBrains Mono is the chrome, and the other seven are what a
    // Part can be set in (ADR-0008 rule 9). Spelled out rather than counted, so
    // that bundling a face without crediting it fails here rather than shipping.
    expect(fonts.map((entry) => entry.name).sort()).toEqual([
      'Archivo Narrow',
      'Bitter',
      'Cabin',
      'JetBrains Mono',
      'Noto Sans',
      'Noto Sans JP',
      'Source Serif 4',
      'Space Grotesk',
    ]);
    expect(fonts.every((entry) => entry.license === 'OFL-1.1')).toBe(true);
  });

  it('credits every family a print stack can actually reach', () => {
    // The spec says the attribution suite grows with every bundled face, and
    // this is what makes that automatic rather than remembered: the stacks in
    // `raster.ts` are the definitive list of what a Part can be set in, so a
    // face added there without an entry here fails, and so does an entry whose
    // stack was removed.
    //
    // Fontsource names its variable families `<Family> Variable`; the credit is
    // for the typeface, so the suffix comes off.
    const reachable = [
      ...new Set(
        Object.values(PRINT_FONT_STACKS).flatMap((stack) =>
          stack
            .split(',')
            .map((family) => family.trim().replace(/^['"]|['"]$/g, ''))
            // Generic keywords are the browser's, and nobody's to credit.
            .filter((family) => /^[A-Z]/.test(family))
            .map((family) => family.replace(/ Variable$/, '')),
        ),
      ),
    ].sort();

    const credited = new Set(
      ATTRIBUTIONS.filter((entry) => entry.kind === 'font').map((entry) => entry.name),
    );
    expect(reachable.filter((family) => !credited.has(family))).toEqual([]);

    // And the other way: a font entry no stack names is either the chrome face
    // or a credit for something that stopped shipping.
    const chromeOnly = new Set(['JetBrains Mono']);
    expect(
      [...credited].filter((name) => !reachable.includes(name) && !chromeOnly.has(name)),
    ).toEqual([]);
  });

  it('credits the services it fetches from at runtime', () => {
    expect(DATA_SOURCES.map((source) => source.name).sort()).toEqual([
      'Cover Art Archive',
      'Discogs',
      'MusicBrainz',
    ]);
    for (const source of DATA_SOURCES) {
      expect(source.url, source.name).toMatch(/^https:\/\//);
      expect(source.terms.length, source.name).toBeGreaterThan(40);
    }
    const names = DATA_SOURCES.map((source) => source.name);
    expect(names).toEqual([...new Set(names)]);
  });

  it('credits every host it actually sends a request to, and no other', () => {
    // The check the enumerated list above cannot make. Every other entry in
    // this file is held against something outside it — a package manifest, a
    // font stack, a real build — and a data source had nothing, so adding a
    // second provider to the adapter without crediting it would have passed.
    // The adapter is now what this is held against.
    const declared = new Set(DATA_SOURCES.map((source) => registrableDomain(new URL(source.url).hostname)));
    const reached = hostsTheAdapterSendsTo();

    expect(reached.filter((host) => !declared.has(host))).toEqual([]);
    expect([...declared].filter((host) => !reached.includes(host)).sort()).toEqual([]);
  });

  it('keeps the network where this file can see it', () => {
    // The host check above reads `src/metadata`, and that is only the whole
    // network surface while two things hold. Both are checked, because the
    // second one on its own is not enough: `fetch` is a global, so a module
    // that never imports anything can still open a connection to a host nobody
    // has credited — and that is exactly what this assertion was missing.
    expect(modulesMatching(/\bfetch\(/)).toEqual(['src/metadata/http.ts']);

    // And the client itself: the workspace is the one exception on purpose,
    // because it builds the single instance and hands it to the adapter. Named
    // rather than filtered out, so this cannot pass by that client vanishing.
    expect(modulesMatching(/from '[^']*\/http\.ts'/)).toEqual([
      'src/app/workspace.ts',
      'src/metadata/metadata-adapter.ts',
    ]);
  });

  it('accounts for every shipped asset, as our own work or as someone else’s', () => {
    // The point is not that everything is credited — the project's own drawing
    // needs no credit — but that nothing reaches a user unexamined.
    const accounted = new Set([...OWN_ARTWORK, ...attributedFiles()]);

    expect(
      shippedAssets().filter((file) => !accounted.has(file) && !file.startsWith(LICENSE_TEXTS)),
    ).toEqual([]);
  });

  it('claims no asset that is not in the build', () => {
    const present = new Set(shippedAssets());

    expect([...OWN_ARTWORK, ...attributedFiles()].filter((file) => !present.has(file))).toEqual([]);
  });

  it('attributes the workbox that vite-plugin-pwa compiles into the bundle', () => {
    // It ships from a devDependency, which is exactly the shape of gap this
    // check exists to close.
    const attributed = new Set(
      ATTRIBUTIONS.map((entry) => entry.packageName).filter((name) => name?.startsWith('workbox-')),
    );

    expect(WORKBOX_MODULES.filter((name) => !attributed.has(name))).toEqual([]);
    expect(
      ATTRIBUTIONS.filter((entry) => entry.packageName?.startsWith('workbox-')).every(
        (entry) => entry.license === 'MIT' && entry.pwaOnly,
      ),
    ).toBe(true);
  });

  it.skipIf(!BUILT)('credits every workbox module a real build contains (needs `npm run build`)', () => {
    // Read back from the build rather than from anyone's memory of it: this is
    // what stops the hand-kept list above drifting when a plugin changes.
    const attributed = new Set(
      ATTRIBUTIONS.map((entry) => entry.packageName).filter((name): name is string => !!name),
    );

    expect(workboxModulesInBuild().filter((name) => !attributed.has(name))).toEqual([]);
  });

  it.skipIf(!BUILT)('claims no workbox module the build does not contain', () => {
    const built = new Set(workboxModulesInBuild());

    expect(WORKBOX_MODULES.filter((name) => !built.has(name))).toEqual([]);
  });

  it('lists no entry twice', () => {
    const names = ATTRIBUTIONS.map((entry) => entry.name);
    expect(names).toEqual([...new Set(names)]);
  });
});
