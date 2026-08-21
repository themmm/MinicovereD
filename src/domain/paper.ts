import type { Mm, Size } from './units.ts';

/** A printable paper size. Sheets are laid out on one of these (spec: A4 default, Letter option). */
export interface PaperSize extends Size {
  readonly id: PaperSizeId;
  readonly name: string;
}

export type PaperSizeId = 'a4' | 'letter';

export const A4: PaperSize = { id: 'a4', name: 'A4', width: 210, height: 297 };

/** Home printers cannot print to the edge, so Sheets keep a configurable margin. */
export const DEFAULT_PRINTABLE_MARGIN_MM: Mm = 5;
