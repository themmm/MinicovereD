import { formatDuration, totalDurationMs } from '../../domain/release.ts';
import type { Release } from '../../domain/release.ts';
import type { Mm, Point, Rect } from '../../domain/units.ts';
import type { DrawOp, TextStyle } from '../layout.ts';
import { ellipsise } from '../text.ts';
import type { TextMeasurer } from '../text.ts';
import type { JCardContext, PartContext, Template } from './template.ts';

/**
 * Classic: solid background, clear typography, artwork as a square. The
 * counterpart to Full-bleed, where the artwork runs to the edges.
 */

const PALETTE = {
  paper: '#ffffff',
  ink: '#141414',
  muted: '#6b6b6b',
  accent: '#1f2933',
  accentInk: '#ffffff',
  placeholder: '#e6e6e6',
} as const;

const PAD: Mm = 3;

function text(
  content: string,
  at: Point,
  style: Omit<TextStyle, 'color'> & { color?: string },
): DrawOp {
  return { op: 'text', text: content, at, style: { color: PALETTE.ink, ...style } };
}

function artworkOrPlaceholder(release: Release, rect: Rect): DrawOp {
  return release.artwork
    ? { op: 'image', rect, artwork: release.artwork, fit: 'cover' }
    : { op: 'fill-rect', rect, color: PALETTE.placeholder };
}

/** `artist — album`, kept to one line so the Spine stays readable on the shelf. */
function spineLine(release: Release): string {
  return [release.artist, release.album].filter(Boolean).join(' — ');
}

function fit(content: string, style: TextStyle, maxWidthMm: Mm, measure: TextMeasurer): string {
  return ellipsise(content, style, maxWidthMm, measure);
}

function drawFrontPanel({ release, measure }: PartContext, panel: Rect): DrawOp[] {
  const artSide = panel.width - 2 * PAD;
  const artBottom = PAD + artSide;
  const centreX = panel.x + panel.width / 2;

  const artistStyle: TextStyle = { sizeMm: 4, weight: 700, color: PALETTE.ink, align: 'center', baseline: 'top' };
  const albumStyle: TextStyle = { sizeMm: 3.2, weight: 400, color: PALETTE.muted, align: 'center', baseline: 'top' };
  const textWidth = panel.width - 2 * PAD;

  return [
    { op: 'fill-rect', rect: panel, color: PALETTE.paper },
    artworkOrPlaceholder(release, { x: panel.x + PAD, y: PAD, width: artSide, height: artSide }),
    text(fit(release.artist, artistStyle, textWidth, measure), { x: centreX, y: artBottom + 2.4 }, artistStyle),
    text(fit(release.album, albumStyle, textWidth, measure), { x: centreX, y: artBottom + 7.2 }, albumStyle),
  ];
}

function drawSpine({ release, measure }: PartContext, panel: Rect): DrawOp[] {
  const style: TextStyle = {
    sizeMm: 2.9,
    weight: 600,
    color: PALETTE.accentInk,
    align: 'center',
    baseline: 'middle',
    rotationDeg: -90,
  };
  return [
    { op: 'fill-rect', rect: panel, color: PALETTE.accent },
    text(
      fit(spineLine(release), style, panel.height - 2 * PAD, measure),
      { x: panel.x + panel.width / 2, y: panel.y + panel.height / 2 },
      style,
    ),
  ];
}

function drawInnerFlap({ release, measure }: PartContext, panel: Rect): DrawOp[] {
  const caption = [release.year, release.notes].filter(Boolean).join(' · ');
  const style: TextStyle = {
    sizeMm: 2.6,
    weight: 400,
    color: PALETTE.muted,
    align: 'center',
    baseline: 'middle',
    rotationDeg: -90,
  };
  return [
    { op: 'fill-rect', rect: panel, color: PALETTE.paper },
    ...(caption
      ? [
          text(
            fit(caption, style, panel.height - 2 * PAD, measure),
            { x: panel.x + panel.width / 2, y: panel.y + panel.height / 2 },
            style,
          ),
        ]
      : []),
  ];
}

function drawBackCard({ release, size, measure }: PartContext): DrawOp[] {
  const contentWidth = size.width - 2 * PAD;
  const albumStyle: TextStyle = { sizeMm: 3.2, weight: 700, color: PALETTE.ink, align: 'left', baseline: 'top' };
  const artistStyle: TextStyle = { sizeMm: 2.6, weight: 400, color: PALETTE.muted, align: 'left', baseline: 'top' };
  const trackStyle: TextStyle = { sizeMm: 2.4, weight: 400, color: PALETTE.ink, align: 'left', baseline: 'top' };

  const ruleY = PAD + 8.6;
  const ops: DrawOp[] = [
    { op: 'fill-rect', rect: { x: 0, y: 0, width: size.width, height: size.height }, color: PALETTE.paper },
    text(fit(release.album, albumStyle, contentWidth, measure), { x: PAD, y: PAD }, albumStyle),
    text(fit(release.artist, artistStyle, contentWidth, measure), { x: PAD, y: PAD + 4.2 }, artistStyle),
    {
      op: 'line',
      from: { x: PAD, y: ruleY },
      to: { x: size.width - PAD, y: ruleY },
      color: PALETTE.muted,
      widthMm: 0.2,
    },
  ];

  const lineHeight = 2.9;
  release.tracks.forEach((track, index) => {
    const line = `${track.position}. ${track.title}`;
    ops.push(
      text(fit(line, trackStyle, contentWidth, measure), { x: PAD, y: ruleY + 2 + index * lineHeight }, trackStyle),
    );
  });

  const total = totalDurationMs(release);
  if (total !== undefined) {
    const totalStyle: TextStyle = { sizeMm: 2.3, weight: 400, color: PALETTE.muted, align: 'right', baseline: 'top' };
    ops.push(text(formatDuration(total), { x: size.width - PAD, y: size.height - PAD - 2.3 }, totalStyle));
  }
  return ops;
}

function labelOutline(size: { width: Mm; height: Mm }, notch: Mm): Point[] {
  return notch > 0
    ? [
        { x: 0, y: 0 },
        { x: size.width - notch, y: 0 },
        { x: size.width, y: notch },
        { x: size.width, y: size.height },
        { x: 0, y: size.height },
      ]
    : [
        { x: 0, y: 0 },
        { x: size.width, y: 0 },
        { x: size.width, y: size.height },
        { x: 0, y: size.height },
      ];
}

function drawLabel({ release, size, dimensions, measure }: PartContext): DrawOp[] {
  const pad: Mm = 2.5;
  const artSide = size.width - 2 * pad;
  const artistStyle: TextStyle = { sizeMm: 2.8, weight: 700, color: PALETTE.ink, align: 'center', baseline: 'top' };
  const albumStyle: TextStyle = { sizeMm: 2.4, weight: 400, color: PALETTE.muted, align: 'center', baseline: 'top' };
  const centreX = size.width / 2;
  const textWidth = size.width - 2 * pad;
  const notch = dimensions.label.notch ? dimensions.label.notchSize : 0;

  // Centre the caption in whatever room the artwork leaves, so the Label reads
  // as one block instead of drifting to the top edge.
  const captionHeight = artistStyle.sizeMm + 1 + albumStyle.sizeMm;
  const captionTop = pad + artSide + (size.height - pad - (pad + artSide) - captionHeight) / 2;

  return [
    { op: 'fill-polygon', points: labelOutline(size, notch), color: PALETTE.paper },
    artworkOrPlaceholder(release, { x: pad, y: pad, width: artSide, height: artSide }),
    text(fit(release.artist, artistStyle, textWidth, measure), { x: centreX, y: captionTop }, artistStyle),
    text(
      fit(release.album, albumStyle, textWidth, measure),
      { x: centreX, y: captionTop + artistStyle.sizeMm + 1 },
      albumStyle,
    ),
  ];
}

export const CLASSIC_TEMPLATE: Template = {
  id: 'classic',
  name: 'Classic',
  drawJCard: (context: JCardContext) => [
    ...drawInnerFlap(context, context.panels['inner-flap']),
    ...drawSpine(context, context.panels.spine),
    ...drawFrontPanel(context, context.panels['front-panel']),
  ],
  drawBackCard,
  drawLabel,
};
