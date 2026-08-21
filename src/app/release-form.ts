import type { Artwork, Release } from '../domain/release.ts';
import { formatTracklist, parseTracklist } from '../domain/tracklist.ts';
import { errorMessage } from '../errors.ts';
import { readArtwork } from './artwork.ts';
import { el } from './dom.ts';

/** Manual Release entry. Everything on the Sheet comes from these fields. */

interface Field {
  readonly label: string;
  readonly key: 'artist' | 'album' | 'year' | 'notes';
  readonly placeholder: string;
}

const FIELDS: readonly Field[] = [
  { label: 'Artist', key: 'artist', placeholder: 'Glen Campbell' },
  { label: 'Album', key: 'album', placeholder: 'Wichita Lineman' },
  { label: 'Year', key: 'year', placeholder: '1968' },
  { label: 'Notes', key: 'notes', placeholder: 'Capitol · ST-103' },
];

/**
 * An edit to the Release being designed. It is a function rather than a patch
 * because removing artwork means the field going away, which a patch of
 * `{ artwork: undefined }` cannot express.
 */
export type ReleaseEdit = (current: Release) => Release;

export interface ReleaseForm {
  readonly element: HTMLElement;
  /** Replace what the fields show — used when a metadata lookup fills them in. */
  setRelease(release: Release): void;
}

export function createReleaseForm(release: Release, onChange: (edit: ReleaseEdit) => void): ReleaseForm {
  const inputs = new Map<Field['key'], HTMLInputElement>();
  const form = el(
    'section',
    { class: 'panel' },
    el('h2', { class: 'panel__title', text: 'Release' }),
    el('p', {
      class: 'panel__hint',
      text: 'Everything on the Sheet comes from here. Metadata lookup arrives in a later ticket.',
    }),
  );

  for (const field of FIELDS) {
    const input = el('input', {
      class: 'field__input',
      attrs: {
        type: 'text',
        placeholder: field.placeholder,
        id: `field-${field.key}`,
        value: release[field.key] ?? '',
      },
      on: {
        input: (event) => {
          const value = (event.target as HTMLInputElement).value;
          onChange((current) => ({ ...current, [field.key]: value }));
        },
      },
    });
    inputs.set(field.key, input);
    form.appendChild(
      el(
        'label',
        { class: 'field', attrs: { for: `field-${field.key}` } },
        el('span', { class: 'field__label', text: field.label }),
        input,
      ),
    );
  }

  const tracklist = el('textarea', {
    class: 'field__input field__input--area',
    attrs: {
      rows: 10,
      id: 'field-tracklist',
      placeholder: 'One track per line.\nLeading numbers are dropped.',
    },
    on: {
      input: (event) => {
        const tracks = parseTracklist((event.target as HTMLTextAreaElement).value);
        onChange((current) => ({ ...current, tracks }));
      },
    },
  });
  tracklist.value = formatTracklist(release.tracks);
  form.appendChild(
    el(
      'label',
      { class: 'field', attrs: { for: 'field-tracklist' } },
      el('span', { class: 'field__label', text: 'Tracklist' }),
      tracklist,
    ),
  );

  const artwork = artworkField(onChange);
  form.appendChild(artwork.element);

  return {
    element: form,
    setRelease(next) {
      for (const field of FIELDS) {
        const input = inputs.get(field.key);
        if (input) input.value = next[field.key] ?? '';
      }
      tracklist.value = formatTracklist(next.tracks);
      artwork.describe(
        next.artwork
          ? `From the Cover Art Archive · ${next.artwork.widthPx}×${next.artwork.heightPx}`
          : 'No artwork chosen',
      );
      artwork.setPresent(!!next.artwork);
    },
  };
}

interface ArtworkField {
  readonly element: HTMLElement;
  describe(text: string): void;
  /** Show or hide the remove button, according to whether there is artwork. */
  setPresent(present: boolean): void;
}

function artworkField(onChange: (edit: ReleaseEdit) => void): ArtworkField {
  const note = el('span', { class: 'field__note', text: 'No artwork chosen' });
  const artworkPresent = (present: boolean): void => {
    remove.hidden = !present;
  };
  const input = el('input', {
    class: 'field__file',
    attrs: { type: 'file', accept: 'image/*', id: 'field-artwork' },
    on: {
      change: (event) => {
        const file = (event.target as HTMLInputElement).files?.[0];
        if (!file) return;
        void readArtwork(file).then(
          (artwork: Artwork) => {
            note.textContent = `${file.name} · ${artwork.widthPx}×${artwork.heightPx}`;
            artworkPresent(true);
            onChange((current) => ({ ...current, artwork }));
          },
          (error: unknown) => {
            note.textContent = `Could not read image: ${errorMessage(error)}`;
          },
        );
      },
    },
  });

  const remove = el('button', {
    class: 'button',
    text: 'Remove',
    attrs: { type: 'button' },
    on: {
      click: () => {
        input.value = '';
        note.textContent = 'No artwork chosen';
        remove.hidden = true;
        onChange(({ artwork: _removed, ...rest }) => rest);
      },
    },
  });
  remove.hidden = true;

  return {
    element: el(
      'div',
      { class: 'field' },
      el('span', { class: 'field__label', text: 'Artwork' }),
      el(
        'div',
        { class: 'field-buttons' },
        // The native control renders its own text in the browser's locale, so
        // it is hidden behind a label that says what this app wants it to say.
        el('label', { class: 'button', attrs: { for: 'field-artwork' } }, 'Choose image…', input),
        remove,
      ),
      note,
    ),
    describe(text) {
      note.textContent = text;
    },
    setPresent(present) {
      remove.hidden = !present;
    },
  };
}
