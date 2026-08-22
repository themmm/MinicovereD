import type { Release } from '../../domain/release.ts';
import type { Mm, Point, Rect } from '../../domain/units.ts';
import type { DrawOp, TextOp, TextStyle } from '../layout.ts';
import { readableInkFor, withAlpha } from '../colors.ts';
import { MINIDISC_LOGO_ASPECT, miniDiscLogo } from '../minidisc-logo.ts';
import { ellipsise } from '../text.ts';
import { layOutTracklist } from '../tracklist-layout.ts';
import { PRINT_FLOOR_MM } from '../tracklist-layout.ts';
import type { TextMeasurer } from '../text.ts';
import type { JCardContext, PartContext, PartDrawing, TemplateParams } from './template.ts';

/**
 * The pieces every Template shares. Classic and Full-bleed differ in how the
 * Front Panel and the Label carry the artwork and in how each sets its own Back
 * Card; the Spine and the Inner Flap are the same design in both, driven by the
 * parameters.
 *
 * The Spine and the Inner Flap are design, and are here because both Templates
 * chose the same one. The tracklist and the placeholder are here for a stronger
 * reason: neither is a design decision at all. How a list flows into columns,
 * when it gives up size instead and when the collector is told about it is one
 * rule for every Template (ticket 07 of v1), and "no artwork yet" has to look
 * the same whichever Template is chosen. A Template holding its own copy of
 * either would be free to get it wrong somewhere no test is looking.
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
): TextOp {
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
 * The size the Spine's one line is set at, and stays at.
 *
 * Sony's artwork specification recommends 7 pt — 2.469 mm — for a 4–7 mm edge
 * (ADR-0008 rule 6); 2.9 mm is above it, deliberately, because the Spine is
 * the one Part read at arm's length from a shelf. When the line does not fit,
 * this does not give way: shrinking all the way to Sony's own floor buys 17 %
 * more characters, which rescues a line that was just over and does nothing at
 * all for one that is 70 % over — measured on real Noto Sans metrics, "Sufjan
 * Stevens — Illinois: Come On Feel the Illinoise" fits at 2.469 and "Godspeed
 * You! Black Emperor — Lift Your Skinny Fists Like Antennas to Heaven" is
 * still half again too long. Trading the legibility the Spine exists for, in
 * exchange for two more words some of the time, is the wrong trade. So the
 * type holds and the truncation is reported instead (`SpineTruncated`).
 *
 * This is where the Spine parts company with the tracklist, which flows, then
 * shrinks toward `PRINT_FLOOR_MM`, then warns (ticket 07). That floor is a
 * different number for a different reason — 5 pt, "a printer can hold this" —
 * and is not this one.
 *
 * The measurements above are Noto Sans', which the Spine is no longer
 * necessarily set in: `TemplateFaces.spine` is the Template's choice, and a
 * condensed face is the other lever on the same problem. It is the lever worth
 * pulling, because narrowing the letters costs none of the size the Spine is
 * read at, where shrinking the type costs exactly that.
 */
const SPINE_SIZE_MM: Mm = 2.9;

/**
 * The Spine: a solid bar of the accent colour with one line of type rotated to
 * read up the case edge, and the logo below it when enabled.
 *
 * Returns a drawing rather than bare ops because it is the one shared piece
 * that can lose content: the line is one line by design, so anything past the
 * edge is cut rather than wrapped.
 */
export function drawSpine({ release, params, faces, measure }: PartContext, panel: Rect): PartDrawing {
  // The bar is the collector's accent colour, so the ink on it has to be
  // chosen rather than configured: dark paper on a dark accent would otherwise
  // put invisible type on the one Part that has to be read from a shelf.
  const ink = readableInkFor(params.accentColor);
  const style: TextStyle = {
    sizeMm: SPINE_SIZE_MM,
    weight: 600,
    face: faces.spine,
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

  const line = spineLine(release);
  const drawn = text(
    line,
    { x: centreX, y: panel.y + (panel.height - logoLength) / 2 },
    style,
    panel.height - 2 * PAD - logoLength,
    measure,
  );
  const ops: DrawOp[] = [
    { op: 'fill-rect', rect: panel, color: params.accentColor },
    drawn,
    ...logo,
  ];

  // Compared against the op that was built rather than re-measured, so the
  // warning cannot describe a Spine other than the one on the Part. An empty
  // line has nothing to lose, whatever `ellipsise` hands back for a panel too
  // small to hold even that — a project file may carry a 1 mm J-Card.
  return line === '' || drawn.text === line
    ? { ops }
    : {
        ops,
        warnings: [
          {
            kind: 'spine-truncated',
            releaseId: release.id,
            releaseTitle: release.album || release.artist || release.id,
            line,
            shown: drawn.text,
            sizeMm: style.sizeMm,
          },
        ],
      };
}

/**
 * The J-Card, which is one design in both Templates but for the Front Panel.
 *
 * Shared rather than written out twice, because the Spine now has a warning to
 * hand back and a Template that spread its ops and forgot its warnings would
 * drop the report without failing anything.
 */
export function drawJCard(
  context: JCardContext,
  drawFrontPanel: (context: PartContext, panel: Rect) => DrawOp[],
): PartDrawing {
  const spine = drawSpine(context, context.panels.spine);
  return {
    ops: [
      ...drawInnerFlap(context, context.panels['inner-flap']),
      ...spine.ops,
      ...drawFrontPanel(context, context.panels['front-panel']),
    ],
    ...(spine.warnings ? { warnings: spine.warnings } : {}),
  };
}

/** The Inner Flap: blank but for the supplementary info, read up the fold. */
export function drawInnerFlap({ release, params, faces, measure }: PartContext, panel: Rect): DrawOp[] {
  const caption = [release.year, release.notes].filter(Boolean).join(' · ');
  const style: TextStyle = {
    sizeMm: 2.6,
    weight: 400,
    // A caption, so the body face rather than the display one — and it folds
    // inside the case, where nothing has to carry a voice from a shelf.
    face: faces.text,
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
export const TRACK_SIZE_MM: Mm = 2.4;

/**
 * The tracklist, fitted into `box` and turned into marks, plus the warning when
 * it had to shrink past what a printer holds.
 *
 * Still shared, even though `drawBackCard` no longer is. Nothing here is a
 * design decision: how a list flows into columns, when it gives up size instead,
 * where the times sit and when the collector is told about any of it is one rule
 * for every Template (ticket 07 of v1), and a Template free to reimplement it
 * would be free to get the warning wrong. What each Template decides for itself
 * is the box, the colour and the face — which is what this takes.
 *
 * `ink` rather than `params.inkColor`, because both Templates now ground the
 * card in a colour the collector chose and reverse the list out of it, so the
 * readable ink is a fact about that ground rather than a parameter.
 */
export function drawTracklist(
  { release, faces, measure }: PartContext,
  box: Rect,
  ink: string,
): PartDrawing {
  // The style goes in whole and comes back fitted, so the list is drawn with the
  // very object it was trimmed against rather than with a second copy of it.
  const style: TextStyle = {
    sizeMm: TRACK_SIZE_MM,
    weight: 400,
    face: faces.text,
    color: ink,
    align: 'left',
    baseline: 'top',
  };
  const tracklist = layOutTracklist(release.tracks, box, style, measure);

  const ops: DrawOp[] = [];
  for (const line of tracklist.lines) {
    ops.push({ op: 'text', text: line.text, at: line.at, style: tracklist.style });
    if (line.duration) {
      ops.push({
        op: 'text',
        text: line.duration.text,
        at: line.duration.at,
        style: tracklist.durationStyle,
      });
    }
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
            sizeMm: tracklist.style.sizeMm,
            floorMm: PRINT_FLOOR_MM,
          },
        ],
      }
    : { ops };
}

export { FRONT_LOGO_WIDTH };
