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
export type TemplateId = 'classic' | 'fullbleed';

/**
 * What a collector can change about a Template without leaving it. Shared by
 * every Template, and set per Release, so two Releases can wear the same design
 * in different colours.
 */
export interface TemplateParams {
  /** Background of the Parts. */
  readonly paperColor: string;
  /** Type and rules. */
  readonly inkColor: string;
  /** The Spine bar, and highlights that go with it. */
  readonly accentColor: string;
  /**
   * Artist and album drawn *on top of* the artwork — the Full-bleed Front Panel
   * and Label. Turning it off is what lets full-bleed artwork stay clean
   * (story 13). Type set beside the artwork, as on the Classic Label, is not
   * over it and is unaffected.
   */
  readonly showOverlayText: boolean;
  /** The MiniDisc logo on Front Panel and Spine (ADR-0004). */
  readonly showLogo: boolean;
}

export const DEFAULT_TEMPLATE_PARAMS: TemplateParams = {
  paperColor: '#ffffff',
  inkColor: '#141414',
  accentColor: '#1f2933',
  showOverlayText: true,
  showLogo: true,
};

export interface PartContext {
  readonly release: Release;
  readonly params: TemplateParams;
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
  /** One line saying what this design does, for the picker. */
  readonly description: string;
  drawJCard(context: JCardContext): readonly DrawOp[];
  drawBackCard(context: PartContext): readonly DrawOp[];
  drawLabel(context: PartContext): readonly DrawOp[];
}
