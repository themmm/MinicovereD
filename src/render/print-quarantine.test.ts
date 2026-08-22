import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { PrintFace } from './layout.ts';
import { PRINT_FONT_STACKS } from './raster.ts';
import { TEMPLATES } from './sheet-renderer.ts';

/**
 * The quarantine, enforced rather than observed (ADR-0008 rule 9).
 *
 * The chrome may be re-skinned freely *because* it cannot reach the paper, and
 * that "cannot" has to be a fact rather than an intention. Two things make it
 * one, and neither can be expressed in the languages involved:
 *
 *  - a canvas cannot read a custom property, so every print stack is written
 *    down twice — once in CSS and once as a string literal — and nothing in CSS
 *    or TypeScript notices when the two drift. They already had: the stylesheet
 *    carried `-apple-system` and `'Segoe UI'` that the canvas never had.
 *  - a token can be re-themed and a literal cannot, so the print surface is
 *    literal on purpose. Nothing stops an editor from "tidying" a hex into a
 *    token except a test that fails when they do.
 *
 * Nine checks. The first four are the ones ticket 11 names, grown from one stack
 * to one per bundled face; two of those became pairs on the way, because one
 * half of each reads as fine on its own. A family in the preload manifest that
 * no Template's stack reaches is a woff2 inlined into a double-clickable file
 * with no way to see it; a family leading a stack that the manifest does not
 * name is laid out against a fallback and then drawn in itself. The fifth check
 * closes the same gap on the screen side, where a print face with no specimen
 * rule of its own would render in the chrome's monospace.
 *
 * The last four came with step 1 and hold the claims it rests on: the print
 * surface stays literal, the stylesheet spends exactly four literal colours,
 * every control inherits its ink, and no text is set in an accent.
 */

const PRINT_FACES = Object.keys(PRINT_FONT_STACKS) as PrintFace[];

/** The faces a Template can actually put on paper, across all of them. */
const facesInUse = (): PrintFace[] => [
  ...new Set(Object.values(TEMPLATES).flatMap((template) => Object.values(template.faces))),
];

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

/** Every family a stack names, leading face and fallbacks alike. */
const families = (stack: string): string[] => stack.split(',').map(firstFamily);

/** The print faces a stylesheet declares a property for, by face id. */
const declaredPrintFaces = (css: string): string[] =>
  [...css.matchAll(/--font-print-([a-z0-9-]+)\s*:/g)].map(([, id]) => id ?? '');

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
    // The one duplication that cannot be removed, so it is the one that is
    // checked — once per face now, because `--font-print` became a family of
    // properties the moment a Template could choose between them.
    const css = read(FONTS_CSS);
    for (const face of PRINT_FACES) {
      expect(customProperty(css, `font-print-${face}`), face).toBe(
        normalise(PRINT_FONT_STACKS[face]),
      );
    }

    // Both directions, so a face cannot be retired from the code and left in
    // the stylesheet: a stale property keeps shipping its woff2.
    expect(declaredPrintFaces(css).sort()).toEqual([...PRINT_FACES].sort());
  });

  it('keeps the chrome face out of every module that draws a Part', () => {
    const chromeFace = firstFamily(customProperty(read(FONTS_CSS), 'font-chrome'));
    expect(chromeFace).not.toBe('');
    // Not the first family of any print stack either: if the chrome and a
    // Template's face ever lead with the same one there is no boundary left to
    // police, and with six stacks it takes only one of them to open the gap.
    for (const face of PRINT_FACES) {
      expect(firstFamily(PRINT_FONT_STACKS[face]), face).not.toBe(chromeFace);
    }

    const offenders = renderModules().filter((path) => read(path).includes(chromeFace));
    expect(offenders, `${chromeFace} may not appear under src/render`).toEqual([]);
  });

  it('lists only print faces in the manifest that preloads them, and all of them', () => {
    // `BUNDLED_FACES` in canvas-text-measurer.ts is the print side's manifest:
    // the faces asked for by name so a canvas is never measured against a
    // fallback. A canvas is the only thing that needs it — DOM text fetches its
    // own face — so the chrome joining this list would be a leak, not an
    // optimisation.
    const source = read('src/render/canvas-text-measurer.ts');
    const manifest = /const BUNDLED_FACES[^=]*=\s*\[(.*?)\n\];/s.exec(source)?.[1];
    expect(manifest, 'BUNDLED_FACES').toBeTruthy();

    const manifested = [...(manifest ?? '').matchAll(/family:\s*'([^']+)'/g)].map(
      ([, family]) => family ?? '',
    );
    expect(manifested.length).toBeGreaterThan(0);

    // Nothing in the manifest that no Template can reach. A bundled face is a
    // woff2 inlined into a double-clickable HTML file, so an unreachable one is
    // weight with no way to see it.
    const reachable = new Set(facesInUse().flatMap((face) => families(PRINT_FONT_STACKS[face])));
    expect(manifested.filter((family) => !reachable.has(family))).toEqual([]);

    // And nothing leading a stack that the manifest does not name. This is the
    // half that shows on paper: a face nobody asked for by name is not loaded
    // when the layout is measured, so the Part is fitted to the fallback's
    // metrics and then drawn in the face that arrived late.
    const manifestedSet = new Set(manifested);
    for (const face of PRINT_FACES) {
      expect(manifestedSet.has(firstFamily(PRINT_FONT_STACKS[face])), face).toBe(true);
    }
  });

  it('builds every canvas font through the one function that knows the stack', () => {
    // Measuring and drawing cannot disagree if neither of them owns the stack —
    // and now that a Template picks between stacks, that is also what stops
    // them disagreeing about *which*. `fontFor` reads the face off the style
    // both of them are handed, so there is no second place to get it wrong.
    expect(read('src/render/canvas-text-measurer.ts')).toContain("import { fontFor } from './raster.ts'");

    const declarations = renderModules().filter((path) =>
      /export const PRINT_FONT_STACK/.test(read(path)),
    );
    expect(declarations).toEqual([RASTER]);

    // No Template may spell a stack out for itself: they name faces, and the
    // names resolve in one place. A quoted family under `templates/` would be a
    // stack no stylesheet is checked against.
    const templateStacks = renderModules()
      .filter((path) => path.includes('/templates/'))
      .filter((path) => /font-family|['"][A-Z][A-Za-z0-9 ]+ Variable['"]/.test(read(path)));
    expect(templateStacks, 'a Template may name a face, never a family').toEqual([]);

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

  it('gives every print face a specimen of its own in the about dialog', () => {
    // The same gap as the manifest one, on the screen side. The dialog is the
    // visible-attribution surface ADR-0003 requires, and its specimen exists to
    // prove each bundled face loaded — so a face with no row, or a row with no
    // rule, renders in whatever `.specimen dd` inherits, which is the chrome's
    // monospace. That is a print face displayed in the chrome face: a leak, and
    // a silent one, because the line still looks like type.
    //
    // Read from `src/app` by a test under `src/render` on purpose: the boundary
    // being policed is the quarantine's, not any one directory's.
    const dialog = read('src/app/about-dialog.ts');
    const rows = [...dialog.matchAll(/stack:\s*'([a-z-]+)'/g)].map(([, face]) => face ?? '');
    expect(rows.length, 'FONT_SPECIMEN rows').toBeGreaterThan(0);

    const missingRow = PRINT_FACES.filter((face) => !rows.includes(face));
    expect(missingRow, 'print faces with no specimen line').toEqual([]);

    // And the rule that actually sets the line in it. `--font-print-<face>` in
    // the property list is not enough: nothing consumes it without this.
    const css = read(APP_CSS);
    const missingRule = PRINT_FACES.filter(
      (face) => !css.includes(`.specimen dd[data-stack='${face}']`),
    );
    expect(missingRule, 'print faces with no specimen rule').toEqual([]);
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

  it('makes every form control inherit its colour rather than the browser’s', () => {
    // The check above can only see colours that are *declared*. The leak that
    // matters more is the missing declaration: a bare <button> takes
    // `buttontext` from the browser, which is black, and black is in no palette
    // here. It had the queue row and the result row before it was noticed, and
    // an unstyled <a> had the browser's link blue in the licences dialog.
    //
    // So the invariant is the reset itself: controls inherit, and the one that
    // wants the other ink says so explicitly.
    const css = read(APP_CSS).replace(/\/\*[\s\S]*?\*\//g, '');
    const reset = /button,\s*input,\s*select,\s*textarea\s*\{[^}]*color:\s*inherit/;

    expect(reset.test(css), 'form controls must inherit their colour').toBe(true);
    expect(/(^|\})\s*a\s*\{[^}]*color:\s*inherit/m.test(css), 'links must inherit theirs').toBe(true);
  });

  it('sets text in one colour and never in an accent', () => {
    // Laws 1 and 2 of ADR-0008, which are otherwise only a habit. Hierarchy has
    // to come from size, weight, tracking and space — and an accent that cannot
    // be a `color` cannot quietly become one either, because every accent in
    // this palette fails 4.5:1 as text.
    const css = read(APP_CSS).replace(/\/\*[\s\S]*?\*\//g, '');
    // Two: the ink, and the paper that the one filled control sets its label in.
    // `--shell-ink` was a third until the ink header band went away with it.
    const allowed = ['var(--ink)', 'var(--surface)', 'inherit', 'currentColor'];

    const used = [...css.matchAll(/(?<![-\w])color:\s*([^;]+);/g)].map((m) => (m[1] ?? '').trim());
    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((value) => !allowed.includes(value))).toEqual([]);
  });
});
