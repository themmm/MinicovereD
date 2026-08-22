import iconUrl from '../../assets/icon.svg';
import markUrl from '../../assets/mark.svg';
import { watchOfflineReadiness } from '../pwa/offline-readiness.ts';
import type { OfflineState } from '../pwa/offline-readiness.ts';
import { createAboutDialog } from './about-dialog.ts';
import { el } from './dom.ts';
import { createWorkspace } from './workspace.ts';

/**
 * The app chrome: one header row, the result list, the workspace, a footer.
 *
 * The header is a light row on the page rather than a band of its own colour
 * (ADR-0010). Search is permanent in it and is the widest thing there, being
 * the entry point — which is only possible if the row is 68 px of mark,
 * wordmark, field and state, and nothing else. A tagline and a 34 px logo were
 * what used to make that impossible.
 */

const OFFLINE_LABELS: Readonly<Record<OfflineState, string>> = {
  unsupported: 'Offline use unavailable',
  preparing: 'Preparing offline copy…',
  ready: 'Ready offline',
};

/**
 * Set from script, so the bundled asset serves both builds as the tab icon —
 * a path in `index.html` would be a file the single-file build has to fetch.
 *
 * The Icon, not the Mark: a favicon needs a ground. The bare Mark is ink, and
 * ink on a dark browser tab bar is very nearly nothing (ADR-0011).
 */
function installFavicon(): void {
  document.head.appendChild(
    el('link', { attrs: { rel: 'icon', type: 'image/svg+xml', href: iconUrl } }),
  );
}

export function mountShell(root: HTMLElement): void {
  installFavicon();

  const about = createAboutDialog();
  const openAbout = (event?: Event): void => {
    event?.preventDefault();
    about.showModal();
  };

  /**
   * The state of the offline copy, as a dot and a word.
   *
   * The dot is an accent doing what rule 2 allows — a graphic, not a label —
   * and the word beside it is what actually says the state, so nothing here is
   * carried by colour alone.
   */
  const stateDot = el('span', { class: 'dot' });
  const stateLabel = el('span', { text: OFFLINE_LABELS.preparing });
  const state = el(
    'span',
    { class: 'state', attrs: { 'data-state': 'preparing', role: 'status' } },
    stateDot,
    stateLabel,
  );

  const workspace = createWorkspace();

  const header = el(
    'header',
    { class: 'top' },
    // 16, not 19: the Mark is sixteen modules, so 16 px is one module to the
    // pixel and anything else anti-aliases the edges grid construction exists
    // to keep (ADR-0011, and ADR-0008 rule 5).
    el('img', { class: 'top__mark', attrs: { src: markUrl, alt: '', width: 16, height: 16 } }),
    el('span', { class: 'top__wm', text: 'MinicovereD' }),
    workspace.find,
    workspace.reopen,
    state,
    el('button', { class: 'button', text: 'About', attrs: { type: 'button' }, on: { click: openAbout } }),
  );

  const footer = el(
    'footer',
    { class: 'shell-footer' },
    el(
      'div',
      { class: 'wrap' },
      'MinicovereD · MIT licensed · works offline, stores nothing outside this device. ',
      el('a', { text: 'Bundled fonts and libraries', attrs: { href: '#' }, on: { click: openAbout } }),
    ),
  );

  // The result list is full-bleed, directly under the header, so it expands
  // across the page rather than inside a column.
  root.append(
    el('div', { class: 'top-wrap' }, el('div', { class: 'wrap' }, header)),
    workspace.hits,
    el('main', { class: 'shell-main' }, el('div', { class: 'wrap' }, workspace.main)),
    footer,
    about,
  );

  watchOfflineReadiness((offline) => {
    stateLabel.textContent = OFFLINE_LABELS[offline];
    state.setAttribute('data-state', offline);
  });
}
