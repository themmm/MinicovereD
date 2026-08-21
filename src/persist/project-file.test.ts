import { describe, expect, it } from 'vitest';

import { A4, LETTER } from '../domain/paper.ts';
import { DEFAULT_PART_DIMENSIONS, PART_KINDS } from '../domain/parts.ts';
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
      { position: 1, title: 'Wichita Lineman' },
      { position: 2, title: '東京は夜の七時' },
    ],
    artwork: { dataUrl: 'data:image/png;base64,AAAA', widthPx: 600, heightPx: 400 },
  },
  templateId: 'fullbleed',
  params: { ...DEFAULT_TEMPLATE_PARAMS, accentColor: '#7c2d12', showLogo: false },
  dimensions: {
    ...DEFAULT_PART_DIMENSIONS,
    label: { width: 36.4, height: 53.1, notch: false, notchSize: 6 },
  },
};

const sheet: SheetConfig = { paper: LETTER, marginMm: 7.5, parts: ['jcard', 'label'] };

/** A Release the lookup never found: what was typed, and nothing else. */
const design2: ReleaseDesign = {
  release: { id: 'r2', artist: 'Zzzqqxx Nonexistent', album: 'No Such Album', tracks: [] },
  templateId: 'classic',
  params: DEFAULT_TEMPLATE_PARAMS,
  dimensions: DEFAULT_PART_DIMENSIONS,
};

/** Most of these tests care about the designs, not which entry carries them. */
const designsOf = (project: Project): ReleaseDesign[] =>
  project.entries.map((entry) => entry.design);

const roundTrip = (designs = [design], config = sheet) => {
  const text = writeProjectFile(designs.map(readyEntry), config);
  const result = readProjectFile(text);
  if (!result.ok) throw new Error(`expected a valid project file, got: ${result.error}`);
  return { ...result.project, designs: designsOf(result.project) };
};

describe('writing a project file', () => {
  it('is JSON that says what it is and which version it is', () => {
    const parsed = JSON.parse(writeProjectFile([readyEntry(design)], sheet)) as Record<string, unknown>;

    expect(parsed['format']).toBe(PROJECT_FORMAT);
    expect(parsed['version']).toBe(PROJECT_VERSION);
  });

  it('carries the artwork inside it, so the file is the whole design', () => {
    expect(writeProjectFile([readyEntry(design)], sheet)).toContain('data:image/png;base64,AAAA');
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

  it('restores the Sheet configuration, paper and all', () => {
    const { sheet: restored } = roundTrip();

    expect(restored.paper.id).toBe('letter');
    expect(restored.marginMm).toBe(7.5);
    expect(restored.parts).toEqual(['jcard', 'label']);
  });

  it('restores an adjusted Label and a Template’s own parameters', () => {
    const { designs } = roundTrip();

    expect(designs[0]?.dimensions.label).toEqual({
      width: 36.4,
      height: 53.1,
      notch: false,
      notchSize: 6,
    });
    expect(designs[0]?.templateId).toBe('fullbleed');
    expect(designs[0]?.params.accentColor).toBe('#7c2d12');
    expect(designs[0]?.params.showLogo).toBe(false);
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
    const text = writeProjectFile([readyEntry(design), unfinishedEntry(design2)], sheet);
    const result = readProjectFile(text);

    if (!result.ok) throw new Error(result.error);
    expect(result.project.entries.map((entry) => entry.status)).toEqual(['ready', 'failed']);
  });

  it('does not carry the reason across, which was true of one moment only', () => {
    const failed = { ...unfinishedEntry(design2), error: 'Nothing on MusicBrainz matched.' };
    const result = readProjectFile(writeProjectFile([failed], sheet));

    if (!result.ok) throw new Error(result.error);
    // Tomorrow the network is fine and the album may well be there. A stale
    // cause shown as a current one is worse than none.
    expect(result.project.entries[0]?.status).toBe('failed');
    expect(result.project.entries[0]?.error).toBeUndefined();
    expect(writeProjectFile([failed], sheet)).not.toContain('MusicBrainz');
  });

  it('writes nothing extra for an ordinary Release', () => {
    expect(writeProjectFile([readyEntry(design)], sheet)).not.toContain('needsCompleting');
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
    expect(failure(JSON.stringify({ hello: 'world' }))).toMatch(/mdcovergen project/i);
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
    const whole = writeProjectFile([readyEntry(design)], sheet);

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
    const base = JSON.parse(writeProjectFile([readyEntry(design)], sheet)) as Record<string, unknown>;
    patch(base);
    return JSON.stringify(base);
  };

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
      (base['sheet'] as Record<string, unknown>)['parts'] = ['jcard', 'sleeve', 'label'];
    });
    const result = readProjectFile(text);

    if (!result.ok) throw new Error(result.error);
    expect(result.project.sheet.parts).toEqual(['jcard', 'label']);
    expect(result.project.sheet.parts.every((part) => PART_KINDS.includes(part))).toBe(true);
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
      designs: [
        {
          release: { id: 'r1', tracks: [{ position: 'first', title: 'One' }] },
          dimensions: { label: { width: null, height: 'tall', notch: 'yes', notchSize: -3 } },
        },
      ],
      sheet: { paperId: 'a4', marginMm: 'wide', parts: PART_KINDS },
    });

    if (!result.ok) throw new Error(result.error);
    const [first] = designsOf(result.project);
    expect(first?.release.tracks[0]?.position).toBe(1);
    expect(first?.dimensions.label.width).toBe(35);
    expect(first?.dimensions.label.notchSize).toBe(0);
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
