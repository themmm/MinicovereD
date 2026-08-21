import type { QueueEntry } from '../queue/release-queue.ts';
import { clear, el } from './dom.ts';

/**
 * The print queue on screen: what is going to be printed, in what order, and
 * which entries still need a hand. Selecting a row is how the collector says
 * which Release the form below is editing.
 */

export interface QueueActions {
  select(releaseId: string): void;
  move(releaseId: string, offset: number): void;
  remove(releaseId: string): void;
}

export interface QueuePanel {
  readonly element: HTMLElement;
  show(queue: readonly QueueEntry[], selectedId: string | undefined): void;
}

export function createQueuePanel(actions: QueueActions): QueuePanel {
  const list = el('ol', { class: 'queue' });
  const summary = el('p', { class: 'panel__hint' });

  const element = el(
    'section',
    { class: 'panel' },
    el('h2', { class: 'panel__title', text: 'Queue' }),
    summary,
    list,
  );

  function row(entry: QueueEntry, index: number, count: number, selected: boolean): HTMLElement {
    const { release } = entry.design;
    const title = [release.artist, release.album].filter(Boolean).join(' — ') || 'Untitled Release';

    const pick = el(
      'button',
      {
        class: 'queue__pick',
        attrs: { type: 'button', 'aria-current': selected ? 'true' : 'false' },
        on: { click: () => actions.select(release.id) },
      },
      el('span', { class: 'queue__title', text: `${index + 1}. ${title}` }),
      el('span', {
        class: 'queue__facts',
        text:
          entry.status === 'failed'
            ? `Needs completing by hand — ${entry.error ?? 'lookup failed'}`
            : `${release.tracks.length} ${release.tracks.length === 1 ? 'track' : 'tracks'}${
                release.artwork ? ' · artwork' : ''
              }`,
      }),
    );

    const button = (label: string, description: string, run: () => void, disabled: boolean) => {
      const control = el('button', {
        class: 'button button--tiny',
        text: label,
        attrs: { type: 'button', 'aria-label': description, title: description },
        on: { click: run },
      });
      control.toggleAttribute('disabled', disabled);
      return control;
    };

    return el(
      'li',
      { class: entry.status === 'failed' ? 'queue__row queue__row--failed' : 'queue__row' },
      pick,
      el(
        'div',
        { class: 'queue__controls' },
        button('↑', `Move ${title} earlier`, () => actions.move(release.id, -1), index === 0),
        button('↓', `Move ${title} later`, () => actions.move(release.id, 1), index === count - 1),
        button('✕', `Remove ${title}`, () => actions.remove(release.id), false),
      ),
    );
  }

  return {
    element,
    show(queue, selectedId) {
      clear(list);
      const failed = queue.filter((entry) => entry.status === 'failed').length;
      summary.textContent =
        queue.length === 0
          ? 'Nothing queued yet. Search for a Release, or fill the form in by hand.'
          : `${queue.length} ${queue.length === 1 ? 'Release' : 'Releases'} queued${
              failed > 0 ? `, ${failed} still needing a hand` : ''
            }. Select one to edit it.`;

      for (const [index, entry] of queue.entries()) {
        list.appendChild(row(entry, index, queue.length, entry.design.release.id === selectedId));
      }
    },
  };
}
