import type { Mm, Point, Rect } from '../../domain/units.ts';
import { readableInkFor, withAlpha } from '../colors.ts';
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
import type { JCardContext, PartContext, Template, TemplateParams } from './template.ts';

/**
 * Full-bleed: the artwork runs to the edges of the Front Panel and the type
 * sits on top of it. Overlaid type needs something to sit on, or a bright
 * album makes it vanish — hence the scrim, and hence the point of being able
 * to switch the type off entirely and let the artwork stand alone.
 *
 * The scrim takes the Release's ink colour, and the type on it is whichever of
 * black or white can be read against that: the collector picks the mood, the
 * Template guarantees it stays legible.
 */

/** How much of the ink colour the scrim keeps — enough to darken artwork under type. */
const SCRIM_OPACITY = 0.62;

/** Height of the band the overlay type sits in, per Part. */
const FRONT_PANEL_SCRIM: Mm = 17;
const LABEL_SCRIM: Mm = 11;

const FRONT_PANEL_ARTIST_SIZE: Mm = 4;
const LABEL_ARTIST_SIZE: Mm = 2.8;

const scrimColor = (params: TemplateParams): string => withAlpha(params.inkColor, SCRIM_OPACITY);

/** Ink that reads on the scrim, whatever colour the Release chose for it. */
const overlayInk = (params: TemplateParams): string => readableInkFor(params.inkColor);

function scrimAndText(
  context: PartContext,
  bounds: Rect,
  scrimHeight: Mm,
  artistSizeMm: Mm,
): DrawOp[] {
  const { release, params, faces, measure } = context;
  if (!params.showOverlayText) return [];

  const ink = overlayInk(params);
  const scrimTop = bounds.y + bounds.height - scrimHeight;
  const centreX = bounds.x + bounds.width / 2;
  const textWidth = bounds.width - 2 * PAD;
  const artistStyle: TextStyle = {
    sizeMm: artistSizeMm,
    weight: 700,
    face: faces.display,
    color: ink,
    align: 'center',
    baseline: 'top',
  };
  const albumStyle: TextStyle = {
    sizeMm: artistSizeMm * 0.8,
    weight: 400,
    face: faces.display,
    color: ink,
    align: 'center',
    baseline: 'top',
  };

  return [
    {
      op: 'fill-rect',
      rect: { x: bounds.x, y: scrimTop, width: bounds.width, height: scrimHeight },
      color: scrimColor(params),
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
  // Above the scrim when there is one, so the two never collide.
  const logoAnchor: Point = {
    x: panel.x + PAD,
    y: panel.y + panel.height - (params.showOverlayText ? FRONT_PANEL_SCRIM : 0) - PAD,
  };

  return [
    artworkOrPlaceholder(release, panel, params),
    ...scrimAndText(context, panel, FRONT_PANEL_SCRIM, FRONT_PANEL_ARTIST_SIZE),
    ...logoOp(params, logoAnchor, FRONT_LOGO_WIDTH, overlayInk(params)),
  ];
}

function drawLabel(context: PartContext): DrawOp[] {
  const { release, params, size } = context;
  const bounds: Rect = { x: 0, y: 0, width: size.width, height: size.height };

  // No paper fill underneath: the artwork covers the whole Part, and the
  // diagonal corner comes from the Part's cut outline, which every renderer
  // clips to. Drawing a notched polygon here would be dead paint.
  return [
    artworkOrPlaceholder(release, bounds, params),
    ...scrimAndText(context, bounds, LABEL_SCRIM, LABEL_ARTIST_SIZE),
  ];
}

export const FULLBLEED_TEMPLATE: Template = {
  id: 'fullbleed',
  name: 'Full-bleed',
  description: 'Artwork edge to edge, type as an overlay.',
  /**
   * A poster: a squared grotesque over the artwork and on the Spine, a slab for
   * the reading.
   *
   * Space Grotesk twice on purpose — the overlay type and the Spine are the two
   * things read together when the case is on a shelf, and this Template's whole
   * argument is one graphic surface rather than a design plus a caption. Bitter
   * carries the body because v2 sets the tracklist Page reversed out of the
   * Release's colour (spec, Templates and type), and a slab's blunt stems
   * survive white-on-colour where a fine serif's hairlines close up.
   */
  faces: { display: 'grotesque', text: 'slab', spine: 'grotesque' },
  drawJCard: (context: JCardContext) => drawJCard(context, drawFrontPanel),
  drawBackCard,
  drawLabel: (context: PartContext) => ({ ops: drawLabel(context) }),
};
