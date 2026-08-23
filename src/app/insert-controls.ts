import { insertSize, MAX_INSERT_PAGES, PAGE_WIDTH_RANGE } from '../domain/parts.ts';
import type { InsertDimensions } from '../domain/parts.ts';
import { el } from './dom.ts';

/**
 * The Insert: how wide a Page is cut.
 *
 * One control for five measurements, and that is deliberate. The Inner Flap, the
 * Spine, the Front Panel and the height are all dictated by the case — they are
 * the J-Card's numbers, unchanged since v1, and a collector who wants to argue
 * with them has the calibration sheet and a project file. The Page width is the
 * one of the five that the case does not decide: it is a *booklet* dimension,
 * ADR-0012 picked 65 mm because 65 is what fits four Pages on A4, and it is the
 * number that changes how long the strip is and therefore how many Inserts share
 * a Sheet. The spec lists it under app settings for exactly that reason.
 *
 * Measurements, so app-level and not per Release (`Measurements`) — the same
 * shape `createLabelControls` has, and for the same reason: the panel is built
 * once and outlives every selection, so an opened project has to be able to push
 * new numbers into it.
 */

export interface InsertControls {
  readonly element: HTMLElement;
  /**
   * Show measurements that changed somewhere else — an opened project, or this
   * browser's restored work. Setting a field's value fires no event, so this
   * cannot loop back through `onChange`.
   */
  show(insert: InsertDimensions): void;
}

/** What the strip measures at both Page counts, which is what the number costs. */
function describeStrip(insert: InsertDimensions): string {
  return (
    `Flat strip: ${insertSize(insert, 2).width} mm at 2 Pages, ` +
    `${insertSize(insert, MAX_INSERT_PAGES).width} mm at ${MAX_INSERT_PAGES}.`
  );
}

export function createInsertControls(
  initial: InsertDimensions,
  onChange: (insert: InsertDimensions) => void,
): InsertControls {
  let dimensions = initial;
  const note = el('span', { class: 'field__note', text: describeStrip(initial) });

  const width = el('input', {
    class: 'field__input',
    attrs: {
      type: 'number',
      id: 'insert-page-width',
      value: initial.pageWidth,
      min: PAGE_WIDTH_RANGE.min,
      max: PAGE_WIDTH_RANGE.max,
      step: PAGE_WIDTH_RANGE.stepMm,
    },
    on: {
      input: (event) => {
        const value = Number((event.target as HTMLInputElement).value);
        if (
          !Number.isFinite(value) ||
          value < PAGE_WIDTH_RANGE.min ||
          value > PAGE_WIDTH_RANGE.max
        ) {
          // Typed mid-edit or out of range: leave the Insert alone for now.
          return;
        }
        dimensions = { ...dimensions, pageWidth: value };
        note.textContent = describeStrip(dimensions);
        onChange(dimensions);
      },
      // Whatever the field ends up showing has to be the Page's real width. An
      // emptied or rejected field would otherwise disagree with it forever.
      blur: (event) => {
        (event.target as HTMLInputElement).value = String(dimensions.pageWidth);
      },
    },
  });

  const element = el(
    'section',
    { class: 'panel' },
    el('h2', { class: 'panel__title', text: 'Insert' }),
    el('p', {
      class: 'panel__hint',
      text:
        'The Insert folds into two or four Pages, decided by what each Release has to say. ' +
        'Page 1 is the Front Panel at 68 mm; this is every Page after it.',
    }),
    el(
      'label',
      { class: 'field', attrs: { for: 'insert-page-width' } },
      el('span', { class: 'field__label', text: 'Page width (mm)' }),
      width,
      note,
    ),
  );

  return {
    element,
    show(insert) {
      dimensions = insert;
      width.value = String(insert.pageWidth);
      note.textContent = describeStrip(insert);
    },
  };
}
