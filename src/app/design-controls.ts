import { TEMPLATES } from '../render/sheet-renderer.ts';
import type { DesignChoice, TemplateId, TemplateParams, TemplateToggle } from '../render/sheet-renderer.ts';
import { clear, el } from './dom.ts';

/**
 * How this Release looks: which Template, in what colours, with or without the
 * type over the artwork and the MiniDisc logo. Every one of these belongs to
 * the Release, not to the app, so two Releases can wear the same design
 * differently — which is the other half of the split the Label measurements
 * left by (`Measurements`).
 *
 * The toggles shown are the ones the chosen Template reads, and no others. Each
 * Template declares that itself (`Template.toggles`), so the list changes when
 * the Template does — in place, because the collector is standing in the picker
 * when it happens and rebuilding the panel would take their focus with it.
 */

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
  readonly key: TemplateToggle;
  readonly label: string;
  readonly hint: string;
}

const TOGGLES: readonly ToggleField[] = [
  {
    key: 'showOverlayText',
    label: 'Text over the artwork',
    hint: 'Artist and album on top of full-bleed artwork',
  },
  {
    key: 'showLogo',
    label: 'MiniDisc logo',
    // Minimal puts it on the Spine only, so the plain "Front Panel and Spine"
    // this said became false the day it was added.
    hint: 'On the Spine always; on the Front Panel of Classic and Full-bleed',
  },
  {
    key: 'insetArtwork',
    label: 'Artwork as an inset square',
    // Named by what it does to the Part rather than by the Template it belongs
    // to, because the Template picker is directly above it.
    hint: 'A square with paper all round it, instead of bleeding to three edges',
  },
];

/** The toggle fields the chosen Template reads, in the order they are listed above. */
const togglesFor = (templateId: TemplateId): ToggleField[] =>
  TOGGLES.filter((toggle) => TEMPLATES[templateId].toggles.includes(toggle.key));

/**
 * The Design fold's summary line: what is inside it, without opening it
 * (ADR-0010 item 6).
 *
 * Lives here rather than in the workspace because it reads the same two lists
 * the panel does — the Templates and the toggle labels — and a summary naming a
 * control the panel does not show would be a summary of a different fold.
 */
export function describeDesign({ templateId, params }: DesignChoice): string {
  // The control labels verbatim, capitals and all: the summary is a list of what
  // is switched on in the fold below it, and renaming them here would make two
  // names for one checkbox.
  const on = togglesFor(templateId).filter((toggle) => params[toggle.key]);
  const named = on.map((toggle) => toggle.label).join(', ');
  return `${TEMPLATES[templateId].name} · ${named || 'no options on'}`;
}

export function createDesignControls(
  initial: DesignChoice,
  onChange: (change: Partial<DesignChoice>) => void,
): HTMLElement {
  let params = initial.params;
  let templateId = initial.templateId;

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

  /**
   * The toggles this Template reads, rebuilt where they stand.
   *
   * The panel itself is not rebuilt when the Template changes — the workspace
   * builds it per *selection*, and a Template change is not one — so this is
   * what keeps the list honest. Only these three nodes are replaced, so the
   * focus stays in the picker the collector just used.
   *
   * A toggle the Template does not read keeps its value in `params` rather than
   * being reset: coming back to Classic should find the inset square as it was
   * left, not as it starts.
   */
  const showToggles = (): void => {
    clear(toggles);
    for (const toggle of togglesFor(templateId)) {
      const box = el('input', {
        attrs: { type: 'checkbox', id: `design-${toggle.key}` },
        on: {
          change: (event) =>
            changeParams({ [toggle.key]: (event.target as HTMLInputElement).checked }),
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
  };
  showToggles();

  picker.addEventListener('change', () => {
    templateId = picker.value as TemplateId;
    description.textContent = TEMPLATES[templateId].description;
    showToggles();
  });

  return el(
    'section',
    { class: 'panel' },
    el('h2', { class: 'panel__title', text: 'Design' }),
    el('p', {
      class: 'panel__hint',
      text:
        'Template, colours and what appears on the artwork — this Release only. ' +
        'The next Release you add starts with whatever is set here.',
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
