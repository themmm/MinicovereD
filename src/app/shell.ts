import logoUrl from '../../assets/logo.svg';
import { watchOfflineReadiness } from '../pwa/offline-readiness.ts';
import type { OfflineState } from '../pwa/offline-readiness.ts';
import { createAboutDialog } from './about-dialog.ts';
import { el } from './dom.ts';
import type { Child } from './dom.ts';

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

/** Sample lines that only render completely from the bundled fonts. */
const FONT_SPECIMEN: ReadonlyArray<{ script: string; sample: string; weight?: 'bold' }> = [
  { script: 'Latin', sample: 'Wichita Lineman — Glen Campbell' },
  { script: 'Umlauts', sample: 'Grüße aus Köln · Ærø · Łódź · Čačak' },
  { script: 'Accents', sample: 'Rêveries · Canción · Sinnöver · Ángel' },
  { script: 'Japanese', sample: '東京は夜の七時 · こんにちは · カタカナ' },
  { script: 'Bold', sample: 'Grüße · 東京 · Ángel', weight: 'bold' },
];

function panel(title: string, hint: string, ...body: Child[]): HTMLElement {
  return el(
    'section',
    { class: 'panel' },
    el('h2', { class: 'panel__title', text: title }),
    el('p', { class: 'panel__hint', text: hint }),
    ...body,
  );
}

function fontSpecimen(): HTMLElement {
  const list = el('dl', { class: 'specimen' });
  for (const row of FONT_SPECIMEN) {
    list.appendChild(el('dt', { text: row.script }));
    list.appendChild(
      el('dd', {
        text: row.sample,
        ...(row.weight ? { attrs: { 'data-weight': row.weight } } : {}),
      }),
    );
  }
  return panel(
    'Bundled typography',
    'Noto Sans and Noto Sans JP ship with the app, so these lines render identically ' +
      'with the network switched off — on screen and on paper.',
    list,
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
  const openAbout = (event?: Event): void => {
    event?.preventDefault();
    about.showModal();
  };

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
    el('button', { class: 'button button--onshell', text: 'About & licenses', on: { click: openAbout } }),
  );

  const workspace = panel(
    'Workspace',
    'Releases, Parts and Sheets arrive here. This build carries the app shell: ' +
      'bundled fonts, offline install and the license record.',
  );

  const main = el('main', { class: 'shell-main' }, el('div', { class: 'stack' }, workspace, fontSpecimen()));

  const footer = el(
    'footer',
    { class: 'shell-footer' },
    'mdcovergen · MIT licensed · works offline, stores nothing outside this device. ',
    el('a', { text: 'Bundled fonts and libraries', attrs: { href: '#' }, on: { click: openAbout } }),
  );

  root.append(header, main, footer, about);

  watchOfflineReadiness((state) => {
    offlinePill.textContent = OFFLINE_LABELS[state];
    offlinePill.setAttribute('data-state', state);
  });
}
