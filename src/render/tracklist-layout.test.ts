import { describe, expect, it } from 'vitest';

import type { Track } from '../domain/release.ts';
import { layOutTracklist, PRINT_FLOOR_MM } from './tracklist-layout.ts';
import type { TextMeasurer } from './text.ts';

/**
 * Deterministic metrics: half an em per Latin character, a full em per CJK one,
 * which is how real faces behave and is all the layout needs to be right about.
 */
const measurer: TextMeasurer = {
  widthMm: (text, style) =>
    [...text].reduce((width, char) => width + (/[⺀-鿿＀-￯ぁ-ゟ゠-ヿ]/.test(char) ? 1 : 0.5), 0) *
    style.sizeMm,
};

/** The Back Card's tracklist area at the defaults: 63 mm wide, 62.4 mm tall. */
const BOX = { x: 3, y: 16.6, width: 63, height: 62.4 };
const BASE_SIZE = 2.4;

const tracks = (count: number, title = 'Track'): Track[] =>
  Array.from({ length: count }, (_, index) => ({ position: index + 1, title: `${title} ${index + 1}` }));

const layout = (count: number, title?: string) =>
  layOutTracklist(tracks(count, title), BOX, BASE_SIZE, measurer);

describe('laying out a tracklist', () => {
  it('keeps a short list in one column at full size', () => {
    const { columns, sizeMm, lines } = layout(10);

    expect(columns).toBe(1);
    expect(sizeMm).toBe(BASE_SIZE);
    expect(lines).toHaveLength(10);
  });

  it('flows a 25-track Release into two columns without shrinking', () => {
    const { columns, sizeMm, lines } = layout(25);

    expect(columns).toBe(2);
    expect(sizeMm).toBe(BASE_SIZE);
    expect(lines).toHaveLength(25);
  });

  it('splits the columns so the first fills before the second starts', () => {
    const { lines } = layout(25);
    const columnX = [...new Set(lines.map((line) => line.at.x))].sort((a, b) => a - b);

    expect(columnX).toHaveLength(2);
    const first = lines.filter((line) => line.at.x === columnX[0]);
    const second = lines.filter((line) => line.at.x === columnX[1]);
    expect(first.length).toBeGreaterThanOrEqual(second.length);
    // Reading order runs down the first column, then down the second.
    expect(first[0]?.text).toContain('1.');
    expect(second[0]?.text).toContain(`${first.length + 1}.`);
  });

  it('shrinks the type rather than truncating a very long list', () => {
    const long = layout(60);

    expect(long.lines).toHaveLength(60);
    expect(long.sizeMm).toBeLessThan(BASE_SIZE);
    expect(long.columns).toBe(2);
  });

  it('never drops a track, at any length', () => {
    for (const count of [1, 21, 22, 42, 43, 60, 120]) {
      const { lines } = layout(count);

      expect(lines, `${count} tracks`).toHaveLength(count);
      expect(lines[0]?.text.startsWith('1.'), `${count} tracks start at 1`).toBe(true);
      expect(lines.at(-1)?.text.startsWith(`${count}.`), `${count} tracks end at ${count}`).toBe(true);
    }
  });

  it('keeps every line inside the box it was given', () => {
    for (const count of [10, 25, 60]) {
      const { lines, sizeMm } = layout(count);

      for (const line of lines) {
        expect(line.at.x, `${count}: left`).toBeGreaterThanOrEqual(BOX.x - 0.001);
        expect(line.at.y, `${count}: top`).toBeGreaterThanOrEqual(BOX.y - 0.001);
        expect(line.at.y + sizeMm, `${count}: bottom`).toBeLessThanOrEqual(BOX.y + BOX.height + 0.001);
      }
    }
  });

  it('shrinks until the list actually fits, however absurd the list', () => {
    // Past a certain length the type used to stop shrinking and the tail ran
    // off the bottom of the box — where the Part clip eats it, which is
    // truncation wearing a different hat.
    for (const count of [130, 500, 2000]) {
      const { lines, sizeMm } = layout(count);

      expect(lines, `${count} tracks`).toHaveLength(count);
      const lowest = Math.max(...lines.map((line) => line.at.y + sizeMm));
      expect(lowest, `${count} tracks stay in the box`).toBeLessThanOrEqual(BOX.y + BOX.height + 0.001);
    }
  });

  it('says when the type has gone below what a printer can hold', () => {
    // Sony's own artwork spec puts the floor at 5 pt; below it, ink spreads.
    expect(layout(25).belowPrintFloor).toBe(false);
    expect(layout(400).belowPrintFloor).toBe(true);
    expect(layout(400).lines).toHaveLength(400);
    expect(PRINT_FLOOR_MM).toBeCloseTo(1.764, 3);
  });
});

describe('laying out a tracklist in other scripts', () => {
  it('carries Japanese titles through unchanged', () => {
    const japanese: Track[] = [
      { position: 1, title: '東京は夜の七時' },
      { position: 2, title: 'こんにちは' },
      { position: 3, title: 'カタカナ' },
    ];

    const { lines } = layOutTracklist(japanese, BOX, BASE_SIZE, measurer);

    expect(lines.map((line) => line.text)).toEqual([
      '1. 東京は夜の七時',
      '2. こんにちは',
      '3. カタカナ',
    ]);
    expect(lines.some((line) => line.text.includes('�'))).toBe(false);
  });

  it('measures CJK as the wider script it is, so it trims where Latin would not', () => {
    // Sixteen characters either way. In a real face a CJK glyph is an em wide
    // against half an em for Latin, so the same count needs twice the column.
    const sixteen = (title: string) =>
      layOutTracklist(
        Array.from({ length: 30 }, (_, index) => ({ position: index + 1, title })),
        BOX,
        BASE_SIZE,
        measurer,
      );
    const latin = sixteen('Abcdefghijklmnop');
    const cjk = sixteen('東京は夜の七時です東京は夜の七時');

    expect(latin.lines).toHaveLength(30);
    expect(cjk.lines).toHaveLength(30);

    const trimmed = (result: { lines: ReadonlyArray<{ text: string }> }): number =>
      result.lines.filter((line) => line.text.endsWith('…')).length;
    expect(trimmed(latin)).toBe(0);
    expect(trimmed(cjk)).toBe(30);
  });

  it('never cuts a surrogate pair in half when trimming', () => {
    const emoji: Track[] = [{ position: 1, title: '🎵'.repeat(60) }];

    const [line] = layOutTracklist(emoji, BOX, BASE_SIZE, measurer).lines;

    expect(line?.text.includes('�')).toBe(false);
    // Every code unit still pairs up: no lone surrogate survived the trim.
    expect([...(line?.text ?? '')].join('')).toBe(line?.text);
  });
});
