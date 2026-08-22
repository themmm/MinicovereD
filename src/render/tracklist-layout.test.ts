import { describe, expect, it } from 'vitest';

import type { Track } from '../domain/release.ts';
import { layOutTracklist, PRINT_FLOOR_MM } from './tracklist-layout.ts';
import type { TextMeasurer } from './text.ts';
import type { TextStyle } from './layout.ts';

/**
 * Deterministic metrics: half an em per Latin character, a full em per CJK one,
 * which is how real faces behave and is all the layout needs to be right about.
 */
const measurer: TextMeasurer = {
  widthMm: (text, style) =>
    [...text].reduce((width, char) => width + (/[⺀-鿿＀-￯ぁ-ゟ゠-ヿ]/.test(char) ? 1 : 0.5), 0) *
    style.sizeMm,
};

/**
 * The Back Card's tracklist area at the defaults: 3 mm in from the left, below
 * the rule at 13.6 mm, 63 × 62.4 mm.
 */
const BOX = { x: 3, y: 13.6, width: 63, height: 62.4 };
const BASE_SIZE = 2.4;
/**
 * What a Template hands in. The face and weight are whichever it chose — the
 * fitting rules are the same for all of them, and the measurer above is
 * face-blind on purpose, so these assertions stay about columns and sizes
 * rather than about anybody's metrics.
 */
const STYLE: TextStyle = {
  sizeMm: BASE_SIZE,
  weight: 400,
  face: 'sans',
  color: '#141414',
  align: 'left',
  baseline: 'top',
};

const tracks = (count: number, title = 'Track'): Track[] =>
  Array.from({ length: count }, (_, index) => ({ position: index + 1, title: `${title} ${index + 1}` }));

/** The same list, with a playing time on every track. */
const timed = (count: number, lengthMs = 200_000): Track[] =>
  tracks(count).map((track) => ({ ...track, lengthMs }));

const layout = (count: number, title?: string) =>
  layOutTracklist(tracks(count, title), BOX, STYLE, measurer);

describe('laying out a tracklist', () => {
  it('keeps a short list in one column at full size', () => {
    const { columns, style, lines } = layout(10);

    expect(columns).toBe(1);
    expect(style.sizeMm).toBe(BASE_SIZE);
    expect(lines).toHaveLength(10);
  });

  it('flows a 25-track Release into two columns without shrinking', () => {
    const { columns, style, lines } = layout(25);

    expect(columns).toBe(2);
    expect(style.sizeMm).toBe(BASE_SIZE);
    expect(lines).toHaveLength(25);
  });

  it('hands back the style it fitted, so the caller cannot draw in another', () => {
    // The whole reason the style travels rather than the size: every field the
    // measurer reads has to be identical on both sides of the fit, and only the
    // size is allowed to have moved.
    const { style } = layout(60);

    expect(style.sizeMm).toBeLessThan(BASE_SIZE);
    expect({ ...style, sizeMm: BASE_SIZE }).toEqual(STYLE);
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
    expect(long.style.sizeMm).toBeLessThan(BASE_SIZE);
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
      const { lines, style } = layout(count);

      for (const line of lines) {
        expect(line.at.x, `${count}: left`).toBeGreaterThanOrEqual(BOX.x - 0.001);
        expect(line.at.y, `${count}: top`).toBeGreaterThanOrEqual(BOX.y - 0.001);
        expect(line.at.y + style.sizeMm, `${count}: bottom`).toBeLessThanOrEqual(BOX.y + BOX.height + 0.001);
      }
    }
  });

  it('shrinks until the list actually fits, however absurd the list', () => {
    // Past a certain length the type used to stop shrinking and the tail ran
    // off the bottom of the box — where the Part clip eats it, which is
    // truncation wearing a different hat.
    for (const count of [130, 500, 2000]) {
      const { lines, style } = layout(count);

      expect(lines, `${count} tracks`).toHaveLength(count);
      const lowest = Math.max(...lines.map((line) => line.at.y + style.sizeMm));
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

    const { lines } = layOutTracklist(japanese, BOX, STYLE, measurer);

    expect(lines.map((line) => line.text)).toEqual([
      '1. 東京は夜の七時',
      '2. こんにちは',
      '3. カタカナ',
    ]);
    expect(lines.some((line) => /[\uD800-\uDFFF]/.test(line.text))).toBe(false);
  });

  it('measures CJK as the wider script it is, so it trims where Latin would not', () => {
    // Sixteen characters either way. In a real face a CJK glyph is an em wide
    // against half an em for Latin, so the same count needs twice the column.
    const sixteen = (title: string) =>
      layOutTracklist(
        Array.from({ length: 30 }, (_, index) => ({ position: index + 1, title })),
        BOX,
        STYLE,
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

    const [line] = layOutTracklist(emoji, BOX, STYLE, measurer).lines;
    const text = line?.text ?? '';

    // A trim by code unit would leave a high surrogate with nothing after it,
    // which is what renders as a replacement glyph on paper.
    expect(text.endsWith('…'), 'the line was actually trimmed').toBe(true);
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(text), 'lone high surrogate').toBe(false);
    expect(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(text), 'lone low surrogate').toBe(false);
  });
});

describe('a tracklist with playing times', () => {
  /** Half an em per character at 2.4 mm, so "3:20" is four of them. */
  const DURATION_MM = 4 * 0.5 * BASE_SIZE;
  const timedLayout = (list: Track[]) => layOutTracklist(list, BOX, STYLE, measurer);

  it('sets each time flush against the right edge of its column', () => {
    const { lines, durationStyle } = timedLayout(timed(10));

    expect(durationStyle.align).toBe('right');
    for (const line of lines) {
      expect(line.duration?.text).toBe('3:20');
      // One column, so the right edge is the box's own.
      expect(line.duration?.at.x).toBeCloseTo(BOX.x + BOX.width, 6);
      expect(line.duration?.at.y).toBeCloseTo(line.at.y, 6);
    }
  });

  it('puts the times of each column against that column, not against the box', () => {
    const { lines, columns } = timedLayout(timed(25));
    expect(columns).toBe(2);

    // (63 - 3) / 2 = 30 per column, so the two right edges are 33 and 66.
    const edges = [...new Set(lines.map((line) => line.duration?.at.x))].sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(edges).toEqual([BOX.x + 30, BOX.x + 33 + 30]);
    for (const line of lines) {
      const columnLeft = line.at.x;
      expect(line.duration?.at.x).toBeCloseTo(columnLeft + 30, 6);
    }
  });

  it('gives the title only the room the time column leaves it', () => {
    // The whole point of a table: a title that runs under its own duration is
    // not a longer title, it is an unreadable one.
    const long = 'A title far too long for thirty millimetres of column';
    const withTime = layOutTracklist(
      [{ position: 1, title: long, lengthMs: 200_000 }],
      BOX,
      STYLE,
      measurer,
    );
    const withoutTime = layOutTracklist([{ position: 1, title: long }], BOX, STYLE, measurer);

    const width = (text: string): number => measurer.widthMm(text, STYLE);
    expect(width(withTime.lines[0]?.text ?? '')).toBeLessThanOrEqual(BOX.width - DURATION_MM - 2);
    expect(width(withTime.lines[0]?.text ?? '')).toBeLessThan(width(withoutTime.lines[0]?.text ?? ''));
  });

  it('reserves the widest time in the list, so no title runs under one', () => {
    // One reserve for the whole list, not each row's own. The long time comes
    // first on purpose: a reserve taken from the row being laid out, or from
    // the last one seen, would clear "1:05" and leave "1:11:05" with a title
    // written through it.
    const long = 'A title far too long for sixty-three millimetres of column, honestly';
    const mixed: Track[] = [
      { position: 1, title: long, lengthMs: 4_265_000 },
      { position: 2, title: long, lengthMs: 65_000 },
    ];

    const { lines } = layOutTracklist(mixed, BOX, STYLE, measurer);

    expect(lines.map((line) => line.duration?.text)).toEqual(['1:11:05', '1:05']);
    expect(new Set(lines.map((line) => line.duration?.at.x)).size).toBe(1);

    // Both rows are trimmed against the same reserve, so both stop clear of the
    // longest time either of them could sit beside — including the row whose
    // own time is four characters shorter.
    const widest = measurer.widthMm('1:11:05', STYLE);
    for (const line of lines) {
      expect(measurer.widthMm(line.text, STYLE) + 2 + widest).toBeLessThanOrEqual(BOX.width);
    }
  });

  it('leaves a track with no time without a cell to draw', () => {
    const { lines } = layOutTracklist(
      [
        { position: 1, title: 'Timed', lengthMs: 200_000 },
        { position: 2, title: 'Untimed' },
      ],
      BOX,
      STYLE,
      measurer,
    );

    expect(lines[0]?.duration).toBeDefined();
    expect(lines[1]?.duration).toBeUndefined();
  });

  it('gives the titles the whole column back when no track has a time', () => {
    const long = 'A title far too long for sixty-three millimetres of column, honestly';
    const untimed = layOutTracklist([{ position: 1, title: long }], BOX, STYLE, measurer);

    // No reserve and no gap: nothing is going to sit in them.
    expect(measurer.widthMm(untimed.lines[0]?.text ?? '', STYLE)).toBeGreaterThan(
      BOX.width - DURATION_MM - 2,
    );
  });

  it('hands back a duration style that differs from the fitted one only in its alignment', () => {
    // The same rule `style` follows: a caller that spelled out
    // `{ ...layout.style, align: 'right' }` is one edit away from spelling out
    // a size, and then the times are measured against a list that shrank.
    const { style, durationStyle } = timedLayout(timed(60));

    expect(style.sizeMm).toBeLessThan(BASE_SIZE);
    expect(durationStyle).toEqual({ ...style, align: 'right' });
  });

  it('keeps every time inside the box the list was given', () => {
    for (const count of [10, 25, 60]) {
      const { lines, style } = timedLayout(timed(count));

      for (const line of lines) {
        expect(line.duration?.at.x, `${count}: right`).toBeLessThanOrEqual(BOX.x + BOX.width + 0.001);
        expect((line.duration?.at.y ?? 0) + style.sizeMm, `${count}: bottom`).toBeLessThanOrEqual(
          BOX.y + BOX.height + 0.001,
        );
      }
    }
  });
});
