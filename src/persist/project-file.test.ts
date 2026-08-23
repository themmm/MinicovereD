import { describe, expect, it } from 'vitest';

import { A4, LETTER } from '../domain/paper.ts';
import { DEFAULT_PART_DIMENSIONS, PART_KINDS } from '../domain/parts.ts';
import { DEFAULT_MEASUREMENTS } from '../domain/measurements.ts';
import type { Measurements } from '../domain/measurements.ts';
import { readyEntry, unfinishedEntry } from '../queue/release-queue.ts';
import { DEFAULT_TEMPLATE_PARAMS } from '../render/sheet-renderer.ts';
import type { ReleaseDesign, SheetConfig } from '../render/sheet-renderer.ts';
import { PROJECT_FORMAT, PROJECT_VERSION, readProjectFile, writeProjectFile } from './project-file.ts';
import type { Project } from './project-file.ts';

const design: ReleaseDesign = {
  release: {
    id: 'r1',
    artist: 'Glen Campbell',
    album: 'Wichita Lineman',
    year: '1968',
    notes: 'Capitol · ST-103',
    tracks: [
      { position: 1, title: 'Wichita Lineman', lengthMs: 187_000 },
      { position: 2, title: '東京は夜の七時' },
    ],
    artwork: { dataUrl: 'data:image/png;base64,AAAA', widthPx: 600, heightPx: 400 },
    // A looked-up Release carries its Discogs link and whatever credits came
    // back, and "every Release exactly as it went in" has to mean these too.
    discogsId: 249504,
    credits: {
      people: [
        { role: 'Producer', name: 'Al De Lory' },
        { role: '', name: 'Carol Kaye' },
      ],
      label: 'Capitol Records',
      catalogNumber: 'ST-103',
      country: 'US',
      year: '1968',
      genres: ['Pop'],
      styles: ['Country'],
    },
  },
  templateId: 'fullbleed',
  params: { ...DEFAULT_TEMPLATE_PARAMS, accentColor: '#7c2d12', showLogo: false, insetArtwork: true },
};

const sheet: SheetConfig = { paper: LETTER, marginMm: 7.5, parts: ['insert', 'label'] };

/** A collector who has nudged their Label away from both presets. */
const measurements: Measurements = {
  dimensions: {
    ...DEFAULT_PART_DIMENSIONS,
    label: { width: 36.4, height: 53.1, notch: false, notchSize: 6 },
  },
};

/** A Release the lookup never found: what was typed, and nothing else. */
const design2: ReleaseDesign = {
  release: { id: 'r2', artist: 'Zzzqqxx Nonexistent', album: 'No Such Album', tracks: [] },
  templateId: 'classic',
  params: DEFAULT_TEMPLATE_PARAMS,
};

/**
 * A version-1 project document, as v1.0 wrote one.
 *
 * Built by hand rather than recorded, because the app can no longer produce
 * one. Its `params` is v1.0's whole `TemplateParams` — the five keys that
 * existed then, `insetArtwork` absent because the parameter did not — and its
 * Part sizes sit inside each design. There is no top-level `measurements`
 * block, because that key arrived with version 2.
 *
 * The `dimensions` block is optional per design only so that the collapse rule
 * can be tested against a Design that states nothing; a real v1 file wrote one
 * on every design, so a real v1 file always resolves to the first.
 */
const versionOneFile = (
  labels: ReadonlyArray<Record<string, unknown> | undefined> = [
    { width: 34.6, height: 52.4, notch: true, notchSize: 5 },
  ],
): Record<string, unknown> => ({
  format: PROJECT_FORMAT,
  version: 1,
  designs: labels.map((label, index) => ({
    release: { id: `r${index + 1}`, artist: 'Glen Campbell', album: 'Wichita Lineman', tracks: [] },
    templateId: 'classic',
    params: {
      paperColor: '#ffffff',
      inkColor: '#141414',
      accentColor: '#1f2933',
      showOverlayText: true,
      showLogo: true,
    },
    ...(label ? { dimensions: { ...DEFAULT_PART_DIMENSIONS, label } } : {}),
  })),
  sheet: { paperId: 'a4', marginMm: 5, parts: PART_KINDS },
});

/** Most of these tests care about the designs, not which entry carries them. */
const designsOf = (project: Project): ReleaseDesign[] =>
  project.entries.map((entry) => entry.design);

/** Writing a project, for the tests that are not about how one is assembled. */
const write = (
  entries = [readyEntry(design)],
  config = sheet,
  nudged = measurements,
): string => writeProjectFile({ entries, sheet: config, measurements: nudged });

const roundTrip = (designs = [design], config = sheet, nudged = measurements) => {
  const result = readProjectFile(write(designs.map(readyEntry), config, nudged));
  if (!result.ok) throw new Error(`expected a valid project file, got: ${result.error}`);
  return { ...result.project, designs: designsOf(result.project) };
};

describe('writing a project file', () => {
  it('is JSON that says what it is and which version it is', () => {
    const parsed = JSON.parse(write()) as Record<string, unknown>;

    expect(parsed['format']).toBe(PROJECT_FORMAT);
    expect(parsed['version']).toBe(PROJECT_VERSION);
  });

  it('carries the artwork inside it, so the file is the whole design', () => {
    expect(write()).toContain('data:image/png;base64,AAAA');
  });

  it('writes the measurements once, beside the Sheet, and inside no design', () => {
    // Asserted against the JSON rather than against what comes back, because
    // the reader cannot put `dimensions` on a Design any more — so a writer
    // still emitting one would round-trip clean, and every file would carry a
    // per-design block that only a version-1 document is ever read for.
    const parsed = JSON.parse(write()) as {
      designs: Array<Record<string, unknown>>;
      measurements: { dimensions: { label: Record<string, unknown> } };
    };

    expect(parsed.measurements.dimensions.label).toEqual({
      width: 36.4,
      height: 53.1,
      notch: false,
      notchSize: 6,
    });
    expect(parsed.designs.some((design) => 'dimensions' in design)).toBe(false);
  });
});

describe('reading a project file back', () => {
  it('returns every Release exactly as it went in', () => {
    const { designs } = roundTrip();

    expect(designs).toEqual([design]);
  });

  it('keeps Unicode intact through the round trip', () => {
    const { designs } = roundTrip();

    expect(designs[0]?.release.tracks[1]?.title).toBe('東京は夜の七時');
  });

  it('carries each track’s playing time, and the absence of one', () => {
    // A saved project has to reproduce its own design (ADR-0001), and from v1.1
    // the Back Card sets a duration column — a reader that dropped the times
    // would reopen the file as a different Part.
    const { designs } = roundTrip();

    expect(designs[0]?.release.tracks[0]?.lengthMs).toBe(187_000);
    expect(designs[0]?.release.tracks[1]).not.toHaveProperty('lengthMs');
  });

  it('refuses a playing time that is not one', () => {
    const written = JSON.parse(write()) as {
      designs: Array<{ release: { tracks: Array<Record<string, unknown>> } }>;
    };
    const tracks = written.designs[0]?.release.tracks ?? [];
    if (tracks[0]) tracks[0]['lengthMs'] = 'four minutes';
    if (tracks[1]) tracks[1]['lengthMs'] = -5;

    const result = readProjectFile(JSON.stringify(written));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    const restored = designsOf(result.project)[0]?.release.tracks ?? [];
    expect(restored[0]).not.toHaveProperty('lengthMs');
    expect(restored[1]).not.toHaveProperty('lengthMs');
  });

  it('reopens a design saved before the artwork could bleed as the square it was', () => {
    // v1.0 and v1.1 files both carry version 1, so the version cannot separate
    // those two — but every v1.1 file states `insetArtwork`, so only a v1.0 file
    // omits it. Inside version 1, reading the absence as "square" is what makes
    // a saved project reproduce its own design across the change.
    const result = readProjectFile(JSON.stringify(versionOneFile()));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(designsOf(result.project)[0]?.params.insetArtwork).toBe(true);
  });

  it('gives a version-2 file that omits the same key the default instead', () => {
    // The tell above is a v1.0 convention and does not travel forward. This app
    // writes the key into every version-2 file, so a version-2 file without one
    // was written by something else and states nothing about a square — and
    // guessing "square" for it would be reading a convention into a document
    // that predates nothing.
    const written = JSON.parse(write()) as {
      version: number;
      designs: Array<{ params: Record<string, unknown> }>;
    };
    expect(written.version).toBe(2);
    delete written.designs[0]?.params['insetArtwork'];

    const result = readProjectFile(JSON.stringify(written));

    if (!result.ok) throw new Error(result.error);
    // The literal, not `DEFAULT_TEMPLATE_PARAMS.insetArtwork`: reading the
    // expectation out of the thing under test would let a flipped default make
    // this pass against the version-1 branch as well.
    expect(designsOf(result.project)[0]?.params.insetArtwork).toBe(false);
  });

  it('keeps a bleeding Front Panel bleeding, which the fallback must not overrule', () => {
    // The other half: `false` is the value a v1.1 file has to be able to state,
    // and a fallback of `true` reached by `??` rather than by a type check
    // would swallow it.
    const bleeding = { ...design, params: { ...design.params, insetArtwork: false } };
    const result = readProjectFile(write([readyEntry(bleeding)]));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(designsOf(result.project)[0]?.params.insetArtwork).toBe(false);
  });

  it('carries a Page count the collector set through a whole round trip', () => {
    // Written only when set, so a project whose Inserts follow their content
    // reads the same as one written before the override existed — and read back
    // when it is there, or reopening the file would quietly re-derive a count the
    // collector had overruled.
    const forced: ReleaseDesign = { ...design, pageCount: 2 };
    const { designs } = roundTrip([forced, design2]);

    expect(designs[0]?.pageCount).toBe(2);
    expect(designs[1]?.pageCount).toBeUndefined();
  });

  it('writes no Page count for a Design that never overrode one', () => {
    // The absence is the ordinary case and has to stay absent in the file: a
    // written-out 2 would freeze today's derived answer into a document that
    // should still follow its content when it is next opened.
    expect(JSON.parse(write())).toMatchObject({ designs: [{}] });
    expect(write()).not.toContain('pageCount');
  });

  it('restores the Sheet configuration, paper and all', () => {
    const { sheet: restored } = roundTrip();

    expect(restored.paper.id).toBe('letter');
    expect(restored.marginMm).toBe(7.5);
    expect(restored.parts).toEqual(['insert', 'label']);
  });

  it('restores an adjusted Label, once, for the whole project', () => {
    const { measurements: restored, designs } = roundTrip([design, design2]);

    expect(restored.dimensions.label).toEqual({
      width: 36.4,
      height: 53.1,
      notch: false,
      notchSize: 6,
    });
    // One block for two Releases: from version 2 the measurements belong to the
    // project, so two Releases cannot come back wanting two different stickers.
    // Both Releases have to be there for that to mean anything.
    expect(designs.map((each) => each.release.id)).toEqual(['r1', 'r2']);
  });

  it('restores a Template’s own parameters', () => {
    const { designs } = roundTrip();

    expect(designs[0]?.templateId).toBe('fullbleed');
    expect(designs[0]?.params.accentColor).toBe('#7c2d12');
    expect(designs[0]?.params.showLogo).toBe(false);
    expect(designs[0]?.params.insetArtwork).toBe(true);
  });

  it('carries a Template the file format never heard of when it was written', () => {
    // Minimal was added after 1.0 shipped, and `PROJECT_VERSION` did not move
    // for it: the reader takes any id the registry holds, so a third Template
    // costs the format nothing. Free is not the same as covered.
    const minimal = { ...design, templateId: 'minimal' as const };

    expect(roundTrip([minimal]).designs[0]?.templateId).toBe('minimal');
  });

  it('carries a whole queue, in order', () => {
    const queue = ['a', 'b', 'c'].map((id) => ({
      ...design,
      release: { ...design.release, id, album: `Album ${id}` },
    }));

    expect(roundTrip(queue).designs.map((entry) => entry.release.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('an entry that still needs completing by hand', () => {
  it('comes back still flagged, because that flag is the collector’s to-do list', () => {
    const text = write([readyEntry(design), unfinishedEntry(design2)]);
    const result = readProjectFile(text);

    if (!result.ok) throw new Error(result.error);
    expect(result.project.entries.map((entry) => entry.status)).toEqual(['ready', 'failed']);
  });

  it('does not carry the reason across, which was true of one moment only', () => {
    const failed = { ...unfinishedEntry(design2), error: 'Nothing on MusicBrainz matched.' };
    const result = readProjectFile(write([failed]));

    if (!result.ok) throw new Error(result.error);
    // Tomorrow the network is fine and the album may well be there. A stale
    // cause shown as a current one is worse than none.
    expect(result.project.entries[0]?.status).toBe('failed');
    expect(result.project.entries[0]?.error).toBeUndefined();
    expect(write([failed])).not.toContain('MusicBrainz');
  });

  it('writes nothing extra for an ordinary Release', () => {
    expect(write()).not.toContain('needsCompleting');
  });

  it('reads a project written before the flag existed as work that is finished', () => {
    const older = JSON.stringify({
      format: PROJECT_FORMAT,
      version: PROJECT_VERSION,
      designs: [{ release: { id: 'r1', artist: 'Someone', album: 'Untitled', tracks: [] } }],
      sheet: { paperId: 'a4', marginMm: 5, parts: PART_KINDS },
    });
    const result = readProjectFile(older);

    if (!result.ok) throw new Error(result.error);
    expect(result.project.entries[0]?.status).toBe('ready');
  });
});

describe('reading a project file that is not one', () => {
  const failure = (text: string): string => {
    const result = readProjectFile(text);
    if (result.ok) throw new Error('expected this file to be rejected');
    return result.error;
  };

  it('says so when the file is not JSON at all', () => {
    expect(failure('<html>404</html>')).toMatch(/not.*json|could not be read/i);
  });

  it('says so when the JSON is not a project file', () => {
    expect(failure(JSON.stringify({ hello: 'world' }))).toMatch(/minicovered project/i);
  });

  it('takes a version-1 project’s Part sizes as the whole project’s measurements', () => {
    // v1 kept them inside each Design. There is one place for them now, and a
    // collector who nudged their Label to 34.6 × 52.4 must not reopen tomorrow
    // to find 35 × 52.5 — a second silent loss of saved work would be a pattern
    // rather than an accident (ADR-0012).
    const result = readProjectFile(JSON.stringify(versionOneFile()));

    if (!result.ok) throw new Error(result.error);
    expect(result.project.measurements.dimensions.label).toEqual({
      width: 34.6,
      height: 52.4,
      notch: true,
      notchSize: 5,
    });
  });

  it('collapses a version-1 project whose Releases disagree onto the first of them', () => {
    // Which really happens: v1's Label control wrote to the selected Release
    // and to nothing else, so a v1 project can hold a Label per Release. There
    // is no shape left to express that in — that being the point of the version
    // — and the first Release is the one selected after an import, so it is the
    // one whose Parts the collector is looking at when they judge whether the
    // measurements survived.
    const result = readProjectFile(
      JSON.stringify(
        versionOneFile([
          undefined,
          undefined,
          { width: 34.6, height: 52.4, notch: true, notchSize: 5 },
          { width: 38, height: 54, notch: false, notchSize: 6 },
        ]),
      ),
    );

    if (!result.ok) throw new Error(result.error);
    // Two Designs state nothing, so the rule cannot be read as "the second one":
    // the first that states anything wins, and an absent block is not a
    // measurement of zero.
    expect(result.project.measurements.dimensions.label.width).toBe(34.6);
  });

  it('prefers the project’s own block to a stale one left inside a Design', () => {
    // Nothing this app writes looks like this — version 2 stopped writing the
    // per-design block — but a hand-merged file can, and which of the two the
    // reader believes must not depend on which branch happens to run first.
    const file = versionOneFile();
    file['version'] = PROJECT_VERSION;
    file['measurements'] = {
      dimensions: { label: { width: 31, height: 49, notch: false, notchSize: 0 } },
    };

    const result = readProjectFile(JSON.stringify(file));

    if (!result.ok) throw new Error(result.error);
    expect(result.project.measurements.dimensions.label.width).toBe(31);
  });

  it('reads a project with no version at all as a version-1 one', () => {
    // `asNumber(parsed['version'], 0)` makes an absent or stringified version
    // zero, and zero is a version-1 document by every rule that reads one. It
    // matters now that the version decides something: a file with no version
    // must keep the v1.0 square-artwork tell rather than picking up the bleed.
    const file = versionOneFile();
    delete file['version'];

    const result = readProjectFile(JSON.stringify(file));

    if (!result.ok) throw new Error(result.error);
    expect(designsOf(result.project)[0]?.params.insetArtwork).toBe(true);
    expect(result.project.measurements.dimensions.label.width).toBe(34.6);
  });

  it('falls back to the defaults for a version-1 project that never stated any', () => {
    // This is also the one path that reaches `DEFAULT_MEASUREMENTS` from a test,
    // so the numbers are written out rather than compared against the constant.
    // `expect(...).toEqual(DEFAULT_MEASUREMENTS)` passes whatever that constant
    // says, and it is the Label every new session starts on.
    const result = readProjectFile(JSON.stringify(versionOneFile([undefined, undefined])));

    if (!result.ok) throw new Error(result.error);
    expect(result.project.measurements).toEqual(DEFAULT_MEASUREMENTS);
    expect(DEFAULT_MEASUREMENTS.dimensions.label).toEqual({
      width: 35,
      height: 52.5,
      notch: true,
      notchSize: 6,
    });
  });

  it('says so when the file comes from a newer version', () => {
    const future = JSON.stringify({ format: PROJECT_FORMAT, version: 99, designs: [], sheet: {} });

    expect(failure(future)).toMatch(/newer version/i);
  });

  it('says so, and which one, when a Release has no id to be identified by', () => {
    const broken = JSON.stringify({
      format: PROJECT_FORMAT,
      version: PROJECT_VERSION,
      designs: [
        { release: { id: 'r1', tracks: [] }, templateId: 'classic' },
        { release: { artist: 'Nameless', tracks: [] }, templateId: 'classic' },
      ],
      sheet: { paperId: 'a4', marginMm: 5, parts: ['jcard'] },
    });

    // Parts find their Release by id, so one without an id cannot be printed.
    expect(failure(broken)).toMatch(/release 2/i);
    expect(failure(broken)).toMatch(/no id/i);
  });

  it('says so when a Release is not an object at all', () => {
    const broken = JSON.stringify({
      format: PROJECT_FORMAT,
      version: PROJECT_VERSION,
      designs: [{ release: 'Wichita Lineman', templateId: 'classic' }],
      sheet: { paperId: 'a4', marginMm: 5, parts: ['jcard'] },
    });

    expect(failure(broken)).toMatch(/release 1 is not a release/i);
  });

  it('accepts a Release with no tracks yet, which is a real thing to save', () => {
    const empty = JSON.stringify({
      format: PROJECT_FORMAT,
      version: PROJECT_VERSION,
      designs: [{ release: { id: 'r1', artist: 'Someone', album: 'Untitled' } }],
      sheet: { paperId: 'a4', marginMm: 5, parts: ['jcard'] },
    });
    const result = readProjectFile(empty);

    if (!result.ok) throw new Error(result.error);
    expect(designsOf(result.project)[0]?.release.tracks).toEqual([]);
  });

  it('says so when the file is truncated mid-write', () => {
    const whole = write();

    expect(failure(whole.slice(0, Math.floor(whole.length / 2)))).toMatch(/could not be read|json/i);
  });

  it('names the paper it does not know, rather than guessing', () => {
    const odd = JSON.stringify({
      format: PROJECT_FORMAT,
      version: PROJECT_VERSION,
      designs: [],
      sheet: { paperId: 'a3', marginMm: 5, parts: ['jcard'] },
    });

    expect(failure(odd)).toMatch(/a3/);
  });
});

describe('reading a project file with values that would break a render', () => {
  const project = (patch: (base: Record<string, unknown>) => void): string => {
    const base = JSON.parse(write()) as Record<string, unknown>;
    patch(base);
    return JSON.stringify(base);
  };

  it('reads a version-1 J-Card block as the Insert’s first four measurements', () => {
    // Four of the Insert's five are the J-Card's own numbers under a new name —
    // the same lengths measured off the same case (ADR-0012 keeps all three
    // panels) — so a v1 collector's nudged J-Card survives the format break
    // rather than being discarded for the defaults.
    const text = project((base) => {
      base['version'] = 1;
      delete base['measurements'];
      const designs = base['designs'] as Array<Record<string, unknown>>;
      (designs[0] as Record<string, unknown>)['dimensions'] = {
        jcard: { innerFlapWidth: 13, spineWidth: 5, frontPanelWidth: 67, height: 78 },
        backCard: { width: 68, height: 78 },
        label: { width: 34.5, height: 52, notch: true, notchSize: 5.5 },
      };
    });
    const result = readProjectFile(text);

    if (!result.ok) throw new Error(result.error);
    expect(result.project.measurements.dimensions.insert).toEqual({
      innerFlapWidth: 13,
      spineWidth: 5,
      frontPanelWidth: 67,
      // No v1 source for this one — there were no Pages — so it takes the default.
      pageWidth: 65,
      height: 78,
    });
    // And the Back Card's 69 mm width is deliberately not read: it has no
    // counterpart on the strip, whose Pages are 65 by the case rather than 69 by
    // the old rectangle.
    expect(result.project.measurements.dimensions.insert.pageWidth).toBe(65);
  });

  it('refuses a Page count a file states that could not be folded', () => {
    // Even, at least two, at most four — and anything else is *no* override
    // rather than a clamped one. A file saying 3 did not come from this app, and
    // guessing which of 2 and 4 it meant would invent a decision.
    for (const pageCount of [3, 1, 0, -2, 6, 2.5, 'four']) {
      const text = project((base) => {
        const designs = base['designs'] as Array<Record<string, unknown>>;
        (designs[0] as Record<string, unknown>)['pageCount'] = pageCount;
      });
      const result = readProjectFile(text);

      if (!result.ok) throw new Error(result.error);
      expect(designsOf(result.project)[0]?.pageCount, `pageCount ${pageCount}`).toBeUndefined();
    }
  });

  it('keeps a Page count a file states that could be folded', () => {
    for (const pageCount of [2, 4]) {
      const text = project((base) => {
        const designs = base['designs'] as Array<Record<string, unknown>>;
        (designs[0] as Record<string, unknown>)['pageCount'] = pageCount;
      });
      const result = readProjectFile(text);

      if (!result.ok) throw new Error(result.error);
      expect(designsOf(result.project)[0]?.pageCount).toBe(pageCount);
    }
  });

  it('holds the Page width to its own range rather than to any Part’s', () => {
    // A Page is what makes the strip long — at four Pages every millimetre here
    // is three on the paper — so it has a floor of 30 and a ceiling of 80 where
    // the other measurements are clamped to 1–300.
    for (const [asked, expected] of [
      [5, 30],
      [500, 80],
      [62.5, 62.5],
    ] as const) {
      const text = project((base) => {
        const measurements = base['measurements'] as Record<string, Record<string, Record<string, unknown>>>;
        measurements['dimensions']!['insert']!['pageWidth'] = asked;
      });
      const result = readProjectFile(text);

      if (!result.ok) throw new Error(result.error);
      expect(result.project.measurements.dimensions.insert.pageWidth, `asked ${asked}`).toBe(expected);
    }
  });

  it('falls back to a safe colour rather than trusting the file', () => {
    const text = project((base) => {
      const designs = base['designs'] as Array<Record<string, Record<string, unknown>>>;
      (designs[0] as { params: Record<string, unknown> }).params['inkColor'] =
        '"/><script>alert(1)</script>';
    });
    const result = readProjectFile(text);

    if (!result.ok) throw new Error(result.error);
    expect(designsOf(result.project)[0]?.params.inkColor).not.toContain('<script');
  });

  it('falls back to Classic for a Template this version does not have', () => {
    // The guard is `Object.hasOwn(TEMPLATES, id)`, and it has to keep holding
    // now that the registry has three entries rather than two — an id that only
    // a later version knows must open as a design, not as `undefined`.
    const text = project((base) => {
      const designs = base['designs'] as Array<Record<string, unknown>>;
      if (designs[0]) designs[0]['templateId'] = 'letterpress';
    });
    const result = readProjectFile(text);

    if (!result.ok) throw new Error(result.error);
    expect(designsOf(result.project)[0]?.templateId).toBe('classic');
  });

  it('clamps a margin that would leave no printable area', () => {
    const text = project((base) => {
      (base['sheet'] as Record<string, unknown>)['marginMm'] = 500;
    });
    const result = readProjectFile(text);

    if (!result.ok) throw new Error(result.error);
    expect(result.project.sheet.marginMm).toBeLessThan(A4.width / 2);
  });

  it('drops a Part toggle it does not recognise instead of packing it', () => {
    const text = project((base) => {
      (base['sheet'] as Record<string, unknown>)['parts'] = ['insert', 'sleeve', 'label'];
    });
    const result = readProjectFile(text);

    if (!result.ok) throw new Error(result.error);
    expect(result.project.sheet.parts).toEqual(['insert', 'label']);
    expect(result.project.sheet.parts.every((part) => PART_KINDS.includes(part))).toBe(true);
  });

  it('collapses a version-1 file’s J-Card and Back Card into the one Insert', () => {
    // ADR-0012's own migration sentence: a v1 Design has exactly one J-Card and
    // one Back Card, which is exactly a two-Page Insert.
    const text = project((base) => {
      (base['sheet'] as Record<string, unknown>)['parts'] = ['jcard', 'back-card', 'label'];
    });
    const result = readProjectFile(text);

    if (!result.ok) throw new Error(result.error);
    expect(result.project.sheet.parts).toEqual(['insert', 'label']);
  });

  it('does not turn a J-Cards-only job into everything', () => {
    // The one case where mapping the old names beats filtering them out. Filtered,
    // this list would come back empty, fall through to "keep at least one Part"
    // and hand the collector Labels they switched off.
    const text = project((base) => {
      (base['sheet'] as Record<string, unknown>)['parts'] = ['jcard'];
    });
    const result = readProjectFile(text);

    if (!result.ok) throw new Error(result.error);
    expect(result.project.sheet.parts).toEqual(['insert']);
  });

  it('keeps at least one Part, so a restored project can still print', () => {
    const text = project((base) => {
      (base['sheet'] as Record<string, unknown>)['parts'] = ['nonsense'];
    });
    const result = readProjectFile(text);

    if (!result.ok) throw new Error(result.error);
    expect(result.project.sheet.parts.length).toBeGreaterThan(0);
  });
});

describe('reading a project file built to break things', () => {
  const read = (value: unknown) => readProjectFile(JSON.stringify(value));

  it('refuses two Releases that share an id', () => {
    // Parts find their Release by id, so a duplicate prints the same content
    // twice — the renderer already refuses it; the reader should say so first.
    const result = read({
      format: PROJECT_FORMAT,
      version: PROJECT_VERSION,
      designs: [
        { release: { id: 'same', tracks: [] } },
        { release: { id: 'same', tracks: [] } },
      ],
      sheet: { paperId: 'a4', marginMm: 5, parts: PART_KINDS },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/share the id "same"/);
  });

  it('does not let a __proto__ key reach anything it touches', () => {
    const result = read({
      format: PROJECT_FORMAT,
      version: PROJECT_VERSION,
      designs: [{ release: { id: 'r1', tracks: [], __proto__: { polluted: true } } }],
      sheet: { paperId: 'a4', marginMm: 5, parts: PART_KINDS },
    });

    expect(result.ok).toBe(true);
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    if (result.ok) expect(Object.hasOwn(designsOf(result.project)[0]!.release, 'polluted')).toBe(false);
  });

  it('ignores numbers that are not numbers', () => {
    const result = read({
      format: PROJECT_FORMAT,
      version: PROJECT_VERSION,
      designs: [{ release: { id: 'r1', tracks: [{ position: 'first', title: 'One' }] } }],
      sheet: { paperId: 'a4', marginMm: 'wide', parts: PART_KINDS },
      measurements: { dimensions: { label: { width: null, height: 'tall', notch: 'yes', notchSize: -3 } } },
    });

    if (!result.ok) throw new Error(result.error);
    const [first] = designsOf(result.project);
    expect(first?.release.tracks[0]?.position).toBe(1);
    expect(result.project.measurements.dimensions.label.width).toBe(35);
    expect(result.project.measurements.dimensions.label.notchSize).toBe(0);
    expect(result.project.sheet.marginMm).toBe(5);
  });

  it('drops artwork that points anywhere but at itself', () => {
    const result = read({
      format: PROJECT_FORMAT,
      version: PROJECT_VERSION,
      designs: [
        {
          release: {
            id: 'r1',
            tracks: [],
            // A project file must not be able to make the app fetch a URL.
            artwork: { dataUrl: 'https://example.invalid/cover.jpg', widthPx: 500, heightPx: 500 },
          },
        },
      ],
      sheet: { paperId: 'a4', marginMm: 5, parts: PART_KINDS },
    });

    if (!result.ok) throw new Error(result.error);
    expect(designsOf(result.project)[0]?.release.artwork).toBeUndefined();
  });

  it('drops a credit with nobody in it, and a block with nothing in it', () => {
    const result = read({
      format: PROJECT_FORMAT,
      version: PROJECT_VERSION,
      designs: [
        {
          release: {
            id: 'r1',
            tracks: [],
            credits: {
              people: [{ role: 'Producer' }, 'Carol Kaye', { role: 'Engineer', name: ' Mike Duffy ' }],
              genres: ['Pop', '', 42],
              label: '   ',
            },
          },
        },
        { release: { id: 'r2', tracks: [], credits: { people: [{ name: '' }], genres: [] } } },
      ],
      sheet: { paperId: 'a4', marginMm: 5, parts: PART_KINDS },
    });

    if (!result.ok) throw new Error(result.error);
    const [first, second] = designsOf(result.project);
    // A credit needs a name; a role is optional. Everything is trimmed, and a
    // block left holding nothing is no block — otherwise a file could arrive
    // saying credits had already been fetched when none had.
    expect(first?.release.credits).toEqual({
      people: [{ role: 'Engineer', name: 'Mike Duffy' }],
      genres: ['Pop'],
      styles: [],
    });
    expect(second?.release.credits).toBeUndefined();
  });

  it('refuses a credits year that is not a year', () => {
    const result = read({
      format: PROJECT_FORMAT,
      version: PROJECT_VERSION,
      designs: [
        { release: { id: 'r1', tracks: [], credits: { people: [], year: 'n/a', label: 'RCA' } } },
        { release: { id: 'r2', tracks: [], credits: { people: [], year: '1987', label: 'RCA' } } },
      ],
      sheet: { paperId: 'a4', marginMm: 5, parts: PART_KINDS },
    });

    if (!result.ok) throw new Error(result.error);
    // `Credits.year` is a fact about a pressing and says it is four digits;
    // `Release.year` beside it is free text on purpose, where "n/a" is real.
    const [first, second] = designsOf(result.project);
    expect(first?.release.credits?.year).toBeUndefined();
    expect(first?.release.credits?.label).toBe('RCA');
    expect(second?.release.credits?.year).toBe('1987');
  });

  it('refuses a Discogs id that could not be one', () => {
    const ids = [0, -1, 2.5, '249504', 9_007_199_254_740_993, null];
    const result = read({
      format: PROJECT_FORMAT,
      version: PROJECT_VERSION,
      designs: ids.map((discogsId, index) => ({
        release: { id: `r${index}`, tracks: [], discogsId },
      })),
      sheet: { paperId: 'a4', marginMm: 5, parts: PART_KINDS },
    });

    if (!result.ok) throw new Error(result.error);
    // It goes into a URL as `/releases/{id}`, so anything that is not a whole
    // positive number that is exactly itself is not an id.
    expect(designsOf(result.project).map((one) => one.release.discogsId)).toEqual(
      ids.map(() => undefined),
    );
  });

  it('drops artwork claiming no pixels, which would divide by zero on a Part', () => {
    const result = read({
      format: PROJECT_FORMAT,
      version: PROJECT_VERSION,
      designs: [
        {
          release: {
            id: 'r1',
            tracks: [],
            artwork: { dataUrl: 'data:image/png;base64,AAAA', widthPx: 0, heightPx: 0 },
          },
        },
      ],
      sheet: { paperId: 'a4', marginMm: 5, parts: PART_KINDS },
    });

    if (!result.ok) throw new Error(result.error);
    expect(designsOf(result.project)[0]?.release.artwork).toBeUndefined();
  });
});
