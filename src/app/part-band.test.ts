import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { describeDropped } from './part-band.ts';

/**
 * The one piece of the Parts band that is a pure function, and the one piece a
 * collector reads word for word.
 *
 * The band itself is a DOM component and this suite runs on `node`, so nothing
 * here builds one. What is worth testing is the sentence fragment two different
 * places print — the note under the specimen and the Sheet check's list — because
 * a fragment shared by two sentences has to agree with both of them, and neither
 * of the two callers can check that for itself.
 *
 * And one thing about the stylesheet, for the same reason: the sentence being
 * right is no use if the box it is printed in cuts it off, and no `node` test can
 * lay out a paragraph. Reading the rule as text is the nearest thing available,
 * and it is the precedent `print-quarantine.test.ts` already sets.
 */

const APP_CSS = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'styles',
  'app.css',
);
describe('naming the Pages an Insert did not get', () => {
  it('agrees with the list it was built from', () => {
    // "the credits Page and the back cover **is** not printed" is the sentence
    // this function exists to stop, and only the verb stops it.
    expect(describeDropped(['credits'])).toBe('the credits Page is');
    expect(describeDropped(['artwork'])).toBe('the back cover is');
    expect(describeDropped(['credits', 'artwork'])).toBe('the credits Page and the back cover are');
  });

  it('calls the artwork Page a back cover, which is what it is on paper', () => {
    // `artwork` is the role's name in the layout model; "back cover" is what a
    // collector holds. Neither name belongs on the other side of that line.
    expect(describeDropped(['artwork'])).not.toContain('artwork');
    expect(describeDropped(['credits', 'artwork'])).toContain('back cover');
  });

  it('keeps the reading order it was given', () => {
    // The credits Page comes before the back cover on the strip, and a sentence
    // that listed them the other way round would describe a different booklet.
    expect(describeDropped(['credits', 'artwork']).indexOf('credits')).toBeLessThan(
      describeDropped(['credits', 'artwork']).indexOf('back cover'),
    );
  });
});

describe('the box those sentences are printed in', () => {
  it('does not cap a note’s height while the band is open', () => {
    // `.spec__note` is `max-height`-capped with `overflow: hidden` so a warning
    // can give up its room when the band condenses. At 90 px that cap is four
    // and a half boxed lines, and the Letter shortfall runs to six — so it was
    // cutting the sentence above off mid-clause, every time, for every Letter
    // collector with credits. Deleting the override brings that straight back and
    // no other test in this repo would notice: the text is complete in the DOM
    // and only layout can see the clip.
    const css = readFileSync(APP_CSS, 'utf8');

    expect(css, 'the cap that makes the collapse animate').toContain(
      'max-height: calc(90px * (1 - var(--cond)))',
    );
    // Both states where `--cond` settles at 0 — see `.band[data-condensed]` and
    // `.band[data-focus]`. Missing either one leaves the note clipped in it.
    expect(css, 'the resting override').toMatch(
      /\.band:not\(\[data-condensed\]\) \.spec__note,\s*\.band\[data-focus\] \.spec__note \{\s*max-height: none;/,
    );
  });
});
