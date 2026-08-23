import type { PaperSize } from '../domain/paper.ts';
import {
  JCARD_PANEL_ORDER,
  jCardSize,
  partShape,
  partSize,
} from '../domain/parts.ts';
import type { JCardPanel, PartDimensions, PartKind } from '../domain/parts.ts';
import type { Release } from '../domain/release.ts';
import type { Mm, Rect, Size } from '../domain/units.ts';
import { DEFAULT_PART_GAP_MM, packParts } from '../pack/sheet-packer.ts';
import type { PackItem } from '../pack/sheet-packer.ts';
import type { Guide, PanelBounds, PartPlacement, SheetLayout, SheetWarning } from './layout.ts';
import { CLASSIC_TEMPLATE } from './templates/classic.ts';
import { FULLBLEED_TEMPLATE } from './templates/fullbleed.ts';
import { MINIMAL_TEMPLATE } from './templates/minimal.ts';
import type {
  DesignChoice,
  JCardContext,
  PartContext,
  Template,
  TemplateId,
} from './templates/template.ts';
import type { TextMeasurer } from './text.ts';

export type { SheetLayout, PartPlacement, Guide, DrawOp, PrintFace, TextStyle, TextOp, SheetWarning } from './layout.ts';
export type { TextMeasurer } from './text.ts';
export type {
  DesignChoice,
  Template,
  TemplateFaces,
  TemplateId,
  TemplateParams,
  TemplateToggle,
} from './templates/template.ts';
export { DEFAULT_DESIGN_CHOICE, DEFAULT_TEMPLATE_PARAMS, TEMPLATE_TOGGLES } from './templates/template.ts';
export { TEMPLATES };

/**
 * SheetRenderer: from Releases plus their Templates and a Sheet configuration
 * to a layout model in millimetres. Pure — same inputs, same layout — so the
 * live preview, the 300 DPI raster and the PDF are three readers of one truth,
 * and the geometry can be asserted as data.
 *
 * Where each Part lands is SheetPacker's answer; what is drawn inside it is the
 * Template's. This module is the join.
 */

/**
 * A Release together with the choices that turn it into Parts (CONTEXT.md,
 * Design): which Template, in what colours, with which toggles on.
 *
 * The Part sizes are deliberately not in here. They describe the collector's
 * cartridges rather than this record, so they are one set of measurements for
 * the whole Queue and arrive beside the designs instead — see `Measurements`
 * (domain/measurements.ts) and the `dimensions` argument to `renderSheets`.
 */
export interface ReleaseDesign extends DesignChoice {
  readonly release: Release;
}

export interface SheetConfig {
  readonly paper: PaperSize;
  readonly marginMm: Mm;
  /** Which Parts this print job wants — "Labels only" is this list with one entry. */
  readonly parts: readonly PartKind[];
}

/** What a packed rectangle is, on the way back from SheetPacker. */
interface PartRef {
  readonly releaseId: string;
  readonly part: PartKind;
}

/** Human names for the Parts, used when one has to be named in an error. */
const PART_LABELS: Readonly<Record<PartKind, string>> = {
  jcard: 'J-Card',
  'back-card': 'Back Card',
  label: 'Label',
};

const TEMPLATES: Readonly<Record<TemplateId, Template>> = {
  classic: CLASSIC_TEMPLATE,
  fullbleed: FULLBLEED_TEMPLATE,
  minimal: MINIMAL_TEMPLATE,
};

export function templateFor(id: TemplateId): Template {
  return TEMPLATES[id];
}

function jCardPanels(dimensions: PartDimensions): Readonly<Record<JCardPanel, Rect>> {
  const { innerFlapWidth, spineWidth, frontPanelWidth, height } = dimensions.jcard;
  return {
    'inner-flap': { x: 0, y: 0, width: innerFlapWidth, height },
    spine: { x: innerFlapWidth, y: 0, width: spineWidth, height },
    'front-panel': { x: innerFlapWidth + spineWidth, y: 0, width: frontPanelWidth, height },
  };
}

/**
 * Cut guides trace what has to be cut out — including the Label's diagonal
 * corner. Fold guides mark where the J-Card folds into its three panels.
 */
function guidesFor(part: PartKind, dimensions: PartDimensions, size: Size): Guide[] {
  const cut: Guide = { kind: 'cut', points: partShape(part, dimensions).outline, closed: true };
  if (part !== 'jcard') return [cut];

  const panels = jCardPanels(dimensions);
  const folds: Guide[] = [panels['inner-flap'], panels.spine].map((panel) => {
    const x = panel.x + panel.width;
    return {
      kind: 'fold' as const,
      points: [
        { x, y: 0 },
        { x, y: size.height },
      ],
      closed: false,
    };
  });
  return [cut, ...folds];
}

function drawPart(
  part: PartKind,
  design: ReleaseDesign,
  dimensions: PartDimensions,
  size: Size,
  measure: TextMeasurer,
): { ops: PartPlacement['ops']; warnings?: readonly SheetWarning[]; panels?: readonly PanelBounds[] } {
  const template = templateFor(design.templateId);
  const context: PartContext = {
    release: design.release,
    params: design.params,
    dimensions,
    size,
    // Taken from the Template that is about to draw, so the shared pieces set
    // the Spine and the tracklist in its faces without asking which it is.
    faces: template.faces,
    measure,
  };

  switch (part) {
    case 'jcard': {
      const panels = jCardPanels(dimensions);
      const jCardContext: JCardContext = { ...context, panels };
      return {
        ...template.drawJCard(jCardContext),
        panels: JCARD_PANEL_ORDER.map((panel) => ({ panel, rect: panels[panel] })),
      };
    }
    case 'back-card':
      return template.drawBackCard(context);
    case 'label':
      return template.drawLabel(context);
  }
}

export function renderSheets(
  designs: readonly ReleaseDesign[],
  config: SheetConfig,
  /**
   * The Part sizes every Release in this Queue is cut to. One set for all of
   * them, taken beside the designs rather than out of one, because a Queue
   * prints onto one collector's cartridges — see `Measurements`.
   */
  dimensions: PartDimensions,
  measure: TextMeasurer,
): readonly SheetLayout[] {
  const byRelease = new Map(designs.map((design) => [design.release.id, design]));
  // Parts find their way back to a Release by id, so two Releases sharing one
  // would silently print the same content twice.
  if (byRelease.size !== designs.length) {
    throw new Error('minicovered: two Releases share an id, so their Parts cannot be told apart');
  }

  const items: Array<PackItem<PartRef>> = designs.flatMap((design) =>
    config.parts.map((part) => ({
      ref: { releaseId: design.release.id, part },
      label: `the ${PART_LABELS[part]} of ${design.release.album || design.release.id}`,
      size: partSize(part, dimensions),
    })),
  );

  const packed = packParts(items, {
    paper: config.paper,
    marginMm: config.marginMm,
    gapMm: DEFAULT_PART_GAP_MM,
  });

  return packed.sheets.map((sheet) => {
    const warnings: SheetWarning[] = [];

    const placements = sheet.placements.map(({ item, rect }): PartPlacement => {
      const { releaseId, part } = item.ref;
      const design = byRelease.get(releaseId);
      if (!design) throw new Error(`minicovered: no design for Release "${releaseId}"`);

      const { ops, panels, warnings: partWarnings } = drawPart(
        part,
        design,
        dimensions,
        item.size,
        measure,
      );
      warnings.push(...(partWarnings ?? []));
      return {
        releaseId,
        part,
        bounds: rect,
        ops,
        guides: guidesFor(part, dimensions, item.size),
        ...(panels ? { panels } : {}),
      };
    });

    return {
      paper: config.paper,
      marginMm: config.marginMm,
      placements,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  });
}

/** Re-exported so callers of the seam do not have to reach into the domain. */
export { jCardSize, partSize };
