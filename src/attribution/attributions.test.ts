import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { ATTRIBUTIONS, licenseTextFor, PERMISSIVE_LICENSES } from './attributions.ts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const readManifest = (packageName: string): { version: string; dependencies?: Record<string, string> } =>
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

  const root = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
  };
  walk(root.dependencies);
  return [...seen].sort();
}

const claimedPackages = (): string[] =>
  ATTRIBUTIONS.map((entry) => entry.packageName).filter((name): name is string => !!name);

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

  it('accepts only permissive licenses', () => {
    const offenders = ATTRIBUTIONS.filter(
      (entry) => !(PERMISSIVE_LICENSES as readonly string[]).includes(entry.license),
    );
    expect(offenders.map((entry) => `${entry.name}: ${entry.license}`)).toEqual([]);
  });

  it('names a copyright holder and a source URL for every entry', () => {
    const incomplete = ATTRIBUTIONS.filter(
      (entry) => !entry.copyright.trim() || !/^https?:\/\//.test(entry.url),
    );
    expect(incomplete.map((entry) => entry.name)).toEqual([]);
  });

  it('carries the full license text offline for every entry', () => {
    for (const entry of ATTRIBUTIONS) {
      expect(licenseTextFor(entry).length, entry.name).toBeGreaterThan(400);
    }
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
