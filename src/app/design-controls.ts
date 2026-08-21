import { TEMPLATES } from '../render/sheet-renderer.ts';
import type { TemplateId, TemplateParams } from '../render/sheet-renderer.ts';
import { el } from './dom.ts';

/**
 * How this Release looks: which Template, in what colours, with or without the
 * type over the artwork and the MiniDisc logo. Every one of these belongs to
 * the Release, not to the app, so two Releases can wear the same design
 * differently.
 */

export interface DesignChoice {
  readonly templateId: TemplateId;
  readonly params: TemplateParams;
}

interface ColourField {
  readonly key: 'paperColor' | 'inkColor' | 'accentColor';
  readonly label: string;
}

const COLOURS: readonly ColourField[] = [
  { key: 'paperColor', label: 'Paper' },
  { key: 'inkColor', label: 'Ink' },
  { key: 'accentColor', label: 'Accent' },
];

interface ToggleField {
  readonly key: 'showOverlayText' | 'showLogo';
  readonly label: string;
  readonly hint: string;
}

const TOGGLES: readonly ToggleField[] = [
  {
    key: 'showOverlayText',
    label: 'Text over the artwork',
    hint: 'Artist and album on top of full-bleed artwork',
  },
  { key: 'showLogo', label: 'MiniDisc logo', hint: 'On Front Panel and Spine' },
];

export function createDesignControls(
  initial: DesignChoice,
  onChange: (change: Partial<DesignChoice>) => void,
): HTMLElement {
  let params = initial.params;

  const changeParams = (patch: Partial<TemplateParams>): void => {
    params = { ...params, ...patch };
    onChange({ params });
  };

  const templates = Object.values(TEMPLATES);
  const picker = el('select', {
    class: 'field__input',
    attrs: { id: 'design-template' },
    on: {
      change: (event) =>
        onChange({ templateId: (event.target as HTMLSelectElement).value as TemplateId }),
    },
  });
  for (const template of templates) {
    const option = el('option', { text: template.name, attrs: { value: template.id } });
    option.selected = template.id === initial.templateId;
    picker.appendChild(option);
  }

  const description = el('span', {
    class: 'field__note',
    text: TEMPLATES[initial.templateId].description,
  });
  picker.addEventListener('change', () => {
    description.textContent = TEMPLATES[picker.value as TemplateId].description;
  });

  const swatches = el('div', { class: 'swatches' });
  for (const colour of COLOURS) {
    const input = el('input', {
      class: 'swatch__input',
      attrs: { type: 'color', id: `design-${colour.key}`, value: params[colour.key] },
      on: {
        input: (event) => changeParams({ [colour.key]: (event.target as HTMLInputElement).value }),
      },
    });
    swatches.appendChild(
      el(
        'label',
        { class: 'swatch', attrs: { for: `design-${colour.key}` } },
        input,
        el('span', { text: colour.label }),
      ),
    );
  }

  const toggles = el('div', { class: 'toggles toggles--stacked' });
  for (const toggle of TOGGLES) {
    const box = el('input', {
      attrs: { type: 'checkbox', id: `design-${toggle.key}` },
      on: {
        change: (event) => changeParams({ [toggle.key]: (event.target as HTMLInputElement).checked }),
      },
    });
    box.checked = params[toggle.key];
    toggles.appendChild(
      el(
        'label',
        { class: 'toggle', attrs: { for: `design-${toggle.key}`, title: toggle.hint } },
        box,
        toggle.label,
      ),
    );
  }

  return el(
    'section',
    { class: 'panel' },
    el('h2', { class: 'panel__title', text: 'Design' }),
    el('p', {
      class: 'panel__hint',
      text: 'Template, colours and what appears on the artwork — set per Release.',
    }),
    el(
      'label',
      { class: 'field', attrs: { for: 'design-template' } },
      el('span', { class: 'field__label', text: 'Template' }),
      picker,
      description,
    ),
    el(
      'div',
      { class: 'field' },
      el('span', { class: 'field__label', text: 'Colours' }),
      swatches,
    ),
    el('div', { class: 'field' }, toggles),
  );
}
