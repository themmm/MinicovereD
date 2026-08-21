import { describe, expect, it } from 'vitest';

import { formatTracklist, parseTracklist } from './tracklist.ts';

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
