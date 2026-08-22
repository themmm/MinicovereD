import { describe, expect, it } from 'vitest';

import {
  formatTracklist,
  formatTrackLength,
  parseTracklist,
  totalTrackLength,
} from './tracklist.ts';

describe('manual tracklist entry', () => {
  it('numbers one track per line', () => {
    expect(parseTracklist('Wichita Lineman\nFate of Man')).toEqual([
      { position: 1, title: 'Wichita Lineman' },
      { position: 2, title: 'Fate of Man' },
    ]);
  });

  it('drops numbering the collector pasted along, in whatever shape', () => {
    const pasted = ['1. Wichita Lineman', '02 - Fate of Man', '3) Dreams', '4 — Where’s the Playground'].join('\n');

    expect(parseTracklist(pasted).map((track) => track.title)).toEqual([
      'Wichita Lineman',
      'Fate of Man',
      'Dreams',
      'Where’s the Playground',
    ]);
  });

  it('renumbers from the list order, not from the pasted numbers', () => {
    expect(parseTracklist('7. Seven\n3. Three').map((track) => track.position)).toEqual([1, 2]);
  });

  it('ignores blank lines rather than printing empty tracks', () => {
    expect(parseTracklist('\n  \nOnly Track\n\n')).toEqual([{ position: 1, title: 'Only Track' }]);
  });

  it('keeps a title that merely starts with a number', () => {
    expect(parseTracklist('1979\n99 Luftballons').map((track) => track.title)).toEqual([
      '1979',
      '99 Luftballons',
    ]);
  });

  it('keeps Unicode titles intact', () => {
    expect(parseTracklist('1. 東京は夜の七時\n2. Grüße').map((track) => track.title)).toEqual([
      '東京は夜の七時',
      'Grüße',
    ]);
  });

  it('round-trips through the textarea representation', () => {
    const tracks = parseTracklist('Wichita Lineman\nFate of Man');

    expect(parseTracklist(formatTracklist(tracks))).toEqual(tracks);
  });
});

describe('a Track’s playing time, as it prints', () => {
  it('sets a time under an hour as m:ss', () => {
    // "One More Time", from the recorded Discovery fixture.
    expect(formatTrackLength(320840)).toBe('5:21');
    expect(formatTrackLength(104466)).toBe('1:44');
    expect(formatTrackLength(600293)).toBe('10:00');
  });

  it('rounds to the nearest second rather than truncating', () => {
    // MusicBrainz rounds, and the number came from MusicBrainz — a card that
    // truncated would disagree with the page the collector looked it up on.
    expect(formatTrackLength(320840)).toBe('5:21');
    expect(formatTrackLength(59_600)).toBe('1:00');
    expect(formatTrackLength(59_499)).toBe('0:59');
  });

  it('pads the seconds but never the leading unit', () => {
    expect(formatTrackLength(65_000)).toBe('1:05');
    expect(formatTrackLength(5_000)).toBe('0:05');
  });

  it('grows an hours field only once there is an hour', () => {
    expect(formatTrackLength(3_599_000)).toBe('59:59');
    expect(formatTrackLength(3_600_000)).toBe('1:00:00');
    expect(formatTrackLength(4_265_000)).toBe('1:11:05');
  });

  it('has nothing to print for a track with no whole second in it', () => {
    // Guarding the input alone would let 400 ms through as `0:00`, which reads
    // as a claim about a track rather than as the absence of one.
    expect(formatTrackLength(400)).toBeUndefined();
    expect(formatTrackLength(499)).toBeUndefined();
    expect(formatTrackLength(500)).toBe('0:01');
  });

  it('has nothing to print for a length that is not one', () => {
    // A Release typed in from a shelf has no times at all, and a zero would
    // print as a claim about one.
    expect(formatTrackLength(undefined)).toBeUndefined();
    expect(formatTrackLength(0)).toBeUndefined();
    expect(formatTrackLength(-1)).toBeUndefined();
    expect(formatTrackLength(Number.NaN)).toBeUndefined();
    expect(formatTrackLength(Number.POSITIVE_INFINITY)).toBeUndefined();
  });
});

describe('editing a tracklist that came with playing times', () => {
  const lookedUp = [
    { position: 1, title: 'One More Time', lengthMs: 320840 },
    { position: 2, title: 'Aerodynamic', lengthMs: 207533 },
  ];

  it('keeps a track’s time when the edit left its title alone', () => {
    // Otherwise the first keystroke in the textarea silently strips every
    // duration off a looked-up Release, and the Back Card loses a column.
    const edited = parseTracklist('One More Time\nAerodynamique', lookedUp);

    expect(edited[0]).toEqual({ position: 1, title: 'One More Time', lengthMs: 320840 });
    expect(edited[1]).toEqual({ position: 2, title: 'Aerodynamique' });
  });

  it('follows the title rather than the position', () => {
    // A line inserted at the top moves every position by one; the times belong
    // to the tracks, not to the row numbers.
    const edited = parseTracklist('Intro\nOne More Time\nAerodynamic', lookedUp);

    expect(edited.map((track) => track.lengthMs)).toEqual([undefined, 320840, 207533]);
  });

  it('gives two tracks of the same title the first one’s time', () => {
    // The rule the doc-block states: a list with "Untitled" twice is real, and
    // being consistent about it beats guessing which one moved where.
    const twice = [
      { position: 1, title: 'Untitled', lengthMs: 1000 },
      { position: 2, title: 'Untitled', lengthMs: 2000 },
    ];

    expect(parseTracklist('Untitled\nUntitled', twice).map((track) => track.lengthMs)).toEqual([
      1000, 1000,
    ]);
  });

  it('has nothing to carry when the Release never had times', () => {
    expect(parseTracklist('Only Track')).toEqual([{ position: 1, title: 'Only Track' }]);
  });
});

describe('how long the whole Release runs', () => {
  it('adds the tracks up when every one of them has a time', () => {
    expect(
      totalTrackLength([
        { position: 1, title: 'One More Time', lengthMs: 320840 },
        { position: 2, title: 'Aerodynamic', lengthMs: 207533 },
      ]),
    ).toBe(528373);
  });

  it('has no total at all when one track is missing its time', () => {
    // A sum over the tracks that happen to have times is a smaller number
    // presented as the running time, and nothing on the Part could say which
    // it was. Better to print no total than a wrong one.
    expect(
      totalTrackLength([
        { position: 1, title: 'One More Time', lengthMs: 320840 },
        { position: 2, title: 'Aerodynamic' },
      ]),
    ).toBeUndefined();
  });

  it('has no total for a Release with no tracks', () => {
    expect(totalTrackLength([])).toBeUndefined();
  });

  it('refuses a length that is not a number, exactly as one track does', () => {
    expect(totalTrackLength([{ position: 1, title: 'Broken', lengthMs: Number.NaN }])).toBeUndefined();
  });

  it('formats past an hour, which is what a full disc does', () => {
    const disc = Array.from({ length: 20 }, (_, index) => ({
      position: index + 1,
      title: `Track ${index + 1}`,
      lengthMs: 240_000,
    }));

    expect(formatTrackLength(totalTrackLength(disc))).toBe('1:20:00');
  });
});
