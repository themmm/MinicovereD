import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { PRINT_FONT_STACK } from './raster.ts';

/**
 * The quarantine, enforced rather than observed (ADR-0008 rule 9).
 *
 * The chrome may be re-skinned freely *because* it cannot reach the paper, and
 * that "cannot" has to be a fact rather than an intention. Two things make it
 * one, and neither can be expressed in the languages involved:
 *
 *  - a canvas cannot read a custom property, so the print stack is written down
 *    twice — once in CSS and once as a string literal — and nothing in CSS or
 *    TypeScript notices when the two drift. They already had: the stylesheet
 *    carried `-apple-system` and `'Segoe UI'` that the canvas never had.
 *  - a token can be re-themed and a literal cannot, so the print surface is
 *    literal on purpose. Nothing stops an editor from "tidying" a hex into a
 *    token except a test that fails when they do.
 *
 * The first four checks here are the ones ticket 11 names. The last two are
 * additions: they hold the two claims step 1 actually rests on — one text
 * colour, and four literals — which the other four do not touch.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (path: string): string => readFileSync(join(repoRoot, path), 'utf8');

const FONTS_CSS = 'src/styles/fonts.css';
const APP_CSS = 'src/styles/app.css';
const RASTER = 'src/render/raster.ts';

/** Whitespace in a font stack is not meaningful; a line wrap in CSS is not a difference. */
const normalise = (stack: string): string => stack.replace(/\s+/g, ' ').trim();

/** The value of one custom property, as declared in a stylesheet. */
function customProperty(css: string, name: string): string {
  const match = new RegExp(`--${name}:\\s*([^;]+);`).exec(css);
  if (!match?.[1]) throw new Error(`--${name} is not declared`);
  return normalise(match[1]);
}

/** The first family of a stack, unquoted — the face itself, not its fallbacks. */
const firstFamily = (stack: string): string =>
  (stack.split(',')[0] ?? '').trim().replace(/^['"]|['"]$/g, '');

/**
 * Every TypeScript module under `src/render` that ships, repo-relative.
 *
 * Tests are excluded, and not as a convenience: a test that asserts *about* the
 * boundary has to be able to name both sides of it, so policing this file as if
 * it drew a Part would make the checks below unwritable.
 */
function renderModules(): string[] {
  const found: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
        found.push(relative(repoRoot, path).split(sep).join('/'));
      }
    }
  };
  walk(join(repoRoot, 'src', 'render'));
  return found.sort();
}

/**
 * The print-surface block: the run between its own delimiters in `app.css`.
 *
 * Found by marker rather than by selector, because the point of the block is
 * that it is a *region* with a rule about it — anything moved inside inherits
 * that rule, and anything moved out loses it.
 */
function printSurfaceBlock(): string {
  const start = '/* ===================================================== the print surface ==';
  const end = '/* ================================================= end the print surface == */';
  const css = read(APP_CSS);
  const from = css.indexOf(start);
  const to = css.indexOf(end);
  expect(from, 'the print-surface block opening marker').toBeGreaterThan(-1);
  expect(to, 'the print-surface block closing marker').toBeGreaterThan(from);
  return css.slice(from, to);
}

describe('the print quarantine (ADR-0008 rule 9)', () => {
  it('gives the Part the same font stack in CSS as the canvas actually draws with', () => {
    // The one duplication that cannot be removed, so it is the one that is checked.
    expect(customProperty(read(FONTS_CSS), 'font-print')).toBe(normalise(PRINT_FONT_STACK));
  });

  it('keeps the chrome face out of every module that draws a Part', () => {
    const chromeFace = firstFamily(customProperty(read(FONTS_CSS), 'font-chrome'));
    expect(chromeFace).not.toBe('');
    // Not `--font-print`'s first family either: if the two stacks ever lead with
    // the same face there is no boundary left to police.
    expect(chromeFace).not.toBe(firstFamily(PRINT_FONT_STACK));

    const offenders = renderModules().filter((path) => read(path).includes(chromeFace));
    expect(offenders, `${chromeFace} may not appear under src/render`).toEqual([]);
  });

  it('lists only print faces in the manifest that preloads them', () => {
    // `BUNDLED_FACES` in canvas-text-measurer.ts is the print side's manifest:
    // the faces asked for by name so a canvas is never measured against a
    // fallback. A canvas is the only thing that needs it — DOM text fetches its
    // own face — so the chrome joining this list would be a leak, not an
    // optimisation.
    const source = read('src/render/canvas-text-measurer.ts');
    const manifest = /const BUNDLED_FACES[^=]*=\s*\[(.*?)\n\];/s.exec(source)?.[1];
    expect(manifest, 'BUNDLED_FACES').toBeTruthy();

    const families = [...(manifest ?? '').matchAll(/family:\s*'([^']+)'/g)].map((m) => m[1]);
    expect(families.length).toBeGreaterThan(0);

    const printFaces = PRINT_FONT_STACK.split(',').map(firstFamily);
    expect(families.filter((family) => !printFaces.includes(family as string))).toEqual([]);
  });

  it('builds every canvas font through the one function that knows the stack', () => {
    // Measuring and drawing cannot disagree if neither of them owns the stack.
    expect(read('src/render/canvas-text-measurer.ts')).toContain("import { fontFor } from './raster.ts'");

    const declarations = renderModules().filter((path) =>
      /export const PRINT_FONT_STACK/.test(read(path)),
    );
    expect(declarations).toEqual([RASTER]);

    // No module may set a canvas font from anything but a `fontFor` result.
    const assignments = renderModules().flatMap((path) =>
      [...read(path).matchAll(/\.font\s*=\s*([^;]+);/g)].map((m) => ({
        path,
        value: (m[1] ?? '').trim(),
      })),
    );
    expect(assignments.length).toBeGreaterThan(0);
    expect(
      assignments.filter(({ value }) => value !== 'font' && !value.startsWith('fontFor(')),
    ).toEqual([]);
  });

  it('keeps the print surface literal, with no token able to re-theme it', () => {
    // The check ticket 11 names. A token in here would mean a palette could
    // decide what paper looks like, which is the whole thing rule 9 forbids.
    expect(printSurfaceBlock()).not.toContain('var(--');
  });

  it('spends exactly four literal colours in the stylesheet, all of them deliberate', () => {
    // Beyond the ticket's four checks, and the one that holds step 1's headline:
    // the chrome carries no hardcoded colour at all, so it is switch-ready even
    // though v1 ships no switcher. Comments are prose and `:root` *is* the
    // palette, so neither counts.
    const css = read(APP_CSS)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/:root\s*\{[\s\S]*?\n\}/g, '');
    const literals = [...css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);

    // paper, the mount it is pinned to, the paper's shadow, the dialog backdrop.
    expect(literals.sort()).toEqual(['#000000b3', '#00000038', '#3c3c3c', '#ffffff'].sort());
  });

  it('sets text in one colour and never in an accent', () => {
    // Laws 1 and 2 of ADR-0008, which are otherwise only a habit. Hierarchy has
    // to come from size, weight, tracking and space — and an accent that cannot
    // be a `color` cannot quietly become one either, because every accent in
    // this palette fails 4.5:1 as text.
    const css = read(APP_CSS).replace(/\/\*[\s\S]*?\*\//g, '');
    const allowed = ['var(--ink)', 'var(--shell-ink)', 'var(--surface)', 'inherit', 'currentColor'];

    const used = [...css.matchAll(/(?<![-\w])color:\s*([^;]+);/g)].map((m) => (m[1] ?? '').trim());
    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((value) => !allowed.includes(value))).toEqual([]);
  });
});
