import { partShape } from '../../domain/parts.ts';
import type { Release } from '../../domain/release.ts';
import type { Mm, Point, Rect } from '../../domain/units.ts';
import type { DrawOp, TextStyle } from '../layout.ts';
import {
  drawBackCard,
  drawInnerFlap,
  drawSpine,
  FRONT_LOGO_WIDTH,
  logoOp,
  PAD,
  text,
} from './shared.ts';
import type { JCardContext, PartContext, Template } from './template.ts';

/**
 * Full-bleed: the artwork runs to the edges of the Front Panel and the type
 * sits on top of it. Overlaid type needs something to sit on, or a bright
 * album makes it vanish — hence the scrim, and hence the point of being able
 * to switch the type off entirely and let the artwork stand alone.
 */

/** Height of the darkened band the overlay type sits in. */
const SCRIM_HEIGHT: Mm = 17;
const SCRIM_COLOR = '#00000099';
const OVERLAY_INK = '#ffffff';

const PLACEHOLDER = '#d9d9d9';

function bleedArtwork(release: Release, rect: Rect): DrawOp {
  return release.artwork
    ? { op: 'image', rect, source: release.artwork, fit: 'cover', role: 'artwork' }
    : { op: 'fill-rect', rect, color: PLACEHOLDER };
}

function scrimAndText(
  { release, params, measure }: PartContext,
  bounds: Rect,
  scrimHeight: Mm,
  artistSizeMm: Mm,
): DrawOp[] {
  if (!params.showCoverText) return [];

  const scrimTop = bounds.y + bounds.height - scrimHeight;
  const centreX = bounds.x + bounds.width / 2;
  const textWidth = bounds.width - 2 * PAD;
  const artistStyle: TextStyle = {
    sizeMm: artistSizeMm,
    weight: 700,
    color: OVERLAY_INK,
    align: 'center',
    baseline: 'top',
  };
  const albumStyle: TextStyle = {
    sizeMm: artistSizeMm * 0.8,
    weight: 400,
    color: OVERLAY_INK,
    align: 'center',
    baseline: 'top',
  };

  return [
    {
      op: 'fill-rect',
      rect: { x: bounds.x, y: scrimTop, width: bounds.width, height: scrimHeight },
      color: SCRIM_COLOR,
    },
    text(release.artist, { x: centreX, y: scrimTop + 2.6 }, artistStyle, textWidth, measure),
    text(
      release.album,
      { x: centreX, y: scrimTop + 2.6 + artistSizeMm + 1 },
      albumStyle,
      textWidth,
      measure,
    ),
  ];
}

function drawFrontPanel(context: PartContext, panel: Rect): DrawOp[] {
  const { release, params } = context;
  // The logo goes above the scrim when there is one, so the two never collide.
  const logoAnchor: Point = {
    x: panel.x + PAD,
    y: panel.y + panel.height - (params.showCoverText ? SCRIM_HEIGHT : 0) - PAD,
  };

  return [
    bleedArtwork(release, panel),
    ...scrimAndText(context, panel, SCRIM_HEIGHT, 4),
    ...logoOp(params, logoAnchor, FRONT_LOGO_WIDTH, OVERLAY_INK),
  ];
}

function drawLabel(context: PartContext): DrawOp[] {
  const { release, size, dimensions } = context;
  const outline = partShape('label', dimensions).outline;
  const bounds: Rect = { x: 0, y: 0, width: size.width, height: size.height };

  return [
    // The notched outline is filled first so the diagonal corner stays paper,
    // then the artwork covers it — the rasteriser clips both to the same shape.
    { op: 'fill-polygon', points: outline, color: context.params.paperColor },
    bleedArtwork(release, bounds),
    ...scrimAndText(context, bounds, 11, 2.8),
  ];
}

export const FULLBLEED_TEMPLATE: Template = {
  id: 'fullbleed',
  name: 'Full-bleed',
  description: 'Artwork edge to edge, type as an overlay.',
  drawJCard: (context: JCardContext) => [
    ...drawInnerFlap(context, context.panels['inner-flap']),
    ...drawSpine(context, context.panels.spine),
    ...drawFrontPanel(context, context.panels['front-panel']),
  ],
  drawBackCard,
  drawLabel,
};
