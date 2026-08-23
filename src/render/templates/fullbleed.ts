import type { Release, Track } from '../../domain/release.ts';
import type { Mm, Point, Rect } from '../../domain/units.ts';
import { readableInkFor, withAlpha } from '../colors.ts';
import type { DrawOp, TextStyle } from '../layout.ts';
import {
  artworkOrPlaceholder,
  drawArtworkBackCover,
  drawCredits,
  drawInsert,
  drawTracklist,
  FRONT_LOGO_WIDTH,
  hasArtworkBackCover,
  logoOp,
  PAD,
  text,
} from './shared.ts';
import type { InsertContext, PartContext, PartDrawing, Template, TemplateParams } from './template.ts';

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
 * Its interior Pages are the same argument on paper with no picture in them: the
 * ink as a ground rather than as type, the scrim grown into a solid accent band,
 * and the list reversed out. The credits Page is that same Page with a different
 * word in the band and a different block under it — which is the point of a
 * poster series rather than a fault: this Template's whole argument is one
 * graphic surface, so its two interior Pages are two states of one design where
 * Classic's are a title page and a colophon.
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
 * The interior Pages' masthead: the band it sits in, and the two lines in it.
 *
 * The band is 15 mm because the artist starts at `PAD` and is 2.6 mm, the album
 * starts 1 mm after it and is 4.6 mm, and 3.8 mm of colour below the album is
 * what stops the bar reading as a caption box cropped too tight.
 */
const BAND_HEIGHT: Mm = 15;
const PAGE_ARTIST_SIZE: Mm = 2.6;
const PAGE_ALBUM_SIZE: Mm = 4.6;
/** Where the block starts, 3 mm under the band. */
const PAGE_BLOCK_TOP: Mm = 18;

/**
 * The ink ground, the accent band, and the two lines in the band — the shell both
 * interior Pages are built on.
 *
 * The band is the Front Panel's device brought inside. There it is a scrim — the
 * ink at 62 %, darkening artwork so overlaid type survives it; here there is no
 * artwork to darken, so it is a solid bar and takes the accent, which is
 * otherwise spent nowhere on this Template but the Spine.
 *
 * Ranged left and artist above album, which is the opposite of Classic on both
 * counts: a poster leads with the name and hangs everything off one left edge.
 * The 0.2 mm rule is gone from here too; the band does that job with weight.
 */
function drawPageShell(
  { release, params, faces, measure }: PartContext,
  page: Rect,
  second: string,
): DrawOp[] {
  const bandInk = readableInkFor(params.accentColor);
  const contentWidth = page.width - 2 * PAD;

  const artistStyle: TextStyle = {
    sizeMm: PAGE_ARTIST_SIZE,
    weight: 400,
    face: faces.display,
    color: bandInk,
    align: 'left',
    baseline: 'top',
  };
  const secondStyle: TextStyle = {
    sizeMm: PAGE_ALBUM_SIZE,
    weight: 700,
    face: faces.display,
    color: bandInk,
    align: 'left',
    baseline: 'top',
  };

  return [
    { op: 'fill-rect', rect: page, color: params.inkColor },
    { op: 'fill-rect', rect: { x: page.x, y: page.y, width: page.width, height: BAND_HEIGHT }, color: params.accentColor },
    text(release.artist, { x: page.x + PAD, y: page.y + PAD }, artistStyle, contentWidth, measure),
    text(second, { x: page.x + PAD, y: page.y + PAD + PAGE_ARTIST_SIZE + 1 }, secondStyle, contentWidth, measure),
  ];
}

/** The block below the band, on either interior Page. */
const blockBox = (page: Rect): Rect => ({
  x: page.x + PAD,
  y: page.y + PAGE_BLOCK_TOP,
  width: page.width - 2 * PAD,
  height: page.height - PAGE_BLOCK_TOP - PAD,
});

/** The tracklist Page: the shell, with the album in the band and the list under it. */
function drawTracklistPage(context: PartContext, page: Rect, tracks: readonly Track[]): PartDrawing {
  const listInk = readableInkFor(context.params.inkColor);
  const tracklist = drawTracklist(context, blockBox(page), listInk, tracks);

  return {
    ops: [...drawPageShell(context, page, context.release.album), ...tracklist.ops],
    ...(tracklist.warnings ? { warnings: tracklist.warnings } : {}),
  };
}

/**
 * The credits Page: the same shell with `Credits` in the band where the album
 * was, and the pressing's own facts and names reversed out below it.
 *
 * The word replaces the album rather than sitting beside it because the band has
 * room for two lines and the artist is already on the top one. A Page headed
 * `artist / Credits` says what it is in the shape the tracklist Page says what
 * *it* is, and repeating the album on every interior Page would be the third
 * time the strip said it.
 */
function drawCreditsPage(context: PartContext, page: Rect): PartDrawing {
  const blockInk = readableInkFor(context.params.inkColor);
  const block = drawCredits(context, blockBox(page), blockInk);

  return {
    ops: [...drawPageShell(context, page, 'Credits'), ...block.ops],
    ...(block.warnings ? { warnings: block.warnings } : {}),
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
   * carries the body because v2 sets the interior Pages reversed out of the
   * Release's colour (spec, Templates and type), and a slab's blunt stems
   * survive white-on-colour where a fine serif's hairlines close up.
   */
  faces: { display: 'grotesque', text: 'slab', spine: 'grotesque' },
  // The artwork again, so the back cover exists exactly when there is artwork to
  // put on it (ADR-0012's odd Page out).
  hasBackCover: (release: Release) => hasArtworkBackCover(release),
  drawInsert: (context: InsertContext) =>
    drawInsert(context, {
      cover: drawFrontPanel,
      tracklist: drawTracklistPage,
      credits: drawCreditsPage,
      backCover: drawArtworkBackCover,
    }),
  drawLabel: (context: PartContext) => ({ ops: drawLabel(context) }),
};
