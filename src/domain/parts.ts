import type { Mm, Size } from './units.ts';

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

export const PART_LABELS: Readonly<Record<PartKind, string>> = {
  jcard: 'J-Card',
  'back-card': 'Back Card',
  label: 'Label',
};

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
  /** The diagonally cut corner that matches the cartridge. */
  readonly notch: boolean;
  /** Length of the notch along each of the two edges it cuts. */
  readonly notchSize: Mm;
}

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

/** Unfolded size of a Part on the Sheet — what has to be cut out. */
export function partSize(part: PartKind, dimensions: PartDimensions): Size {
  switch (part) {
    case 'jcard':
      return jCardSize(dimensions.jcard);
    case 'back-card':
      return { width: dimensions.backCard.width, height: dimensions.backCard.height };
    case 'label':
      return { width: dimensions.label.width, height: dimensions.label.height };
  }
}
