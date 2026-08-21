import type { Artwork, Release } from '../domain/release.ts';
import { formatTracklist, parseTracklist } from '../domain/tracklist.ts';
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

export interface ReleaseForm {
  readonly element: HTMLElement;
  /** Replace what the fields show — used when a metadata lookup fills them in. */
  setRelease(release: Release): void;
}

export function createReleaseForm(
  release: Release,
  onChange: (changes: Partial<Release>) => void,
): ReleaseForm {
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
      on: { input: (event) => onChange({ [field.key]: (event.target as HTMLInputElement).value }) },
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
      input: (event) =>
        onChange({ tracks: parseTracklist((event.target as HTMLTextAreaElement).value) }),
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
    },
  };
}

interface ArtworkField {
  readonly element: HTMLElement;
  describe(text: string): void;
}

function artworkField(onChange: (changes: Partial<Release>) => void): ArtworkField {
  const note = el('span', { class: 'field__note', text: 'No artwork chosen' });
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
            onChange({ artwork });
          },
          (error: unknown) => {
            note.textContent = `Could not read image: ${
              error instanceof Error ? error.message : String(error)
            }`;
          },
        );
      },
    },
  });

  return {
    element: el(
      'div',
      { class: 'field' },
      el('span', { class: 'field__label', text: 'Artwork' }),
      // The native control renders its own text in the browser's locale, so it
      // is hidden behind a label that says what this app wants it to say.
      el('label', { class: 'button', attrs: { for: 'field-artwork' } }, 'Choose image…', input),
      note,
    ),
    describe(text) {
      note.textContent = text;
    },
  };
}
