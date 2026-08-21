import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { ATTRIBUTIONS, licenseTextFor, PERMISSIVE_LICENSES } from './attributions.ts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

interface PackageManifest {
  readonly version: string;
  readonly license?: string;
  readonly dependencies?: Record<string, string>;
}

const readManifest = (packageName: string): PackageManifest =>
  JSON.parse(readFileSync(join(repoRoot, 'node_modules', packageName, 'package.json'), 'utf8'));

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
  return [...seen].sort();
}

const claimedPackages = (): string[] =>
  ATTRIBUTIONS.map((entry) => entry.packageName).filter((name): name is string => !!name);

/** A distinctive phrase from each license, so "shows the text" means the right text. */
const LICENSE_MARKERS: Readonly<Record<string, string>> = {
  MIT: 'MIT License',
  'OFL-1.1': 'SIL OPEN FONT LICENSE',
  '0BSD': 'Permission to use, copy, modify, and/or distribute',
  Zlib: 'zlib License',
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

  it('lists no entry twice', () => {
    const names = ATTRIBUTIONS.map((entry) => entry.name);
    expect(names).toEqual([...new Set(names)]);
  });
});
