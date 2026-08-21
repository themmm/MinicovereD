import { el } from './dom.ts';

/**
 * A collapsed section with a summary on its closed header (ADR-0010 item 6).
 *
 * Everything that is not search or selection starts closed, and each fold says
 * enough on its header that its contents are known without opening it — so the
 * packing, the Template and the paper are legible at a glance and the Parts get
 * the screen.
 *
 * Two things here are not decoration:
 *
 * The height animates as a grid track from `0fr` to `1fr`, because `height`
 * cannot animate to `auto`. `overflow: hidden` for that has to sit on the grid
 * *item* rather than on the container: on the item its automatic minimum size
 * becomes 0 and the track can actually close, while on the container the track
 * never closes at all.
 *
 * And a closed fold is `inert`. A `0fr` track still holds focusable controls in
 * the tab order and in the accessibility tree, so without it the collector tabs
 * into fields they cannot see — which `display: none` would prevent, at the
 * price of the transition.
 */

export interface Fold {
  readonly element: HTMLElement;
  /** Where content goes. Appending to the fold itself would land it in the header. */
  readonly body: HTMLElement;
  /** The line on the closed header saying what is inside. */
  setSummary(text: string): void;
  setOpen(open: boolean): void;
  readonly isOpen: boolean;
}

export interface FoldSpec {
  /** The ordinal shown before the title. Folds are read as a sequence. */
  readonly index: string;
  readonly title: string;
  readonly startOpen?: boolean;
}

let nextId = 0;

export function createFold({ index, title, startOpen = false }: FoldSpec, ...children: Node[]): Fold {
  const bodyId = `fold-body-${++nextId}`;
  const summary = el('span', { class: 'fold__sum' });

  const pad = el('div', { class: 'fold__pad' }, ...children);
  const clip = el('div', { class: 'fold__clip' }, pad);
  const body = el('div', { class: 'fold__body', attrs: { id: bodyId } }, clip);

  const button = el(
    'button',
    {
      class: 'fold__btn',
      attrs: { type: 'button', 'aria-expanded': 'false', 'aria-controls': bodyId },
    },
    el('span', { class: 'fold__num', text: index }),
    el('span', { class: 'fold__ttl', text: title }),
    summary,
    // The caret says the same thing aria-expanded does, so it is not announced.
    el('span', { class: 'fold__caret', attrs: { 'aria-hidden': 'true' } }),
  );

  const element = el('section', { class: 'fold' }, button, body);

  let open = false;

  function setOpen(next: boolean): void {
    open = next;
    element.toggleAttribute('data-open', open);
    button.setAttribute('aria-expanded', String(open));
    body.toggleAttribute('inert', !open);
  }

  button.addEventListener('click', () => setOpen(!open));
  setOpen(startOpen);

  return {
    element,
    body: pad,
    setSummary(text) {
      summary.textContent = text;
    },
    setOpen,
    get isOpen() {
      return open;
    },
  };
}
