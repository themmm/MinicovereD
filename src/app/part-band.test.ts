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
 */
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
