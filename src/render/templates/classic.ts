import { partShape } from '../../domain/parts.ts';
import type { Mm, Rect } from '../../domain/units.ts';
import type { DrawOp, TextStyle } from '../layout.ts';
import {
  artworkOrPlaceholder,
  drawBackCard,
  drawJCard,
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

function drawFrontPanel({ release, params, measure }: PartContext, panel: Rect): DrawOp[] {
  const artSide = panel.width - 2 * PAD;
  const artTop = panel.y + PAD;
  const artBottom = artTop + artSide;

  // The logo takes the bottom-right corner, so the caption gets the rest of the
  // width and centres in that — otherwise a long artist runs straight through
  // the mark, which no amount of ellipsising alone would prevent.
  const logoColumn = params.showLogo ? FRONT_LOGO_WIDTH + PAD : 0;
  const captionLeft = panel.x + PAD;
  const captionWidth = panel.width - 2 * PAD - logoColumn;
  const captionCentre = captionLeft + captionWidth / 2;

  const artistStyle: TextStyle = { sizeMm: 4, weight: 700, color: params.inkColor, align: 'center', baseline: 'top' };
  const albumStyle: TextStyle = { sizeMm: 3.2, weight: 400, color: params.inkColor, align: 'center', baseline: 'top' };

  return [
    { op: 'fill-rect', rect: panel, color: params.paperColor },
    artworkOrPlaceholder(release, { x: panel.x + PAD, y: artTop, width: artSide, height: artSide }, params),
    ...(params.showOverlayText
      ? [
          text(release.artist, { x: captionCentre, y: artBottom + 2.4 }, artistStyle, captionWidth, measure),
          text(release.album, { x: captionCentre, y: artBottom + 7.2 }, albumStyle, captionWidth, measure),
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
    artworkOrPlaceholder(release, { x: artLeft, y: pad, width: artSide, height: artSide }, params),
    // Beside the artwork rather than on top of it, so `showOverlayText` — which
    // governs type over artwork — leaves this caption alone.
    text(release.artist, { x: centreX, y: captionTop }, artistStyle, textWidth, measure),
    text(release.album, { x: centreX, y: captionTop + artistStyle.sizeMm + 1 }, albumStyle, textWidth, measure),
  ];
}

export const CLASSIC_TEMPLATE: Template = {
  id: 'classic',
  name: 'Classic',
  description: 'Solid background, artwork as a square, type below it.',
  drawJCard: (context: JCardContext) => drawJCard(context, drawFrontPanel),
  drawBackCard,
  drawLabel: (context: PartContext) => ({ ops: drawLabel(context) }),
};

