import { partShape } from '../../domain/parts.ts';
import type { Release } from '../../domain/release.ts';
import type { Mm, Rect } from '../../domain/units.ts';
import type { DrawOp, TextStyle } from '../layout.ts';
import type { TemplateParams } from './template.ts';
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
 * Classic: a solid background with the artwork as a square and the type below
 * it. The counterpart to Full-bleed, where the artwork runs to the edges.
 */

const PLACEHOLDER = '#e6e6e6';

function artworkOrPlaceholder(release: Release, rect: Rect): DrawOp {
  return release.artwork
    ? { op: 'image', rect, source: release.artwork, fit: 'cover', role: 'artwork' }
    : { op: 'fill-rect', rect, color: PLACEHOLDER };
}

function drawFrontPanel({ release, params, measure }: PartContext, panel: Rect): DrawOp[] {
  const artSide = panel.width - 2 * PAD;
  const artTop = panel.y + PAD;
  const artBottom = artTop + artSide;
  const centreX = panel.x + panel.width / 2;
  const textWidth = panel.width - 2 * PAD;

  const artistStyle: TextStyle = { sizeMm: 4, weight: 700, color: params.inkColor, align: 'center', baseline: 'top' };
  const albumStyle: TextStyle = { sizeMm: 3.2, weight: 400, color: params.inkColor, align: 'center', baseline: 'top' };

  return [
    { op: 'fill-rect', rect: panel, color: params.paperColor },
    artworkOrPlaceholder(release, { x: panel.x + PAD, y: artTop, width: artSide, height: artSide }),
    ...(params.showCoverText
      ? [
          text(release.artist, { x: centreX, y: artBottom + 2.4 }, artistStyle, textWidth, measure),
          text(release.album, { x: centreX, y: artBottom + 7.2 }, albumStyle, textWidth, measure),
        ]
      : []),
    ...logoOp(
      params,
      { x: panel.x + panel.width - PAD - FRONT_LOGO_WIDTH, y: panel.y + panel.height - PAD },
      FRONT_LOGO_WIDTH,
      params.inkColor,
    ),
  ];
}

function drawLabel({ release, params, size, dimensions, measure }: PartContext): DrawOp[] {
  const pad: Mm = 2.5;
  // The diagonal runs x = (width - notch) + y, so a square inset by `pad` on
  // every side would poke through it at the top right. Sizing the square to
  // clear the diagonal keeps the artwork whole.
  const { notchSize } = dimensions.label;
  const artSide = Math.min(size.width - 2 * pad, size.width - notchSize - pad);
  const artLeft = (size.width - artSide) / 2;

  const artistStyle: TextStyle = { sizeMm: 2.8, weight: 700, color: params.inkColor, align: 'center', baseline: 'top' };
  const albumStyle: TextStyle = { sizeMm: 2.4, weight: 400, color: params.inkColor, align: 'center', baseline: 'top' };
  const centreX = size.width / 2;
  const textWidth = size.width - 2 * pad;

  // Centre the caption in whatever room the artwork leaves, so the Label reads
  // as one block instead of drifting to the top edge.
  const captionHeight = artistStyle.sizeMm + 1 + albumStyle.sizeMm;
  const captionTop = pad + artSide + (size.height - pad - (pad + artSide) - captionHeight) / 2;

  return [
    { op: 'fill-polygon', points: partShape('label', dimensions).outline, color: params.paperColor },
    artworkOrPlaceholder(release, { x: artLeft, y: pad, width: artSide, height: artSide }),
    text(release.artist, { x: centreX, y: captionTop }, artistStyle, textWidth, measure),
    text(release.album, { x: centreX, y: captionTop + artistStyle.sizeMm + 1 }, albumStyle, textWidth, measure),
  ];
}

export const CLASSIC_TEMPLATE: Template = {
  id: 'classic',
  name: 'Classic',
  description: 'Solid background, artwork as a square, type below it.',
  drawJCard: (context: JCardContext) => [
    ...drawInnerFlap(context, context.panels['inner-flap']),
    ...drawSpine(context, context.panels.spine),
    ...drawFrontPanel(context, context.panels['front-panel']),
  ],
  drawBackCard,
  drawLabel,
};

export type { TemplateParams };
