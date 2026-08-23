import { MAX_INSERT_PAGES } from '../domain/parts.ts';
import { DEFAULT_TEMPLATE_PARAMS, TEMPLATES } from '../render/sheet-renderer.ts';
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
 *
 * The Page count is in here too, and that is the one field on this panel that is
 * not about how the Insert *looks*. It is here because of what it is a decision
 * about: this record, and only this record. It is not a measurement — every field
 * of `Measurements` is a length in millimetres and a count is not one — and it
 * is not a Design choice either, because a Design choice carries forward
 * (CONTEXT.md) and a four-Page override carried onto the next Release would fold
 * Pages for content that is not there. So it sits on the Design, beside the
 * things that describe one record, and starts on Auto for every new one.
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
export function describeDesign({
  templateId,
  params,
  pageCount,
}: DesignChoice & { readonly pageCount?: number }): string {
  // The control labels verbatim, capitals and all: the summary is a list of what
  // is switched on in the fold below it, and renaming them here would make two
  // names for one checkbox.
  const on = togglesFor(templateId).filter((toggle) => params[toggle.key]);
  // The colours cannot be listed — three hexes say nothing at a glance — but
  // whether this Release has been taken off the plain ones can be, and a fold
  // that hides three colour wells has to admit that (ADR-0010 item 6).
  const recoloured = COLOURS.some(
    (colour) => params[colour.key] !== DEFAULT_TEMPLATE_PARAMS[colour.key],
  );
  const notes = [
    // Only when the collector set one: a fold's summary is for what has been
    // decided in it, and "Auto" is the state of not having decided.
    ...(pageCount === undefined ? [] : [`${pageCount} Pages`]),
    ...on.map((toggle) => toggle.label),
    ...(recoloured ? ['recoloured'] : []),
  ];
  return `${TEMPLATES[templateId].name} · ${notes.join(', ') || 'nothing on, default colours'}`;
}

/** How the Page count is offered: worked out from the content, or said. */
const AUTO = 'auto';

/** What the collector can ask for, once the derived answer is not what they want. */
const PAGE_CHOICES: readonly number[] = [2, MAX_INSERT_PAGES];

export interface DesignChange extends Partial<DesignChoice> {
  /**
   * The Page count the collector asked for, or `null` to go back to deriving it.
   *
   * `null` rather than `undefined`, because `undefined` on a partial cannot be
   * told apart from "not mentioned" — and "derive it" is a change the collector
   * makes on purpose.
   */
  readonly pageCount?: number | null;
}

export function createDesignControls(
  initial: DesignChoice & { readonly pageCount?: number },
  onChange: (change: DesignChange) => void,
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

  /**
   * Pages: Auto, or a count.
   *
   * Auto is first and is what every Release starts on, because the derived answer
   * is right far more often than not — two Pages for a record with nothing but a
   * tracklist, four once there are credits (ADR-0012). The two explicit counts
   * are here for the two cases the derivation cannot know about: a collector who
   * wants the credits left off, and one who wants a back cover on a record whose
   * list would have fitted one Page.
   *
   * An asked-for count that cannot be folded is refused rather than clamped — the
   * paper may have no room for four, and no Page may be blank — and the Insert
   * then says so under the specimen rather than here. This control is where the
   * request goes; whether it could be met is a fact about the strip.
   */
  const pages = el('select', {
    class: 'field__input',
    attrs: { id: 'design-pages' },
    on: {
      change: (event) => {
        const value = (event.target as HTMLSelectElement).value;
        onChange({ pageCount: value === AUTO ? null : Number(value) });
      },
    },
  });
  for (const option of [
    el('option', { text: 'Auto — from the content', attrs: { value: AUTO } }),
    ...PAGE_CHOICES.map((count) =>
      el('option', { text: `${count} Pages`, attrs: { value: String(count) } }),
    ),
  ]) {
    pages.appendChild(option);
  }
  pages.value = initial.pageCount === undefined ? AUTO : String(initial.pageCount);

  const toggles = el('div', { class: 'toggles toggles--stacked' });

  /**
   * The toggles this Template reads, rebuilt where they stand.
   *
   * The panel itself is not rebuilt when the Template changes — the workspace
   * builds it per *selection*, and a Template change is not one — so this is
   * what keeps the list honest. Only the checkboxes inside `toggles` are
   * replaced — one, two or three of them, depending on the Template — so the
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
      'label',
      { class: 'field', attrs: { for: 'design-pages' } },
      el('span', { class: 'field__label', text: 'Insert Pages' }),
      pages,
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
