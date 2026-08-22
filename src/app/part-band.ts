import { LABEL_PRESETS, PART_KINDS } from '../domain/parts.ts';
import type { PartKind } from '../domain/parts.ts';
import type { QueueEntry } from '../queue/release-queue.ts';
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
 * so one token is one truth and the real size relationships stay visible.
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
  'spine-truncated': 'jcard',
};

/** Warnings that are errors rather than cautions, and are shown as such. */
const WARNING_SEVERITY: Readonly<Record<SheetWarning['kind'], 'warn' | 'error'>> = {
  'type-below-print-floor': 'warn',
  // The only one that reports content the collector will not find on the Part.
  'spine-truncated': 'error',
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
   */
  show(sheets: readonly SheetLayout[], entry: QueueEntry | undefined): void;
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
  }
}

/** 87.5 stays 87.5, 79 does not become 79.0. */
const trim = (mm: number): string => String(Math.round(mm * 100) / 100);

export function createPartBand({ actions = [] }: PartBandOptions = {}): PartBand {
  let jcardView: JCardView = 'assembled';

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

  const viewSeg = segment<JCardView>(
    'J-Card view',
    [
      { value: 'assembled', text: 'Assembled' },
      { value: 'flat', text: 'Flat' },
    ],
    'assembled',
    (view) => {
      jcardView = view;
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
  let selected: QueueEntry | undefined;
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
      `all ${drawn.size === 1 ? 'one' : drawn.size === 2 ? 'two' : 'three'} at one scale — ` +
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
   * The millimetres are the point of a specimen, so the J-Card says both
   * numbers when it is assembled: what is on screen, what actually prints, and
   * where the difference went.
   */
  function captionFacts(part: PartKind, box: { width: number; height: number }): string {
    if (part !== 'jcard' || jcardView === 'flat') {
      return `${trim(box.width)} × ${trim(box.height)} mm`;
    }
    const jcard = selected?.design.dimensions.jcard;
    const flat = jcard ? jcard.innerFlapWidth + jcard.spineWidth + jcard.frontPanelWidth : box.width;
    return (
      `${trim(box.width)} × ${trim(box.height)} shown · ${trim(flat)} flat · ` +
      `flap ${trim(jcard?.innerFlapWidth ?? 0)} behind`
    );
  }

  /**
   * The Label's own line, which is information rather than a problem.
   *
   * Not every note under a Part is a warning: the notch is the one piece of a
   * Part's shape that a collector has to decide about, and saying which preset
   * is in force is what makes the decision checkable without opening a fold.
   */
  function labelNote(): string | undefined {
    const label = selected?.design.dimensions.label;
    if (!label) return undefined;
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

    const view = part === 'jcard' ? jcardView : 'flat';
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
      const view = part === 'jcard' ? jcardView : 'flat';
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
          el('span', { text: captionFacts(part, box) }),
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
    show(sheets, entry) {
      selected = entry;
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
