import { LABEL_PRESETS, LABEL_SIZE_RANGE, labelPreset } from '../domain/parts.ts';
import type { LabelDimensions, LabelPresetId } from '../domain/parts.ts';
import { el } from './dom.ts';

/**
 * The Label: which preset to start from, how big exactly, and whether to cut
 * the cartridge's diagonal corner. The sources for these numbers disagree, so
 * the preset is a starting point and the calibration sheet is the arbiter.
 */

interface SizeField {
  readonly key: 'width' | 'height';
  readonly label: string;
}

const SIZES: readonly SizeField[] = [
  { key: 'width', label: 'Width (mm)' },
  { key: 'height', label: 'Height (mm)' },
];

export function createLabelControls(
  initial: LabelDimensions,
  onChange: (dimensions: LabelDimensions) => void,
): HTMLElement {
  let dimensions = initial;

  const inputs = new Map<SizeField['key'], HTMLInputElement>();
  const notch = el('input', {
    attrs: { type: 'checkbox', id: 'label-notch' },
  });
  const provenance = el('span', { class: 'field__note', text: '' });

  const apply = (next: LabelDimensions, syncInputs: boolean): void => {
    dimensions = next;
    if (syncInputs) {
      for (const field of SIZES) {
        const input = inputs.get(field.key);
        if (input) input.value = String(next[field.key]);
      }
      notch.checked = next.notch;
    }
    onChange(dimensions);
  };

  const picker = el('select', {
    class: 'field__input',
    attrs: { id: 'label-preset' },
    on: {
      change: (event) => {
        const preset = labelPreset((event.target as HTMLSelectElement).value as LabelPresetId);
        provenance.textContent = preset.provenance;
        apply(preset.dimensions, true);
      },
    },
  });
  // A Label that has been nudged is no longer any preset, so the picker starts
  // on whichever one it currently matches, or on nothing.
  const matching = LABEL_PRESETS.find(
    (preset) =>
      preset.dimensions.width === initial.width &&
      preset.dimensions.height === initial.height &&
      preset.dimensions.notch === initial.notch,
  );
  for (const preset of LABEL_PRESETS) {
    const option = el('option', { text: preset.name, attrs: { value: preset.id } });
    option.selected = preset.id === matching?.id;
    picker.appendChild(option);
  }
  provenance.textContent = matching?.provenance ?? 'Adjusted from a preset.';

  const sizeFields = el('div', { class: 'field-row' });
  for (const field of SIZES) {
    const input = el('input', {
      class: 'field__input',
      attrs: {
        type: 'number',
        id: `label-${field.key}`,
        value: initial[field.key],
        min: LABEL_SIZE_RANGE.min,
        max: LABEL_SIZE_RANGE.max,
        step: LABEL_SIZE_RANGE.stepMm,
      },
      on: {
        input: (event) => {
          const value = Number((event.target as HTMLInputElement).value);
          if (!Number.isFinite(value) || value < LABEL_SIZE_RANGE.min || value > LABEL_SIZE_RANGE.max) {
            return;
          }
          provenance.textContent = 'Adjusted from a preset.';
          apply({ ...dimensions, [field.key]: value }, false);
        },
      },
    });
    inputs.set(field.key, input);
    sizeFields.appendChild(
      el(
        'label',
        { class: 'field', attrs: { for: `label-${field.key}` } },
        el('span', { class: 'field__label', text: field.label }),
        input,
      ),
    );
  }

  notch.checked = initial.notch;
  notch.addEventListener('change', () => {
    apply({ ...dimensions, notch: notch.checked }, false);
  });

  return el(
    'section',
    { class: 'panel' },
    el('h2', { class: 'panel__title', text: 'Label' }),
    el('p', {
      class: 'panel__hint',
      text: 'Start from a preset, then nudge it until it fits your cartridges. Print the calibration sheet to check.',
    }),
    el(
      'label',
      { class: 'field', attrs: { for: 'label-preset' } },
      el('span', { class: 'field__label', text: 'Preset' }),
      picker,
      provenance,
    ),
    sizeFields,
    el(
      'div',
      { class: 'field' },
      el(
        'label',
        { class: 'toggle', attrs: { for: 'label-notch' } },
        notch,
        'Diagonal corner notch',
      ),
    ),
  );
}
