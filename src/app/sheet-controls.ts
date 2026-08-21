import { PAPER_SIZES, paperSizeById } from '../domain/paper.ts';
import type { PaperSizeId } from '../domain/paper.ts';
import { PART_KINDS } from '../domain/parts.ts';
import type { PartKind } from '../domain/parts.ts';
import type { SheetConfig } from '../render/sheet-renderer.ts';
import { el } from './dom.ts';

/** Paper size, printable margin and which Parts this print job wants. */

const PART_LABELS: Readonly<Record<PartKind, string>> = {
  jcard: 'J-Card',
  'back-card': 'Back Card',
  label: 'Label',
};

/** Wide enough that no home printer clips, narrow enough to stay useful. */
const MARGIN_RANGE = { min: 0, max: 25, step: 0.5 } as const;

export function createSheetControls(
  config: SheetConfig,
  onChange: (changes: Partial<SheetConfig>) => void,
): HTMLElement {
  const paper = el('select', {
    class: 'field__input',
    attrs: { id: 'sheet-paper' },
    on: {
      change: (event) =>
        onChange({ paper: paperSizeById((event.target as HTMLSelectElement).value as PaperSizeId) }),
    },
  });
  for (const size of PAPER_SIZES) {
    const option = el('option', { text: size.name, attrs: { value: size.id } });
    option.selected = size.id === config.paper.id;
    paper.appendChild(option);
  }

  const margin = el('input', {
    class: 'field__input',
    attrs: {
      type: 'number',
      id: 'sheet-margin',
      value: config.marginMm,
      min: MARGIN_RANGE.min,
      max: MARGIN_RANGE.max,
      step: MARGIN_RANGE.step,
    },
    on: {
      input: (event) => {
        const value = Number((event.target as HTMLInputElement).value);
        if (Number.isFinite(value) && value >= MARGIN_RANGE.min && value <= MARGIN_RANGE.max) {
          onChange({ marginMm: value });
        }
      },
    },
  });

  const chosen = new Set<PartKind>(config.parts);
  const toggles = el('div', { class: 'toggles' });
  for (const part of PART_KINDS) {
    const box = el('input', {
      attrs: { type: 'checkbox', id: `part-${part}` },
      on: {
        change: (event) => {
          if ((event.target as HTMLInputElement).checked) chosen.add(part);
          else chosen.delete(part);
          onChange({ parts: PART_KINDS.filter((candidate) => chosen.has(candidate)) });
        },
      },
    });
    box.checked = chosen.has(part);
    toggles.appendChild(
      el('label', { class: 'toggle', attrs: { for: `part-${part}` } }, box, PART_LABELS[part]),
    );
  }

  return el(
    'section',
    { class: 'panel' },
    el('h2', { class: 'panel__title', text: 'Sheet' }),
    el('p', {
      class: 'panel__hint',
      text: 'Parts are packed onto as few Sheets as possible, inside the printable margin.',
    }),
    el(
      'div',
      { class: 'field-row' },
      el(
        'label',
        { class: 'field', attrs: { for: 'sheet-paper' } },
        el('span', { class: 'field__label', text: 'Paper' }),
        paper,
      ),
      el(
        'label',
        { class: 'field', attrs: { for: 'sheet-margin' } },
        el('span', { class: 'field__label', text: 'Printable margin (mm)' }),
        margin,
      ),
    ),
    el(
      'div',
      { class: 'field' },
      el('span', { class: 'field__label', text: 'Parts to print' }),
      toggles,
    ),
  );
}
