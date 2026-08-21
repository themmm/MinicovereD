import type { Mm, Size } from './units.ts';

/** A printable paper size. Sheets are laid out on one of these (spec: A4 default, Letter option). */
export interface PaperSize extends Size {
  readonly id: PaperSizeId;
  readonly name: string;
}

export type PaperSizeId = 'a4' | 'letter';

export const A4: PaperSize = { id: 'a4', name: 'A4', width: 210, height: 297 };
export const LETTER: PaperSize = { id: 'letter', name: 'Letter', width: 215.9, height: 279.4 };

export const PAPER_SIZES: readonly PaperSize[] = [A4, LETTER];

export function paperSizeById(id: PaperSizeId): PaperSize {
  const paper = PAPER_SIZES.find((candidate) => candidate.id === id);
  if (!paper) throw new Error(`mdcovergen: unknown paper size "${id}"`);
  return paper;
}

/** Home printers cannot print to the edge, so Sheets keep a configurable margin. */
export const DEFAULT_PRINTABLE_MARGIN_MM: Mm = 5;
