import { el } from './dom.ts';

/**
 * What a first visit opens on, in place of the panels that edit a Release —
 * because there is no Release yet to edit.
 *
 * Its only job is to stop existing. Both routes to a first Release are named
 * because they are genuinely different jobs: a pressing the database knows,
 * and a compilation only the collector knows. Nothing else is on screen
 * competing with them.
 */
export function createEmptyState(onStartByHand: () => void): HTMLElement {
  return el(
    'section',
    { class: 'panel panel--empty' },
    el('h2', { class: 'panel__title', text: 'Start with a Release' }),
    el('p', {
      class: 'panel__hint',
      text:
        'Look one up — an artist and an album, or a whole shelf pasted in a line at a time — and ' +
        'its tracklist and cover art come with it. Every field stays editable afterwards.',
    }),
    el('p', {
      class: 'panel__hint',
      text:
        'Or fill one in yourself, which is how a mixtape gets a cover: type the tracks, add a ' +
        'picture if you have one, and print it.',
    }),
    el('button', {
      class: 'button button--primary',
      text: 'Start a Release by hand',
      attrs: { type: 'button', id: 'start-by-hand' },
      on: { click: onStartByHand },
    }),
  );
}
