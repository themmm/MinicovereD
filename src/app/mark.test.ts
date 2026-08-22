import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The Mark and the Icon, held to one figure (ADR-0011).
 *
 * CONTEXT.md separates the two — the Mark is this project's pictorial mark,
 * the Icon is a rendered placement of it — so they are two files, and the
 * figure is written down twice. Nothing in SVG or TypeScript notices when two
 * path strings drift apart, which is the same problem the print quarantine has
 * with the font stack and the same answer: a test that fails when they do.
 *
 * The grid arithmetic is checked too, because rule 5 is about numbers. A
 * sixteen-module figure only renders one module to the pixel at sizes that are
 * integer multiples of sixteen, and the surfaces it ships on are fixed.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (path: string): string => readFileSync(join(repoRoot, path), 'utf8');

/** Every `d` in a file, in document order. */
const paths = (svg: string): string[] => [...svg.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1] ?? '');

const MARK = 'assets/mark.svg';
const ICON = 'assets/icon.svg';

describe('the Mark (ADR-0011)', () => {
  it('draws the same figure in the Mark and in the Icon', () => {
    const [figure, ...rest] = paths(read(MARK));

    expect(rest, 'the Mark is one path and nothing else').toEqual([]);
    // The Icon is the ground first, then the same figure on top of it.
    expect(paths(read(ICON))[1]).toBe(figure);
  });

  it('gives the Icon a ground, which is the whole reason it is a second file', () => {
    const [ground] = paths(read(ICON));

    // The full 16 x 16 field. Without it the favicon is ink on a dark tab bar.
    expect(ground).toBe('M0 0h16v16H0z');
    expect(paths(read(MARK))[0]).not.toBe(ground);
  });

  it('is built on sixteen modules with no curve in it', () => {
    for (const file of [MARK, ICON]) {
      const svg = read(file);
      expect(svg, file).toContain('viewBox="0 0 16 16"');
      // Grid construction is the point (rule 2), and crispEdges is what stops
      // the renderer softening it back again.
      expect(svg, file).toContain('shape-rendering="crispEdges"');
      // M, H, V, Z and digits. A C, S, Q, A or L would be a curve or a diagonal,
      // and neither is on this grid.
      for (const d of paths(svg)) {
        expect(d.replace(/[MHVZmhvz0-9\s.]/g, ''), `${file}: ${d}`).toBe('');
      }
    }
  });

  it('lands on an integer number of modules at every size it ships at', () => {
    // 16 header and favicon, 192 and 512 app icons, 96 in the README. The
    // maskable icon draws the figure at x18 rather than filling its 512.
    for (const px of [16, 96, 192, 512, 16 * 18]) {
      expect(px % 16, `${px} px`).toBe(0);
    }
  });

  it('keeps the two colours the palette actually has, and no third', () => {
    const fills = [read(MARK), read(ICON)].flatMap((svg) =>
      [...svg.matchAll(/fill="([^"]+)"/g)].map((m) => m[1]),
    );

    expect([...new Set(fills)].sort()).toEqual(['#5c6a72', '#fdf6e3']);
  });
});
