import type { JCardPanel, PartDimensions } from '../../domain/parts.ts';
import type { Release } from '../../domain/release.ts';
import type { Rect, Size } from '../../domain/units.ts';
import type { DrawOp } from '../layout.ts';
import type { TextMeasurer } from '../text.ts';

/**
 * A Template is a named visual design that determines layout, typography and
 * color logic of a Part (CONTEXT.md). It never places Parts on a Sheet and
 * never draws guides — it only fills a Part-sized area with drawing ops, in
 * Part-local millimetres.
 */
export type TemplateId = 'classic';

export interface PartContext {
  readonly release: Release;
  readonly dimensions: PartDimensions;
  /** The Part being drawn, at Part-local origin (0, 0). */
  readonly size: Size;
  readonly measure: TextMeasurer;
}

export interface JCardContext extends PartContext {
  /** The three panels, in Part-local coordinates. */
  readonly panels: Readonly<Record<JCardPanel, Rect>>;
}

export interface Template {
  readonly id: TemplateId;
  readonly name: string;
  drawJCard(context: JCardContext): readonly DrawOp[];
  drawBackCard(context: PartContext): readonly DrawOp[];
  drawLabel(context: PartContext): readonly DrawOp[];
}
