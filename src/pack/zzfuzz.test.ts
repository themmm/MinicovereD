import { describe, expect, it } from 'vitest';
import { A4, LETTER, printableArea } from '../domain/paper.ts';
import { rectsOverlap } from '../domain/units.ts';
import { packParts } from './sheet-packer.ts';
import type { PackConfig, PackItem } from './sheet-packer.ts';

function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('fuzz', () => {
  it('never overlaps / overflows / drops', () => {
    const problems: string[] = [];
    for (let seed = 0; seed < 4000; seed++) {
      const rnd = mulberry32(seed);
      const paper = rnd() < 0.5 ? A4 : LETTER;
      const marginMm = Math.round(rnd() * 20 * 2) / 2;
      const gapMm = Math.round(rnd() * 10 * 2) / 2;
      const area = printableArea(paper, marginMm);
      if (area.width <= 1 || area.height <= 1) continue;
      const n = 1 + Math.floor(rnd() * 14);
      const items: PackItem[] = [];
      for (let i = 0; i < n; i++) {
        const w = Math.max(0.5, Math.round(rnd() * area.width * 2) / 2);
        const h = Math.max(0.5, Math.round(rnd() * area.height * 2) / 2);
        items.push({ releaseId: `r${i}`, part: 'label', size: { width: w, height: h } });
      }
      const config: PackConfig = { paper, marginMm, gapMm };
      let sheets;
      try { sheets = packParts(items, config); } catch (e) { continue; }
      const all = sheets.flatMap((s) => s.placements);
      if (all.length !== items.length) problems.push(`seed ${seed}: dropped ${items.length - all.length}`);
      for (const sheet of sheets) {
        for (const [i, a] of sheet.placements.entries()) {
          if (a.rect.width !== a.item.size.width || a.rect.height !== a.item.size.height)
            problems.push(`seed ${seed}: rect != size`);
          const eps = 1e-9;
          if (a.rect.x < area.x - eps || a.rect.y < area.y - eps ||
              a.rect.x + a.rect.width > area.x + area.width + eps ||
              a.rect.y + a.rect.height > area.y + area.height + eps)
            problems.push(`seed ${seed}: out of area ${JSON.stringify({cfg:config, item:a.item.size, rect:a.rect, area})}`);
          for (const b of sheet.placements.slice(i + 1)) {
            if (rectsOverlap(a.rect, b.rect))
              problems.push(`seed ${seed}: OVERLAP ${JSON.stringify({cfg:config, a:a.rect, b:b.rect, items: items.map(x=>x.size)})}`);
          }
          // gap check
          for (const b of sheet.placements.slice(i + 1)) {
            const gapX = Math.max(a.rect.x - (b.rect.x + b.rect.width), b.rect.x - (a.rect.x + a.rect.width));
            const gapY = Math.max(a.rect.y - (b.rect.y + b.rect.height), b.rect.y - (a.rect.y + a.rect.height));
            if (gapX < gapMm - 1e-9 && gapY < gapMm - 1e-9)
              problems.push(`seed ${seed}: GAP too small ${JSON.stringify({cfg:config, a:a.rect, b:b.rect})}`);
          }
        }
      }
      if (problems.length > 12) break;
    }
    if (problems.length) console.log(problems.slice(0, 12).join('\n'));
    expect(problems.slice(0, 5)).toEqual([]);
  });
});
