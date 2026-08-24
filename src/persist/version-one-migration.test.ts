import { describe, expect, it } from 'vitest';

import { A4, LETTER } from '../domain/paper.ts';
import type {
  PartPlacement,
  SheetLayout,
  SheetWarning,
  TextMeasurer,
} from '../render/sheet-renderer.ts';
import { renderSheets } from '../render/sheet-renderer.ts';
import { PROJECT_FORMAT, readProjectFile } from './project-file.ts';
import type { Project } from './project-file.ts';

/**
 * One whole version-1 document, opened.
 *
 * Every reader that does the migrating is tested field by field in
 * `project-file.test.ts` — the `jcard` block, the toggle collapse, the Label
 * that becomes the project's measurements. What is not tested there is the
 * document: a real saved project has several Designs, a `dimensions` block on
 * each of them, and a Sheet naming Parts this version no longer has, and the
 * question a collector actually asks of it is whether their queue comes back.
 * So this file opens one and then *prints* it, because "nothing lost" is a claim
 * about the paper and not only about the parse.
 *
 * v1.0.0 is public and the v1 rename shipped without a migration. Doing that
 * twice, the second time to a released version, is how a tool teaches people not
 * to trust it with their work.
 */

/**
 * Text metrics for a test that is not about type.
 *
 * Half an em a character, which is close enough to a real face that nothing
 * below is set at an absurd size. Deliberately not a copy of
 * `sheet-renderer.test.ts`'s face-blind measurer: nothing asserted here — the
 * Page count, the strip's length, which Part landed on paper — depends on text
 * metrics at all, so a second measurer that drifts from that one cannot make
 * this file disagree with the seam.
 */
const measurer: TextMeasurer = {
  widthMm: (text, style) => text.length * 0.5 * style.sizeMm,
};

/** Cover art, so a Release can have a back cover to print (ADR-0012's odd Page out). */
const ARTWORK = { dataUrl: 'data:image/png;base64,AAAA', widthPx: 600, heightPx: 600 } as const;

/**
 * The Part sizes as this collector nudged them, in v1's own shape.
 *
 * `jcard` carries four of the Insert's five measurements — the same lengths off
 * the same case (ADR-0012 keeps all three panels) — and `backCard` carries the
 * 69 mm rectangle that has no counterpart on the strip. Both are here because a
 * v1 file wrote both, and only one of them is read.
 */
const NUDGED = {
  jcard: { innerFlapWidth: 13.8, spineWidth: 5.4, frontPanelWidth: 67.6, height: 78.6 },
  backCard: { width: 68.5, height: 78.6 },
  label: { width: 34.6, height: 52.4, notch: true, notchSize: 5 },
} as const;

/** v1's defaults, which is what the Designs the collector never selected carried. */
const V1_DEFAULTS = {
  jcard: { innerFlapWidth: 14, spineWidth: 5.5, frontPanelWidth: 68, height: 79 },
  backCard: { width: 69, height: 79 },
  label: { width: 35, height: 52.5, notch: true, notchSize: 6 },
} as const;

/** v1.1's whole `TemplateParams`: the six keys that existed when it wrote this. */
const V1_1_PARAMS = {
  paperColor: '#fdf6e3',
  inkColor: '#141414',
  accentColor: '#7c2d12',
  showOverlayText: true,
  showLogo: true,
  insetArtwork: false,
} as const;

/**
 * A version-1 project as **v1.1** saved one: four Designs, a `dimensions` block
 * on every one of them, and a Sheet still naming the J-Card and the Back Card.
 *
 * Written by 1.1 rather than by 1.0 for one reason that matters to the Page
 * count: Discogs credits arrived in 1.1 (ADR-0013) and 1.1 files still carry
 * version 1, so this is the document that opens with a credits Page. A 1.0 file
 * cannot — see the test below it, which is the same project with the two things
 * 1.0 did not have taken out.
 *
 * The Releases are what a real queue holds: a looked-up pressing, a looked-up
 * pressing with credits, a mixtape typed in from a shelf, and one the lookup
 * never found. Only the first states nudged measurements, because v1's Label
 * control wrote to the *selected* Release and to nothing else — which is the
 * asymmetry version 2 exists to remove, and the reason the collapse has to pick
 * one.
 */
const versionOneOneProject = (): Record<string, unknown> => ({
  format: PROJECT_FORMAT,
  version: 1,
  savedAt: '2026-03-14T09:12:44.201Z',
  designs: [
    {
      release: {
        id: 'mb-1',
        artist: 'Glen Campbell',
        album: 'Wichita Lineman',
        year: '1968',
        notes: 'Capitol · ST-103',
        tracks: [
          { position: 1, title: 'Wichita Lineman', lengthMs: 187_000 },
          { position: 2, title: 'Dreams of the Everyday Housewife', lengthMs: 141_000 },
          { position: 3, title: 'Fate of Man' },
        ],
        artwork: ARTWORK,
      },
      templateId: 'classic',
      params: V1_1_PARAMS,
      dimensions: NUDGED,
    },
    {
      release: {
        id: 'mb-2',
        artist: 'Cocteau Twins',
        album: 'Heaven or Las Vegas',
        year: '1990',
        tracks: [
          { position: 1, title: 'Cherry-coloured Funk', lengthMs: 193_000 },
          { position: 2, title: 'Pitch the Baby', lengthMs: 187_000 },
          { position: 3, title: 'Iceblink Luck', lengthMs: 194_000 },
        ],
        artwork: ARTWORK,
        discogsId: 249_504,
        credits: {
          people: [
            { role: 'Producer', name: 'Cocteau Twins' },
            { role: '', name: 'Robin Guthrie' },
          ],
          label: '4AD',
          catalogNumber: 'CAD 0007',
          country: 'UK',
          year: '1990',
          genres: ['Rock'],
          styles: ['Dream Pop', 'Shoegaze'],
        },
      },
      templateId: 'fullbleed',
      params: V1_1_PARAMS,
      dimensions: V1_DEFAULTS,
    },
    {
      release: {
        id: 'hand-1',
        artist: 'Various',
        album: 'Tape for the 08:14',
        tracks: [
          { position: 1, title: 'Ceremony' },
          { position: 2, title: '東京は夜の七時' },
          { position: 3, title: 'Łódź' },
          { position: 4, title: 'Age of Consent' },
        ],
      },
      templateId: 'minimal',
      params: V1_1_PARAMS,
      dimensions: V1_DEFAULTS,
    },
    {
      release: { id: 'typed-1', artist: 'Zzzqqxx Nonexistent', album: 'No Such Album', tracks: [] },
      templateId: 'classic',
      params: V1_1_PARAMS,
      dimensions: V1_DEFAULTS,
      needsCompleting: true,
    },
  ],
  sheet: { paperId: 'a4', marginMm: 5, parts: ['jcard', 'back-card', 'label'] },
});

/**
 * The same project as **v1.0** would have written it: no `insetArtwork`, because
 * the parameter did not exist, and no credits or Discogs link, because ADR-0013
 * had not happened.
 */
const versionOneZeroProject = (): Record<string, unknown> => {
  const file = versionOneOneProject();
  for (const design of file['designs'] as Array<Record<string, unknown>>) {
    const { insetArtwork: _dropped, ...params } = design['params'] as typeof V1_1_PARAMS;
    design['params'] = params;
    const { credits: _noCredits, discogsId: _noLink, ...release } = design['release'] as Record<
      string,
      unknown
    >;
    design['release'] = release;
  }
  return file;
};

const open = (file: Record<string, unknown>): Project => {
  const result = readProjectFile(JSON.stringify(file));
  if (!result.ok) throw new Error(`expected this project to open, got: ${result.error}`);
  return result.project;
};

/** The project, printed onto Sheets at the measurements it came back with. */
const print = (project: Project): readonly SheetLayout[] =>
  renderSheets(
    project.entries.map((entry) => entry.design),
    project.sheet,
    project.measurements.dimensions,
    measurer,
  );

/** Every placement of one Release across every Sheet, however they packed. */
const placementsOf = (sheets: readonly SheetLayout[], releaseId: string): PartPlacement[] =>
  sheets.flatMap((sheet) =>
    sheet.placements.filter((placement) => placement.releaseId === releaseId),
  );

/** The Insert of one Release, which is the Part every claim below is about. */
const insertOf = (sheets: readonly SheetLayout[], releaseId: string): PartPlacement => {
  const found = placementsOf(sheets, releaseId).filter(({ part }) => part === 'insert');
  expect(found, `Inserts for ${releaseId}`).toHaveLength(1);
  return found[0] as PartPlacement;
};

/** What each Page of one Insert carries, in reading order along the strip. */
const rolesOf = (placement: PartPlacement): string[] =>
  (placement.panels ?? []).flatMap((panel) => (panel.panel === 'page' ? [panel.role] : []));

/**
 * Every "the paper had no room for this" report, across every Sheet.
 *
 * Narrowed to the one member, because `SheetWarning` is a union and a test that
 * wants `dropped` has to say which of the three it is holding.
 */
type Shortfall = Extract<SheetWarning, { kind: 'insert-pages-short' }>;

const shortfalls = (sheets: readonly SheetLayout[]): Shortfall[] =>
  sheets.flatMap((sheet) =>
    (sheet.warnings ?? []).flatMap((warning) =>
      warning.kind === 'insert-pages-short' ? [warning] : [],
    ),
  );

describe('opening a whole version-1 project', () => {
  it('brings the queue back in order, with the entry that needs a hand still flagged', () => {
    const project = open(versionOneOneProject());

    expect(project.entries.map((entry) => entry.design.release.id)).toEqual([
      'mb-1',
      'mb-2',
      'hand-1',
      'typed-1',
    ]);
    // The flag is the collector's to-do list, and every other entry was work
    // they had finished with.
    expect(project.entries.map((entry) => entry.status)).toEqual([
      'ready',
      'ready',
      'ready',
      'failed',
    ]);
  });

  it('loses nothing off any Release, credits and Discogs link included', () => {
    const project = open(versionOneOneProject());
    const releases = project.entries.map((entry) => entry.design.release);

    // Whole Releases rather than field by field: this is the assertion that
    // fails when a reader added for one field quietly drops another, which is
    // the only failure mode a migration really has.
    expect(releases).toEqual(
      (versionOneOneProject()['designs'] as Array<Record<string, unknown>>).map(
        (design) => design['release'],
      ),
    );
  });

  it('keeps each Design’s own Template and parameters', () => {
    const project = open(versionOneOneProject());
    const designs = project.entries.map((entry) => entry.design);

    expect(designs.map((design) => design.templateId)).toEqual([
      'classic',
      'fullbleed',
      'minimal',
      'classic',
    ]);
    // Stated one way in a 1.1 file, so it is read the way it was stated rather
    // than picking up v1.0's square convention.
    expect(designs.every((design) => design.params.insetArtwork === false)).toBe(true);
    expect(designs.every((design) => design.params.accentColor === '#7c2d12')).toBe(true);
  });

  it('states no Page count, so every Insert folds to what its content asks for', () => {
    // A version-1 file has no `pageCount` key to read — the override arrived
    // with version 2 — which is why the counts below are derived and why they
    // are not all the same.
    const project = open(versionOneOneProject());

    expect(project.entries.every((entry) => entry.design.pageCount === undefined)).toBe(true);
  });

  it('collapses the four `dimensions` blocks onto the one set the project prints at', () => {
    const project = open(versionOneOneProject());

    expect(project.measurements.dimensions.insert).toEqual({
      innerFlapWidth: 13.8,
      spineWidth: 5.4,
      frontPanelWidth: 67.6,
      // No v1 source, there being no Pages, so it takes the default — and the
      // Back Card's 68.5 in the same block was there to be picked up and was
      // not, which is the whole of why this number is 65.
      pageWidth: 65,
      height: 78.6,
    });
    expect(project.measurements.dimensions.label).toEqual({
      width: 34.6,
      height: 52.4,
      notch: true,
      notchSize: 5,
    });
  });

  it('collapses the J-Card and the Back Card toggles into the one Insert', () => {
    const project = open(versionOneOneProject());

    expect(project.sheet.parts).toEqual(['insert', 'label']);
    expect(project.sheet.paper).toBe(A4);
    expect(project.sheet.marginMm).toBe(5);
  });

  it('prints every Release as exactly one Insert and one Label', () => {
    const sheets = print(open(versionOneOneProject()));

    for (const releaseId of ['mb-1', 'mb-2', 'hand-1', 'typed-1']) {
      expect(
        placementsOf(sheets, releaseId).map(({ part }) => part).sort(),
        `the Parts of ${releaseId}`,
      ).toEqual(['insert', 'label']);
    }
  });

  it('folds the Release with credits to four Pages and the rest to two', () => {
    // The sentence ADR-0012's migration paragraph originally got wrong. A v1
    // file does not open as a 2-Page Insert as a rule: no Page count is read
    // from one, so the content decides, and a 1.1 file *can* carry credits.
    const sheets = print(open(versionOneOneProject()));

    expect(rolesOf(insertOf(sheets, 'mb-2'))).toEqual([
      'cover',
      'tracklist',
      'credits',
      'artwork',
    ]);
    for (const releaseId of ['mb-1', 'hand-1', 'typed-1']) {
      expect(rolesOf(insertOf(sheets, releaseId)), releaseId).toEqual(['cover', 'tracklist']);
    }
  });

  it('says nothing was short of paper, because nothing was', () => {
    // A4 at a 5 mm margin takes four Pages, so the one Release that wants them
    // gets them. This is the assertion that turns into a failure the day the
    // migrated measurements stop fitting.
    const sheets = print(open(versionOneOneProject()));

    expect(shortfalls(sheets)).toEqual([]);
  });

  it('tells a Letter collector which Pages their paper could not take', () => {
    // The other half of the test above, without which it is only the absence of
    // something. The same project saved for Letter loses the credits Page and
    // the back cover at every margin including zero — 282.5 mm of strip against
    // a 279.4 mm long edge (ADR-0014) — and a migrated document has to be told
    // that in the same words a version-2 one would be.
    const file = versionOneOneProject();
    (file['sheet'] as Record<string, unknown>)['paperId'] = 'letter';

    const short = shortfalls(print(open(file)));

    expect(short).toHaveLength(1);
    expect(short[0]).toMatchObject({
      releaseId: 'mb-2',
      releaseTitle: 'Heaven or Las Vegas',
      requestedPages: 4,
      pages: 2,
      maxPages: 2,
      paperName: LETTER.name,
      // Nobody asked for four Pages: the credits did, which is the difference
      // between "You asked for" and "This Release needs" on screen.
      requestedByCollector: false,
      dropped: ['credits', 'artwork'],
    });
  });

  it('cuts the strips at the migrated measurements, not at the defaults', () => {
    // The end of the round trip: a number the collector nudged in v1 decides how
    // much paper their Insert takes in v2. 13.8 + 5.4 + 67.6 is 86.8 of case
    // end, and every Page after the cover adds 65.
    const sheets = print(open(versionOneOneProject()));
    const twoPages = insertOf(sheets, 'mb-1');
    const fourPages = insertOf(sheets, 'mb-2');

    expect(rolesOf(twoPages)).toHaveLength(2);
    expect(rolesOf(fourPages)).toHaveLength(4);
    // Page 1 is the Front Panel and takes the Front Panel's own width.
    expect((twoPages.panels ?? []).map((panel) => panel.rect.width)).toEqual([
      13.8, 5.4, 67.6, 65,
    ]);
    expect((fourPages.panels ?? []).map((panel) => panel.rect.width)).toEqual([
      13.8, 5.4, 67.6, 65, 65, 65,
    ]);
    // Turned or standing, a Part is drawn and cut in its own upright
    // millimetres (ADR-0014), so the height is the case's whatever the packer did.
    expect((twoPages.panels ?? []).every((panel) => panel.rect.height === 78.6)).toBe(true);
  });

  it('opens the same project as version 1.0 wrote it, at two Pages throughout', () => {
    // The contrast that makes the paragraph above true rather than lucky. Take
    // out the two things 1.0 did not have and the credits Page goes with them —
    // so a 1.0 file really does open as a queue of 2-Page Inserts, and it is the
    // content that decides rather than the version.
    const project = open(versionOneZeroProject());
    const sheets = print(project);

    for (const releaseId of ['mb-1', 'mb-2', 'hand-1', 'typed-1']) {
      expect(rolesOf(insertOf(sheets, releaseId)), releaseId).toEqual(['cover', 'tracklist']);
    }
    // And the one thing the version does still decide: every Front Panel written
    // before 1.1 was drawn as an inset square, and inside version 1 the absence
    // of the key is the tell.
    expect(project.entries.every((entry) => entry.design.params.insetArtwork)).toBe(true);
  });
});
