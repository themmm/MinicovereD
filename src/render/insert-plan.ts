import type { PaperSize } from '../domain/paper.ts';
import { insertSize, MAX_INSERT_PAGES } from '../domain/parts.ts';
import type { InsertDimensions } from '../domain/parts.ts';
import type { Mm, Size } from '../domain/units.ts';
import { fitsPaper } from '../pack/sheet-packer.ts';
import type { FoldKind, PageRole, PanelBounds } from './layout.ts';
import { nominalListHeight, TRACK_SIZE_MM, tracklistFitsOnePage } from './tracklist-layout.ts';

/**
 * How many Pages a Release's Insert folds into, what goes on each, and where the
 * paper creases (ADR-0012).
 *
 * All arithmetic. No measurer, no canvas and no Template: the Page count decides
 * how long the strip is **cut**, so it has to be decidable before a mark is
 * made — the packer needs the strip's length before anything is drawn inside it.
 *
 * The one thing here that is not a fact about the Release is `hasBackCover`, and
 * it is passed in rather than worked out, because what a back cover *is* belongs
 * to the Template: Classic and Full-bleed reprint the artwork, and Minimal,
 * which draws none, has no back cover at all.
 */

/** What a Release has to put on paper, as far as the Page count is concerned. */
export interface InsertContent {
  readonly trackCount: number;
  /** Whether there is a credits block worth a Page of its own (ADR-0013). */
  readonly hasCredits: boolean;
  /** Whether the drawing Template can fill a back cover for this Release. */
  readonly hasBackCover: boolean;
}

export interface InsertPlan {
  /**
   * What each Page carries, in reading order along the flat strip. Page 1 is
   * always the cover, and the length is always even (ADR-0012: a leaf is two
   * Pages).
   */
  readonly pages: readonly PageRole[];
  /** What the content asked for, before the paper or the collector had a say. */
  readonly wantedPages: number;
  /**
   * What was asked for in the end — the collector's own count when they set one,
   * otherwise the content's — evened off but before the paper had its say.
   *
   * Kept apart from `wantedPages` because the two can disagree in *either*
   * direction, and a strip shorter than this is a shortfall whichever of them it
   * fell short of. An override asking for four Pages that the content cannot fill
   * drops nothing — there was nothing more to print — but the collector still
   * asked and still did not get it, and saying nothing there left the Design fold
   * reading "4 Pages" over a specimen reading "2 Pages".
   */
  readonly requestedPages: number;
  /**
   * What is not on the strip as a result, in reading order.
   *
   * Never the tracklist: a Page of list that has nowhere to go is set smaller
   * rather than dropped, which is the rule `layOutTracklist` has always kept and
   * is reported by `TypeBelowPrintFloor` instead. What can actually be lost is
   * the credits Page and the back cover.
   */
  readonly dropped: readonly PageRole[];
}

/** One crease across the strip, and which way it goes. */
export interface InsertFold {
  readonly kind: FoldKind;
  /** Distance from the strip's left edge, in Part-local millimetres. */
  readonly atMm: Mm;
}

/**
 * The interior of the strip is one Page or three, because the count is even and
 * Page 1 is the cover. Three is as far as ADR-0012 goes on one A4 Sheet.
 */
const SMALL_INTERIOR = 1;
const LARGE_INTERIOR = 3;

/**
 * What the interior Pages carry at `interior` Pages, or nothing when they cannot
 * be filled.
 *
 * The order is the reading order and it is also the priority: the tracklist,
 * then the credits, then the back cover. The back cover is last because it is
 * the *odd Page out* (ADR-0012) — the thing that fills a Page the even rule
 * produced — so it is what gives way when the other two already fill the strip.
 *
 * The tracklist takes whatever the other two leave, and never fewer Pages than
 * it needs to be set at full size. That is what lets a Release with credits and
 * no artwork reach four Pages: the list spreads over two rather than a blank one
 * being folded — and it is why the roles always add up to at least `interior`,
 * so the only thing that can refuse a length is the track count below.
 *
 * Nothing back means "not foldable at this length", which is how the even-Page
 * rule is kept from ever producing a blank sheet the collector did not ask for.
 * The one Page allowed to hold nothing is the tracklist Page every Insert has:
 * an empty Release's second Page is an empty list, exactly as v1's Back Card was.
 */
function fillInterior(interior: number, content: InsertContent, needsTwoLists: boolean): PageRole[] | undefined {
  const credits = content.hasCredits ? 1 : 0;
  const back = content.hasBackCover ? 1 : 0;
  const lists = Math.max(needsTwoLists ? 2 : 1, interior - credits - back);
  // A tracklist Page with no track on it is blank paper, and this is the only
  // thing that can refuse a length: `lists` is floored at `interior - credits -
  // back`, so the three roles always sum to `interior` or more.
  if (lists > Math.max(1, content.trackCount)) return undefined;

  return [
    ...Array.from({ length: lists }, (): PageRole => 'tracklist'),
    ...(credits ? (['credits'] as const) : []),
    ...(back ? (['artwork'] as const) : []),
    // Trimmed rather than padded, and the back cover is last, so it is what gives
    // way when the other two already fill the strip.
  ].slice(0, interior);
}

/** Rounded down to something foldable: even, and at least two. */
function evenPages(asked: number): number {
  return Math.floor(Math.max(2, asked) / 2) * 2;
}

/**
 * How many Pages this Release's Insert folds into, and what goes on each.
 *
 * The derivation, in one sentence: **two Pages, unless there is a second thing
 * to say.** Credits are that second thing on their own; a tracklist too long for
 * one Page is that second thing only when there is a back cover to fill out the
 * four, which is why a mixtape — no Discogs entry and no cover — is always two
 * Pages however long its list runs. Three Pages of tracklist is not a better
 * object than one Page of small type, and the small type already reports itself.
 *
 * `override` is the collector's own count. It can go either way and it is held
 * to the same two rules as the derivation: even, and every Page filled. So it
 * can take a four-Page Insert down to two, and it can take a two-Page one up to
 * four wherever the Pages can be filled — but it cannot fold blank paper, and it
 * cannot beat the paper. When it is refused, `requestedPages` is what says so:
 * the strip came out shorter than what was asked for.
 */
export function planInsert(
  content: InsertContent,
  insert: InsertDimensions,
  maxPages: number,
  override?: number,
): InsertPlan {
  const needsTwoLists = !tracklistFitsOnePage(
    content.trackCount,
    nominalListHeight(insert.height),
    TRACK_SIZE_MM,
  );
  const wantsLarge = content.hasCredits || (needsTwoLists && content.hasBackCover);
  const derived = fillInterior(wantsLarge ? LARGE_INTERIOR : SMALL_INTERIOR, content, needsTwoLists);
  // The small interior is always fillable — one tracklist Page, which every
  // Insert has — so the fallback is never itself in doubt.
  const wanted = derived ?? (fillInterior(SMALL_INTERIOR, content, needsTwoLists) as PageRole[]);
  const wantedPages = wanted.length + 1;

  // Evened off before the paper is consulted, so `requestedPages` is what was
  // asked for rather than what the paper allowed — those are two different
  // sentences to a collector, and only one of them has a remedy.
  const requestedPages = evenPages(override ?? wantedPages);
  const asked = Math.min(requestedPages, Math.max(2, maxPages));
  const chosen =
    fillInterior(asked - 1, content, needsTwoLists) ??
    (fillInterior(SMALL_INTERIOR, content, needsTwoLists) as PageRole[]);

  return {
    pages: ['cover', ...chosen],
    wantedPages,
    requestedPages,
    // By role rather than by Page, and the tracklist is never in it: what a
    // collector loses is a credits block or a back cover, and a list that lost a
    // Page is a list set smaller, which `TypeBelowPrintFloor` already reports.
    dropped: (['credits', 'artwork'] as const).filter(
      (role) => wanted.includes(role) && !chosen.includes(role),
    ),
  };
}

/**
 * The most Pages an Insert can have and still be printed on this paper at this
 * printable margin.
 *
 * The strip only ever gets longer, so this walks {@link MAX_INSERT_PAGES} down
 * in twos — the count is always even — and asks the packer's own `fitsPaper`
 * each time. Asking rather than re-deriving is the point: a Page count chosen by
 * one rule and packed by another is a strip the packer refuses, and refusing a
 * Part blanks the whole preview.
 *
 * Never fewer than two, because two Pages is the Insert, and the floor is not a
 * lie in practice: a two-Page strip is 152.5 × 79, and since this asks with
 * `turn: 'to-fit'` it may lie down — 79 across and 152.5 down fits A4 up to a
 * 65.5 mm margin, where the control stops at 25. (Standing up it would only reach
 * 28.75, which is the figure to quote if this ever stops turning.) A hand-edited
 * project file can still carry an Insert that fits nothing, and that one throws,
 * with the packer's own sentence about which margin would take it.
 *
 * What this produces is ADR-0014's slack, reached from the other side: A4 gives
 * four Pages up to a 7.25 mm margin and two above it, and **Letter gives two at
 * every margin including zero** — 282.5 mm of strip against 279.4 mm of long
 * edge, which is the one thing ADR-0014's arithmetic did not check.
 */
export function maxInsertPages(insert: InsertDimensions, paper: PaperSize, marginMm: Mm): number {
  const fits = (size: Size): boolean => fitsPaper(size, { paper, marginMm, turn: 'to-fit' });
  for (let pages = MAX_INSERT_PAGES; pages > 2; pages -= 2) {
    if (fits(insertSize(insert, pages))) return pages;
  }
  return 2;
}

/**
 * Every crease across the strip, left to right.
 *
 * Two case folds first — the Inner Flap in behind and the Spine round the case
 * edge, which are the J-Card's own two folds and are unchanged. Then one fold
 * between each pair of Pages, alternating **fore-edge, spine, fore-edge**, which
 * single-sided printing fully determines (ADR-0012): the paper doubles back
 * blank against blank at a fore-edge, and printed against printed at the spine
 * the booklet pages on.
 *
 * The count being even is what makes the last fold a fore-edge — the folds
 * between Pages are numbered from one and the odd ones are fore-edges, so an odd
 * number of them ends on one. Which is the property the whole arrangement rests
 * on: nothing blank is ever visible.
 */
export function insertFolds(insert: InsertDimensions, pageCount: number): readonly InsertFold[] {
  const { innerFlapWidth, spineWidth, frontPanelWidth, pageWidth } = insert;
  const folds: InsertFold[] = [
    { kind: 'case', atMm: innerFlapWidth },
    { kind: 'case', atMm: innerFlapWidth + spineWidth },
  ];
  const firstPageEnd = innerFlapWidth + spineWidth + frontPanelWidth;
  for (let between = 1; between < pageCount; between += 1) {
    folds.push({
      kind: between % 2 === 1 ? 'fore-edge' : 'spine',
      atMm: firstPageEnd + (between - 1) * pageWidth,
    });
  }
  return folds;
}

/**
 * The Inner Flap, the Spine and every Page as rectangles in Part-local
 * millimetres, in the order they sit on the flat strip.
 *
 * Page 1 is the Front Panel and takes the Front Panel's own width (ADR-0012);
 * every Page after it takes `pageWidth`, which is what makes the inner Pages
 * come out slightly narrower than the cover, as a book's do.
 */
export function insertPanels(
  insert: InsertDimensions,
  pages: readonly PageRole[],
): readonly PanelBounds[] {
  const { innerFlapWidth, spineWidth, frontPanelWidth, pageWidth, height } = insert;
  const panels: PanelBounds[] = [
    { panel: 'inner-flap', rect: { x: 0, y: 0, width: innerFlapWidth, height } },
    { panel: 'spine', rect: { x: innerFlapWidth, y: 0, width: spineWidth, height } },
  ];
  let x = innerFlapWidth + spineWidth;
  for (const [index, role] of pages.entries()) {
    const width = index === 0 ? frontPanelWidth : pageWidth;
    panels.push({ panel: 'page', page: index + 1, role, rect: { x, y: 0, width, height } });
    x += width;
  }
  return panels;
}
