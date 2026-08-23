import type { Mm, Point, Size } from './units.ts';

/**
 * A Release has two printable Parts (ADR-0012): the **Insert**, one folded
 * strip that lives entirely in the front of the case, and the **Label** stuck
 * to the cartridge.
 *
 * This is where the v1 J-Card and Back Card went. They were three panels plus a
 * separate rectangle; the Insert is the same three panels with Pages hanging off
 * the end, folded concertina so the printed side always faces out. CONTEXT.md
 * keeps both old names, marked retired, because five ADRs still say them —
 * 0005, 0007, 0010, 0011 and 0012.
 *
 * Every dimension here is an adjustable parameter — the sources disagree by a
 * millimetre or so, which is what the calibration sheet exists to settle — so
 * these are defaults, not constants.
 */
export type PartKind = 'insert' | 'label';

export const PART_KINDS: readonly PartKind[] = ['insert', 'label'];

/**
 * The Insert's measurements. Five lengths, and the strip they describe is only
 * as long as the Page count makes it — see {@link insertSize}.
 *
 * `frontPanelWidth` and `pageWidth` are kept apart although both are Pages:
 * Page 1 *is* the Front Panel (ADR-0012), it is the one Page sized by the case
 * window rather than by the booklet, and inner Pages coming out slightly
 * narrower than the cover is what a book does anyway.
 */
export interface InsertDimensions {
  /** The 14 mm end folded inside the case to hold the Insert in place. */
  readonly innerFlapWidth: Mm;
  /** The 5.5 mm edge visible when the case is shelved. */
  readonly spineWidth: Mm;
  /** The 68 mm face visible through the case front, which is Page 1. */
  readonly frontPanelWidth: Mm;
  /** Every Page after the first, at 65 mm. */
  readonly pageWidth: Mm;
  readonly height: Mm;
}

export interface LabelDimensions extends Size {
  /** The diagonally cut corner that matches the cartridge (CONTEXT.md: Label). */
  readonly notch: boolean;
  /** Length of the notch along each of the two edges it cuts. */
  readonly notchSize: Mm;
}

/**
 * Named starting points for the Label. The sources disagree by a millimetre or
 * two — Sony's blank-label template says ~35.75 × 52.75, measured originals
 * ~34.5 × 52.5, and the jkap generator uses 38 × 54 — which is why these are
 * presets to adjust from rather than constants, and why the calibration sheet
 * exists to settle the argument with a ruler.
 */
export type LabelPresetId = 'classic' | 'full';

export interface LabelPreset {
  readonly id: LabelPresetId;
  readonly name: string;
  /** Where the numbers come from, so a collector can judge which to trust. */
  readonly provenance: string;
  readonly dimensions: LabelDimensions;
}

export const LABEL_PRESETS: readonly LabelPreset[] = [
  {
    id: 'classic',
    name: 'Classic',
    provenance: 'Close to measured original stickers; leaves the cartridge’s cut corner clear.',
    dimensions: { width: 35, height: 52.5, notch: true, notchSize: 6 },
  },
  {
    id: 'full',
    name: 'Full',
    provenance: 'Covers the whole cartridge face, corner included, as the jkap generator does.',
    dimensions: { width: 38, height: 54, notch: false, notchSize: 6 },
  },
];

export function labelPreset(id: LabelPresetId): LabelPreset {
  const preset = LABEL_PRESETS.find((candidate) => candidate.id === id);
  if (!preset) throw new Error(`minicovered: unknown Label preset "${id}"`);
  return preset;
}

/** How far the Label may be nudged from a preset, and in what steps. */
export const LABEL_SIZE_RANGE = { min: 20, max: 60, stepMm: 0.1 } as const;

/**
 * How far a Page may be nudged, and in what steps.
 *
 * Narrower than the Label's range at the top because a Page is what makes the
 * strip long: at 4 Pages every millimetre here is three on the paper, and
 * ADR-0014 leaves only 4.5 mm of slack on A4. Wide enough at the bottom that a
 * collector who wants a stub rather than a Page can have one.
 */
export const PAGE_WIDTH_RANGE = { min: 30, max: 80, stepMm: 0.5 } as const;

/**
 * The most Pages this app will fold into one strip, whatever the paper.
 *
 * Four, because that is the A4 maximum (ADR-0012), and A4's 297 mm is the longest
 * edge any paper here offers — Letter is wider at 215.9 but 17.6 mm shorter, so
 * it takes fewer Pages rather than more. At 65 mm Pages the strip is 282.5 mm
 * against A4's 287 mm of usable length.
 *
 * Six Pages needs a second strip, which is out of scope, so the number is written
 * down rather than left to be discovered by the paper: a collector on a paper size
 * this app does not yet offer should get the booklet this project has actually
 * folded and tested, not one it has not.
 */
export const MAX_INSERT_PAGES = 4;

export interface PartDimensions {
  readonly insert: InsertDimensions;
  readonly label: LabelDimensions;
}

export const DEFAULT_PART_DIMENSIONS: PartDimensions = {
  insert: { innerFlapWidth: 14, spineWidth: 5.5, frontPanelWidth: 68, pageWidth: 65, height: 79 },
  label: { width: 35, height: 52.5, notch: true, notchSize: 6 },
};

/**
 * How long the flat strip is at `pageCount` Pages, and how tall.
 *
 * The Inner Flap, the Spine and the Front Panel are fixed; every Page *after*
 * the first adds `pageWidth`, because Page 1 is the Front Panel and is already
 * counted. So 2 Pages is 152.5 mm and 4 Pages is 282.5 — the two numbers
 * ADR-0012 and ADR-0014 are written around.
 *
 * Not clamped, and no view taken of whether `pageCount` is even or printable:
 * this is arithmetic, and both of those are decisions made elsewhere with more
 * to go on — the parity by ADR-0012's fold pattern, the printability by the
 * paper (see {@link maxInsertPages}).
 */
export function insertSize(insert: InsertDimensions, pageCount: number): Size {
  const pagesAfterTheFirst = Math.max(0, pageCount - 1);
  return {
    width:
      insert.innerFlapWidth +
      insert.spineWidth +
      insert.frontPanelWidth +
      pagesAfterTheFirst * insert.pageWidth,
    height: insert.height,
  };
}

/**
 * The physical shape of a Part: how much Sheet it takes, and the outline it is
 * cut along. One definition, because the cut guide and the Part's own
 * background have to agree — a Label filled as a rectangle but cut along a
 * notched outline prints a corner that is not there.
 */
export interface PartShape {
  readonly size: Size;
  /** Closed outline in Part-local coordinates, starting at the top-left corner. */
  readonly outline: readonly Point[];
}

function rectangle(size: Size): PartShape {
  return {
    size,
    outline: [
      { x: 0, y: 0 },
      { x: size.width, y: 0 },
      { x: size.width, y: size.height },
      { x: 0, y: size.height },
    ],
  };
}

/** The Insert's flat strip: a plain rectangle, and the folds are guides on it. */
export function insertShape(insert: InsertDimensions, pageCount: number): PartShape {
  return rectangle(insertSize(insert, pageCount));
}

/**
 * How deep the Label's cut corner actually is, in millimetres, and zero when it
 * is squared off.
 *
 * Clamped to half the shorter edge: a notch bigger than the Label would fold
 * the outline through itself into negative coordinates, and a Label is not a
 * triangle. Project files are not trusted to be sane.
 *
 * Exported because the outline is not the only thing that has to know. A
 * Template setting type near that corner reserves room from it, and it has to
 * reserve the corner that is actually cut rather than the one the file asked
 * for — two answers to that question is one answer too many.
 */
export function labelNotchDepth(label: LabelDimensions): Mm {
  return label.notch ? Math.min(label.notchSize, label.width / 2, label.height / 2) : 0;
}

/** The Label, with the cartridge's diagonally cut corner taken out of it. */
export function labelShape(label: LabelDimensions): PartShape {
  const { width, height } = label;
  const notchSize = labelNotchDepth(label);
  if (notchSize <= 0) return rectangle({ width, height });

  // The cartridge's diagonally cut corner (CONTEXT.md: Label).
  return {
    size: { width, height },
    outline: [
      { x: 0, y: 0 },
      { x: width - notchSize, y: 0 },
      { x: width, y: notchSize },
      { x: width, y: height },
      { x: 0, y: height },
    ],
  };
}

/**
 * Whether two Labels would be cut to the same piece of paper.
 *
 * `notchSize` counts only when the notch is cut, because that is the only time
 * it reaches the paper — `labelNotchDepth` above is what decides that, and it
 * is asked here rather than re-derived.
 *
 * One definition, because two things ask and they must not disagree: the preset
 * picker, deciding whether the numbers still match a preset, and an import,
 * deciding whether a project file changed the collector's Label enough to say
 * so. Two answers would give a sentence announcing a change over a picker still
 * naming the preset it is no longer on.
 */
export function sameLabelCut(a: LabelDimensions, b: LabelDimensions): boolean {
  if (a.width !== b.width || a.height !== b.height || a.notch !== b.notch) return false;
  return labelNotchDepth(a) === labelNotchDepth(b);
}

/** Whether two Inserts would be cut and folded the same way. */
export function sameInsertCut(a: InsertDimensions, b: InsertDimensions): boolean {
  return (
    a.innerFlapWidth === b.innerFlapWidth &&
    a.spineWidth === b.spineWidth &&
    a.frontPanelWidth === b.frontPanelWidth &&
    a.pageWidth === b.pageWidth &&
    a.height === b.height
  );
}

/** Whether two sets of Part sizes would cut the same pieces of paper. */
export function samePartDimensions(a: PartDimensions, b: PartDimensions): boolean {
  return sameInsertCut(a.insert, b.insert) && sameLabelCut(a.label, b.label);
}

export function partShape(
  part: PartKind,
  dimensions: PartDimensions,
  /**
   * How many Pages this Release's Insert folds into. Read for the Insert and
   * ignored for the Label, which has no Pages — required rather than defaulted
   * because a Page count guessed here would be a strip of the wrong length, and
   * the wrong length is what the packer refuses.
   */
  pageCount: number,
): PartShape {
  switch (part) {
    case 'insert':
      return insertShape(dimensions.insert, pageCount);
    case 'label':
      return labelShape(dimensions.label);
  }
}

/** Unfolded size of a Part on the Sheet — what has to be cut out. */
export function partSize(part: PartKind, dimensions: PartDimensions, pageCount: number): Size {
  return partShape(part, dimensions, pageCount).size;
}
