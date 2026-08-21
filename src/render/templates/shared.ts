import type { Release } from '../../domain/release.ts';
import type { Mm, Point, Rect } from '../../domain/units.ts';
import type { DrawOp, TextStyle } from '../layout.ts';
import { readableInkFor, withAlpha } from '../colors.ts';
import { MINIDISC_LOGO_ASPECT, miniDiscLogo } from '../minidisc-logo.ts';
import { ellipsise } from '../text.ts';
import { layOutTracklist } from '../tracklist-layout.ts';
import { PRINT_FLOOR_MM } from '../tracklist-layout.ts';
import type { TracklistLayout } from '../tracklist-layout.ts';
import type { TextMeasurer } from '../text.ts';
import type { PartContext, PartDrawing, TemplateParams } from './template.ts';

/**
 * The pieces every Template shares. Classic and Full-bleed differ in how the
 * Front Panel and the Label carry the artwork; the Spine, the Inner Flap and
 * the Back Card are the same design in both, driven by the parameters.
 */

export const PAD: Mm = 3;

/** Sony's artwork spec puts the small logo variant at 4–7 mm; a 5.5 mm Spine sits inside that. */
const SPINE_LOGO_WIDTH: Mm = 4.2;
const FRONT_LOGO_WIDTH: Mm = 9;

export function text(
  content: string,
  at: Point,
  style: TextStyle,
  maxWidthMm: Mm,
  measure: TextMeasurer,
): DrawOp {
  return { op: 'text', text: ellipsise(content, style, maxWidthMm, measure), at, style };
}

/** `artist — album`, kept to one line so the Spine stays readable on the shelf. */
export function spineLine({ artist, album }: { artist: string; album: string }): string {
  return [artist, album].filter(Boolean).join(' — ');
}

/**
 * The MiniDisc logo, sized by width and anchored by its bottom-left corner.
 * Returns nothing when the design has it switched off, which is the whole point
 * of keeping it a plain optional asset.
 */
export function logoOp(
  params: TemplateParams,
  anchor: Point,
  widthMm: Mm,
  color: string,
  rotationDeg: -90 | 0 = 0,
): DrawOp[] {
  if (!params.showLogo) return [];
  const height = widthMm / MINIDISC_LOGO_ASPECT;
  return [
    {
      op: 'image',
      rect: { x: anchor.x, y: anchor.y - height, width: widthMm, height },
      source: miniDiscLogo(color),
      fit: 'contain',
      role: 'logo',
      ...(rotationDeg ? { rotationDeg } : {}),
    },
  ];
}

/** How tall the logo is at a given width. */
export function logoHeight(widthMm: Mm): Mm {
  return widthMm / MINIDISC_LOGO_ASPECT;
}

/** Grey standing in for artwork a Release does not have yet. */
const PLACEHOLDER_TINT = 0.9;

/**
 * The Release's artwork in `rect`, or a flat panel when there is none. Shared,
 * because "no artwork yet" has to look the same whichever Template is chosen.
 */
export function artworkOrPlaceholder(release: Release, rect: Rect, params: TemplateParams): DrawOp {
  return release.artwork
    ? { op: 'image', rect, source: release.artwork, fit: 'cover', role: 'artwork' }
    : { op: 'fill-rect', rect, color: placeholderColor(params) };
}

function placeholderColor(params: TemplateParams): string {
  // A tint of the ink, so the placeholder belongs to the chosen palette rather
  // than being a grey that fights it.
  return withAlpha(params.inkColor, 1 - PLACEHOLDER_TINT);
}

/**
 * The Spine: a solid bar of the accent colour with one line of type rotated to
 * read up the case edge, and the logo below it when enabled.
 */
export function drawSpine({ release, params, measure }: PartContext, panel: Rect): DrawOp[] {
  // The bar is the collector's accent colour, so the ink on it has to be
  // chosen rather than configured: dark paper on a dark accent would otherwise
  // put invisible type on the one Part that has to be read from a shelf.
  const ink = readableInkFor(params.accentColor);
  const style: TextStyle = {
    sizeMm: 2.9,
    weight: 600,
    color: ink,
    align: 'center',
    baseline: 'middle',
    // Bottom-to-top, so a shelved case reads the right way up (CONTEXT.md: Spine).
    rotationDeg: -90,
  };

  const centreX = panel.x + panel.width / 2;
  // Rotated to match the type: on a shelf the mark and the line read together.
  const logoLength = params.showLogo ? SPINE_LOGO_WIDTH + PAD : 0;
  const logo = logoOp(
    params,
    { x: centreX - SPINE_LOGO_WIDTH / 2, y: panel.y + panel.height - PAD },
    SPINE_LOGO_WIDTH,
    ink,
    -90,
  );

  return [
    { op: 'fill-rect', rect: panel, color: params.accentColor },
    text(
      spineLine(release),
      { x: centreX, y: panel.y + (panel.height - logoLength) / 2 },
      style,
      panel.height - 2 * PAD - logoLength,
      measure,
    ),
    ...logo,
  ];
}

/** The Inner Flap: blank but for the supplementary info, read up the fold. */
export function drawInnerFlap({ release, params, measure }: PartContext, panel: Rect): DrawOp[] {
  const caption = [release.year, release.notes].filter(Boolean).join(' · ');
  const style: TextStyle = {
    sizeMm: 2.6,
    weight: 400,
    color: params.inkColor,
    align: 'center',
    baseline: 'middle',
    rotationDeg: -90,
  };
  return [
    { op: 'fill-rect', rect: panel, color: params.paperColor },
    ...(caption
      ? [
          text(
            caption,
            { x: panel.x + panel.width / 2, y: panel.y + panel.height / 2 },
            style,
            panel.height - 2 * PAD,
            measure,
          ),
        ]
      : []),
  ];
}

/** Type size the tracklist starts at, before any of it has to give way. */
const TRACK_SIZE_MM: Mm = 2.4;

/** Where the tracklist sits on the Back Card, and how it had to fit. */
function backCardTracklist({ release, size, measure }: PartContext): TracklistLayout {
  const listTop = PAD + 8.6 + 2;
  return layOutTracklist(
    release.tracks,
    { x: PAD, y: listTop, width: size.width - 2 * PAD, height: size.height - listTop - PAD },
    TRACK_SIZE_MM,
    measure,
  );
}

/**
 * The Back Card: album, artist, a rule, and the tracklist — which is the one
 * Part whose content has no upper bound, so the list decides its own columns
 * and size rather than being given them.
 */
export function drawBackCard(context: PartContext): PartDrawing {
  const { release, params, size, measure } = context;
  const contentWidth = size.width - 2 * PAD;
  const albumStyle: TextStyle = { sizeMm: 3.2, weight: 700, color: params.inkColor, align: 'left', baseline: 'top' };
  const artistStyle: TextStyle = { sizeMm: 2.6, weight: 400, color: params.inkColor, align: 'left', baseline: 'top' };

  const ruleY = PAD + 8.6;
  const ops: DrawOp[] = [
    { op: 'fill-rect', rect: { x: 0, y: 0, width: size.width, height: size.height }, color: params.paperColor },
    text(release.album, { x: PAD, y: PAD }, albumStyle, contentWidth, measure),
    text(release.artist, { x: PAD, y: PAD + 4.2 }, artistStyle, contentWidth, measure),
    {
      op: 'line',
      from: { x: PAD, y: ruleY },
      to: { x: size.width - PAD, y: ruleY },
      color: params.accentColor,
      widthMm: 0.2,
    },
  ];

  const tracklist = backCardTracklist(context);
  const trackStyle: TextStyle = {
    sizeMm: tracklist.sizeMm,
    weight: 400,
    color: params.inkColor,
    align: 'left',
    baseline: 'top',
  };

  for (const line of tracklist.lines) {
    ops.push({ op: 'text', text: line.text, at: line.at, style: trackStyle });
  }

  // Reported from where it was measured, so the warning always describes the
  // list that was actually drawn.
  return tracklist.belowPrintFloor
    ? {
        ops,
        warnings: [
          {
            kind: 'type-below-print-floor',
            releaseId: release.id,
            releaseTitle: release.album || release.artist || release.id,
            trackCount: release.tracks.length,
            sizeMm: tracklist.sizeMm,
            floorMm: PRINT_FLOOR_MM,
          },
        ],
      }
    : { ops };
}

export { FRONT_LOGO_WIDTH };
