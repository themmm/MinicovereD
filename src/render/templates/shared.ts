import { describeCredits } from '../../domain/credits.ts';
import type { Release, Track } from '../../domain/release.ts';
import type { Mm, Point, Rect } from '../../domain/units.ts';
import type { DrawOp, SheetWarning, TextOp, TextStyle, TypeBelowPrintFloor } from '../layout.ts';
import { readableInkFor, withAlpha } from '../colors.ts';
import { MINIDISC_LOGO_ASPECT, miniDiscLogo } from '../minidisc-logo.ts';
import { ellipsise, wrapText } from '../text.ts';
import { layOutLines, layOutTracklist } from '../tracklist-layout.ts';
import { PRINT_FLOOR_MM, TRACK_SIZE_MM } from '../tracklist-layout.ts';
import type { TextMeasurer } from '../text.ts';
import type { InsertContext, PartContext, PartDrawing, TemplateParams } from './template.ts';

/**
 * The pieces every Template shares, and the composer that walks the Insert's
 * Pages.
 *
 * The Spine and the Inner Flap are design, and are here because all three
 * Templates chose the same one. The tracklist, the credits and the placeholder
 * are here for a stronger reason: none of them is a design decision at all. How
 * a list flows into columns, when it gives up size instead and when the
 * collector is told about it is one rule for every Template (ticket 07 of v1),
 * and "no artwork yet" has to look the same whichever Template is chosen. A
 * Template holding its own copy of any of them would be free to get it wrong
 * somewhere no test is looking.
 *
 * What each Template still decides for itself is the box, the ground and the
 * face — which is exactly what {@link drawInsert} asks it for, one Page at a
 * time. `drawBackCard` stopped being shared in ticket 03 and nothing here puts
 * it back: the fold pattern is shared, the drawing on each Page is not.
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
  // small to hold even that — a project file may carry a 1 mm Insert.
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
 * What a Template draws on each kind of Page, handed to {@link drawInsert}.
 *
 * One callback per {@link PageRole} rather than one per Page, because the roles
 * are what a Template has an opinion about and the Pages are what the paper and
 * the Release between them decided. A Template never learns how long its strip
 * is.
 */
export interface InsertPages {
  /** Page 1, the Front Panel: what the case window shows. */
  cover(context: PartContext, page: Rect): DrawOp[];
  /** One Page of tracklist, carrying the share of the list that landed on it. */
  tracklist(context: PartContext, page: Rect, tracks: readonly Track[]): PartDrawing;
  /** The credits Page (ADR-0013 on paper). */
  credits(context: PartContext, page: Rect): PartDrawing;
  /**
   * The back cover — the odd Page out. Asked for only when the Template's own
   * `hasBackCover` said yes, so a Template that has none needs no callback that
   * draws nothing.
   */
  backCover?(context: PartContext, page: Rect): DrawOp[];
}

/**
 * The whole Insert: the Inner Flap, the Spine, and every Page through the
 * Template's own callbacks.
 *
 * Shared rather than written out three times, because the fold pattern is fixed
 * by single-sided printing (ADR-0012) and no Template has a view about it — and
 * because the Spine and the tracklist both have warnings to hand back, and a
 * Template that spread their ops and forgot their warnings would drop the report
 * without failing anything.
 *
 * The tracklist's warning is merged rather than passed through. A list split
 * over two Pages measures itself twice, and two `type-below-print-floor`
 * warnings for one Release would be read as two problems; one warning naming the
 * Release's whole track count and the smallest size any Page settled on is the
 * true statement about the strip.
 */
export function drawInsert(context: InsertContext, pages: InsertPages): PartDrawing {
  const spine = drawSpine(context, context.spine);
  const ops: DrawOp[] = [
    ...drawInnerFlap(context, context.innerFlap),
    ...spine.ops,
  ];
  const warnings: SheetWarning[] = [...(spine.warnings ?? [])];
  const listWarnings: TypeBelowPrintFloor[] = [];

  const take = (drawing: PartDrawing): void => {
    ops.push(...drawing.ops);
    for (const warning of drawing.warnings ?? []) {
      if (warning.kind === 'type-below-print-floor') listWarnings.push(warning);
      else warnings.push(warning);
    }
  };

  for (const page of context.pages) {
    switch (page.role) {
      case 'cover':
        ops.push(...pages.cover(context, page.rect));
        break;
      case 'tracklist':
        take(pages.tracklist(context, page.rect, page.tracks ?? []));
        break;
      case 'credits':
        take(pages.credits(context, page.rect));
        break;
      case 'artwork':
        // Optional on `InsertPages`, and never reached without it: the renderer
        // only plans a back-cover Page for a Template whose `hasBackCover` said
        // yes, and a Template that says yes draws one.
        ops.push(...(pages.backCover?.(context, page.rect) ?? []));
        break;
    }
  }

  const smallest = listWarnings.reduce<TypeBelowPrintFloor | undefined>(
    (worst, warning) => (!worst || warning.sizeMm < worst.sizeMm ? warning : worst),
    undefined,
  );
  if (smallest) {
    warnings.push({ ...smallest, trackCount: context.release.tracks.length });
  }

  return { ops, ...(warnings.length > 0 ? { warnings } : {}) };
}

/**
 * The back cover Classic and Full-bleed share: the artwork again, edge to edge,
 * and nothing on top of it.
 *
 * Nothing on top of it deliberately. This is the Page a closed booklet shows
 * face down, the artwork is already named on the cover and on the Spine, and a
 * second caption would be the only thing on the strip saying the same words
 * three times.
 */
export function drawArtworkBackCover({ release, params }: PartContext, page: Rect): DrawOp[] {
  return [artworkOrPlaceholder(release, page, params)];
}

/**
 * Whether a Release has a back cover under a Template that reprints its
 * artwork — which is Classic and Full-bleed, and is not Minimal.
 *
 * The artwork itself, never the placeholder: `artworkOrPlaceholder` would fill
 * the Page with a flat tint of the ink, and a whole Page of tint is exactly the
 * blank sheet ADR-0012's even-Page rule refuses to fold.
 */
export function hasArtworkBackCover(release: Release): boolean {
  return !!release.artwork;
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

/**
 * `tracks` fitted into `box` and turned into marks, plus the warning when they
 * had to shrink past what a printer holds.
 *
 * Still shared, even though what a tracklist *Page* looks like is not. Nothing
 * here is a design decision: how a list flows into columns, when it gives up
 * size instead, where the times sit and when the collector is told about any of
 * it is one rule for every Template (ticket 07 of v1), and a Template free to
 * reimplement it would be free to get the warning wrong. What each Template
 * decides for itself is the box, the colour and the face — which is what this
 * takes.
 *
 * The tracks come in rather than being read off the Release, because a long list
 * may be spread over two Pages and this draws one of them. `splitTracks` does
 * the dealing, once, for every Template.
 *
 * `ink` rather than `params.inkColor`, because a Template is free to ground its
 * Page in a colour the collector chose and reverse the list out of it, so the
 * readable ink is a fact about that ground rather than a parameter.
 */
export function drawTracklist(
  { release, faces, measure }: PartContext,
  box: Rect,
  ink: string,
  tracks: readonly Track[],
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
  const tracklist = layOutTracklist(tracks, box, style, measure);

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
  // list that was actually drawn. `trackCount` is this Page's share; `drawInsert`
  // merges the Pages' warnings into one naming the Release's whole list, because
  // a list split over two Pages is one problem and not two.
  return tracklist.belowPrintFloor
    ? {
        ops,
        warnings: [
          {
            kind: 'type-below-print-floor',
            releaseId: release.id,
            releaseTitle: release.album || release.artist || release.id,
            trackCount: tracks.length,
            sizeMm: tracklist.style.sizeMm,
            floorMm: PRINT_FLOOR_MM,
          } satisfies TypeBelowPrintFloor,
        ],
      }
    : { ops };
}

/** Air between the release facts and the list of names under them. */
const CREDITS_GAP: Mm = 2.4;

/**
 * The credits, fitted into `box`: the release facts wrapped across the top, then
 * everyone the pressing credits, one to a line.
 *
 * Shared for the reason the tracklist is. What a credits block *looks* like is
 * the Template's — the ground, the heading, the box — but which facts go on
 * paper and in what order is a fact about ADR-0013's `Credits`, and three
 * Templates deciding it separately would be three chances for one of them to
 * quietly drop the catalogue number.
 *
 * The facts first because that is the shape ADR-0013's own example opens with,
 * `RCA · PB 41447 · UK 1987`, and because it is the block a collector scans for.
 * `describeCredits` builds that line, so the form's summary and the paper cannot
 * disagree about what arrived. Then the names, flowed and shrunk by the same rule
 * the tracklist gets (`layOutLines`).
 *
 * A credit's role is carried exactly as the source wrote it — brackets and all,
 * which is Discogs' own qualifier (`Credit.role`) — and a name with no role is
 * set on its own, because a sleeve's "Photography" block is a list of names.
 */
export function drawCredits(
  { release, faces, measure }: PartContext,
  box: Rect,
  ink: string,
): PartDrawing {
  const credits = release.credits;
  if (!credits) return { ops: [] };

  const style: TextStyle = {
    sizeMm: TRACK_SIZE_MM,
    weight: 400,
    face: faces.text,
    color: ink,
    align: 'left',
    baseline: 'top',
  };
  // Bolder than the names, because it is the block that identifies the pressing.
  const factsStyle: TextStyle = { ...style, weight: 600 };
  const facts = wrapText(describeCredits(credits), factsStyle, box.width, measure);
  const factsHeight = facts.length * factsStyle.sizeMm * 1.25;

  const names = credits.people.map((credit) =>
    credit.role ? `${credit.role} — ${credit.name}` : credit.name,
  );
  const list = layOutLines(
    names,
    {
      x: box.x,
      y: box.y + (facts.length > 0 ? factsHeight + CREDITS_GAP : 0),
      width: box.width,
      height: Math.max(0, box.height - (facts.length > 0 ? factsHeight + CREDITS_GAP : 0)),
    },
    style,
    measure,
  );

  return {
    ops: [
      ...facts.map(
        (line, index): DrawOp => ({
          op: 'text',
          text: line,
          at: { x: box.x, y: box.y + index * factsStyle.sizeMm * 1.25 },
          style: factsStyle,
        }),
      ),
      ...list.lines.map(
        (line): DrawOp => ({ op: 'text', text: line.text, at: line.at, style: list.style }),
      ),
    ],
  };
}

export { FRONT_LOGO_WIDTH, TRACK_SIZE_MM };
