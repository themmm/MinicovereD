import type { PaperSize } from '../domain/paper.ts';
import {
  DEFAULT_PART_DIMENSIONS,
  JCARD_PANEL_ORDER,
  PART_KINDS,
  jCardSize,
  partShape,
  partSize,
} from '../domain/parts.ts';
import type { JCardPanel, PartDimensions, PartKind } from '../domain/parts.ts';
import type { Release } from '../domain/release.ts';
import type { Mm, Rect, Size } from '../domain/units.ts';
import { printableArea } from './layout.ts';
import type { Guide, PanelBounds, PartPlacement, SheetLayout } from './layout.ts';
import { CLASSIC_TEMPLATE } from './templates/classic.ts';
import type { JCardContext, PartContext, Template, TemplateId } from './templates/template.ts';
import type { TextMeasurer } from './text.ts';

export type { SheetLayout, PartPlacement, Guide, DrawOp, TextStyle } from './layout.ts';
export type { TextMeasurer } from './text.ts';
export type { TemplateId } from './templates/template.ts';

/**
 * SheetRenderer: from Releases plus their Templates and a Sheet configuration
 * to a layout model in millimetres. Pure — same inputs, same layout — so the
 * live preview, the 300 DPI raster and the PDF are three readers of one truth,
 * and the geometry can be asserted as data.
 */

/** A Release together with the Template chosen for it and the Part sizes it prints at. */
export interface ReleaseDesign {
  readonly release: Release;
  readonly templateId: TemplateId;
  readonly dimensions: PartDimensions;
}

export interface SheetConfig {
  readonly paper: PaperSize;
  readonly marginMm: Mm;
}

/** Breathing room between Parts so two cut lines never end up on top of each other. */
const PART_GAP_MM: Mm = 4;

const TEMPLATES: Readonly<Record<TemplateId, Template>> = {
  classic: CLASSIC_TEMPLATE,
};

export function templateFor(id: TemplateId): Template {
  return TEMPLATES[id];
}

export function defaultDesign(release: Release): ReleaseDesign {
  return { release, templateId: 'classic', dimensions: DEFAULT_PART_DIMENSIONS };
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
): { ops: PartPlacement['ops']; panels?: readonly PanelBounds[] } {
  const template = templateFor(design.templateId);
  const context: PartContext = {
    release: design.release,
    dimensions: design.dimensions,
    size,
    measure,
  };

  switch (part) {
    case 'jcard': {
      const panels = jCardPanels(design.dimensions);
      const jCardContext: JCardContext = { ...context, panels };
      return {
        ops: template.drawJCard(jCardContext),
        panels: JCARD_PANEL_ORDER.map((panel) => ({ panel, rect: panels[panel] })),
      };
    }
    case 'back-card':
      return { ops: template.drawBackCard(context) };
    case 'label':
      return { ops: template.drawLabel(context) };
  }
}

/**
 * Shelf arrangement inside the printable area: Parts are laid in rows, a new
 * row starting when the current one runs out of width. Ticket 03 replaces this
 * with SheetPacker, which packs several Releases across as few Sheets as
 * possible; here it only has to put one Release's three Parts on one Sheet —
 * and say so loudly rather than place a Part where the printer will clip it.
 */
function arrange(sizes: readonly Size[], area: Rect): Rect[] {
  const placed: Rect[] = [];
  let cursorX = area.x;
  let cursorY = area.y;
  let rowHeight = 0;

  for (const size of sizes) {
    if (size.width > area.width || size.height > area.height) {
      throw new Error(
        `mdcovergen: a ${size.width} × ${size.height} mm Part does not fit the ` +
          `${area.width} × ${area.height} mm printable area`,
      );
    }
    if (cursorX > area.x && cursorX + size.width > area.x + area.width) {
      cursorX = area.x;
      cursorY += rowHeight + PART_GAP_MM;
      rowHeight = 0;
    }
    if (cursorY + size.height > area.y + area.height) {
      throw new Error('mdcovergen: this Release does not fit on one Sheet');
    }
    placed.push({ x: cursorX, y: cursorY, width: size.width, height: size.height });
    cursorX += size.width + PART_GAP_MM;
    rowHeight = Math.max(rowHeight, size.height);
  }
  return placed;
}

export function renderSheets(
  designs: readonly ReleaseDesign[],
  config: SheetConfig,
  measure: TextMeasurer,
): readonly SheetLayout[] {
  const area = printableArea(config.paper, config.marginMm);

  return designs.map((design) => {
    const sizes = PART_KINDS.map((part) => partSize(part, design.dimensions));
    const rects = arrange(sizes, area);

    const placements: PartPlacement[] = PART_KINDS.map((part, index) => {
      const bounds = rects[index] as Rect;
      const size = sizes[index] as Size;
      const { ops, panels } = drawPart(part, design, size, measure);
      return {
        releaseId: design.release.id,
        part,
        bounds,
        ops,
        guides: guidesFor(part, design.dimensions, size),
        ...(panels ? { panels } : {}),
      };
    });

    return { paper: config.paper, marginMm: config.marginMm, placements };
  });
}

/** Re-exported so callers of the seam do not have to reach into the domain. */
export { jCardSize, partSize };
