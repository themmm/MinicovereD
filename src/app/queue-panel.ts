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
            ? // A restored entry has no reason to give: the failure was true of
              // one moment on one network, and is not written down.
              `Needs completing by hand${entry.error ? ` — ${entry.error}` : '.'}`
            : `${release.tracks.length} ${release.tracks.length === 1 ? 'track' : 'tracks'}${
                release.artwork ? ' · artwork' : ''
              }`,
      }),
    );

    const button = (
      action: string,
      label: string,
      description: string,
      run: () => void,
      disabled: boolean,
    ) => {
      const control = el('button', {
        class: 'button button--tiny',
        text: label,
        // The action is on the element so focus can be found again after the
        // list is rebuilt — see `show`.
        attrs: { type: 'button', 'aria-label': description, title: description, 'data-action': action },
        on: { click: run },
      });
      control.toggleAttribute('disabled', disabled);
      return control;
    };

    return el(
      'li',
      {
        class: entry.status === 'failed' ? 'queue__row queue__row--failed' : 'queue__row',
        attrs: { 'data-release': release.id },
      },
      pick,
      el(
        'div',
        { class: 'queue__controls' },
        button('up', '↑', `Move ${title} earlier`, () => actions.move(release.id, -1), index === 0),
        button('down', '↓', `Move ${title} later`, () => actions.move(release.id, 1), index === count - 1),
        button('remove', '✕', `Remove ${title}`, () => actions.remove(release.id), false),
      ),
    );
  }

  /**
   * Where the keyboard was, as something that survives the rows being replaced.
   *
   * Rebuilding the list destroys the button that was just pressed, and focus
   * falls to the document body — so pressing ↑ twice to move an entry two
   * places means tabbing back through the list in between. Remembering the
   * Release and the action, rather than a node or a position, is what makes it
   * follow an entry that has just moved.
   */
  function focusedControl(): { release: string; action: string } | undefined {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !list.contains(active)) return undefined;
    const action = active.dataset['action'];
    const release = active.closest('[data-release]');
    if (!action || !(release instanceof HTMLElement)) return undefined;
    const id = release.dataset['release'];
    return id ? { release: id, action } : undefined;
  }

  function restoreFocus(was: { release: string; action: string } | undefined): void {
    if (!was) return;
    const selector = `[data-release="${CSS.escape(was.release)}"] [data-action="${was.action}"]`;
    const control = list.querySelector(selector);
    // Not if it is disabled: an entry moved to the top has no "earlier" left,
    // and focusing a disabled control silently drops focus anyway.
    if (control instanceof HTMLElement && !control.hasAttribute('disabled')) control.focus();
  }

  return {
    element,
    show(queue, selectedId) {
      const was = focusedControl();
      const scrolled = list.scrollTop;
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

      // The list scrolls; rebuilding its children sends it back to the top,
      // hiding the entry the collector just moved.
      list.scrollTop = scrolled;
      restoreFocus(was);
    },
  };
}
