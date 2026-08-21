import logoUrl from '../../assets/logo.svg';
import { watchOfflineReadiness } from '../pwa/offline-status.ts';
import type { OfflineState } from '../pwa/offline-status.ts';
import { createAboutDialog } from './about-dialog.ts';
import { el } from './dom.ts';

/**
 * The app chrome: header, workspace, footer. Later tickets fill the workspace;
 * the shell itself only owns branding, the about/licenses dialog and the
 * offline-readiness indicator.
 */

const OFFLINE_LABELS: Readonly<Record<OfflineState, string>> = {
  unsupported: 'Offline use unavailable',
  preparing: 'Preparing offline copy…',
  ready: 'Ready offline',
};

/** A test string that only renders correctly from the bundled fonts. */
const SPECIMEN: ReadonlyArray<{ label: string; text: string; weight?: 'bold' }> = [
  { label: 'Latin', text: 'Wichita Lineman — Glen Campbell' },
  { label: 'Umlauts', text: 'Grüße aus Köln · Ærø · Łódź · Čačak' },
  { label: 'Accents', text: 'Rêveries · Canción · Sinnöver · Ángel' },
  { label: 'Japanese', text: '東京は夜の七時 · こんにちは · カタカナ' },
  { label: 'Bold', text: 'Grüße · 東京 · Ángel', weight: 'bold' },
];

function fontSpecimen(): HTMLElement {
  const list = el('dl', { class: 'specimen' });
  for (const row of SPECIMEN) {
    list.appendChild(el('dt', { text: row.label }));
    list.appendChild(
      el('dd', { text: row.text, ...(row.weight ? { attrs: { 'data-weight': row.weight } } : {}) }),
    );
  }
  return el(
    'section',
    { class: 'panel' },
    el('h2', { class: 'panel__title', text: 'Bundled typography' }),
    el('p', {
      class: 'panel__hint',
      text:
        'Noto Sans and Noto Sans JP ship with the app, so these lines render identically ' +
        'with the network switched off — on screen and on paper.',
    }),
    list,
  );
}

function workspacePlaceholder(): HTMLElement {
  return el(
    'section',
    { class: 'panel' },
    el('h2', { class: 'panel__title', text: 'Workspace' }),
    el('p', {
      class: 'panel__hint',
      text:
        'Releases, Parts and Sheets arrive here. This build carries the app shell: ' +
        'bundled fonts, offline install and the license record.',
    }),
  );
}

/** Set from script so the one bundled logo also serves both builds as the tab icon. */
function installFavicon(): void {
  document.head.appendChild(
    el('link', { attrs: { rel: 'icon', type: 'image/svg+xml', href: logoUrl } }),
  );
}

export function mountShell(root: HTMLElement): void {
  installFavicon();
  const about = createAboutDialog();
  const offlinePill = el('span', {
    class: 'status-pill',
    text: OFFLINE_LABELS.preparing,
    attrs: { 'data-state': 'preparing', role: 'status' },
  });

  const header = el(
    'header',
    { class: 'shell-header' },
    el('img', {
      class: 'shell-header__logo',
      attrs: { src: logoUrl, alt: '', width: 34, height: 34 },
    }),
    el(
      'div',
      { class: 'shell-header__titles' },
      el('h1', { class: 'shell-header__title', text: 'mdcovergen' }),
      el('p', {
        class: 'shell-header__tagline',
        text: 'Print-accurate MiniDisc J-Cards, Back Cards and Labels',
      }),
    ),
    offlinePill,
    el('button', {
      class: 'button button--onshell',
      text: 'About & licenses',
      on: { click: () => about.showModal() },
    }),
  );

  const main = el(
    'main',
    { class: 'shell-main' },
    el('div', { class: 'stack' }, workspacePlaceholder(), fontSpecimen()),
  );

  const footer = el(
    'footer',
    { class: 'shell-footer' },
    'mdcovergen · MIT licensed · works offline, stores nothing outside this device. ',
    el('a', {
      text: 'Bundled fonts and libraries',
      attrs: { href: '#' },
      on: {
        click: (event: Event) => {
          event.preventDefault();
          about.showModal();
        },
      },
    }),
  );

  root.append(header, main, footer, about);

  watchOfflineReadiness((state) => {
    offlinePill.textContent = OFFLINE_LABELS[state];
    offlinePill.setAttribute('data-state', state);
  });
}
