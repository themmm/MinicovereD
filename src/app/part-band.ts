import { PART_KINDS } from '../domain/parts.ts';
import type { PartKind } from '../domain/parts.ts';
import type { PartPlacement, SheetLayout, SheetWarning } from '../render/layout.ts';
import { partSheet } from '../render/part-sheet.ts';
import type { JCardView } from '../render/part-sheet.ts';
import { rasterizeSheet } from '../render/raster.ts';
import { clear, el } from './dom.ts';

/**
 * The Parts band: the three specimens, at one shared scale, as the composition
 * of the page (ADR-0010).
 *
 * This is the design surface. The A4 Sheet used to be the only preview, which
 * put the 68 mm Front Panel on screen at roughly 2× physical size while
 * two-thirds of the area showed empty paper — the thing being designed was the
 * least legible thing on screen. Here every width is literally its millimetres,
 * `calc(87.5 * var(--mm))` and friends, so one token is one truth and the real
 * size relationships between the three stay visible.
 *
 * Scale lives entirely in CSS. This module owns only what CSS cannot know: which
 * Parts exist, what they look like, which Part is focused, and how far down the
 * page the collector has scrolled.
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

/** Human names, and the millimetres, for the caption under each specimen. */
const PART_LABELS: Readonly<Record<PartKind, string>> = {
  jcard: 'J-Card',
  'back-card': 'Back Card',
  label: 'Label',
};

/**
 * Which Part a warning belongs under (ADR-0010 item 5).
 *
 * Warnings sit at their cause rather than collecting in one list away from the
 * Part that produced them: a tracklist that had to shrink is a fact about the
 * Back Card, and reading it anywhere else means looking for what it refers to.
 */
const WARNING_HOME: Readonly<Record<SheetWarning['kind'], PartKind>> = {
  'type-below-print-floor': 'back-card',
};

export interface PartBand {
  readonly element: HTMLElement;
  /**
   * Show the Parts of `releaseId`, found in whichever Sheet they were packed
   * onto. Absent Parts are absent: a Part switched off does not print, so it is
   * not on the design surface either.
   */
  show(sheets: readonly SheetLayout[], releaseId: string): void;
  /** Stop watching the scroll position. */
  destroy(): void;
}

interface Specimen {
  readonly part: PartKind;
  readonly canvas: HTMLCanvasElement;
  readonly art: HTMLButtonElement;
  readonly notes: HTMLUListElement;
  readonly caption: HTMLElement;
}

/** How the warning reads on screen. The geometry stays geometry (layout.ts). */
function describeWarning(warning: SheetWarning): string {
  const { trackCount, sizeMm, floorMm } = warning;
  return (
    `${trackCount} tracks only fit at ${sizeMm.toFixed(2)} mm type, below the ` +
    `${floorMm.toFixed(2)} mm a printer reliably holds. Every track is there, but they may ` +
    `not be legible.`
  );
}

export function createPartBand(): PartBand {
  const jcardView = { current: 'assembled' as JCardView };

  const specimens = el('div', { class: 'specimens' });
  const eyebrowNote = el('span', { class: 'band__note' });

  const viewButtons = new Map<JCardView, HTMLButtonElement>();
  const segment = el('div', {
    class: 'seg',
    attrs: { role: 'group', 'aria-label': 'How to show the J-Card' },
  });
  for (const view of ['assembled', 'flat'] as const) {
    const button = el('button', {
      class: 'seg__btn',
      text: view === 'assembled' ? 'Assembled' : 'Flat',
      attrs: { type: 'button', 'aria-pressed': String(view === jcardView.current) },
      on: {
        click: () => {
          jcardView.current = view;
          for (const [candidate, node] of viewButtons) {
            node.setAttribute('aria-pressed', String(candidate === view));
          }
          redraw();
        },
      },
    });
    viewButtons.set(view, button);
    segment.appendChild(button);
  }

  const head = el(
    'div',
    { class: 'band__head' },
    el('p', { class: 'eyebrow' }, el('span', { class: 'eyebrow__text', text: 'The Parts' }), eyebrowNote),
    segment,
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
  let focused: PartKind | undefined;
  let drawToken = 0;
  const drawn = new Map<PartKind, Specimen>();

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

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && focused) {
      setFocus(undefined);
      event.stopPropagation();
    }
  };
  band.addEventListener('keydown', onKeyDown);

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
  }

  window.addEventListener('scroll', readScroll, { passive: true });
  window.addEventListener('resize', readScroll, { passive: true });

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
    const caption = el('div', { class: 'spec__cap' });
    const notes = el('ul', { class: 'spec__note' });
    return { part, canvas, art, notes, caption };
  }

  async function render(part: PartKind, dpi: number): Promise<void> {
    const token = drawToken;
    const found = placements.find((entry) => entry.placement.part === part);
    const specimen = drawn.get(part);
    if (!found || !specimen) return;

    const view = part === 'jcard' ? jcardView.current : 'flat';
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
      const view = part === 'jcard' ? jcardView.current : 'flat';
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
      }

      // The millimetres are the caption, because they are the point: the
      // specimen is the Part at a known size, not a picture of one.
      specimen.caption.append(
        el('b', { text: PART_LABELS[part] }),
        el('span', {
          text: box ? `${trim(box.width)} × ${trim(box.height)} mm` : '',
        }),
      );

      for (const warning of warnings.filter((candidate) => WARNING_HOME[candidate.kind] === part)) {
        specimen.notes.appendChild(
          el('li', { class: 'spec__warning', text: describeWarning(warning) }),
        );
      }

      // display: contents, so the three rows line up across the three columns
      // however tall any one caption or warning turns out to be.
      const group = el('div', { class: `spec spec--${part}` }, specimen.art, specimen.caption, specimen.notes);
      specimens.appendChild(group);
    }

    if (focused && !present.includes(focused)) setFocus(undefined);
    element.toggleAttribute('data-empty', present.length === 0);
    eyebrowNote.textContent =
      present.length === 0
        ? 'nothing to show — every Part is switched off'
        : `${present.length} of 3 · one shared scale`;

    for (const part of present) void render(part, part === focused ? FOCUS_DPI : PART_DPI);
    readScroll();
  }

  return {
    element,
    show(sheets, releaseId) {
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
    destroy() {
      window.removeEventListener('scroll', readScroll);
      window.removeEventListener('resize', readScroll);
    },
  };
}

/** 87.5 stays 87.5, 79 does not become 79.0. */
const trim = (mm: number): string => String(Math.round(mm * 100) / 100);
