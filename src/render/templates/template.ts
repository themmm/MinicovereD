import type { JCardPanel, PartDimensions } from '../../domain/parts.ts';
import type { Release } from '../../domain/release.ts';
import type { Rect, Size } from '../../domain/units.ts';
import type { DrawOp, PrintFace, SheetWarning } from '../layout.ts';
import type { TextMeasurer } from '../text.ts';

/**
 * A Template is a named visual design that determines layout, typography and
 * color logic of a Part (CONTEXT.md). It never places Parts on a Sheet and
 * never draws guides — it only fills a Part-sized area with drawing ops, in
 * Part-local millimetres.
 */
export type TemplateId = 'classic' | 'fullbleed' | 'minimal';

/**
 * What a Template sets each kind of type in. CONTEXT.md already puts typography
 * inside the Template rather than beside it, which is why this is not a
 * `TemplateParams` field: the collector picks a design, not a font.
 *
 * Three roles rather than one, because one face per Template would make a
 * Template's whole voice a single choice and leave most of the bundled faces
 * unreachable. They are the three jobs type actually does on a Part, and each
 * has a different constraint:
 *
 *  - `display` is read at arm's length off a shelf front, so it can carry the
 *    voice and afford some contrast.
 *  - `text` is read at 2.4 mm, and in v2 reversed out of colour on the
 *    tracklist Page, so it needs stems that survive both.
 *  - `spine` is one line on 5.5 mm that gets cut when it will not fit
 *    (`SpineTruncated`), so width per character is worth real money there.
 *
 * Three roles, not three faces: a Template is free to name one face in all
 * three, and Minimal does. The difference from the single-choice version this
 * replaced is that spending the roles on one voice is then a decision that
 * Template made, rather than the only shape available to any of them.
 */
export interface TemplateFaces {
  /** Artist and album at display size: the Front Panel, the Label, headings. */
  readonly display: PrintFace;
  /** Body copy: the tracklist, the Inner Flap caption. */
  readonly text: PrintFace;
  /** The one line that reads up the 5.5 mm case edge. */
  readonly spine: PrintFace;
}

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
  /**
   * The MiniDisc logo (ADR-0004). Always the Spine, which is where a shelved
   * case is identified from; the Front Panel too on Classic and Full-bleed, but
   * not on Minimal, whose Front Panel carries nothing that is not type.
   */
  readonly showLogo: boolean;
  /**
   * Classic's Front Panel artwork as an inset square with paper all round it,
   * which is how v1 drew every Front Panel, instead of bleeding to the panel's
   * top, left and right edges.
   *
   * A parameter rather than a deleted design: the square is a real choice —
   * it keeps a whole sleeve visible where the bleed crops one — and the
   * collector who liked it should not have to keep v1 installed to have it.
   * Full-bleed's artwork covers the Part by definition and ignores this, and so
   * does the Classic Label, whose square is sized around the cartridge's cut
   * corner rather than around taste. Minimal ignores it because it draws no
   * artwork at all.
   */
  readonly insetArtwork: boolean;
}

export const DEFAULT_TEMPLATE_PARAMS: TemplateParams = {
  paperColor: '#ffffff',
  inkColor: '#141414',
  accentColor: '#1f2933',
  showOverlayText: true,
  showLogo: true,
  // The bleed is what ticket 03 makes Classic, so it is what a new design gets.
  insetArtwork: false,
};

/**
 * The parameters that are on or off, as against the three that are colours.
 *
 * Named as a type rather than left implicit because each Template reads a
 * different subset of them and now has to say which — see {@link Template.toggles}.
 */
export type TemplateToggle = 'showOverlayText' | 'showLogo' | 'insetArtwork';

export const TEMPLATE_TOGGLES: readonly TemplateToggle[] = [
  'showOverlayText',
  'showLogo',
  'insetArtwork',
];

/**
 * The choices that turn a Release into Parts, without the Release: which
 * Template, and what it was told (CONTEXT.md, Design).
 *
 * This is the taste half of the fit/taste split, and the half that carries
 * forward. A collector who set a Release in Full-bleed on a black ground meant
 * it about their taste, not about that one record, so the next Release to
 * arrive wears the same thing by every route it can arrive by — a lookup, a
 * Batch, or a mixtape typed in from a shelf. The measurements that used to
 * travel beside these now live in `Measurements` (domain/measurements.ts).
 */
export interface DesignChoice {
  readonly templateId: TemplateId;
  readonly params: TemplateParams;
}

/**
 * What the first Release of a session wears, and the only place the answer is
 * written down.
 *
 * v1 had three copies of it — one in the workspace, one in the Batch resolver
 * and one inlined in the entry a failed lookup leaves behind — and they agreed
 * only because nobody had edited one of them yet.
 */
export const DEFAULT_DESIGN_CHOICE: DesignChoice = {
  templateId: 'classic',
  params: DEFAULT_TEMPLATE_PARAMS,
};

export interface PartContext {
  readonly release: Release;
  readonly params: TemplateParams;
  readonly dimensions: PartDimensions;
  /** The Part being drawn, at Part-local origin (0, 0). */
  readonly size: Size;
  /**
   * The drawing Template's own faces, handed down rather than looked up, so the
   * shared pieces set the Spine and the tracklist in the Template's type
   * without knowing which Template they are inside.
   */
  readonly faces: TemplateFaces;
  readonly measure: TextMeasurer;
}

export interface JCardContext extends PartContext {
  /** The three panels, in Part-local coordinates. */
  readonly panels: Readonly<Record<JCardPanel, Rect>>;
}

/**
 * What drawing a Part produced: the marks, and anything the collector should
 * know about them. Warnings come back with the drawing rather than being
 * recomputed beside it, so what is reported always describes what was drawn.
 */
export interface PartDrawing {
  readonly ops: readonly DrawOp[];
  readonly warnings?: readonly SheetWarning[];
}

export interface Template {
  readonly id: TemplateId;
  readonly name: string;
  /** One line saying what this design does, for the picker. */
  readonly description: string;
  readonly faces: TemplateFaces;
  /**
   * Which of the toggles this Template actually reads.
   *
   * Declared by the Template rather than worked out by the panel, because it is
   * a fact about the drawing: `insetArtwork` under Full-bleed and Minimal, and
   * `showOverlayText` under Classic and Minimal, changed nothing and were shown
   * anyway for the whole of v1. A control that cannot do anything is worse than
   * a missing one — it is read as the reason the Part looks the way it does.
   *
   * Held to it by `sheet-renderer.test.ts`, which flips every toggle under every
   * Template and requires the ops to differ for exactly the ones named here. So
   * a Template that declares one it ignores fails, and one that reads a toggle
   * it did not declare fails too.
   */
  readonly toggles: readonly TemplateToggle[];
  drawJCard(context: JCardContext): PartDrawing;
  drawBackCard(context: PartContext): PartDrawing;
  drawLabel(context: PartContext): PartDrawing;
}
