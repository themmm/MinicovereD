import type { Mm, Point, Rect } from '../../domain/units.ts';
import type { DrawOp, TextStyle } from '../layout.ts';
import { MINIDISC_LOGO_ASPECT, miniDiscLogo } from '../minidisc-logo.ts';
import { ellipsise } from '../text.ts';
import type { TextMeasurer } from '../text.ts';
import type { PartContext, TemplateParams } from './template.ts';

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
    },
  ];
}

/**
 * The Spine: a solid bar of the accent colour with one line of type rotated to
 * read up the case edge, and the logo below it when enabled.
 */
export function drawSpine({ release, params, measure }: PartContext, panel: Rect): DrawOp[] {
  const style: TextStyle = {
    sizeMm: 2.9,
    weight: 600,
    color: params.paperColor,
    align: 'center',
    baseline: 'middle',
    // Reading bottom-to-top, so the line is the right way up on a shelf.
    rotationDeg: -90,
  };
  const centreX = panel.x + panel.width / 2;
  const logo = logoOp(
    params,
    { x: centreX - SPINE_LOGO_WIDTH / 2, y: panel.y + panel.height - PAD / 2 },
    SPINE_LOGO_WIDTH,
    params.paperColor,
  );
  // The logo takes the foot of the Spine, so the type centres in what is left.
  const textRoom = panel.height - 2 * PAD - (params.showLogo ? SPINE_LOGO_WIDTH * 2 : 0);

  return [
    { op: 'fill-rect', rect: panel, color: params.accentColor },
    text(
      spineLine(release),
      { x: centreX, y: panel.y + (panel.height - (params.showLogo ? SPINE_LOGO_WIDTH * 2 : 0)) / 2 },
      style,
      textRoom,
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

/** The Back Card: album, artist, a rule, and the tracklist. */
export function drawBackCard({ release, params, size, measure }: PartContext): DrawOp[] {
  const contentWidth = size.width - 2 * PAD;
  const albumStyle: TextStyle = { sizeMm: 3.2, weight: 700, color: params.inkColor, align: 'left', baseline: 'top' };
  const artistStyle: TextStyle = { sizeMm: 2.6, weight: 400, color: params.inkColor, align: 'left', baseline: 'top' };
  const trackStyle: TextStyle = { sizeMm: 2.4, weight: 400, color: params.inkColor, align: 'left', baseline: 'top' };

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

  const lineHeight = 2.9;
  release.tracks.forEach((track, index) => {
    ops.push(
      text(
        `${track.position}. ${track.title}`,
        { x: PAD, y: ruleY + 2 + index * lineHeight },
        trackStyle,
        contentWidth,
        measure,
      ),
    );
  });
  return ops;
}

export { FRONT_LOGO_WIDTH };
