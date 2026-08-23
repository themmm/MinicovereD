import { describeCredits, formatCredits, hasCredits, parseCredits } from '../domain/credits.ts';
import type { Artwork, Credits, Release } from '../domain/release.ts';
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
  /**
   * Credits that arrived after the form was built — a lookup answers in one
   * request and Discogs answers a second or two later (ADR-0013).
   *
   * One field is told rather than the form rebuilt: detaching a node takes the
   * caret inside it with it, and the collector is quite possibly typing an
   * artist name while this lands. The workspace calls it only when the credits
   * were actually applied, so it never overwrites anything.
   */
  showCredits(credits: Credits): void;
}

export function createReleaseForm(release: Release, onChange: (edit: ReleaseEdit) => void): ReleaseForm {
  const form = el(
    'section',
    { class: 'panel' },
    el('h2', { class: 'panel__title', text: 'Release' }),
    el('p', {
      class: 'panel__hint',
      text: 'Everything on the Sheet comes from here — including anything a lookup filled in, which stays editable.',
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
        const typed = (event.target as HTMLTextAreaElement).value;
        // Parsed against the Release as it stands rather than from the text
        // alone: the textarea shows titles and nothing else, so a lookup's
        // playing times would go the moment a typo was fixed.
        onChange((current) => ({ ...current, tracks: parseTracklist(typed, current.tracks) }));
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

  const credits = creditsField(release.credits, onChange);
  form.appendChild(credits.element);

  const artwork = artworkField(onChange);
  form.appendChild(artwork.element);

  // What the fields already show, for a Release that arrived with a cover.
  if (release.artwork) {
    artwork.describe(
      `From the Cover Art Archive · ${release.artwork.widthPx}×${release.artwork.heightPx}`,
    );
    artwork.setPresent(true);
  }

  return { element: form, showCredits: credits.show };
}

interface CreditsField {
  readonly element: HTMLElement;
  show(credits: Credits): void;
}

/**
 * Credits, edited the way the tracklist is: one per line, in the convention the
 * search field already teaches — `Role — Name`.
 *
 * The release facts that arrive with them — label, catalogue number, country,
 * year, genres, styles — are shown on the note under the field and are not
 * editable. They are carried through every edit by `parseCredits`, which is the
 * whole reason it takes the block it is replacing; six read-only inputs for
 * facts nobody can act on would be a worse form than one sentence.
 *
 * Carried, but not permanent, which is what Remove is for. MusicBrainz's link
 * to Discogs is community-edited and a wrong one is a real failure — the same
 * worry `discogsIdOf` refuses a master link over — and with no way out the
 * facts of a mis-linked pressing would sit on the Release for good, because
 * `withArrivedCredits` will not overwrite them either. Remove is the artwork
 * field's own answer to the same problem, a few functions down.
 */
function creditsField(present: Credits | undefined, onChange: (edit: ReleaseEdit) => void): CreditsField {
  const note = el('span', { class: 'field__note', text: noteFor(present) });

  const area = el('textarea', {
    class: 'field__input field__input--area',
    attrs: {
      rows: 4,
      id: 'field-credits',
      placeholder: 'Producer — Mike Stock\nOne credit per line.',
    },
    on: {
      input: (event) => {
        const typed = (event.target as HTMLTextAreaElement).value;
        onChange((current) => {
          const credits = parseCredits(typed, current.credits);
          note.textContent = noteFor(credits);
          // Emptied of everything, including the facts a lookup never found:
          // the field goes away rather than staying behind as a block with
          // nothing in it, which is what every other absence looks like here.
          remove.hidden = !hasCredits(credits);
          if (hasCredits(credits)) return { ...current, credits };
          const { credits: _emptied, ...rest } = current;
          return rest;
        });
      },
    },
  });
  area.value = formatCredits(present?.people ?? []);

  const remove = el('button', {
    class: 'button',
    text: 'Remove',
    attrs: { type: 'button' },
    on: {
      click: () => {
        area.value = '';
        note.textContent = noteFor(undefined);
        remove.hidden = true;
        onChange(({ credits: _removed, ...rest }) => rest);
      },
    },
  });
  // Hidden when there is nothing to remove, exactly as the artwork field hides
  // its own: a button that does nothing is worse than no button.
  remove.hidden = !present;

  return {
    // A div holding its own label, not a label wrapping everything, which is
    // the shape the artwork field below already uses and for the same reason: a
    // note inside the label becomes part of the field's accessible name, and
    // this note changes the moment credits arrive.
    element: el(
      'div',
      { class: 'field' },
      el('label', { class: 'field__label', text: 'Credits', attrs: { for: 'field-credits' } }),
      area,
      el('div', { class: 'field-buttons' }, remove),
      note,
    ),
    show(credits) {
      area.value = formatCredits(credits.people);
      note.textContent = noteFor(credits);
      remove.hidden = false;
    },
  };
}

/**
 * What the note under the credits says: the release facts once there are any,
 * and otherwise what the field is for.
 *
 * The sentence has to stay true of a build that prints none of this. It says
 * where credits come from and that nothing shows them yet, because a field that
 * quietly changes nothing on the Parts is worse than a field that says so.
 */
function noteFor(credits: Credits | undefined): string {
  const facts = credits ? describeCredits(credits) : '';
  return (
    facts ||
    'One credit per line. A lookup fills these in when Discogs has them; nothing on the Parts shows them yet.'
  );
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
