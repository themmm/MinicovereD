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
import type {
  JCardContext,
  PartContext,
  Template,
  TemplateId,
  TemplateParams,
} from './templates/template.ts';
import type { TextMeasurer } from './text.ts';

export type { SheetLayout, PartPlacement, Guide, DrawOp, TextStyle, SheetWarning } from './layout.ts';
export type { TextMeasurer } from './text.ts';
export type { TemplateId, TemplateParams, Template } from './templates/template.ts';
export { DEFAULT_TEMPLATE_PARAMS } from './templates/template.ts';
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

/** A Release together with the Template chosen for it and the Part sizes it prints at. */
export interface ReleaseDesign {
  readonly release: Release;
  readonly templateId: TemplateId;
  /** Colours and toggles for this Release, independent of any other. */
  readonly params: TemplateParams;
  readonly dimensions: PartDimensions;
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
  size: Size,
  measure: TextMeasurer,
): { ops: PartPlacement['ops']; warnings?: readonly SheetWarning[]; panels?: readonly PanelBounds[] } {
  const template = templateFor(design.templateId);
  const context: PartContext = {
    release: design.release,
    params: design.params,
    dimensions: design.dimensions,
    size,
    measure,
  };

  switch (part) {
    case 'jcard': {
      const panels = jCardPanels(design.dimensions);
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
  measure: TextMeasurer,
): readonly SheetLayout[] {
  const byRelease = new Map(designs.map((design) => [design.release.id, design]));
  // Parts find their way back to a Release by id, so two Releases sharing one
  // would silently print the same content twice.
  if (byRelease.size !== designs.length) {
    throw new Error('mdcovergen: two Releases share an id, so their Parts cannot be told apart');
  }

  const items: Array<PackItem<PartRef>> = designs.flatMap((design) =>
    config.parts.map((part) => ({
      ref: { releaseId: design.release.id, part },
      label: `the ${PART_LABELS[part]} of ${design.release.album || design.release.id}`,
      size: partSize(part, design.dimensions),
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
      if (!design) throw new Error(`mdcovergen: no design for Release "${releaseId}"`);

      const { ops, panels, warnings: partWarnings } = drawPart(part, design, item.size, measure);
      warnings.push(...(partWarnings ?? []));
      return {
        releaseId,
        part,
        bounds: rect,
        ops,
        guides: guidesFor(part, design.dimensions, item.size),
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
