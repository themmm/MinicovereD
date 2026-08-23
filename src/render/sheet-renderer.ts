import type { PaperSize } from '../domain/paper.ts';
import { insertSize, partShape, partSize } from '../domain/parts.ts';
import type { PartDimensions, PartKind } from '../domain/parts.ts';
import type { Release } from '../domain/release.ts';
import type { Mm, Size } from '../domain/units.ts';
import { DEFAULT_PART_GAP_MM, packParts } from '../pack/sheet-packer.ts';
import type { PackItem } from '../pack/sheet-packer.ts';
import { hasCredits } from '../domain/credits.ts';
import { insertFolds, insertPanels, maxInsertPages, planInsert } from './insert-plan.ts';
import type { InsertPlan } from './insert-plan.ts';
import { splitTracks } from './tracklist-layout.ts';
import type { Guide, PanelBounds, PartPlacement, SheetLayout, SheetWarning } from './layout.ts';
import { CLASSIC_TEMPLATE } from './templates/classic.ts';
import { FULLBLEED_TEMPLATE } from './templates/fullbleed.ts';
import { MINIMAL_TEMPLATE } from './templates/minimal.ts';
import type {
  DesignChoice,
  InsertContext,
  InsertPage,
  PartContext,
  Template,
  TemplateId,
} from './templates/template.ts';
import type { TextMeasurer } from './text.ts';

export type {
  SheetLayout,
  PartPlacement,
  Guide,
  CutGuide,
  FoldGuide,
  FoldKind,
  PageRole,
  PanelBounds,
  DrawOp,
  PrintFace,
  TextStyle,
  TextOp,
  SheetWarning,
} from './layout.ts';
export type { TextMeasurer } from './text.ts';
export type {
  DesignChoice,
  InsertContext,
  InsertPage,
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
  /**
   * How many Pages this Release's Insert folds into, when the collector said
   * rather than let the content decide (ADR-0012's manual override).
   *
   * On the Design and deliberately **not** on `DesignChoice`, which is the half
   * that carries forward (CONTEXT.md, Design choice). A collector who forced a
   * four-Page Insert meant it about *this* record's credits, and carrying it to
   * the next Release would fold Pages for content that is not there. Absent is
   * the ordinary case and means "work it out".
   *
   * Not a measurement either, which is the other place it could have gone: every
   * field of `Measurements` is a length in millimetres and a count is not one.
   * There is no app-level default because the derived count already is one, and a
   * better one — it is about the record in front of the collector rather than
   * about their preferences.
   */
  readonly pageCount?: number;
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
  insert: 'Insert',
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

/**
 * How many Pages this Design's Insert folds into, and what goes on each.
 *
 * Worked out here rather than inside the drawing, because the strip's *length*
 * depends on it and the packer needs a length before anything is drawn. That is
 * the whole reason the plan is a separate step: an Insert is the one Part whose
 * size is not a measurement.
 *
 * The Template is asked one question — whether it has a back cover for this
 * Release — and the paper is asked another: how long a strip it will take. Both
 * answers change the count, which is why neither can be left to the Template
 * that eventually draws the Pages.
 */
function planFor(design: ReleaseDesign, dimensions: PartDimensions, config: SheetConfig): InsertPlan {
  const { release } = design;
  return planInsert(
    {
      trackCount: release.tracks.length,
      hasCredits: !!release.credits && hasCredits(release.credits),
      hasBackCover: templateFor(design.templateId).hasBackCover(release),
    },
    dimensions.insert,
    maxInsertPages(dimensions.insert, config.paper, config.marginMm),
    design.pageCount,
  );
}

/**
 * Cut guides trace what has to be cut out — including the Label's diagonal
 * corner. Fold guides mark every crease across the Insert, each one carrying
 * which kind it is so the Sheet can draw the three differently: a collector who
 * folds a fore-edge the way the spine goes gets a booklet with a blank face
 * showing (ADR-0012).
 */
function guidesFor(
  part: PartKind,
  dimensions: PartDimensions,
  pageCount: number,
  size: Size,
): Guide[] {
  const cut: Guide = {
    kind: 'cut',
    points: partShape(part, dimensions, pageCount).outline,
    closed: true,
  };
  if (part !== 'insert') return [cut];

  const folds: Guide[] = insertFolds(dimensions.insert, pageCount).map((fold) => ({
    kind: 'fold' as const,
    fold: fold.kind,
    points: [
      { x: fold.atMm, y: 0 },
      { x: fold.atMm, y: size.height },
    ],
    closed: false,
  }));
  return [cut, ...folds];
}

function drawPart(
  part: PartKind,
  design: ReleaseDesign,
  dimensions: PartDimensions,
  plan: InsertPlan,
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
    case 'insert': {
      const panels = insertPanels(dimensions.insert, plan.pages);
      // Dealt out once, here, so every Template splits a long list the same way
      // and none of them can lose a track doing it.
      const shares = splitTracks(
        design.release.tracks,
        plan.pages.filter((role) => role === 'tracklist').length,
      );
      let listPage = 0;
      const pages: InsertPage[] = panels.flatMap((panel): InsertPage[] => {
        if (panel.panel !== 'page') return [];
        const tracks = panel.role === 'tracklist' ? shares[listPage++] : undefined;
        return [
          {
            page: panel.page,
            role: panel.role,
            rect: panel.rect,
            ...(tracks ? { tracks } : {}),
          },
        ];
      });
      const insertContext: InsertContext = {
        ...context,
        // Non-null: `insertPanels` always emits these two first, in this order.
        innerFlap: (panels[0] as Extract<PanelBounds, { panel: 'inner-flap' | 'spine' }>).rect,
        spine: (panels[1] as Extract<PanelBounds, { panel: 'inner-flap' | 'spine' }>).rect,
        pages,
      };
      return { ...template.drawInsert(insertContext), panels };
    }
    case 'label':
      return template.drawLabel(context);
  }
}

/** The Insert has fewer Pages than the content asked for, said as data. */
function shortfall(
  design: ReleaseDesign,
  plan: InsertPlan,
  maxPages: number,
  config: SheetConfig,
): SheetWarning[] {
  if (plan.dropped.length === 0) return [];
  const { release } = design;
  return [
    {
      kind: 'insert-pages-short',
      releaseId: release.id,
      releaseTitle: release.album || release.artist || release.id,
      wantedPages: plan.wantedPages,
      pages: plan.pages.length,
      maxPages,
      paperName: config.paper.name,
      marginMm: config.marginMm,
      dropped: plan.dropped,
    },
  ];
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

  // Planned before anything is packed, because the Insert is the one Part whose
  // length is not a measurement: how many Pages it folds into decides how much
  // paper it takes.
  const plans = new Map(designs.map((design) => [design.release.id, planFor(design, dimensions, config)]));
  const planOf = (releaseId: string): InsertPlan => {
    const plan = plans.get(releaseId);
    if (!plan) throw new Error(`minicovered: no Insert plan for Release "${releaseId}"`);
    return plan;
  };

  const items: Array<PackItem<PartRef>> = designs.flatMap((design) =>
    config.parts.map((part) => ({
      ref: { releaseId: design.release.id, part },
      label: `the ${PART_LABELS[part]} of ${design.release.album || design.release.id}`,
      size: partSize(part, dimensions, planOf(design.release.id).pages.length),
    })),
  );

  const packed = packParts(items, {
    paper: config.paper,
    marginMm: config.marginMm,
    gapMm: DEFAULT_PART_GAP_MM,
    // A Part longer than the paper is wide is turned rather than refused
    // (ADR-0014), and the strip that leaves beside it is filled downwards
    // rather than left empty. Neither is the packer's default, because the
    // calibration sheet shares it and wants the other answer to both.
    turn: 'to-fit',
    columns: true,
  });

  // Said once per Release rather than once per Sheet: a Release's Insert is on
  // exactly one Sheet, and the warning is about the strip rather than the paper
  // it landed on. Collected up front so it is reported even when the Insert is
  // not among the Parts this job prints — the Pages it lost are still Pages the
  // collector will not have.
  const maxPages = maxInsertPages(dimensions.insert, config.paper, config.marginMm);
  const shortfalls = designs.flatMap((design) =>
    shortfall(design, planOf(design.release.id), maxPages, config),
  );

  const sheets = packed.sheets.map((sheet): SheetLayout => {
    const warnings: SheetWarning[] = [];

    const placements = sheet.placements.map(({ item, rect, turned }): PartPlacement => {
      const { releaseId, part } = item.ref;
      const design = byRelease.get(releaseId);
      if (!design) throw new Error(`minicovered: no design for Release "${releaseId}"`);

      // `item.size` throughout, never `rect`: a turned Part is drawn and cut in
      // its own upright millimetres, and the turn is applied to the whole of it
      // at once by whoever draws it.
      const plan = planOf(releaseId);
      const { ops, panels, warnings: partWarnings } = drawPart(
        part,
        design,
        dimensions,
        plan,
        item.size,
        measure,
      );
      warnings.push(...(partWarnings ?? []));
      return {
        releaseId,
        part,
        bounds: rect,
        turned,
        ops,
        guides: guidesFor(part, dimensions, plan.pages.length, item.size),
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

  // On the first Sheet, which is the one a collector is looking at, and only
  // there — the Sheet check lists every Sheet's warnings together anyway, and
  // repeating these on each would count one lost credits Page several times.
  const [first, ...rest] = sheets;
  if (!first || shortfalls.length === 0) return sheets;
  return [{ ...first, warnings: [...shortfalls, ...(first.warnings ?? [])] }, ...rest];
}

/** Re-exported so callers of the seam do not have to reach into the domain. */
export { insertSize, partSize };
export { insertFolds, insertPanels, maxInsertPages, planInsert } from './insert-plan.ts';
export type { InsertFold, InsertPlan } from './insert-plan.ts';
