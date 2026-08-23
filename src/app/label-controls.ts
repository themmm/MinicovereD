import { LABEL_PRESETS, LABEL_SIZE_RANGE, labelPreset } from '../domain/parts.ts';
import type { LabelDimensions, LabelPreset, LabelPresetId } from '../domain/parts.ts';
import { el } from './dom.ts';

/**
 * The Label: which preset to start from, how big exactly, and whether to cut
 * the cartridge's diagonal corner. The sources for these numbers disagree, so
 * the preset is a starting point and the calibration sheet is the arbiter.
 *
 * These are measurements rather than design, so from v2 they belong to the app
 * and not to the Release on screen (`Measurements`). Two consequences show up
 * here. The panel is built once and outlives every selection, which is why it
 * needs {@link LabelControls.show} — the same shape `createSheetControls` has,
 * for the same reason: a project arriving from a file changes the numbers from
 * somewhere else. And a nudge now applies to every Release at once, which is
 * what the hint says.
 */

interface SizeField {
  readonly key: 'width' | 'height';
  readonly label: string;
}

const SIZES: readonly SizeField[] = [
  { key: 'width', label: 'Width (mm)' },
  { key: 'height', label: 'Height (mm)' },
];

/** Shown once the Label has been nudged away from every preset. */
const CUSTOM = 'custom';

/** Which preset a set of measurements matches, if any. */
const presetMatching = (label: LabelDimensions): LabelPreset | undefined =>
  LABEL_PRESETS.find(
    (preset) =>
      preset.dimensions.width === label.width &&
      preset.dimensions.height === label.height &&
      preset.dimensions.notch === label.notch,
  );

export interface LabelControls {
  readonly element: HTMLElement;
  /**
   * Show measurements that changed somewhere else — an opened project, or this
   * browser's restored work. Setting a field's value fires no event, so this
   * cannot loop back through `onChange`.
   */
  show(label: LabelDimensions): void;
}

export function createLabelControls(
  initial: LabelDimensions,
  onChange: (dimensions: LabelDimensions) => void,
): LabelControls {
  let dimensions = initial;

  const inputs = new Map<SizeField['key'], HTMLInputElement>();
  const notch = el('input', {
    attrs: { type: 'checkbox', id: 'label-notch' },
  });
  const provenance = el('span', { class: 'field__note', text: '' });

  /** Puts the numbers on screen, without saying who changed them. */
  const syncInputs = (next: LabelDimensions): void => {
    for (const field of SIZES) {
      const input = inputs.get(field.key);
      if (input) input.value = String(next[field.key]);
    }
    notch.checked = next.notch;
  };

  const apply = (next: LabelDimensions, sync: boolean): void => {
    dimensions = next;
    if (sync) syncInputs(next);
    onChange(dimensions);
  };

  const picker = el('select', {
    class: 'field__input',
    attrs: { id: 'label-preset' },
    on: {
      change: (event) => {
        const chosen = (event.target as HTMLSelectElement).value;
        if (chosen === CUSTOM) return;
        const preset = labelPreset(chosen as LabelPresetId);
        provenance.textContent = preset.provenance;
        apply(preset.dimensions, true);
      },
    },
  });
  const custom = el('option', { text: 'Custom', attrs: { value: CUSTOM } });
  // A Label that has been nudged is no longer any preset, so the picker starts
  // on whichever one it currently matches, or on nothing.
  const matching = presetMatching(initial);
  for (const preset of LABEL_PRESETS) {
    const option = el('option', { text: preset.name, attrs: { value: preset.id } });
    option.selected = preset.id === matching?.id;
    picker.appendChild(option);
  }
  picker.appendChild(custom);
  custom.selected = !matching;
  provenance.textContent = matching?.provenance ?? 'Adjusted from a preset.';

  /** A nudged Label is no longer any preset, and the picker should say so. */
  const markCustom = (): void => {
    custom.selected = true;
    provenance.textContent = 'Adjusted from a preset — the calibration sheet will tell you if it fits.';
  };

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
            // Typed mid-edit or out of range: leave the Label alone for now.
            return;
          }
          markCustom();
          apply({ ...dimensions, [field.key]: value }, false);
        },
        // Whatever the field ends up showing has to be the Label's real size.
        // An emptied or rejected field would otherwise disagree with it forever.
        blur: (event) => {
          (event.target as HTMLInputElement).value = String(dimensions[field.key]);
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
    markCustom();
    apply({ ...dimensions, notch: notch.checked }, false);
  });

  const element = el(
    'section',
    { class: 'panel' },
    el('h2', { class: 'panel__title', text: 'Label' }),
    el('p', {
      class: 'panel__hint',
      text:
        'Your cartridges, not this Release: one size for every Release in the queue. Start from a ' +
        'preset, nudge it until it fits, and print the calibration sheet to check.',
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

  return {
    element,
    show(label) {
      dimensions = label;
      syncInputs(label);
      const preset = presetMatching(label);
      picker.value = preset?.id ?? CUSTOM;
      provenance.textContent = preset?.provenance ?? 'Adjusted from a preset.';
    },
  };
}
