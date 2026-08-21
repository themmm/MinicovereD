import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  ATTRIBUTIONS,
  DATA_SOURCES,
  licenseTextFor,
  OWN_ARTWORK,
  PERMISSIVE_LICENSES,
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
 * Named rather than walked: their manifests depend on `@types/*` packages,
 * which are declaration files and ship nothing, and demanding attribution for
 * those would be a claim about the build that is not true.
 */
const SHIPPED_VIA_BUILD = ['workbox-window', 'workbox-core'];

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
 * Directories whose every file ships — copied into the build as-is, or
 * imported by the app and compiled in.
 */
const ASSET_DIRECTORIES = ['assets', 'public'];

/** Every shipped file that is not code, repo-relative and slash-separated. */
function shippedAssets(): string[] {
  const found: string[] = [];

  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      // Dotfiles are the operating system's business, not the build's.
      if (entry.name.startsWith('.')) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else found.push(relative(repoRoot, path).split(sep).join('/'));
    }
  };

  for (const directory of ASSET_DIRECTORIES) walk(join(repoRoot, directory));
  return found.sort();
}

/** Files some attribution entry says it covers. */
const attributedFiles = (): string[] => ATTRIBUTIONS.flatMap((entry) => entry.files ?? []);

const claimedPackages = (): string[] =>
  ATTRIBUTIONS.map((entry) => entry.packageName).filter((name): name is string => !!name);

/** A distinctive phrase from each license, so "shows the text" means the right text. */
const LICENSE_MARKERS: Readonly<Record<string, string>> = {
  MIT: 'MIT License',
  'OFL-1.1': 'SIL OPEN FONT LICENSE',
  '0BSD': 'Permission to use, copy, modify, and/or distribute',
  Zlib: 'zlib License',
  'LicenseRef-PD-textlogo': 'below the threshold of originality',
};

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
    expect(fonts.map((entry) => entry.name).sort()).toEqual(['Noto Sans', 'Noto Sans JP']);
    expect(fonts.every((entry) => entry.license === 'OFL-1.1')).toBe(true);
  });

  it('credits the services it fetches from at runtime', () => {
    expect(DATA_SOURCES.map((source) => source.name).sort()).toEqual([
      'Cover Art Archive',
      'MusicBrainz',
    ]);
    for (const source of DATA_SOURCES) {
      expect(source.url, source.name).toMatch(/^https:\/\//);
      expect(source.terms.length, source.name).toBeGreaterThan(40);
    }
  });

  it('accounts for every shipped asset, as our own work or as someone else’s', () => {
    // The point is not that everything is credited — the Mark is ours and
    // needs no credit — but that nothing reaches a user unexamined.
    const accounted = new Set([...OWN_ARTWORK, ...attributedFiles()]);

    expect(shippedAssets().filter((file) => !accounted.has(file))).toEqual([]);
  });

  it('claims no asset that is not in the build', () => {
    const present = new Set(shippedAssets());

    expect([...OWN_ARTWORK, ...attributedFiles()].filter((file) => !present.has(file))).toEqual([]);
  });

  it('attributes the workbox that vite-plugin-pwa compiles into the bundle', () => {
    // It ships from a devDependency, which is exactly the shape of gap this
    // check exists to close.
    const workbox = ATTRIBUTIONS.filter((entry) => entry.packageName?.startsWith('workbox-'));

    expect(workbox.map((entry) => entry.packageName).sort()).toEqual(['workbox-core', 'workbox-window']);
    expect(workbox.every((entry) => entry.license === 'MIT')).toBe(true);
  });

  it('lists no entry twice', () => {
    const names = ATTRIBUTIONS.map((entry) => entry.name);
    expect(names).toEqual([...new Set(names)]);
  });
});
