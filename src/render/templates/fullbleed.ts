import type { Mm, Point, Rect } from '../../domain/units.ts';
import { readableInkFor, withAlpha } from '../colors.ts';
import type { DrawOp, TextStyle } from '../layout.ts';
import {
  artworkOrPlaceholder,
  drawJCard,
  drawTracklist,
  FRONT_LOGO_WIDTH,
  logoOp,
  PAD,
  text,
} from './shared.ts';
import type { JCardContext, PartContext, PartDrawing, Template, TemplateParams } from './template.ts';

/**
 * Full-bleed: the artwork runs to the edges of the Front Panel and the type
 * sits on top of it. Overlaid type needs something to sit on, or a bright
 * album makes it vanish — hence the scrim, and hence the point of being able
 * to switch the type off entirely and let the artwork stand alone.
 *
 * The scrim takes the Release's ink colour, and the type on it is whichever of
 * black or white can be read against that: the collector picks the mood, the
 * Template guarantees it stays legible.
 *
 * Its Back Card is the same argument on paper with no picture in it: the ink as
 * a ground rather than as type, the scrim grown into a solid accent band, and
 * the tracklist reversed out.
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

/**
 * The Back Card's masthead: the band it sits in, and the two lines in it.
 *
 * The band is 15 mm because the artist starts at `PAD` and is 2.6 mm, the album
 * starts 1 mm after it and is 4.6 mm, and 3.8 mm of colour below the album is
 * what stops the bar reading as a caption box cropped too tight.
 */
const BACK_BAND_HEIGHT: Mm = 15;
const BACK_ARTIST_SIZE: Mm = 2.6;
const BACK_ALBUM_SIZE: Mm = 4.6;
/** Where the list starts, 3 mm under the band. */
const BACK_LIST_TOP: Mm = 18;

/**
 * The Back Card: the Release's ink as a full-bleed ground, a solid accent band
 * across the top carrying the masthead, and the tracklist reversed out of the
 * ink below it.
 *
 * The band is the Front Panel's device brought round the back. There it is a
 * scrim — the ink at 62 %, darkening artwork so overlaid type survives it; here
 * there is no artwork to darken, so it is a solid bar and takes the accent,
 * which is otherwise spent nowhere on this Template but the Spine.
 *
 * Ranged left and artist above album, which is the opposite of Classic on both
 * counts: a poster leads with the name and hangs everything off one left edge.
 * The 0.2 mm rule is gone from here too; the band does that job with weight.
 */
function drawBackCard(context: PartContext): PartDrawing {
  const { release, params, size, faces, measure } = context;
  const bandInk = readableInkFor(params.accentColor);
  const listInk = readableInkFor(params.inkColor);
  const contentWidth = size.width - 2 * PAD;

  const artistStyle: TextStyle = {
    sizeMm: BACK_ARTIST_SIZE,
    weight: 400,
    face: faces.display,
    color: bandInk,
    align: 'left',
    baseline: 'top',
  };
  const albumStyle: TextStyle = {
    sizeMm: BACK_ALBUM_SIZE,
    weight: 700,
    face: faces.display,
    color: bandInk,
    align: 'left',
    baseline: 'top',
  };

  const tracklist = drawTracklist(
    context,
    {
      x: PAD,
      y: BACK_LIST_TOP,
      width: contentWidth,
      height: size.height - BACK_LIST_TOP - PAD,
    },
    listInk,
  );

  return {
    ops: [
      { op: 'fill-rect', rect: { x: 0, y: 0, width: size.width, height: size.height }, color: params.inkColor },
      { op: 'fill-rect', rect: { x: 0, y: 0, width: size.width, height: BACK_BAND_HEIGHT }, color: params.accentColor },
      text(release.artist, { x: PAD, y: PAD }, artistStyle, contentWidth, measure),
      text(release.album, { x: PAD, y: PAD + BACK_ARTIST_SIZE + 1 }, albumStyle, contentWidth, measure),
      ...tracklist.ops,
    ],
    ...(tracklist.warnings ? { warnings: tracklist.warnings } : {}),
  };
}

export const FULLBLEED_TEMPLATE: Template = {
  id: 'fullbleed',
  name: 'Full-bleed',
  description: 'Artwork edge to edge, type as an overlay, tracklist on colour.',
  // Every word on the Front Panel and the Label sits on the artwork here, so
  // `showOverlayText` is the one Template it means something to. The artwork
  // covers the Part by definition, which leaves `insetArtwork` nothing to do.
  toggles: ['showOverlayText', 'showLogo'],
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
