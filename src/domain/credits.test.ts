import { describe, expect, it } from 'vitest';

import {
  describeCredits,
  formatCredits,
  hasCredits,
  parseCredits,
  withArrivedCredits,
} from './credits.ts';
import type { Credits, Release } from './release.ts';

/** What a lookup leaves behind: three credits and the facts that came with them. */
const arrived: Credits = {
  people: [
    { role: 'Producer', name: 'Stock, Aitken & Waterman' },
    { role: 'Engineer', name: 'Mike Duffy' },
    { role: 'Design', name: 'Me Company' },
  ],
  label: 'RCA',
  catalogNumber: 'PB 41447',
  country: 'UK',
  year: '1987',
  genres: ['Electronic', 'Pop'],
  styles: ['Synth-pop'],
};

const release = (fields: Partial<Release> = {}): Release => ({
  id: 'r1',
  artist: 'Rick Astley',
  album: 'Never Gonna Give You Up',
  tracks: [],
  ...fields,
});

describe('editing credits by hand', () => {
  it('reads one credit per line, as Role — Name', () => {
    expect(parseCredits('Producer — Mike Stock\nEngineer — Mike Duffy').people).toEqual([
      { role: 'Producer', name: 'Mike Stock' },
      { role: 'Engineer', name: 'Mike Duffy' },
    ]);
  });

  it('takes every dash people paste, and a tab', () => {
    const text = ['Producer – Mike Stock', 'Engineer − Mike Duffy', 'Design\tMe Company'].join('\n');

    expect(parseCredits(text).people).toEqual([
      { role: 'Producer', name: 'Mike Stock' },
      { role: 'Engineer', name: 'Mike Duffy' },
      { role: 'Design', name: 'Me Company' },
    ]);
  });

  it('trims what it read, wherever the spaces were', () => {
    // The line arrives untrimmed on purpose — a trailing space is part of the
    // separator — so the trimming has to happen to each half instead.
    const text = '   Producer   —   Mike Stock   \nDesign\t  Me Company';

    expect(parseCredits(text).people).toEqual([
      { role: 'Producer', name: 'Mike Stock' },
      { role: 'Design', name: 'Me Company' },
    ]);
  });

  it('keeps a hyphenated role and a hyphenated name whole', () => {
    // Only a *spaced* dash separates, which is the whole reason the search
    // field can read `Jean-Michel Jarre` as one artist.
    expect(parseCredits('Written-By — Jean-Michel Jarre').people).toEqual([
      { role: 'Written-By', name: 'Jean-Michel Jarre' },
    ]);
  });

  it('reads a line with no separator as a name with no role', () => {
    // A sleeve's photography block is a list of names, and making the collector
    // invent a role to satisfy a parser is not what that field is for.
    expect(parseCredits('Anton Corbijn').people).toEqual([{ role: '', name: 'Anton Corbijn' }]);
  });

  it('drops a role nobody filled in, and blank lines', () => {
    expect(parseCredits('Producer — \n\n   \nEngineer — Mike Duffy').people).toEqual([
      { role: 'Engineer', name: 'Mike Duffy' },
    ]);
  });

  it('keeps the release facts through an edit that cannot show them', () => {
    // The same trap the tracklist has with playing times: the textarea shows a
    // role and a name, so the label, the catalogue number, the country, the
    // year, the genres and the styles are gone on the first keystroke unless
    // they are carried across.
    const edited = parseCredits('Producer — Mike Stock', arrived);

    expect(edited).toEqual({ ...arrived, people: [{ role: 'Producer', name: 'Mike Stock' }] });
  });

  it('keeps the facts even when every credit is deleted', () => {
    expect(parseCredits('', arrived)).toEqual({ ...arrived, people: [] });
  });

  it('starts from nothing when nothing arrived', () => {
    expect(parseCredits('Producer — Mike Stock')).toEqual({
      people: [{ role: 'Producer', name: 'Mike Stock' }],
      genres: [],
      styles: [],
    });
  });

  it('puts a parsed block back the way it was typed', () => {
    const typed = 'Producer — Stock, Aitken & Waterman\nEngineer — Mike Duffy\nDesign — Me Company';

    expect(formatCredits(parseCredits(typed).people)).toBe(typed);
  });

  it('writes a credit with no role as the bare name it was read from', () => {
    expect(formatCredits(parseCredits('Anton Corbijn').people)).toBe('Anton Corbijn');
  });
});

describe('whether there is a credits block at all', () => {
  it('is nothing when it holds nothing', () => {
    expect(hasCredits({ people: [], genres: [], styles: [] })).toBe(false);
  });

  it('is something when it holds any one thing', () => {
    const nothing: Credits = { people: [], genres: [], styles: [] };

    expect(hasCredits({ ...nothing, people: [{ role: '', name: 'Somebody' }] })).toBe(true);
    expect(hasCredits({ ...nothing, label: 'RCA' })).toBe(true);
    expect(hasCredits({ ...nothing, catalogNumber: 'PB 41447' })).toBe(true);
    expect(hasCredits({ ...nothing, country: 'UK' })).toBe(true);
    expect(hasCredits({ ...nothing, year: '1987' })).toBe(true);
    expect(hasCredits({ ...nothing, genres: ['Pop'] })).toBe(true);
    expect(hasCredits({ ...nothing, styles: ['Synth-pop'] })).toBe(true);
  });
});

describe('saying what arrived', () => {
  it('opens the way ADR-0013’s example does', () => {
    // Country and year are one fact about one pressing, so they are joined by a
    // space rather than by a separator.
    expect(describeCredits(arrived)).toBe('RCA · PB 41447 · UK 1987 · Electronic · Pop · Synth-pop');
  });

  it('says only what it knows', () => {
    expect(describeCredits({ people: [], genres: [], styles: [], year: '1987' })).toBe('1987');
    expect(describeCredits({ people: [], genres: [], styles: [] })).toBe('');
  });
});

describe('credits arriving after the Release', () => {
  it('fills a hole', () => {
    expect(withArrivedCredits(release(), arrived).credits).toEqual(arrived);
  });

  it('never overwrites what is already there, whoever put it there', () => {
    // The collector's own typing, or an earlier answer. Either way a second
    // source replying two seconds late is not a reason to replace it — the rule
    // `project-arrival.ts` states about a whole Project, at the scale of a field.
    const mine: Credits = { people: [{ role: 'Producer', name: 'Me' }], genres: [], styles: [] };
    const current = release({ credits: mine });

    expect(withArrivedCredits(current, arrived)).toBe(current);
  });

  it('touches nothing else about the Release', () => {
    const current = release({ year: '1988', notes: 'Capitol · ST-103' });

    const after = withArrivedCredits(current, arrived);

    // The precedence in one assertion: the fields the collector can edit are
    // not Discogs' to write, and the facts it does know sit beside them.
    expect(after.year).toBe('1988');
    expect(after.notes).toBe('Capitol · ST-103');
    expect(after.credits?.year).toBe('1987');
    expect(after.credits?.label).toBe('RCA');
  });
});
