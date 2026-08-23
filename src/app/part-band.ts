import { DEFAULT_PART_DIMENSIONS, insertSize, LABEL_PRESETS, PART_KINDS } from '../domain/parts.ts';
import type { PartDimensions, PartKind } from '../domain/parts.ts';
import type { QueueEntry } from '../queue/release-queue.ts';
import type { PageRole, PartPlacement, SheetLayout, SheetWarning } from '../render/layout.ts';
import { partSheet } from '../render/part-sheet.ts';
import type { InsertView } from '../render/part-sheet.ts';
import { rasterizeSheet } from '../render/raster.ts';
import { clear, el } from './dom.ts';

/**
 * The Parts band: the specimens, at one shared scale, as the composition of the
 * page (ADR-0010).
 *
 * This is the design surface. The A4 Sheet used to be the only preview, which
 * put the 68 mm Front Panel on screen at roughly 2× physical size while
 * two-thirds of the area showed empty paper — the thing being designed was the
 * least legible thing on screen. Here every width is literally its millimetres,
 * so one token is one truth and the real size relationships stay visible.
 *
 * ADR-0010 wrote that rule for Parts of 87.5, 69 and 35 mm. A flat Insert is
 * 152.5 or 282.5, which at 6.05 px/mm is 923 or 1709 CSS px, so the row can now
 * be wider than the viewport. It still holds and the scale is still shared: the
 * *band* scrolls sideways, and the page does not — see `.specimens` in app.css.
 * Assembled, which is the default, is 73.5 × 79 whatever the Page count, which
 * is the same box a v1 J-Card had.
 *
 * Scale lives entirely in CSS. This module owns only what CSS cannot know:
 * which Parts exist, what they look like, which Part is focused, and how far
 * down the page the collector has scrolled.
 */

/**
 * Rasterising resolution for a specimen, and for the one being looked at.
 *
 * A specimen tops out at 6.05 CSS px/mm at rest, which is 12.1 device px/mm on
 * a 2× display — 307 DPI. Focus goes to 13.5, which is 690. Rendering
 * everything for the second case would cost four times the pixels for three
 * Parts that are mostly not being looked at, so the focused one is redrawn
 * sharper on demand. Both go through the same call as the Sheet.
 */
const PART_DPI = 300;
const FOCUS_DPI = 600;

const PART_LABELS: Readonly<Record<PartKind, string>> = {
  insert: 'Insert',
  label: 'Label',
};

/**
 * Which Part a warning belongs under (ADR-0010 item 5).
 *
 * Warnings sit at their cause rather than collecting in one list away from the
 * Part that produced them. All three are the Insert's now, and that is not the
 * map going stale: the tracklist, the Spine and the Pages are all sections of one
 * folded strip since ADR-0012, so the Part that produced them really is the same
 * Part. The map stays because the Label is still a Part that could grow a warning
 * of its own, and because a warning with no home would be silently dropped.
 */
const WARNING_HOME: Readonly<Record<SheetWarning['kind'], PartKind>> = {
  'type-below-print-floor': 'insert',
  'spine-truncated': 'insert',
  'insert-pages-short': 'insert',
};

/** Warnings that are errors rather than cautions, and are shown as such. */
const WARNING_SEVERITY: Readonly<Record<SheetWarning['kind'], 'warn' | 'error'>> = {
  'type-below-print-floor': 'warn',
  // The two that report content the collector will not find on the Part at all.
  'spine-truncated': 'error',
  'insert-pages-short': 'error',
};

export interface PartBandOptions {
  /** Controls shown at the right of the band's head — Export, in practice. */
  readonly actions?: readonly HTMLElement[];
}

export interface PartBand {
  readonly element: HTMLElement;
  /**
   * Show the Parts of `entry`, found in whichever Sheet they were packed onto.
   * Absent Parts are absent: a Part switched off does not print, so it is not
   * on the design surface either.
   *
   * The measurements come in beside the entry rather than out of it: they belong
   * to the app now, and the captions under the specimens are about the paper
   * being cut rather than about this Release (`Measurements`).
   */
  show(
    sheets: readonly SheetLayout[],
    entry: QueueEntry | undefined,
    dimensions: PartDimensions,
  ): void;
}

interface Specimen {
  readonly canvas: HTMLCanvasElement;
  readonly art: HTMLButtonElement;
  readonly notes: HTMLUListElement;
  readonly caption: HTMLElement;
}

/**
 * How the warning reads on screen. The geometry stays geometry (layout.ts).
 *
 * No Release named: the note already sits under the Part of the Release being
 * looked at. The Sheet check has its own wording for the same warnings, and
 * does name them, because it lists every Release at once.
 */
function describeWarning(warning: SheetWarning): string {
  switch (warning.kind) {
    case 'type-below-print-floor':
      return (
        `${warning.trackCount} tracks only fit at ${warning.sizeMm.toFixed(2)} mm type, below the ` +
        `${warning.floorMm.toFixed(2)} mm a printer reliably holds. Every track is there, but they ` +
        `may not be legible.`
      );
    case 'spine-truncated':
      // Not quoting what it says: the Spine is on screen an inch away, and the
      // note has to fit a slot that is 90 px tall. The Sheet check, which has
      // no Part beside it, quotes.
      return (
        `The Spine does not fit and its end is cut. The type stays at ` +
        `${warning.sizeMm.toFixed(2)} mm so a shelved case can be read — shorten the artist or the ` +
        `album.`
      );
    case 'insert-pages-short':
      return describeShortfall(warning);
  }
}

/**
 * Why the Insert has fewer Pages than this Release wanted, and what to do about
 * it.
 *
 * Two different sentences, because there are two different causes and only one of
 * them has a remedy. The paper being too small is fixable — lower the margin, or
 * change paper — and the numbers to do it with are on the warning. Pages that
 * could not be *filled* are not fixable and should not pretend to be: ADR-0012
 * will not fold a blank Page, so a Release with nothing for a third Page gets
 * two, and telling the collector to adjust something would send them looking for
 * a control that cannot help.
 *
 * The `maxPages` comparison is what tells the two apart, which is why the warning
 * carries it rather than a cause field — the geometry stays geometry and the
 * wording stays here (layout.ts).
 */
function describeShortfall(warning: Extract<SheetWarning, { kind: 'insert-pages-short' }>): string {
  const lost = describeDropped(warning.dropped);
  if (warning.maxPages < warning.wantedPages) {
    return (
      `${warning.paperName} at a ${warning.marginMm.toFixed(1)} mm margin has room for ` +
      `${warning.maxPages} Pages, not ${warning.wantedPages}, so ${lost} not printed. ` +
      `${LOWER_THE_MARGIN}`
    );
  }
  return (
    `This Release fills ${warning.pages} Pages, not ${warning.wantedPages}, so ${lost} not ` +
    `printed. An Insert folds an even number of Pages and none of them may be blank.`
  );
}

/**
 * What was dropped, with its own article and its own verb.
 *
 * The verb comes along because two things dropped needs "are" and one needs
 * "is", and a sentence built from a list has to agree with the list it was
 * built from — "the credits Page and the back cover is not printed" is the
 * sentence this exists to stop. Shared with the Sheet check, which prints the
 * same two names in a sentence of its own shape.
 */
export function describeDropped(dropped: readonly PageRole[]): string {
  const named = dropped.map((role) => (role === 'credits' ? 'the credits Page' : 'the back cover'));
  return `${named.join(' and ')} ${named.length > 1 ? 'are' : 'is'}`;
}

/**
 * What actually helps when the paper is the limit.
 *
 * A4 takes a four-Page Insert up to a 7.25 mm printable margin and Letter takes
 * one at no margin at all — 282.5 mm of strip against 279.4 mm of long edge — so
 * the two papers need different advice and only one of them has any.
 */
const LOWER_THE_MARGIN =
  'A four-Page Insert needs A4 and a printable margin of 7.25 mm or less; Letter is 3 mm too short for one at any margin.';

/** 87.5 stays 87.5, 79 does not become 79.0. */
const trim = (mm: number): string => String(Math.round(mm * 100) / 100);

export function createPartBand({ actions = [] }: PartBandOptions = {}): PartBand {
  let insertView: InsertView = 'assembled';

  const specimens = el('div', { class: 'specimens' });
  const scaleNote = el('span', { class: 'eyebrow__tail' });

  /** A segmented control: one pressed option, ink-filled, everything else bare. */
  function segment<T extends string>(
    label: string,
    options: ReadonlyArray<{ value: T; text: string }>,
    initial: T,
    onPick: (value: T) => void,
  ): { element: HTMLElement; set: (value: T) => void } {
    const buttons = new Map<T, HTMLButtonElement>();
    const element = el('div', { class: 'seg', attrs: { role: 'group', 'aria-label': label } });
    const set = (value: T): void => {
      for (const [candidate, node] of buttons) {
        node.setAttribute('aria-pressed', String(candidate === value));
      }
    };
    for (const option of options) {
      const button = el('button', {
        class: 'seg__btn',
        text: option.text,
        attrs: { type: 'button', 'aria-pressed': String(option.value === initial) },
        on: {
          click: () => {
            set(option.value);
            onPick(option.value);
          },
        },
      });
      buttons.set(option.value, button);
      element.appendChild(button);
    }
    return { element, set };
  }

  const viewSeg = segment<InsertView>(
    'Insert view',
    [
      { value: 'assembled', text: 'Assembled' },
      { value: 'flat', text: 'Flat' },
    ],
    'assembled',
    (view) => {
      insertView = view;
      redraw();
    },
  );

  /**
   * Fit, or actual size.
   *
   * `1:1` is the nominal CSS millimetre — 3.7795 px — which is what a browser
   * calls a millimetre and roughly what a 96 DPI screen shows. It is a sanity
   * check against the ruler, not a promise: only the calibration sheet settles
   * what a printer actually does.
   */
  const scaleSeg = segment<'fit' | 'one'>(
    'Scale',
    [
      { value: 'fit', text: 'Fit' },
      { value: 'one', text: '1:1' },
    ],
    'fit',
    (scale) => {
      band.toggleAttribute('data-scale', scale === 'one');
      updateScaleNote();
    },
  );

  const head = el(
    'div',
    { class: 'band__head' },
    el(
      'p',
      { class: 'eyebrow' },
      el('span', { class: 'eyebrow__num', text: 'Parts' }),
      scaleNote,
    ),
    viewSeg.element,
    scaleSeg.element,
    ...actions,
  );

  const band = el('div', { class: 'band' }, head, specimens);

  /**
   * A static 1 px marker sitting just above the band.
   *
   * The band's own `offsetTop` moves the moment it sticks, so using it as the
   * trip point is self-referential and can never latch. This does not move, so
   * how far it has scrolled past the top of the viewport is a number that means
   * the same thing before and after the band sticks.
   */
  const sentinel = el('div', { class: 'band-sentinel', attrs: { 'aria-hidden': 'true' } });
  const element = el('div', { class: 'band-wrap' }, sentinel, band);

  let placements: readonly { placement: PartPlacement; sheet: SheetLayout }[] = [];
  let warnings: readonly SheetWarning[] = [];
  // The app's measurements, not the selected Release's: what the captions and
  // the Label note are about is the paper being cut.
  let dimensions: PartDimensions = DEFAULT_PART_DIMENSIONS;
  let focused: PartKind | undefined;
  let drawToken = 0;
  const drawn = new Map<PartKind, Specimen>();

  function updateScaleNote(): void {
    const mm = getComputedStyle(band).getPropertyValue('--mm').trim();
    const px = Number.parseFloat(mm);
    if (!Number.isFinite(px) || drawn.size === 0) {
      scaleNote.textContent = '';
      return;
    }
    scaleNote.textContent =
      `${drawn.size === 1 ? 'one Part' : 'both Parts'} at one scale — ` +
      `${px.toFixed(2)} px/mm · click a Part to enlarge it`;
  }

  /* -------------------------------------------------------------- focus --- */

  function setFocus(next: PartKind | undefined): void {
    if (focused === next) return;
    focused = next;
    if (focused) band.setAttribute('data-focus', focused);
    else band.removeAttribute('data-focus');

    for (const [part, specimen] of drawn) {
      specimen.art.toggleAttribute('data-focused', part === focused);
      specimen.art.setAttribute('aria-pressed', String(part === focused));
    }
    // The focused Part is the one being judged, so it is the one worth the
    // pixels. The others are thumbnails and keep what they have.
    if (focused) void render(focused, FOCUS_DPI);
    updateScaleNote();
  }

  band.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const art = target.closest('.spec__art');
    if (art instanceof HTMLElement) {
      const part = art.dataset['part'] as PartKind | undefined;
      if (part) setFocus(focused === part ? undefined : part);
      return;
    }
    // Clicking the background leaves focus; clicking a control never does —
    // reaching for the J-Card toggle while a Part is isolated must not throw
    // away the thing being looked at.
    if (!target.closest('button, input, select, a, label, summary')) setFocus(undefined);
  });

  band.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && focused) {
      setFocus(undefined);
      event.stopPropagation();
    }
  });

  /* ------------------------------------------------------------ condense --- */

  /**
   * Condensing shortens the document by roughly 280 px, which pulls the scroll
   * position — so a single threshold makes the two edges chase each other and
   * the band flickers between states. Entering well past the marker and leaving
   * close to it is what stops that.
   */
  const CONDENSE_ENTER_PX = 48;
  const CONDENSE_LEAVE_PX = 10;

  let condensed = false;

  function readScroll(): void {
    // Measured from the marker's live position rather than a remembered offset:
    // opening the results above the band moves it, and a cached number would be
    // wrong from then on.
    const passed = -sentinel.getBoundingClientRect().top;
    const next = condensed ? passed > CONDENSE_LEAVE_PX : passed > CONDENSE_ENTER_PX;
    if (next === condensed) return;
    condensed = next;
    band.toggleAttribute('data-condensed', condensed);
    band.toggleAttribute('data-stuck', condensed);
    updateScaleNote();
  }

  /*
   * Never removed, and deliberately: the band is created once and lives as long
   * as the page does, so a teardown method would be an API nothing calls. If a
   * second band is ever built, these three have to come off with the first one.
   */
  window.addEventListener('scroll', readScroll, { passive: true });
  window.addEventListener('resize', readScroll, { passive: true });
  window.addEventListener('resize', updateScaleNote, { passive: true });

  /* ------------------------------------------------------------ drawing --- */

  function specimenFor(part: PartKind): Specimen {
    const canvas = el('canvas', { class: 'spec__canvas' });
    const art = el(
      'button',
      {
        class: 'spec__art',
        attrs: {
          type: 'button',
          'data-part': part,
          'aria-pressed': 'false',
          'aria-label': `${PART_LABELS[part]} — enlarge`,
        },
      },
      canvas,
    );
    return {
      canvas,
      art,
      caption: el('div', { class: 'spec__cap' }),
      notes: el('ul', { class: 'spec__note' }),
    };
  }

  /**
   * What the caption says beyond the name.
   *
   * The millimetres are the point of a specimen, so the Insert says every number
   * that matters when it is assembled: what is on screen, how long the strip
   * actually is, and how many Pages that is. Flat, the box on screen *is* the
   * strip, so the Page count is all that is left to say.
   *
   * The Page count comes off the placement rather than out of the measurements,
   * because it is not one: it is derived from this Release's content and capped by
   * the paper (ADR-0012), so the specimen is the only thing that knows.
   */
  function captionFacts(
    part: PartKind,
    box: { width: number; height: number },
    placement: PartPlacement | undefined,
  ): string {
    const shown = `${trim(box.width)} × ${trim(box.height)}`;
    if (part !== 'insert') return `${shown} mm`;

    const pages = pageCountOf(placement);
    const pageNote = `${pages} ${pages === 1 ? 'Page' : 'Pages'}`;
    if (insertView === 'flat') return `${shown} mm flat · ${pageNote}`;

    const { insert } = dimensions;
    const flat = insertSize(insert, pages).width;
    return (
      `${shown} shown · ${trim(flat)} flat · ${pageNote} · ` +
      `flap ${trim(insert.innerFlapWidth)} behind`
    );
  }

  /** How many Pages this Insert folded into, counted off its own sections. */
  function pageCountOf(placement: PartPlacement | undefined): number {
    return (placement?.panels ?? []).filter((panel) => panel.panel === 'page').length;
  }

  /**
   * The Label's own line, which is information rather than a problem.
   *
   * Not every note under a Part is a warning: the notch is the one piece of a
   * Part's shape that a collector has to decide about, and saying which preset
   * is in force is what makes the decision checkable without opening a fold.
   */
  function labelNote(): string {
    const { label } = dimensions;
    const preset = LABEL_PRESETS.find(
      (candidate) =>
        candidate.dimensions.width === label.width && candidate.dimensions.height === label.height,
    );
    const name = preset ? `${preset.name} preset` : 'Custom size';
    return label.notch
      ? `${name} · ${trim(label.notchSize)} mm notch clears the cartridge corner.`
      : `${name} · no notch, so the Label covers the cut corner.`;
  }

  async function render(part: PartKind, dpi: number): Promise<void> {
    const token = drawToken;
    const found = placements.find((entry) => entry.placement.part === part);
    const specimen = drawn.get(part);
    if (!found || !specimen) return;

    const view = part === 'insert' ? insertView : 'flat';
    const rendered = await rasterizeSheet(partSheet(found.sheet.paper, found.placement, view), dpi);
    if (token !== drawToken) return;

    specimen.canvas.width = rendered.width;
    specimen.canvas.height = rendered.height;
    specimen.canvas.getContext('2d')?.drawImage(rendered, 0, 0);
  }

  function redraw(): void {
    // Abandons every raster still in flight: they would draw onto canvases that
    // are about to be thrown away, or worse, onto the new ones.
    drawToken += 1;
    clear(specimens);
    drawn.clear();

    const present = PART_KINDS.filter((part) =>
      placements.some((entry) => entry.placement.part === part),
    );

    for (const part of present) {
      const specimen = specimenFor(part);
      drawn.set(part, specimen);

      const found = placements.find((entry) => entry.placement.part === part);
      const view = part === 'insert' ? insertView : 'flat';
      const box = found ? partSheet(found.sheet.paper, found.placement, view).paper : undefined;

      // The Part's size in millimetres, handed to CSS so that its width can be
      // `calc(var(--w) * var(--mm))` — literally its millimetres at the shared
      // scale. It comes from the layout model rather than being written into the
      // stylesheet because these are adjustable parameters: the Label has
      // presets and a size control, and a hardcoded 35 × 52.5 would be wrong
      // the moment anyone used them.
      if (box) {
        specimen.art.style.setProperty('--w', String(box.width));
        specimen.art.style.setProperty('--h', String(box.height));
        specimen.caption.append(
          el('b', { text: PART_LABELS[part] }),
          el('span', { text: captionFacts(part, box, found?.placement) }),
        );
      }

      for (const warning of warnings.filter((candidate) => WARNING_HOME[candidate.kind] === part)) {
        specimen.notes.appendChild(
          el('li', {
            // `prose`: a warning is a sentence of English, and the Noto stack
            // is what this page sets those in.
            class: `micro prose note note--${WARNING_SEVERITY[warning.kind]}`,
            text: describeWarning(warning),
          }),
        );
      }

      const note = part === 'label' ? labelNote() : undefined;
      // No `prose`: this one is a fact about the Part, and belongs to the
      // caption above it rather than to the warnings beside it.
      if (note) specimen.notes.appendChild(el('li', { class: 'micro note note--plain', text: note }));

      // display: contents, so the three rows line up across the three columns
      // however tall any one caption or note turns out to be.
      specimens.appendChild(
        el('div', { class: `spec spec--${part}` }, specimen.art, specimen.caption, specimen.notes),
      );
    }

    if (focused && !present.includes(focused)) setFocus(undefined);
    element.toggleAttribute('data-empty', present.length === 0);

    for (const part of present) void render(part, part === focused ? FOCUS_DPI : PART_DPI);
    readScroll();
    updateScaleNote();
  }

  return {
    element,
    show(sheets, entry, next) {
      dimensions = next;
      const releaseId = entry?.design.release.id ?? '';
      const found: { placement: PartPlacement; sheet: SheetLayout }[] = [];
      for (const sheet of sheets) {
        for (const placement of sheet.placements) {
          if (placement.releaseId === releaseId) found.push({ placement, sheet });
        }
      }
      placements = found;
      warnings = sheets
        .flatMap((sheet) => sheet.warnings ?? [])
        .filter((warning) => warning.releaseId === releaseId);
      redraw();
    },
  };
}
