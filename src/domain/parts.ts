import type { Mm, Point, Size } from './units.ts';

/**
 * A Release has three printable Parts (ADR-0005): the three-panel J-Card that
 * slides into the front of the case, the Back Card carrying the tracklist, and
 * the Label stuck to the cartridge.
 *
 * Every dimension here is an adjustable parameter — the sources disagree by a
 * millimetre or so, which is what the calibration sheet exists to settle — so
 * these are defaults, not constants.
 */
export type PartKind = 'jcard' | 'back-card' | 'label';

export const PART_KINDS: readonly PartKind[] = ['jcard', 'back-card', 'label'];

/** The J-Card panels, in the order they sit on the Sheet from left to right. */
export type JCardPanel = 'inner-flap' | 'spine' | 'front-panel';

export const JCARD_PANEL_ORDER: readonly JCardPanel[] = ['inner-flap', 'spine', 'front-panel'];

export interface JCardDimensions {
  /** The 14 mm end folded inside the case to hold the J-Card in place. */
  readonly innerFlapWidth: Mm;
  /** The 5.5 mm edge visible when the case is shelved. */
  readonly spineWidth: Mm;
  /** The 68 mm face visible through the case front. */
  readonly frontPanelWidth: Mm;
  readonly height: Mm;
}

export interface BackCardDimensions extends Size {}

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

export interface PartDimensions {
  readonly jcard: JCardDimensions;
  readonly backCard: BackCardDimensions;
  readonly label: LabelDimensions;
}

export const DEFAULT_PART_DIMENSIONS: PartDimensions = {
  jcard: { innerFlapWidth: 14, spineWidth: 5.5, frontPanelWidth: 68, height: 79 },
  backCard: { width: 69, height: 79 },
  label: { width: 35, height: 52.5, notch: true, notchSize: 6 },
};

export function jCardSize(dimensions: JCardDimensions): Size {
  return {
    width: dimensions.innerFlapWidth + dimensions.spineWidth + dimensions.frontPanelWidth,
    height: dimensions.height,
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

/** Whether two sets of Part sizes would cut the same pieces of paper. */
export function samePartDimensions(a: PartDimensions, b: PartDimensions): boolean {
  return (
    a.jcard.innerFlapWidth === b.jcard.innerFlapWidth &&
    a.jcard.spineWidth === b.jcard.spineWidth &&
    a.jcard.frontPanelWidth === b.jcard.frontPanelWidth &&
    a.jcard.height === b.jcard.height &&
    a.backCard.width === b.backCard.width &&
    a.backCard.height === b.backCard.height &&
    sameLabelCut(a.label, b.label)
  );
}

export function partShape(part: PartKind, dimensions: PartDimensions): PartShape {
  switch (part) {
    case 'jcard':
      return rectangle(jCardSize(dimensions.jcard));
    case 'back-card':
      return rectangle({ width: dimensions.backCard.width, height: dimensions.backCard.height });
    case 'label': {
      const { width, height } = dimensions.label;
      const notchSize = labelNotchDepth(dimensions.label);
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
  }
}

/** Unfolded size of a Part on the Sheet — what has to be cut out. */
export function partSize(part: PartKind, dimensions: PartDimensions): Size {
  return partShape(part, dimensions).size;
}
